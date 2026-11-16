// GET /api/backgrounds/animated?category=animated&page=1&per_page=50
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const url = new URL(request.url);
    const category = (url.searchParams.get("category") || "").trim();
    const page = Math.max(1, toNum(url.searchParams.get("page"), 1));
    const perPage = Math.min(100, Math.max(1, toNum(url.searchParams.get("per_page"), 50)));
    const offset = (page - 1) * perPage;

    const where: string[] = ["is_active = 1", "is_deleted = 0"];
    const bindings: any[] = [];

    if (category) {
      where.push("category = ?");
      bindings.push(category);
    }

    const sql = `
      SELECT
        id, name, url,
        COALESCE(thumbnail_url, url) AS thumbnail_url,
        poster_url,
        is_animated, width, height,
        dominant_color, text_color, overlay_color, overlay_opacity,
        category, sort_order
      FROM animated_backgrounds
      WHERE ${where.join(" AND ")}
      ORDER BY sort_order, id
      LIMIT ? OFFSET ?
    `;

    const result = await env.DB
      .prepare(sql)
      .bind(...bindings, perPage, offset)
      .all<any>();

    const rows = result.results || [];

    return json(
      {
        success: true,
        data: rows,
        meta: { page, per_page: perPage, count: rows.length },
      },
      200,
      // curated list → cache at edge
      { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" }
    );
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to list" }, 500);
  }
};
