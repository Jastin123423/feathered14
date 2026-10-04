import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

const safeJsonArray = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseTs = (v: any): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const userId = toNum(request.headers.get("x-user-id"), 0);
    if (!userId) return json({ success: false, error: "Missing user id" }, 400);

    const ads = await env.DB
      .prepare(
        `SELECT *
         FROM ads
         WHERE advertiser_id = ?
         ORDER BY created_at DESC`
      )
      .bind(userId)
      .all();

    const parsedAds = (ads.results || []).map((ad: any) => {
      const mediaUrls = safeJsonArray(ad.media_urls);
      const mediaTypes = safeJsonArray(ad.media_types);

      const mediaUrl = ad.media_url || (mediaUrls.length > 0 ? mediaUrls[0] : "");
      const mediaType =
        ad.media_type || (mediaTypes.length > 0 ? mediaTypes[0] : "image");

      let days = ad.duration_days || 7;
      if (ad.start_date && ad.end_date && !ad.duration_days) {
        const start = new Date(ad.start_date).getTime();
        const end = new Date(ad.end_date).getTime();
        if (Number.isFinite(start) && Number.isFinite(end)) {
          days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        }
      }

      return {
        id: ad.id,
        advertiser_id: ad.advertiser_id,
        post_id: ad.post_id,
        name: ad.campaign_name || `Campaign #${ad.id}`,
        type: mediaType === "video" ? "video" : "image",
        status: ad.status || "draft",

        description: ad.description || "",
        mediaUrl,
        media_urls: mediaUrls,
        media_types: mediaTypes,
        destination_url: ad.destination_url,
        cta_button: ad.cta_button || "Learn More",

        phone_number: ad.phone_number,
        email: ad.email_address,
        whatsapp_number: null,

        target_location: ad.target_location || "Global",
        target_countries: ad.target_country ? [ad.target_country] : [],

        budget: ad.budget || 0,
        daily_budget: ad.daily_budget || 0,
        total_budget: ad.budget || 0,
        currency: ad.currency || "USD",

        start_date: ad.start_date,
        end_date: ad.end_date,
        days,
        createdAt: parseTs(ad.created_at),

        analytics: {
          impressions: ad.impressions || 0,
          clicks: ad.clicks || 0,
          views: ad.views || 0,
          spend: ad.spent || 0,
        },

        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        views: ad.views || 0,
        spent: ad.spent || 0,
        ctr: ad.ctr || 0,

        is_free: ad.is_free === 1,

        campaign_name: ad.campaign_name,
        contact_type: ad.contact_type,
        media_url: ad.media_url,

        created_at: ad.created_at,
        updated_at: ad.updated_at,
      };
    });

    return json({ success: true, ads: parsedAds });
  } catch (err: any) {
    console.error("Error fetching ads:", err);
    return json(
      { success: false, error: err?.message || String(err) },
      500
    );
  }
};
