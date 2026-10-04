// functions/api/products/[id]/share.ts
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
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const ALLOWED_DESTINATIONS = new Set([
  "feed",
  "story",
  "message",
  "copy_link",
  "group",
  "external",
]);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    // ✅ product id comes from URL path
    const product_id = toNum((params as any)?.id, 0);
    if (!product_id) {
      return json({ success: false, error: "Invalid product id" }, 400);
    }

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const destination = String(body.destination || "feed").trim().toLowerCase();
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : null;

    if (!user_id) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    if (!ALLOWED_DESTINATIONS.has(destination)) {
      return json({ success: false, error: "Invalid destination" }, 400);
    }

    // Verify product exists
    const product = await env.DB
      .prepare(
        `SELECT pr.*, u.id AS seller_user_id, u.name AS seller_name, u.username AS seller_username,
                u.profile_image_url AS seller_avatar, u.is_verified AS seller_verified
         FROM products pr
         LEFT JOIN users u ON u.id = pr.seller_id
         WHERE pr.id = ? AND COALESCE(pr.is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(product_id)
      .first<any>();

    if (!product) {
      return json({ success: false, error: "Product not found" }, 404);
    }

    // Insert share record
    const ins = await env.DB
      .prepare(
        `INSERT INTO product_shares (product_id, user_id, destination, message, shared_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(product_id, user_id, destination, message)
      .run();

    const share_id = toNum(ins.meta?.last_row_id, 0);

    // Best-effort counter update
    try {
      await env.DB
        .prepare(
          `UPDATE products SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = ?`
        )
        .bind(product_id)
        .run();
    } catch (_) {}

    // Notify owner (never self)
    const ownerId = toNum(product.seller_id, 0);
    if (ownerId && ownerId !== user_id) {
      try {
        await createNotification(
          env,
          ownerId,
          user_id,
          "share",
          "product",
          product_id,
          `share_product_${product_id}`
        );
      } catch (_) {}
    }

    // Count from source of truth
    const countRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM product_shares WHERE product_id = ?`)
      .bind(product_id)
      .first<{ c: number }>();

    const count = toNum(countRow?.c, 0);

    let sharerUser: any = null;
    try {
      sharerUser = await env.DB
        .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ?`)
        .bind(user_id)
        .first<any>();
    } catch (_) {}

    const safeParseJson = (val: any) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return []; }
      }
      return [];
    };

    const imgs = safeParseJson(product.images);
    const isSellerVerified = Boolean(product.seller_verified && product.seller_verified !== '0' && product.seller_verified !== 0);
    const isSharerVerified = Boolean(sharerUser?.is_verified && sharerUser?.is_verified !== '0' && sharerUser?.is_verified !== 0);

    const fullProduct = {
      id: product.id,
      product_id: product.id,
      seller_id: product.seller_id,
      user_id: product.seller_id,
      title: product.title,
      name: product.title,
      category: product.category,
      description: product.description,
      content: product.description,
      country: product.country,
      address: product.address,
      location: product.address || "Marketplace",
      main_price: product.main_price,
      discount_price: product.discount_price,
      price: product.discount_price ?? product.main_price,
      currency: "TZS",
      quantity: product.quantity,
      phone_number: product.phone_number,
      images: imgs,
      media_urls: imgs,
      created_at: product.created_at,
      item_type: "product",
      source: "product",
      type: "product",
      post_type: "product",
      kind: "product",
      is_product: true,
      author: {
        id: product.seller_id,
        name: product.seller_name || product.seller_username || "Seller",
        username: product.seller_username || "",
        avatar_url: product.seller_avatar || "",
        profile_image_url: product.seller_avatar || "",
        is_verified: isSellerVerified,
        verified: isSellerVerified,
      },
      user: {
        id: product.seller_id,
        name: product.seller_name || product.seller_username || "Seller",
        username: product.seller_username || "",
        avatar_url: product.seller_avatar || "",
        profile_image_url: product.seller_avatar || "",
        is_verified: isSellerVerified,
        verified: isSellerVerified,
      },
      seller: {
        id: product.seller_id,
        name: product.seller_name || product.seller_username || "Seller",
        username: product.seller_username || "",
        avatar_url: product.seller_avatar || "",
        profile_image_url: product.seller_avatar || "",
        is_verified: isSellerVerified,
        verified: isSellerVerified,
      },
    };

    const newSharedProductPost = {
      id: share_id || Date.now(),
      post_id: share_id || Date.now(),
      feed_key: `product_share:${share_id || Date.now()}`,
      product_id: product.id,
      shared_post_id: product.id,
      user_id,
      owner_id: user_id,
      owner_field: "user_id",
      username: sharerUser?.username || "user",
      name: sharerUser?.name || sharerUser?.username || "User",
      avatar_url: sharerUser?.profile_image_url || "",
      profile_image_url: sharerUser?.profile_image_url || "",
      is_verified: isSharerVerified,
      verified: isSharerVerified,
      author: {
        id: user_id,
        name: sharerUser?.name || sharerUser?.username || "User",
        username: sharerUser?.username || "",
        avatar_url: sharerUser?.profile_image_url || "",
        profile_image_url: sharerUser?.profile_image_url || "",
        is_verified: isSharerVerified,
        verified: isSharerVerified,
      },
      user: {
        id: user_id,
        name: sharerUser?.name || sharerUser?.username || "User",
        username: sharerUser?.username || "",
        avatar_url: sharerUser?.profile_image_url || "",
        profile_image_url: sharerUser?.profile_image_url || "",
        is_verified: isSharerVerified,
        verified: isSharerVerified,
      },
      content: message || "",
      description: message || "",
      message: message || "",
      visibility: "public",
      views: 0,
      shares: 0,
      shares_count: 0,
      comments_count: 0,
      reactions_count: 0,
      my_reaction: null,
      source: "product_share",
      item_type: "product_share",
      type: "product_share",
      post_type: "product_share",
      kind: "product_share",
      created_at: new Date().toISOString(),
      shared_at: new Date().toISOString(),
      shared_product: fullProduct,
      shared_post: fullProduct,
    };

    return json({
      success: true,
      share_id,
      product_id,
      shares: count,
      share_count: count,
      post: newSharedProductPost,
      shared_post: fullProduct,
      shared_product: fullProduct,
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to share product" },
      500
    );
  }
};
