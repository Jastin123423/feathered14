import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const safeStr = (v: any) => (typeof v === "string" ? v : "");
const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const getAuthUserId = async (request: Request): Promise<number> => {
  const hdr = request.headers.get("x-user-id");
  const id = safeNum(hdr, 0);
  return id > 0 ? id : 0;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * PUT /api/messages/:id
 * Body: { text_content: "..." }
 * Only sender can edit.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const userId = await getAuthUserId(request);
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    const messageId = safeNum((params as any)?.id, 0);
    if (!messageId) return json({ success: false, error: "Invalid message id" }, 400);

    const body = await request.json().catch(() => ({} as any));
    const newText = safeStr(body.text_content ?? "").trim();
    if (!newText) return json({ success: false, error: "Missing text_content" }, 400);

    const msg = await env.DB
      .prepare(`SELECT id, sender_id FROM messages WHERE id = ? LIMIT 1`)
      .bind(messageId)
      .first();

    if (!msg) return json({ success: false, error: "Message not found" }, 404);
    if (safeNum((msg as any)?.sender_id) !== userId) return json({ success: false, error: "Forbidden" }, 403);

    // edited_at might not exist; try and fallback
    try {
      await env.DB
        .prepare(`UPDATE messages SET text_content = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(newText, messageId)
        .run();
    } catch {
      await env.DB.prepare(`UPDATE messages SET text_content = ? WHERE id = ?`).bind(newText, messageId).run();
    }

    const updated = await env.DB.prepare(`SELECT * FROM messages WHERE id = ? LIMIT 1`).bind(messageId).first();
    return json({ success: true, message: updated });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};

/**
 * DELETE /api/messages/:id
 * Body: { delete_for_everyone: boolean }
 * - delete_for_everyone=true : only sender can hard-delete from messages table
 * - else : delete for me (insert into message_deletes)
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const userId = await getAuthUserId(request);
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    const messageId = safeNum((params as any)?.id, 0);
    if (!messageId) return json({ success: false, error: "Invalid message id" }, 400);

    const body = await request.json().catch(() => ({} as any));
    const delEveryone = !!body.delete_for_everyone;

    const msg = await env.DB
      .prepare(`SELECT id, sender_id FROM messages WHERE id = ? LIMIT 1`)
      .bind(messageId)
      .first();

    if (!msg) return json({ success: false, error: "Message not found" }, 404);

    const senderId = safeNum((msg as any)?.sender_id, 0);

    if (delEveryone) {
      if (senderId !== userId) return json({ success: false, error: "Forbidden" }, 403);
      await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(messageId).run();
      return json({ success: true, deleted: "everyone" });
    }

    // delete for me
    await env.DB
      .prepare(`INSERT OR IGNORE INTO message_deletes (message_id, user_id) VALUES (?, ?)`)
      .bind(messageId, userId)
      .run();

    return json({ success: true, deleted: "me" });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};
