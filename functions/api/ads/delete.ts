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

    const userId = toNum(request.headers.get("x-user-id"), 0);
    if (!userId) return json({ success: false, error: "Missing user id" }, 400);

    const body: any = await request.json().catch(() => ({}));
    const adId = toNum(body.ad_id, 0);
    if (!adId) return json({ success: false, error: "ad_id is required" }, 400);

    const ad = await env.DB
      .prepare(`SELECT id, advertiser_id FROM ads WHERE id = ? LIMIT 1`)
      .bind(adId)
      .first<any>();

    if (!ad) return json({ success: false, error: "Ad not found" }, 404);
    if (toNum(ad.advertiser_id, 0) !== userId) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    // FK cascades delete ad_impressions and ad_clicks
    await env.DB.prepare(`DELETE FROM ads WHERE id = ?`).bind(adId).run();

    return json({
      success: true,
      ad_id: adId,
      deleted: true,
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to delete ad" },
      500
    );
  }
};
