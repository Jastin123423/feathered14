si// GET /api/backgrounds/animated/:id
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const id = Number((params as any)?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return json({ success: false, error: "Invalid id" }, 400);
    }

    const row = await env.DB
      .prepare(
        `SELECT
           id, name, url,
           COALESCE(thumbnail_url, url) AS thumbnail_url,
           poster_url, is_animated, width, height,
           dominant_color, text_color, overlay_color, overlay_opacity,
           category, sort_order
         FROM animated_backgrounds
         WHERE id = ? AND is_active = 1 AND is_deleted = 0
         LIMIT 1`
      )
      .bind(id)
      .first<any>();

    if (!row) return json({ success: false, error: "Not found" }, 404);
    return json({ success: true, data: row });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed" }, 500);
  }
};
