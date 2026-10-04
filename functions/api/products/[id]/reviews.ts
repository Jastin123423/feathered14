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
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

// GET — list reviews with replies
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const product_id = toNum((params as any)?.id, 0);
    if (!product_id) return json({ success: false, error: "Product ID required" }, 400);

    const url = new URL(request.url);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryViewerId = toNum(url.searchParams.get("viewerId"), 0);
    const viewerId = headerUserId || queryViewerId || 0;

    // product owner
    const product = await env.DB
      .prepare(`SELECT id, seller_id FROM products WHERE id = ? LIMIT 1`)
      .bind(product_id)
      .first<any>();

    if (!product) return json({ success: false, error: "Product not found" }, 404);

    const sellerId = toNum(product.seller_id, 0);

    // top-level comments
    const comments = await env.DB.prepare(
      `
      SELECT
        pc.id,
        pc.user_id,
        pc.product_id,
        pc.text,
        pc.image_url,
        pc.parent_comment_id,
        pc.created_at,
        pc.updated_at,
        pc.hidden_scope,
        pc.hidden_by,
        pc.likes_count,
        u.name   AS author_name,
        u.username AS author_username,
        u.profile_image_url AS author_image,
        u.is_verified AS author_is_verified,
        CASE WHEN ? > 0 AND EXISTS (
          SELECT 1 FROM product_comment_likes
          WHERE comment_id = pc.id AND user_id = ?
        ) THEN 1 ELSE 0 END AS liked_by_me,
        (
          SELECT COUNT(*) FROM product_comments
          WHERE parent_comment_id = pc.id
            AND COALESCE(is_deleted, 0) = 0
        ) AS replies_count
      FROM product_comments pc
      LEFT JOIN users u ON u.id = pc.user_id
      WHERE pc.product_id = ?
        AND pc.parent_comment_id IS NULL
        AND COALESCE(pc.is_deleted, 0) = 0
        AND (
          pc.hidden_scope IS NULL
          OR pc.user_id = ?
          OR ? = ?
        )
      ORDER BY pc.created_at DESC
      `
    )
      .bind(viewerId, viewerId, product_id, viewerId, viewerId, sellerId)
      .all();

    const topLevel = (comments.results ?? []) as any[];

    if (!topLevel.length) {
      return json({ success: true, comments: [] });
    }

    const ids = topLevel.map((c) => Number(c.id)).filter(Boolean);
    const placeholders = ids.map(() => "?").join(",");

    const repliesQuery = await env.DB.prepare(
      `
      SELECT
        pc.id,
        pc.user_id,
        pc.product_id,
        pc.text,
        pc.image_url,
        pc.parent_comment_id,
        pc.created_at,
        pc.updated_at,
        pc.hidden_scope,
        pc.hidden_by,
        pc.likes_count,
        u.name AS author_name,
        u.username AS author_username,
        u.profile_image_url AS author_image,
        u.is_verified AS author_is_verified,
        CASE WHEN ? > 0 AND EXISTS (
          SELECT 1 FROM product_comment_likes
          WHERE comment_id = pc.id AND user_id = ?
        ) THEN 1 ELSE 0 END AS liked_by_me
      FROM product_comments pc
      LEFT JOIN users u ON u.id = pc.user_id
      WHERE pc.parent_comment_id IN (${placeholders})
        AND COALESCE(pc.is_deleted, 0) = 0
        AND (
          pc.hidden_scope IS NULL
          OR pc.user_id = ?
          OR ? = ?
        )
      ORDER BY pc.created_at ASC
      `
    )
      .bind(viewerId, viewerId, ...ids, viewerId, viewerId, sellerId)
      .all();

    const repliesByParent: Record<number, any[]> = {};
    for (const r of (repliesQuery.results ?? []) as any[]) {
      const pid = Number(r.parent_comment_id);
      if (!repliesByParent[pid]) repliesByParent[pid] = [];
      repliesByParent[pid].push({
        ...r,
        liked_by_me: Boolean(r.liked_by_me),
        is_hidden: !!r.hidden_scope,
        hidden_label:
          r.hidden_scope === "author"
            ? "Hidden by you"
            : r.hidden_scope === "owner"
              ? "Hidden by product owner"
              : null,
      });
    }

    const shaped = topLevel.map((c) => ({
      ...c,
      liked_by_me: Boolean(c.liked_by_me),
      is_hidden: !!c.hidden_scope,
      hidden_label:
        c.hidden_scope === "author"
          ? "Hidden by you"
          : c.hidden_scope === "owner"
            ? "Hidden by product owner"
            : null,
      replies: repliesByParent[Number(c.id)] ?? [],
    }));

    return json({ success: true, comments: shaped });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to load reviews" },
      500
    );
  }
};

// PATCH — hide / unhide (author or product owner)
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const product_id = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const commentId = toNum(body.comment_id, 0);
    const action = toStr(body.action, "").trim().toLowerCase();

    if (!product_id) return json({ success: false, error: "Product ID required" }, 400);
    if (!commentId)  return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId)     return json({ success: false, error: "user_id is required" }, 400);

    const row = await env.DB
      .prepare(
        `SELECT
           pc.id,
           pc.user_id AS comment_author_id,
           p.seller_id AS product_owner_id
         FROM product_comments pc
         LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.id = ? AND pc.product_id = ?
           AND COALESCE(pc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, product_id)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isOwner = toNum(row.product_owner_id) === userId;

    if (action !== "hide" && action !== "unhide") {
      return json({ success: false, error: "action must be hide or unhide" }, 400);
    }

    if (!isAuthor && !isOwner) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    if (action === "unhide") {
      await env.DB
        .prepare(
          `UPDATE product_comments
           SET hidden_scope = NULL, hidden_by = NULL, hidden_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(commentId)
        .run();

      return json({ success: true, comment_id: commentId, hidden: false });
    }

    const scope = isAuthor ? "author" : "owner";

    await env.DB
      .prepare(
        `UPDATE product_comments
         SET hidden_scope = ?, hidden_by = ?, hidden_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(scope, userId, commentId)
      .run();

    return json({ success: true, comment_id: commentId, hidden: true, scope });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to update review" },
      500
    );
  }
};

// DELETE — soft delete (author or product owner). Query params, not body.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const product_id = toNum((params as any)?.id, 0);
    const url = new URL(request.url);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    const commentId = toNum(url.searchParams.get("comment_id"), 0);

    if (!product_id) return json({ success: false, error: "Product ID required" }, 400);
    if (!commentId)  return json({ success: false, error: "comment_id is required" }, 400);
    if (!userId)     return json({ success: false, error: "user_id is required" }, 400);

    const row = await env.DB
      .prepare(
        `SELECT
           pc.id,
           pc.user_id AS comment_author_id,
           p.seller_id AS product_owner_id
         FROM product_comments pc
         LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.id = ? AND pc.product_id = ?
           AND COALESCE(pc.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(commentId, product_id)
      .first<any>();

    if (!row) return json({ success: false, error: "Comment not found" }, 404);

    const isAuthor = toNum(row.comment_author_id) === userId;
    const isOwner = toNum(row.product_owner_id) === userId;

    if (!isAuthor && !isOwner) {
      return json({ success: false, error: "Not allowed to delete this comment" }, 403);
    }

    await env.DB
      .prepare(
        `UPDATE product_comments
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND product_id = ?`
      )
      .bind(userId, commentId, product_id)
      .run();

    return json({
      success: true,
      comment_id: commentId,
      deleted: true,
      deleted_by: userId,
      by: isAuthor ? "author" : "product_owner",
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete review" },
      500
    );
  }
};
