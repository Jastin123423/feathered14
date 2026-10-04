// functions/api/stories/[id]/reply.ts
import type { PagesFunction } from "@cloudflare/workers-types";
type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const storyId = toInt((params as any)?.id, 0);
    if (!storyId) return json({ error: "Invalid story id" }, 400);

    const body = await request.json().catch(() => ({} as any));
    const userId = toInt(body.user_id, 0);
    const text = String(body.text ?? "").trim();

    if (!userId) return json({ error: "user_id is required" }, 400);
    if (!text) return json({ error: "text is required" }, 400);

    const insert = await env.DB.prepare(
      `INSERT INTO story_replies (story_id, user_id, text) VALUES (?, ?, ?)`
    )
      .bind(storyId, userId, text)
      .run();

    const replyId = Number(insert.meta?.last_row_id);

    const reply = await env.DB.prepare(
      `
      SELECT
        r.*,
        u.username as author_name,
        u.profile_image_url as author_image
      FROM story_replies r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = ?
      LIMIT 1
    `
    )
      .bind(replyId)
      .first();

    return json({ success: true, reply: reply ?? null }, 201);
  } catch (err: any) {
    return json({ error: "Backend crash", message: String(err?.message ?? err) }, 500);
  }
};
