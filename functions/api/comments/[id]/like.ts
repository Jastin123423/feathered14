// functions/api/comments/[id]/like.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const commentId = toInt((params as any)?.id, 0);
    if (!commentId) return json({ success: false, error: "Invalid comment id" }, 400);

    const body = await request.json().catch(() => ({} as any));
    const userId = toInt(body?.user_id, 0);
    if (!userId) return json({ success: false, error: "Missing user_id" }, 400);

    // Ensure table exists:
    // comment_likes(comment_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    // PRIMARY KEY(comment_id,user_id))
    const existing = await env.DB.prepare(
      `SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1`
    ).bind(commentId, userId).first();

    if (existing) {
      // Unlike
      await env.DB.prepare(
        `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`
      ).bind(commentId, userId).run();
    } else {
      // Like
      await env.DB.prepare(
        `INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)`
      ).bind(commentId, userId).run();
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM comment_likes WHERE comment_id = ?`
    ).bind(commentId).first();

    const likes_count = toInt((countRow as any)?.c, 0);

    return json({
      success: true,
      comment_id: commentId,
      user_id: userId,
      liked_by_me: !existing,
      likes_count,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || String(e) }, 500);
  }
};
