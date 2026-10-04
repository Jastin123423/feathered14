
import type { PagesFunction } from "@cloudflare/workers-types";

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

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || null;

    const adId = toNum(body.ad_id, 0);
    if (!adId) return json({ success: false, error: "ad_id is required" }, 400);

    const ad = await env.DB
      .prepare(`SELECT id, status FROM ads WHERE id = ? LIMIT 1`)
      .bind(adId)
      .first<any>();

    if (!ad) return json({ success: false, error: "Ad not found" }, 404);
    if (ad.status !== "active") {
      return json({ success: false, error: "Ad not active" }, 400);
    }

    // Log the click
    await env.DB
      .prepare(`INSERT INTO ad_clicks (ad_id, user_id) VALUES (?, ?)`)
      .bind(adId, userId)
      .run();

    // Increment + recompute CTR
    await env.DB
      .prepare(
        `UPDATE ads
         SET clicks = COALESCE(clicks, 0) + 1,
             ctr = CASE
               WHEN COALESCE(impressions, 0) > 0
               THEN (COALESCE(clicks, 0) + 1) * 1.0 / COALESCE(impressions, 0)
               ELSE 0
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(adId)
      .run();

    // Return fresh numbers
    const fresh = await env.DB
      .prepare(`SELECT impressions, clicks, ctr FROM ads WHERE id = ? LIMIT 1`)
      .bind(adId)
      .first<any>();

    return json({
      success: true,
      ad_id: adId,
      impressions: toNum(fresh?.impressions, 0),
      clicks: toNum(fresh?.clicks, 0),
      ctr: Number(fresh?.ctr || 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to record click" },
      500
    );
  }
};
