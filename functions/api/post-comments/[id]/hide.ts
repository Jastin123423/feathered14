import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,PATCH,OPTIONS",
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
   POST /api/post-comments/:id/hide
   body: { user_id, action: "hide" | "unhide" }
   Rules:
   - Author can hide/unhide their own comment
   - Admin can hide/unhide any comment
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const commentId = toNum((params as any)?.id, 0);
    if (!commentId) return json({ success: false, error: "Invalid comment id" }, 400);

    const body: any = await request.json().catch(() => ({}));
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const action = String(body.action || "hide").trim().toLowerCase();
    const isHide = action === "hide";
    const isUnhide = action === "unhide";

    if (!userId) return json({ success: false, error: "user_id is required" }, 400);
    if (!isHide && !isUnhide) {
      return json({ success: false, error: "action must be hide or unhide" }, 400);
    }

    // Load comment
    const comment = await env.DB
      .prepare(
        `SELECT id, user_id, hidden_scope
         FROM post_comments
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId)
      .first<any>();

    if (!comment) return json({ success: false, error: "Comment not found" }, 404);

    // Load viewer role from users table
    const user = await env.DB
      .prepare(`SELECT id, role FROM users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first<any>();

    const role = String(user?.role || "").toLowerCase();
    const isAdmin = ["admin", "superadmin", "moderator", "owner"].includes(role);
    const isAuthor = toNum(comment.user_id) === userId;

    if (!isAuthor && !isAdmin) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    if (isUnhide) {
      await env.DB
        .prepare(
          `UPDATE post_comments
           SET hidden_by = NULL,
               hidden_at = NULL,
               hidden_scope = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(commentId)
        .run();

      return json({
        success: true,
        comment_id: commentId,
        hidden: false,
      });
    }

    // Hide — admin hide takes precedence over author hide
    const scope = isAdmin ? "admin" : "author";

    await env.DB
      .prepare(
        `UPDATE post_comments
         SET hidden_by = ?,
             hidden_at = CURRENT_TIMESTAMP,
             hidden_scope = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(userId, scope, commentId)
      .run();

    return json({
      success: true,
      comment_id: commentId,
      hidden: true,
      scope,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to hide comment" }, 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = onRequestPost;
