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
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (v: any, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const eventId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId;

    const text = toText(body.text);
    const image_url = toText(body.image_url) || null;
    const parentCommentId =
      body.parent_comment_id == null ? null : toNum(body.parent_comment_id, 0);

    if (!eventId) return json({ success: false, error: "Invalid event id" }, 400);
    if (!userId)  return json({ success: false, error: "user_id is required" }, 400);
    if (!text && !image_url) {
      return json({ success: false, error: "text or image_url is required" }, 400);
    }
    if (text && text.length > 2000) {
      return json({ success: false, error: "Comment is too long" }, 400);
    }

    // ✅ creator_id
    const event = await env.DB
      .prepare(`SELECT id, creator_id FROM events WHERE id=? LIMIT 1`)
      .bind(eventId)
      .first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);

    const user = await env.DB
      .prepare(`SELECT id FROM users WHERE id=? LIMIT 1`)
      .bind(userId)
      .first();

    if (!user) return json({ success: false, error: "User not found" }, 404);

    let parentComment: any = null;

    if (parentCommentId) {
      parentComment = await env.DB
        .prepare(
          `SELECT id, event_id, user_id
           FROM event_comments
           WHERE id=? AND COALESCE(is_deleted, 0)=0
           LIMIT 1`
        )
        .bind(parentCommentId)
        .first<any>();

      if (!parentComment) {
        return json({ success: false, error: "Parent comment not found" }, 404);
      }

      if (toNum(parentComment.event_id, 0) !== eventId) {
        return json(
          { success: false, error: "Parent comment does not belong to this event" },
          400
        );
      }
    }

    const ins = await env.DB
      .prepare(
        `INSERT INTO event_comments (event_id, user_id, parent_comment_id, text, image_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(eventId, userId, parentCommentId, text || "", image_url) // ✅ "" not null
      .run();

    const commentId = toNum(ins.meta?.last_row_id, 0);

    const comment = await env.DB
      .prepare(
        `SELECT
           ec.id, ec.event_id, ec.user_id, ec.parent_comment_id,
           ec.text, ec.image_url, ec.created_at, ec.updated_at,
           u.name, u.username, u.profile_image_url, u.role, u.is_verified
         FROM event_comments ec
         LEFT JOIN users u ON u.id = ec.user_id
         WHERE ec.id = ?
         LIMIT 1`
      )
      .bind(commentId)
      .first();

    const eventOwnerId = toNum(event.creator_id, 0);

    // 🔔 Notify (self-guarded)
    if (parentCommentId && parentComment) {
      const parentOwnerId = toNum(parentComment.user_id, 0);
      if (parentOwnerId && parentOwnerId !== userId) {
        try {
          await createNotification(
            env,
            parentOwnerId,
            userId,
            "reply",
            "event_comment",
            parentCommentId,
            `event_comment:${parentCommentId}:reply`,
            "replied to your comment"
          );
        } catch (_) {}
      }
    } else {
      if (eventOwnerId && eventOwnerId !== userId) {
        try {
          await createNotification(
            env,
            eventOwnerId,
            userId,
            "discuss",
            "event",
            eventId,
            `event:${eventId}:discuss`,
            "commented on your event"
          );
        } catch (_) {}
      }
    }

    return json({ success: true, comment: comment ?? null }, 201);
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to add event comment" },
      500
    );
  }
};
