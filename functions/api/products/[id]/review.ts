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

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const product_id = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const text = toStr(body.text, "").trim();
    const image_url = toStr(body.image_url, "").trim() || null;
    const parent_comment_id =
      body.parent_comment_id == null ? null : toNum(body.parent_comment_id, 0);

    if (!product_id) return json({ success: false, error: "Invalid product id" }, 400);
    if (!userId)     return json({ success: false, error: "user_id is required" }, 400);
    if (!text && !image_url) {
      return json({ success: false, error: "text or image_url is required" }, 400);
    }
    if (text && text.length > 2000) {
      return json({ success: false, error: "Review is too long" }, 400);
    }

    // product exists + owner
    const product = await env.DB
      .prepare(`SELECT id, seller_id FROM products WHERE id = ? LIMIT 1`)
      .bind(product_id)
      .first<any>();

    if (!product) return json({ success: false, error: "Product not found" }, 404);

    // parent comment checks
    let parentComment: any = null;
    if (parent_comment_id) {
      parentComment = await env.DB
        .prepare(
          `SELECT id, product_id, user_id
           FROM product_comments
           WHERE id = ? AND COALESCE(is_deleted, 0) = 0
           LIMIT 1`
        )
        .bind(parent_comment_id)
        .first<any>();

      if (!parentComment) {
        return json({ success: false, error: "Parent comment not found" }, 404);
      }
      if (toNum(parentComment.product_id, 0) !== product_id) {
        return json(
          { success: false, error: "Parent comment does not belong to this product" },
          400
        );
      }
    }

    const ins = await env.DB
      .prepare(
        `INSERT INTO product_comments (product_id, user_id, parent_comment_id, text, image_url)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(product_id, userId, parent_comment_id, text || "", image_url)
      .run();

    const newId = toNum(ins.meta?.last_row_id, 0);

    // best-effort counter (skip if column missing)
    try {
      await env.DB
        .prepare(
          `UPDATE products SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = ?`
        )
        .bind(product_id)
        .run();
    } catch (_) {}

    // notifications
    const sellerId = toNum(product.seller_id, 0);
    if (sellerId && sellerId !== userId) {
      try {
        await createNotification(
          env,
          sellerId,
          userId,
          "comment",
          "product",
          product_id,
          `comment_product_${product_id}`
        );
      } catch (_) {}
    }

    if (parent_comment_id && parentComment) {
      const parentOwnerId = toNum(parentComment.user_id, 0);
      if (parentOwnerId && parentOwnerId !== userId) {
        try {
          await createNotification(
            env,
            parentOwnerId,
            userId,
            "reply",
            "product_comment",
            parent_comment_id,
            `reply_comment_${parent_comment_id}`
          );
        } catch (_) {}
      }
    }

    const comment = await env.DB
      .prepare(
        `SELECT
           pc.id,
           pc.user_id,
           pc.product_id,
           pc.text,
           pc.image_url,
           pc.parent_comment_id,
           pc.created_at,
           pc.updated_at,
           pc.likes_count,
           u.name AS author_name,
           u.username AS author_username,
           u.profile_image_url AS author_image,
           0 AS liked_by_me
         FROM product_comments pc
         LEFT JOIN users u ON u.id = pc.user_id
         WHERE pc.id = ?
         LIMIT 1`
      )
      .bind(newId)
      .first();

    return json({ success: true, comment }, 201);
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to create review" },
      500
    );
  }
};
