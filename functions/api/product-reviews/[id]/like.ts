import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ error: "DB binding missing" }, 500);

    const comment_id = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    if (!comment_id) return json({ error: "Invalid comment id" }, 400);
    if (!user_id)    return json({ error: "user_id is required" }, 400);

    // Confirm comment exists and is not deleted
    const comment = await env.DB
      .prepare(
        `SELECT id, user_id
         FROM product_comments
         WHERE id = ?
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(comment_id)
      .first<any>();

    if (!comment) return json({ error: "Comment not found" }, 404);

    const existing = await env.DB
      .prepare(
        `SELECT id FROM product_comment_likes
         WHERE comment_id = ? AND user_id = ?
         LIMIT 1`
      )
      .bind(comment_id, user_id)
      .first<any>();

    let liked = false;

    if (existing?.id) {
      await env.DB
        .prepare(`DELETE FROM product_comment_likes WHERE comment_id = ? AND user_id = ?`)
        .bind(comment_id, user_id)
        .run();
      liked = false;
    } else {
      await env.DB
        .prepare(`INSERT INTO product_comment_likes (comment_id, user_id) VALUES (?, ?)`)
        .bind(comment_id, user_id)
        .run();
      liked = true;

      const ownerId = toNum(comment.user_id, 0);
      if (ownerId && ownerId !== user_id) {
        try {
          await createNotification(
            env,
            ownerId,
            user_id,
            "like",
            "product_comment",
            comment_id,
            `like_comment_${comment_id}`
          );
        } catch (_) {
          // Notification failures shouldn't break the like
        }
      }
    }

    // Count from source of truth
    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM product_comment_likes WHERE comment_id = ?`)
      .bind(comment_id)
      .first<{ c: number }>();

    const likesCount = toNum(count?.c, 0);

    // Best-effort sync of denormalized column (safe if missing)
    try {
      await env.DB
        .prepare(`UPDATE product_comments SET likes_count = ? WHERE id = ?`)
        .bind(likesCount, comment_id)
        .run();
    } catch (_) {
      // product_comments.likes_count doesn't exist — safe to ignore
    }

    return json({
      success: true,
      comment_id,
      liked,
      likes_count: likesCount,
    });
  } catch (err: any) {
    return json({ error: err?.message || "Failed to like product comment" }, 500);
  }
};
