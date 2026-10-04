// functions/api/posts/[id]/comments.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
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

const toIntOrNull = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith("tmp-")) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ADMIN_ROLES = new Set(["admin", "superadmin", "moderator", "owner"]);

/* =========================================================
   GET /api/posts/:id/comments
   Query: ?viewerId=X  OR header x-user-id
   - Excludes admin-deleted comments
   - Excludes admin-hidden comments from non-admins
   - Shows author their own hidden comment
   - Admin sees everything (with is_hidden label)
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toInt((params as any)?.id, 0);
    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);

    const url = new URL(request.url);
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const queryViewerId = toInt(url.searchParams.get("viewerId"), 0);
    const viewerId = headerUserId || queryViewerId || 0;

    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit = limitParam
      ? Math.min(Math.max(Number(limitParam), 1), 500)
      : 200;
    const offset = offsetParam ? Math.max(Number(offsetParam), 0) : 0;

    // Admin check
    let isAdmin = false;
    if (viewerId > 0) {
      const u = await env.DB
        .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
        .bind(viewerId)
        .first<any>();
      const role = String(u?.role || "").toLowerCase();
      isAdmin = ADMIN_ROLES.has(role);
    }

    const q = `
      SELECT
        pc.id,
        pc.post_id,
        pc.user_id,
        pc.text,
        pc.image_url,
        pc.created_at,
        pc.updated_at,
        pc.parent_comment_id,
        pc.hidden_scope,
        pc.hidden_by,
        u.username AS author_name,
        u.name AS author_full_name,
        u.profile_image_url AS author_image,
        u.is_verified AS author_is_verified,
        u.role AS author_role,

        (SELECT COUNT(*)
         FROM post_comment_likes pcl
         WHERE pcl.comment_id = pc.id) AS likes_count,

        (SELECT COUNT(*)
         FROM post_comments child
         WHERE child.parent_comment_id = pc.id
           AND COALESCE(child.is_deleted, 0) = 0) AS replies_count,

        (SELECT 1
         FROM post_comment_likes pcl
         WHERE pcl.comment_id = pc.id
           AND pcl.user_id = ?
         LIMIT 1) AS liked_by_me

      FROM post_comments pc
      LEFT JOIN users u ON u.id = pc.user_id
      WHERE pc.post_id = ?
        AND COALESCE(pc.is_deleted, 0) = 0
        AND (
          pc.hidden_scope IS NULL
          OR pc.user_id = ?
          OR ? = 1
        )
      ORDER BY pc.created_at ASC, pc.id ASC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(q)
      .bind(viewerId || 0, postId, viewerId || 0, isAdmin ? 1 : 0, limit, offset)
      .all();

    const comments = ((results || []) as any[]).map((c) => ({
      ...c,
      is_hidden: !!c.hidden_scope,
      hidden_label:
        c.hidden_scope === "admin"
          ? "Hidden by admin"
          : c.hidden_scope === "author"
            ? "Hidden by you"
            : null,
    }));

    return json({ success: true, comments, limit, offset });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to load comments" },
      500
    );
  }
};

/* =========================================================
   POST /api/posts/:id/comments
   body: { user_id, text, image_url?, parent_comment_id? }
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toInt((params as any)?.id, 0);
    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);

    const body: any = await request.json().catch(() => ({}));

    const text = String(body.text ?? "").trim();
    const image_url = typeof body.image_url === "string" ? body.image_url.trim() : null;

    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const parentCommentId = toIntOrNull(body.parent_comment_id);

    if (!userId) return json({ success: false, error: "user_id is required" }, 400);
    if (!text && !image_url) {
      return json({ success: false, error: "text or image_url is required" }, 400);
    }
    if (text && text.length > 2000) {
      return json({ success: false, error: "Comment is too long" }, 400);
    }

    // Post exists?
    const post: any = await env.DB
      .prepare(`SELECT id, user_id FROM posts WHERE id = ? LIMIT 1`)
      .bind(postId)
      .first();

    if (!post) return json({ success: false, error: "Post not found" }, 404);

    // Parent comment check
    let parentComment: any = null;
    if (parentCommentId) {
      parentComment = await env.DB
        .prepare(
          `SELECT id, post_id, user_id
           FROM post_comments
           WHERE id = ? AND COALESCE(is_deleted, 0) = 0
           LIMIT 1`
        )
        .bind(parentCommentId)
        .first();

      if (!parentComment) {
        return json({ success: false, error: "Parent comment not found" }, 404);
      }
      if (Number(parentComment.post_id) !== postId) {
        return json(
          { success: false, error: "Parent comment does not belong to this post" },
          400
        );
      }
    }

    // Insert (text always a string, never null)
    const insert = await env.DB
      .prepare(
        `INSERT INTO post_comments (post_id, user_id, text, image_url, parent_comment_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(postId, userId, text || "", image_url, parentCommentId)
      .run();

    const insertedId = Number(insert.meta?.last_row_id);
    if (!insertedId) {
      return json({ success: false, error: "Failed to create comment" }, 500);
    }

    // Notify (self-guarded)
    const postOwnerId = toInt(post?.user_id, 0);

    if (parentCommentId && parentComment) {
      const parentOwnerId = toInt(parentComment.user_id, 0);
      if (parentOwnerId && parentOwnerId !== userId) {
        try {
          await createNotification(
            env,
            parentOwnerId,
            userId,
            "reply",
            "post_comment",
            parentCommentId,
            `post_comment:${parentCommentId}:reply`,
            "replied to your comment"
          );
        } catch (_) {}
      }
    } else if (postOwnerId && postOwnerId !== userId) {
      try {
        await createNotification(
          env,
          postOwnerId,
          userId,
          "discuss",
          "post",
          postId,
          `post:${postId}:discuss`,
          "commented on your post"
        );
      } catch (_) {}
    }

    // Return the created comment
    const comment = await env.DB
      .prepare(
        `SELECT
           pc.id,
           pc.post_id,
           pc.user_id,
           pc.text,
           pc.image_url,
           pc.created_at,
           pc.updated_at,
           pc.parent_comment_id,
           u.username AS author_name,
           u.name AS author_full_name,
           u.profile_image_url AS author_image,
           u.is_verified AS author_is_verified,
           u.role AS author_role
         FROM post_comments pc
         LEFT JOIN users u ON u.id = pc.user_id
         WHERE pc.id = ?`
      )
      .bind(insertedId)
      .first();

    return json({ success: true, comment: comment ?? null }, 201);
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to create comment" },
      500
    );
  }
};
