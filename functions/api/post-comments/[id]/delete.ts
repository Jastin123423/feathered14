import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
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

// Optional escape hatch — set to true if you want platform admins to delete anything.
// Leave false to strictly limit to comment author + post owner.
const ALLOW_PLATFORM_ADMIN = true;
const PLATFORM_ADMIN_ROLES = new Set(["admin", "superadmin", "moderator", "owner"]);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const handle = async (request: Request, env: Env, params: any): Promise<Response> => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const commentId = toNum(params?.id, 0);
    if (!commentId) return json({ success: false, error: "Invalid comment id" }, 400);

    const url = new URL(request.url);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);

    let bodyUserId = 0;
    if (request.method !== "GET") {
      const body: any = await request.json().catch(() => ({}));
      bodyUserId = toNum(body?.user_id, 0);
    }

    const userId = headerUserId || bodyUserId || queryUserId || 0;
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    // Load comment + post owner in one query
    const comment = await env.DB
      .prepare(
        `SELECT
           c.id,
           c.user_id  AS comment_author_id,
           c.post_id,
           p.user_id  AS post_owner_id
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

    const isCommentAuthor = toNum(comment.comment_author_id) === userId;
    const isPostOwner = toNum(comment.post_owner_id) === userId;

    let isPlatformAdmin = false;
    if (ALLOW_PLATFORM_ADMIN) {
      const u = await env.DB
        .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
        .bind(userId)
        .first<any>();
      const role = String(u?.role || "").trim().toLowerCase();
      isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(role);
    }

    if (!isCommentAuthor && !isPostOwner && !isPlatformAdmin) {
      return json(
        {
          success: false,
          error: "Not allowed to delete this comment",
          reason: "Only the comment author, the post owner, or a platform admin can delete",
        },
        403
      );
    }

    // Soft delete
    await env.DB
      .prepare(
        `UPDATE post_comments
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(userId, commentId)
      .run();

    // Who deleted it (for UI / moderation log)
    const role = isCommentAuthor
      ? "comment_author"
      : isPostOwner
        ? "post_owner"
        : "platform_admin";

    return json({
      success: true,
      comment_id: commentId,
      deleted: true,
      deleted_by: userId,
      by: role,
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete comment" },
      500
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) =>
  handle(request, env, params);

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) =>
  handle(request, env, params);
