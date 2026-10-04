import type { PagesFunction } from "@cloudflare/workers-types";
import { cors, ok, bad, server } from "./_cors";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

// =========================================================
// GET — list comments for a group post
//   ?post_id=X&viewerId=Y
// =========================================================
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const post_id = toNum(url.searchParams.get("post_id"), 0);
    if (!post_id) return bad("post_id is required");

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryViewerId = toNum(url.searchParams.get("viewerId"), 0);
    const viewerId = headerUserId || queryViewerId || 0;

    // post author (for hidden visibility)
    const post = await env.DB
      .prepare(`SELECT id, user_id FROM group_posts WHERE id = ? LIMIT 1`)
      .bind(post_id)
      .first<any>();

    if (!post) return bad("Group post not found", 404);

    const postAuthorId = toNum(post.user_id, 0);

    const { results } = await env.DB.prepare(
      `SELECT
         c.id,
         c.user_id,
         c.group_post_id,
         c.parent_comment_id,
         c.text,
         c.image_url,
         c.created_at,
         c.updated_at,
         c.hidden_scope,
         c.hidden_by,
         u.username,
         u.name,
         u.profile_image_url,
         u.is_verified,
         u.role
       FROM group_post_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.group_post_id = ?
         AND COALESCE(c.is_deleted, 0) = 0
         AND (
           c.hidden_scope IS NULL
           OR c.user_id = ?
           OR ? = ?
         )
       ORDER BY c.created_at ASC, c.id ASC
       LIMIT 500`
    )
      .bind(post_id, viewerId, viewerId, postAuthorId)
      .all();

    const comments = ((results || []) as any[]).map((c) => ({
      ...c,
      is_hidden: !!c.hidden_scope,
      hidden_label:
        c.hidden_scope === "author"
          ? "Hidden by you"
          : c.hidden_scope === "owner"
            ? "Hidden by post author"
            : null,
    }));

    return ok({ comments });
  } catch (e: any) {
    return server(e?.message || "Failed to fetch comments");
  }
};

// =========================================================
// POST — create comment or reply
//   body: { user_id, post_id, text, image_url?, parent_comment_id? }
// =========================================================
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body: any = await request.json().catch(() => ({}));
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const post_id = toNum(body.post_id, 0);
    const parent_comment_id =
      body.parent_comment_id == null ? null : toNum(body.parent_comment_id, 0);
    const text = toStr(body.text, "").trim();
    const image_url = toStr(body.image_url, "").trim() || null;

    if (!user_id || !post_id) {
      return bad("user_id and post_id are required");
    }
    if (!text && !image_url) {
      return bad("text or image_url is required");
    }
    if (text && text.length > 2000) {
      return bad("Comment is too long");
    }

    // group post exists + owner
    const post = await env.DB
      .prepare(`SELECT id, group_id, user_id FROM group_posts WHERE id = ? LIMIT 1`)
      .bind(post_id)
      .first<any>();

    if (!post?.group_id) return bad("Group post not found", 404);

    // must be group member or admin/owner
    let isMemberOrAdmin = false;
    const group = await env.DB
      .prepare(`SELECT admin_id, type FROM groups WHERE id = ? LIMIT 1`)
      .bind(Number(post.group_id))
      .first<any>();

    if (group && toNum(group.admin_id, 0) === user_id) {
      isMemberOrAdmin = true;
    } else {
      const mem = await env.DB
        .prepare(
          `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`
        )
        .bind(Number(post.group_id), user_id)
        .first();
      if (mem) isMemberOrAdmin = true;
    }

    if (!isMemberOrAdmin) return bad("User is not a member of this group", 403);

    // parent comment
    let parentComment: any = null;
    if (parent_comment_id) {
      parentComment = await env.DB
        .prepare(
          `SELECT id, group_post_id, user_id FROM group_post_comments
           WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
        )
        .bind(parent_comment_id)
        .first<any>();

      if (!parentComment) return bad("Parent comment not found", 404);
      if (toNum(parentComment.group_post_id, 0) !== post_id) {
        return bad("Parent comment does not belong to this group post", 400);
      }
    }

    const insert = await env.DB
      .prepare(
        `INSERT INTO group_post_comments (user_id, group_post_id, parent_comment_id, text, image_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(user_id, post_id, parent_comment_id, text || "", image_url)
      .run();

    const commentId = toNum(insert.meta?.last_row_id, 0);

    // notifications (self-guarded)
    const postOwnerId = toNum(post.user_id, 0);

    if (parent_comment_id && parentComment) {
      const parentOwnerId = toNum(parentComment.user_id, 0);
      if (parentOwnerId && parentOwnerId !== user_id) {
        try {
          await createNotification(
            env,
            parentOwnerId,
            user_id,
            "reply",
            "group_comment",
            parent_comment_id,
            `group_post_comment:${parent_comment_id}:reply`,
            "replied to your comment"
          );
        } catch (_) {}
      }
    } else {
      if (postOwnerId && postOwnerId !== user_id) {
        try {
          await createNotification(
            env,
            postOwnerId,
            user_id,
            "discuss",
            "group_post",
            post_id,
            `group_post:${post_id}:discuss`,
            "commented on your group post"
          );
        } catch (_) {}
      }
    }

    const comment = await env.DB
      .prepare(
        `SELECT
           c.id, c.user_id, c.group_post_id, c.parent_comment_id,
           c.text, c.image_url, c.created_at, c.updated_at,
           u.username, u.name, u.profile_image_url, u.is_verified, u.role
         FROM group_post_comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = ?
         LIMIT 1`
      )
      .bind(commentId)
      .first();

    return ok({ comment: comment || {} });
  } catch (e: any) {
    return server(e?.message || "Failed to comment");
  }
};

// =========================================================
// PATCH — hide / unhide
//   body: { user_id, comment_id, action: "hide" | "unhide" }
//   allowed: comment author OR group post author
// =========================================================
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const commentId = toNum(body.comment_id, 0);
    const action = toStr(body.action, "").trim().toLowerCase();

    if (!commentId) return bad("comment_id is required");
    if (!userId) return bad("user_id is required");
    if (action !== "hide" && action !== "unhide") {
      return bad("action must be hide or unhide");
    }

    const row = await env.DB
      .prepare(
        `SELECT
           c.id,
           c.user_id AS comment_author_id,
           p.user_id AS post_author_id
         FROM group_post_comments c
         LEFT JOIN group_posts p ON p.id = c.group_post_id
         WHERE c.id = ? AND COALESCE(c.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId)
      .first<any>();

    if (!row) return bad("Comment not found", 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isPostAuthor = toNum(row.post_author_id) === userId;

    if (!isAuthor && !isPostAuthor) {
      return bad("Not allowed", 403);
    }

    if (action === "unhide") {
      await env.DB
        .prepare(
          `UPDATE group_post_comments
           SET hidden_scope = NULL, hidden_by = NULL, hidden_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(commentId)
        .run();

      return ok({ comment_id: commentId, hidden: false });
    }

    const scope = isAuthor ? "author" : "owner";

    await env.DB
      .prepare(
        `UPDATE group_post_comments
         SET hidden_scope = ?, hidden_by = ?, hidden_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(scope, userId, commentId)
      .run();

    return ok({ comment_id: commentId, hidden: true, scope });
  } catch (e: any) {
    return server(e?.message || "Failed to update comment");
  }
};

// =========================================================
// DELETE — soft delete
//   query: ?comment_id=X&user_id=Y
//   allowed: comment author OR group post author
// =========================================================
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    const commentId = toNum(url.searchParams.get("comment_id"), 0);

    if (!commentId) return bad("comment_id is required");
    if (!userId) return bad("user_id is required");

    const row = await env.DB
      .prepare(
        `SELECT
           c.id,
           c.user_id AS comment_author_id,
           p.user_id AS post_author_id
         FROM group_post_comments c
         LEFT JOIN group_posts p ON p.id = c.group_post_id
         WHERE c.id = ? AND COALESCE(c.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId)
      .first<any>();

    if (!row) return bad("Comment not found", 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isPostAuthor = toNum(row.post_author_id) === userId;

    if (!isAuthor && !isPostAuthor) {
      return bad("Not allowed to delete this comment", 403);
    }

    await env.DB
      .prepare(
        `UPDATE group_post_comments
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(userId, commentId)
      .run();

    return ok({
      comment_id: commentId,
      deleted: true,
      deleted_by: userId,
      by: isAuthor ? "author" : "post_author",
    });
  } catch (e: any) {
    return server(e?.message || "Failed to delete comment");
  }
};
