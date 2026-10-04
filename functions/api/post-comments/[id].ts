import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* =========================================================
   DELETE /api/post-comments/:id
   Query: ?user_id=1     OR header x-user-id: 1
   Behavior: soft delete (sets is_deleted = 1)
   ========================================================= */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const commentId = toNum((params as any)?.id, 0);
    if (!commentId) return json({ success: false, error: "Invalid comment id" }, 400);

    const url = new URL(request.url);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    // Load comment + parent post owner
    const comment = await env.DB
      .prepare(
        `SELECT
           c.id,
           c.user_id    AS comment_author_id,
           c.post_id,
           p.user_id    AS post_owner_id
         FROM post_comments c
         LEFT JOIN posts p ON p.id = c.post_id
         WHERE c.id = ?
           AND COALESCE(c.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId)
      .first<any>();

    if (!comment) {
      return json({ success: false, error: "Comment not found" }, 404);
    }

    const isAuthor = toNum(comment.comment_author_id) === userId;
    const isPostOwner = toNum(comment.post_owner_id) === userId;

    if (!isAuthor && !isPostOwner) {
      return json(
        { success: false, error: "Not allowed to delete this comment" },
        403
      );
    }

    // Soft delete
    await env.DB
      .prepare(`UPDATE post_comments SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(commentId)
      .run();

    return json({
      success: true,
      deleted: true,
      comment_id: commentId,
      by: isAuthor ? "author" : "post_owner",
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete comment" },
      500
    );
  }
};
