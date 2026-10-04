import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

/* =========================================================
   GET — list comments (filters deleted, filters hidden
   unless viewer is the comment author or the song owner)
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const songId = toNum((params as any)?.id, 0);
    const url = new URL(request.url);

    const viewerId =
      toNum(request.headers.get("x-user-id"), 0) ||
      toNum(url.searchParams.get("viewerId"), 0);

    const limit = Math.min(Math.max(toNum(url.searchParams.get("limit"), 200), 1), 500);
    const offset = Math.max(toNum(url.searchParams.get("offset"), 0), 0);

    if (!songId) {
      return json({ success: false, error: "Invalid song id" }, 400);
    }

    const song = await env.DB.prepare(
      `SELECT id, uploader_id FROM songs WHERE id = ? LIMIT 1`
    ).bind(songId).first<any>();

    if (!song) {
      return json({ success: false, error: "Song not found" }, 404);
    }

    const songOwnerId = toNum(song.uploader_id, 0);

    const { results } = await env.DB.prepare(
      `
      SELECT
        sc.id,
        sc.song_id,
        sc.user_id,
        sc.parent_comment_id,
        sc.text,
        sc.image_url,
        sc.created_at,
        sc.updated_at,
        sc.hidden_scope,
        sc.hidden_by,

        u.name,
        u.username,
        u.profile_image_url,
        u.role,
        u.is_verified,

        (
          SELECT COUNT(*)
          FROM song_comment_likes scl
          WHERE scl.comment_id = sc.id
        ) AS likes_count,

        (
          SELECT COUNT(*)
          FROM song_comments child
          WHERE child.parent_comment_id = sc.id
            AND COALESCE(child.is_deleted, 0) = 0
        ) AS replies_count,

        CASE
          WHEN ? > 0 AND EXISTS (
            SELECT 1
            FROM song_comment_likes mine
            WHERE mine.comment_id = sc.id
              AND mine.user_id = ?
          ) THEN 1
          ELSE 0
        END AS liked_by_me

      FROM song_comments sc
      LEFT JOIN users u ON u.id = sc.user_id
      WHERE sc.song_id = ?
        AND COALESCE(sc.is_deleted, 0) = 0
        AND (
          sc.hidden_scope IS NULL
          OR sc.user_id = ?
          OR ? = ?
        )
      ORDER BY sc.created_at ASC, sc.id ASC
      LIMIT ? OFFSET ?
      `
    )
      .bind(
        viewerId,
        viewerId,
        songId,
        viewerId,
        viewerId,
        songOwnerId,
        limit,
        offset
      )
      .all();

    const comments = ((results ?? []) as any[]).map((c) => ({
      ...c,
      is_hidden: !!c.hidden_scope,
      hidden_label:
        c.hidden_scope === "author"
          ? "Hidden by you"
          : c.hidden_scope === "owner"
            ? "Hidden by song owner"
            : c.hidden_scope === "admin"
              ? "Hidden by admin"
              : null,
    }));

    return json({ success: true, comments, limit, offset });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to fetch song comments" },
      500
    );
  }
};

/* =========================================================
   PATCH — hide / unhide
   body: { user_id, comment_id, action: "hide" | "unhide" }
   Allowed: comment author OR song owner
   ========================================================= */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const songId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const commentId = toNum(body.comment_id, 0);
    const action = toStr(body.action, "").trim().toLowerCase();

    if (!songId) return json({ success: false, error: "Invalid song id" }, 400);
    if (!commentId) return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const row = await env.DB
      .prepare(
        `SELECT
           sc.id,
           sc.user_id AS comment_author_id,
           s.uploader_id AS song_owner_id
         FROM song_comments sc
         LEFT JOIN songs s ON s.id = sc.song_id
         WHERE sc.id = ? AND sc.song_id = ?
           AND COALESCE(sc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, songId)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isSongOwner = toNum(row.song_owner_id) === userId;

    if (action === "hide" || action === "unhide") {
      if (!isAuthor && !isSongOwner) {
        return json({ success: false, error: "Not allowed" }, 403);
      }

      if (action === "unhide") {
        await env.DB
          .prepare(
            `UPDATE song_comments
             SET hidden_scope = NULL, hidden_by = NULL, hidden_at = NULL,
                 updated_at = datetime('now')
             WHERE id = ?`
          )
          .bind(commentId)
          .run();

        return json({ success: true, comment_id: commentId, hidden: false });
      }

      const scope = isSongOwner ? "owner" : "author";

      await env.DB
        .prepare(
          `UPDATE song_comments
           SET hidden_scope = ?, hidden_by = ?, hidden_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(scope, userId, commentId)
        .run();

      return json({ success: true, comment_id: commentId, hidden: true, scope });
    }

    return json(
      { success: false, error: "action must be hide or unhide" },
      400
    );
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to update comment" },
      500
    );
  }
};

/* =========================================================
   DELETE — author OR song owner
   Query: ?comment_id=X&user_id=Y   (DELETE body is stripped, use query)
   ========================================================= */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const songId = toNum((params as any)?.id, 0);
    const url = new URL(request.url);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    const commentId =
      toNum(url.searchParams.get("comment_id"), 0) ||
      toNum((params as any)?.commentId, 0);

    if (!songId) return json({ success: false, error: "Invalid song id" }, 400);
    if (!commentId) return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const row = await env.DB
      .prepare(
        `SELECT
           sc.id,
           sc.user_id AS comment_author_id,
           s.uploader_id AS song_owner_id
         FROM song_comments sc
         LEFT JOIN songs s ON s.id = sc.song_id
         WHERE sc.id = ? AND sc.song_id = ?
           AND COALESCE(sc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, songId)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isSongOwner = toNum(row.song_owner_id) === userId;

    if (!isAuthor && !isSongOwner) {
      return json({ success: false, error: "Not allowed to delete this comment" }, 403);
    }

    await env.DB
      .prepare(
        `UPDATE song_comments
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND song_id = ?`
      )
      .bind(userId, commentId, songId)
      .run();

    return json({
      success: true,
      comment_id: commentId,
      deleted: true,
      deleted_by: userId,
      by: isAuthor ? "author" : "song_owner",
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete comment" },
      500
    );
  }
};
