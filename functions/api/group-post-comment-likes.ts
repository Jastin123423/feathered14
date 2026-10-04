import type { PagesFunction } from "@cloudflare/workers-types";
import { cors, ok, bad, server } from "./_cors";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/group-post-comment-likes
 * Body: { comment_id, user_id? }
 * Headers: x-user-id?
 * Toggles like on a group post comment
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return server("DB binding missing (DB)");

    const body = await request.json().catch(() => ({} as any));
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const comment_id = toInt(body.comment_id ?? body.id, 0);

    if (!user_id || !comment_id) {
      return bad("user_id and comment_id are required");
    }

    // Ensure group_post_comment_likes table exists
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS group_post_comment_likes (
        comment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comment_id, user_id)
      )`
    ).run().catch(() => {});

    // Ensure comment exists
    const comment = await env.DB.prepare(
      `SELECT id, user_id, group_post_id
       FROM group_post_comments
       WHERE id = ?
       LIMIT 1`
    )
      .bind(comment_id)
      .first<any>();

    if (!comment) return bad("Group post comment not found", 404);

    const commentOwnerId = toInt(comment.user_id, 0);

    // Check existing
    const existing = await env.DB.prepare(
      `SELECT 1 FROM group_post_comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(comment_id, user_id)
      .first();

    let liked = false;
    if (existing) {
      await env.DB.prepare(
        `DELETE FROM group_post_comment_likes WHERE comment_id = ? AND user_id = ?`
      )
        .bind(comment_id, user_id)
        .run();
      liked = false;
    } else {
      await env.DB.prepare(
        `INSERT INTO group_post_comment_likes (comment_id, user_id) VALUES (?, ?)`
      )
        .bind(comment_id, user_id)
        .run();
      liked = true;

      if (commentOwnerId && commentOwnerId !== user_id) {
        try {
          await createNotification(
            env,
            commentOwnerId,
            user_id,
            "like",
            "group_post_comment",
            comment_id,
            `group_post_comment:${comment_id}:like`,
            "liked your comment in group discussion"
          );
        } catch (_) {}
      }
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM group_post_comment_likes WHERE comment_id = ?`
    )
      .bind(comment_id)
      .first<{ c: number }>();

    const likes_count = toInt(countRow?.c, 0);

    return ok({
      success: true,
      comment_id,
      liked,
      likes_count,
    });
  } catch (err: any) {
    return server(err?.message || "Internal error");
  }
};
