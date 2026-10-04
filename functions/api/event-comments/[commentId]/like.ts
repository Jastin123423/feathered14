import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const commentId = toNum((params as any)?.commentId || (params as any)?.id, 0);
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!commentId) {
      return json({ success: false, error: "Invalid comment id" }, 400);
    }

    if (!userId) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    const comment = await env.DB.prepare(
      `
      SELECT
        id,
        event_id,
        user_id
      FROM event_comments
      WHERE id = ?
        AND COALESCE(is_deleted, 0) = 0
      LIMIT 1
      `
    ).bind(commentId).first();

    if (!comment) {
      return json({ success: false, error: "Comment not found" }, 404);
    }

    const existing = await env.DB.prepare(
      `
      SELECT id
      FROM event_comment_likes
      WHERE comment_id = ? AND user_id = ?
      LIMIT 1
      `
    ).bind(commentId, userId).first();

    let liked = false;

    if ((existing as any)?.id) {
      await env.DB.prepare(
        `DELETE FROM event_comment_likes WHERE comment_id = ? AND user_id = ?`
      ).bind(commentId, userId).run();

      liked = false;
    } else {
      await env.DB.prepare(
        `INSERT INTO event_comment_likes (comment_id, user_id) VALUES (?, ?)`
      ).bind(commentId, userId).run();

      liked = true;

      const commentOwnerId = toNum((comment as any)?.user_id, 0);

      await createNotification(
        env,
        commentOwnerId,
        userId,
        "react",
        "comment",
        commentId,
        `event_comment:${commentId}:like`,
        "reacted to your Discuss"
      );
    }

    const countRow = await env.DB.prepare(
      `
      SELECT COUNT(*) AS likes_count
      FROM event_comment_likes
      WHERE comment_id = ?
      `
    ).bind(commentId).first();

    return json({
      success: true,
      comment_id: commentId,
      liked,
      likes_count: toNum((countRow as any)?.likes_count, 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to like event comment" },
      500
    );
  }
};
