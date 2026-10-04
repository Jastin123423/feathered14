import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

/* =========================================================
   GET — list comments on a story
   - Excludes deleted
   - Excludes comments hidden by others (author/story owner still see)
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);

    const url = new URL(request.url);
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const queryViewerId = toInt(url.searchParams.get("viewerId"), 0);
    const viewerId = headerUserId || queryViewerId || 0;

    const { results } = await env.DB.prepare(
      `
      SELECT
        sc.id,
        sc.story_id,
        sc.user_id,
        sc.parent_id,
        sc.content,
        sc.image_url,
        sc.created_at,
        sc.updated_at,
        sc.hidden_scope,
        sc.hidden_by,
        u.name,
        u.username,
        u.profile_image_url,
        u.role,
        u.is_verified
      FROM story_comments sc
      LEFT JOIN users u ON u.id = sc.user_id
      LEFT JOIN stories s ON s.id = sc.story_id
      WHERE sc.story_id = ?
        AND COALESCE(sc.is_deleted, 0) = 0
        AND (
          sc.hidden_scope IS NULL
          OR sc.user_id = ?
          OR s.user_id = ?
        )
      ORDER BY sc.created_at ASC, sc.id ASC
      LIMIT 200
      `
    )
      .bind(storyId, viewerId || 0, viewerId || 0)
      .all();

    const comments = ((results || []) as any[]).map((c) => ({
      ...c,
      is_hidden: !!c.hidden_scope,
      hidden_label:
        c.hidden_scope === "author"
          ? "Hidden by you"
          : c.hidden_scope === "owner"
            ? "Hidden by story owner"
            : c.hidden_scope === "admin"
              ? "Hidden by admin"
              : null,
    }));

    return json({ success: true, comments });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to load comments" },
      500
    );
  }
};

/* =========================================================
   POST — create a comment or reply
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const parentId = body.parent_id == null ? null : toInt(body.parent_id, 0);
    const content = toStr(body.content, "").trim();
    const image_url = toStr(body.image_url, "").trim() || null;

    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);
    if (!content && !image_url) {
      return json({ success: false, error: "content or image_url is required" }, 400);
    }
    if (content.length > 2000) {
      return json({ success: false, error: "Comment is too long" }, 400);
    }

    const story = await env.DB
      .prepare(`SELECT id, user_id FROM stories WHERE id = ? LIMIT 1`)
      .bind(storyId)
      .first<any>();

    if (!story) return json({ success: false, error: "Story not found" }, 404);

    let parentComment: any = null;
    if (parentId) {
      parentComment = await env.DB
        .prepare(
          `SELECT id, story_id, user_id FROM story_comments
           WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
        )
        .bind(parentId)
        .first<any>();

      if (!parentComment) {
        return json({ success: false, error: "Parent comment not found" }, 404);
      }
      if (toInt(parentComment.story_id, 0) !== storyId) {
        return json(
          { success: false, error: "Parent comment does not belong to this story" },
          400
        );
      }
    }

    const result = await env.DB
      .prepare(
        `INSERT INTO story_comments (story_id, user_id, parent_id, content, image_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(storyId, userId, parentId, content || "", image_url)
      .run();

    const commentId = Number(result.meta?.last_row_id || 0);

    const comment = await env.DB
      .prepare(
        `SELECT
           sc.id, sc.story_id, sc.user_id, sc.parent_id, sc.content, sc.image_url,
           sc.created_at, sc.updated_at,
           u.name, u.username, u.profile_image_url, u.role, u.is_verified
         FROM story_comments sc
         LEFT JOIN users u ON u.id = sc.user_id
         WHERE sc.id = ?
         LIMIT 1`
      )
      .bind(commentId)
      .first();

    const storyOwnerId = toInt(story.user_id, 0);

    if (parentId && parentComment) {
      const parentOwnerId = toInt(parentComment.user_id, 0);
      if (parentOwnerId && parentOwnerId !== userId) {
        try {
          await createNotification(
            env,
            parentOwnerId,
            userId,
            "reply",
            "story_comment",
            parentId,
            `story_comment:${parentId}:reply`,
            "replied to your comment"
          );
        } catch (_) {}
      }
    } else {
      if (storyOwnerId && storyOwnerId !== userId) {
        try {
          await createNotification(
            env,
            storyOwnerId,
            userId,
            "discuss",
            "story",
            storyId,
            `story:${storyId}:discuss`,
            "commented on your story"
          );
        } catch (_) {}
      }
    }

    return json({ success: true, comment }, 201);
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to create comment" },
      500
    );
  }
};

/* =========================================================
   PATCH — edit content OR hide/unhide
   body:
     edit:  { user_id, comment_id, content }
     hide:  { user_id, comment_id, action: "hide" | "unhide" }
   ========================================================= */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const commentId = toInt(body.comment_id, 0);
    const action = toStr(body.action, "").trim().toLowerCase();

    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);
    if (!commentId) return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    // Load comment + story owner + author
    const row = await env.DB
      .prepare(
        `SELECT
           sc.id,
           sc.user_id AS comment_author_id,
           sc.story_id,
           s.user_id AS story_owner_id
         FROM story_comments sc
         LEFT JOIN stories s ON s.id = sc.story_id
         WHERE sc.id = ? AND sc.story_id = ?
           AND COALESCE(sc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, storyId)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toInt(row.comment_author_id) === userId;
    const isStoryOwner = toInt(row.story_owner_id) === userId;

    // --- HIDE / UNHIDE ---
    if (action === "hide" || action === "unhide") {
      if (!isAuthor && !isStoryOwner) {
        return json({ success: false, error: "Not allowed" }, 403);
      }

      if (action === "unhide") {
        await env.DB
          .prepare(
            `UPDATE story_comments
             SET hidden_scope = NULL, hidden_by = NULL, hidden_at = NULL,
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .bind(commentId)
          .run();

        return json({ success: true, comment_id: commentId, hidden: false });
      }

      const scope = isStoryOwner ? "owner" : "author";

      await env.DB
        .prepare(
          `UPDATE story_comments
           SET hidden_scope = ?, hidden_by = ?, hidden_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(scope, userId, commentId)
        .run();

      return json({ success: true, comment_id: commentId, hidden: true, scope });
    }

    // --- EDIT CONTENT ---
    const content = toStr(body.content, "").trim();
    if (!content) {
      return json({ success: false, error: "content or action is required" }, 400);
    }
    if (content.length > 2000) {
      return json({ success: false, error: "Comment is too long" }, 400);
    }
    if (!isAuthor) {
      return json({ success: false, error: "Only the author can edit" }, 403);
    }

    await env.DB
      .prepare(
        `UPDATE story_comments
         SET content = ?, updated_at = datetime('now')
         WHERE id = ? AND story_id = ?`
      )
      .bind(content, commentId, storyId)
      .run();

    return json({ success: true, edited: true, comment_id: commentId });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to update comment" },
      500
    );
  }
};

/* =========================================================
   DELETE — author OR story owner
   ========================================================= */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const url = new URL(request.url);
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const queryUserId = toInt(url.searchParams.get("user_id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const userId = headerUserId || bodyUserId || queryUserId || 0;

    const commentId = toInt(body.comment_id, 0) || toInt(url.searchParams.get("comment_id"), 0);

    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);
    if (!commentId) return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const row = await env.DB
      .prepare(
        `SELECT
           sc.id,
           sc.user_id AS comment_author_id,
           s.user_id AS story_owner_id
         FROM story_comments sc
         LEFT JOIN stories s ON s.id = sc.story_id
         WHERE sc.id = ? AND sc.story_id = ?
           AND COALESCE(sc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, storyId)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toInt(row.comment_author_id) === userId;
    const isStoryOwner = toInt(row.story_owner_id) === userId;

    if (!isAuthor && !isStoryOwner) {
      return json({ success: false, error: "Not allowed to delete this comment" }, 403);
    }

    await env.DB
      .prepare(
        `UPDATE story_comments
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND story_id = ?`
      )
      .bind(userId, commentId, storyId)
      .run();

    return json({
      success: true,
      comment_id: commentId,
      deleted: true,
      deleted_by: userId,
      by: isAuthor ? "author" : "story_owner",
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete comment" },
      500
    );
  }
};
