import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const userId = await getAuthUserId(request);
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => ({} as any));
    const blockedId = safeNum(body.blocked_id, 0);
    const block = !!body.block;

    if (!blockedId) return json({ success: false, error: "Missing blocked_id" }, 400);
    if (blockedId === userId) return json({ success: false, error: "Cannot block yourself" }, 400);

    if (block) {
      await env.DB
        .prepare(`INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)`)
        .bind(userId, blockedId)
        .run();
    } else {
      await env.DB.prepare(`DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?`).bind(userId, blockedId).run();
    }

    return json({ success: true, block });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};
