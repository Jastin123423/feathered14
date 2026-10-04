import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const commentId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!commentId) return json({ success: false, error: "Invalid comment id" }, 400);
    if (!userId)    return json({ success: false, error: "user_id is required" }, 400);

    // Confirm comment exists
    const comment = await env.DB
      .prepare(`SELECT id FROM post_comments WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`)
      .bind(commentId)
      .first();

    if (!comment) return json({ success: false, error: "Comment not found" }, 404);

    // Toggle
    const existing = await env.DB
      .prepare(`SELECT id FROM post_comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1`)
      .bind(commentId, userId)
      .first<any>();

    let liked = false;

    if (existing?.id) {
      await env.DB
        .prepare(`DELETE FROM post_comment_likes WHERE comment_id = ? AND user_id = ?`)
        .bind(commentId, userId)
        .run();
      liked = false;
    } else {
      await env.DB
        .prepare(`INSERT INTO post_comment_likes (comment_id, user_id) VALUES (?, ?)`)
        .bind(commentId, userId)
        .run();
      liked = true;
    }

    // Count from source of truth
    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM post_comment_likes WHERE comment_id = ?`)
      .bind(commentId)
      .first<{ c: number }>();

    return json({
      success: true,
      comment_id: commentId,
      liked,
      likes_count: toNum(count?.c, 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to like comment" },
      500
    );
  }
};
