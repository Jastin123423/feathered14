// api/ads/feeds.ts
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

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const ads = await env.DB.prepare(`
      SELECT
        id,
        advertiser_id,
        post_id,
        campaign_name,
        title,
        description,
        media_url,
        media_urls,
        media_types,
        media_type,
        contact_type,
        destination_url,
        phone_number,
        email_address,
        cta_button,
        target_location,
        target_country,
        target_city,
        impressions,
        clicks,
        views,
        ctr,
        start_date,
        end_date,
        created_at,
        source_type,
        source_id,
        source_snapshot
      FROM ads
      WHERE status = 'active'
        AND (start_date IS NULL OR datetime(start_date) <= datetime('now'))
        AND (end_date IS NULL OR datetime(end_date) >= datetime('now'))
      ORDER BY RANDOM()
      LIMIT 3
    `).all();

    return json({ success: true, ads: ads.results || [] });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || String(err) },
      500
    );
  }
};
