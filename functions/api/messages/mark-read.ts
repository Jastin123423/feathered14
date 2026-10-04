// functions/api/messages/mark-read.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const getAuthUserId = async (request: Request): Promise<number> => {
  const hdr = request.headers.get("x-user-id");
  const id = safeNum(hdr, 0);
  return id > 0 ? id : 0;
};

export const onRequestOptions: PagesFunction = async () => new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const body = await request.json().catch(() => ({} as any));
    const authUserId = await getAuthUserId(request);
    const userId = authUserId || safeNum(body.user_id, 0);

    const conversationId = safeNum(body.conversation_id, 0);
    const upToMessageId = safeNum(body.up_to_message_id, 0); // optional

    if (!userId || !conversationId) return json({ success: false, error: "Missing user_id or conversation_id" }, 400);

    // Ensure participant
    const chk = await env.DB.prepare(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(conversationId, userId)
      .first();
    if (!chk) return json({ success: false, error: "Forbidden" }, 403);

    // Insert receipts for messages from others not yet read
    // Use INSERT OR IGNORE so duplicates do not error.
    const extra = upToMessageId ? ` AND m.id <= ? ` : "";
    const stmt = `
      INSERT OR IGNORE INTO message_receipts (message_id, user_id)
      SELECT m.id, ?
      FROM messages m
      LEFT JOIN message_receipts r
        ON r.message_id = m.id AND r.user_id = ?
      WHERE m.conversation_id = ?
        AND m.sender_id != ?
        AND r.id IS NULL
        ${extra}
    `;

    const q = env.DB.prepare(stmt);

    if (upToMessageId) {
      await q.bind(userId, userId, conversationId, userId, upToMessageId).run();
    } else {
      await q.bind(userId, userId, conversationId, userId).run();
    }

    return json({ success: true });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};
