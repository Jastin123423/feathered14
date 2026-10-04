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

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeType = (v: any) => String(v || "like").trim().toLowerCase();

const ALLOWED_REACTIONS = new Set([
  "like","love","haha","wow","sad","angry",
  "fire","party","clap","star","thinking",
  "crying","heart_eyes","kiss","sunglasses",
  "rocket","trophy","crown",
]);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ error: "DB binding missing" }, 500);

    const product_id = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const type = normalizeType(body.type);

    if (!product_id) return json({ error: "Invalid product id" }, 400);
    if (!user_id) return json({ error: "user_id is required" }, 400);
    if (!ALLOWED_REACTIONS.has(type)) {
      return json({ error: `Invalid reaction type: ${type}` }, 400);
    }

    const product = await env.DB
      .prepare(`SELECT id, seller_id FROM products WHERE id = ? LIMIT 1`)
      .bind(product_id)
      .first<any>();

    if (!product) return json({ error: "Product not found" }, 404);

    const existing = await env.DB
      .prepare(`SELECT type FROM product_reactions WHERE product_id = ? AND user_id = ? LIMIT 1`)
      .bind(product_id, user_id)
      .first<any>();

    let action: "added" | "removed" | "changed" = "added";

    if (existing) {
      if (existing.type === type) {
        // Same reaction → remove (toggle off)
        await env.DB
          .prepare(`DELETE FROM product_reactions WHERE product_id = ? AND user_id = ?`)
          .bind(product_id, user_id)
          .run();
        action = "removed";
      } else {
        // Different reaction → change
        await env.DB
          .prepare(`UPDATE product_reactions SET type = ?, created_at = CURRENT_TIMESTAMP WHERE product_id = ? AND user_id = ?`)
          .bind(type, product_id, user_id)
          .run();
        action = "changed";
      }
    } else {
      await env.DB
        .prepare(`INSERT INTO product_reactions (product_id, user_id, type) VALUES (?, ?, ?)`)
        .bind(product_id, user_id, type)
        .run();
      action = "added";
    }

    // Recompute count from source-of-truth (safe, no drift)
    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM product_reactions WHERE product_id = ?`)
      .bind(product_id)
      .first<{ c: number }>();

    const reactionsCount = toNum(count?.c, 0);

    // Best-effort sync of denormalized counter — ignore if column missing
    try {
      await env.DB
        .prepare(`UPDATE products SET reactions_count = ? WHERE id = ?`)
        .bind(reactionsCount, product_id)
        .run();
    } catch (_) {
      // products.reactions_count doesn't exist — safe to ignore
    }

    // Notify only on add/change, never on remove, and never self-notify
    if (action !== "removed") {
      const sellerId = toNum(product.seller_id, 0);
      if (sellerId && sellerId !== user_id) {
        try {
          await createNotification(
            env,
            sellerId,
            user_id,
            "react",
            "product",
            product_id,
            `react_product_${product_id}`
          );
        } catch (_) {
          // notification failure shouldn't break the reaction
        }
      }
    }

    const myReaction = action === "removed" ? null : type;

    return json({
      success: true,
      action,
      reactions_count: reactionsCount,
      my_reaction: myReaction,
    });
  } catch (err: any) {
    return json(
      { error: err?.message || "Failed to react to product" },
      500
    );
  }
};
