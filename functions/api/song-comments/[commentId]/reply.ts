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

const toText = (v: any, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;

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

    const text = toText(body.text);
    const image_url = toText(body.image_url) || null;

    if (!commentId) {
      return json({ success: false, error: "Invalid comment id" }, 400);
    }

    if (!userId) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    if (!text && !image_url) {
      return json({ success: false, error: "text or image_url is required" }, 400);
    }

    if (text && text.length > 2000) {
      return json({ success: false, error: "Reply is too long" }, 400);
    }

    const parentComment = await env.DB.prepare(
      `
      SELECT
        id,
        song_id,
        user_id,
        parent_comment_id
      FROM song_comments
      WHERE id = ?
        AND COALESCE(is_deleted, 0) = 0
      LIMIT 1
      `
    ).bind(commentId).first();

    if (!parentComment) {
      return json({ success: false, error: "Parent comment not found" }, 404);
    }

    const songId = toNum((parentComment as any)?.song_id, 0);
    if (!songId) {
      return json({ success: false, error: "Parent comment has no song" }, 400);
    }

    const song = await env.DB.prepare(
      `SELECT id FROM songs WHERE id = ? LIMIT 1`
    ).bind(songId).first();

    if (!song) {
      return json({ success: false, error: "Song not found" }, 404);
    }

    const user = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? LIMIT 1`
    ).bind(userId).first();

    if (!user) {
      return json({ success: false, error: "User not found" }, 404);
    }

    const ins = await env.DB.prepare(
      `
      INSERT INTO song_comments (
        song_id,
        user_id,
        parent_comment_id,
        text,
        image_url
      )
      VALUES (?, ?, ?, ?, ?)
      `
    )
      .bind(songId, userId, commentId, text || "", image_url)
      .run();

    const replyId = toNum(ins.meta?.last_row_id, 0);

    const reply = await env.DB.prepare(
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
        u.name,
        u.username,
        u.profile_image_url,
        u.role,
        u.is_verified
      FROM song_comments sc
      LEFT JOIN users u ON u.id = sc.user_id
      WHERE sc.id = ?
      LIMIT 1
      `
    )
      .bind(replyId)
      .first();

    const parentOwnerId = toNum((parentComment as any)?.user_id, 0);

    if (parentOwnerId && parentOwnerId !== userId) {
      await createNotification(
        env,
        parentOwnerId,
        userId,
        "reply",
        "comment",
        commentId,
        `song_comment:${commentId}:reply`,
        "replied to your comment"
      );
    }

    return json(
      {
        success: true,
        reply: reply ?? null,
      },
      201
    );
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to reply to comment" },
      500
    );
  }
};
