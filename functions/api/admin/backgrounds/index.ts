// POST /api/admin/backgrounds
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

const toNum = (v: any, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const toStr = (v: any, f = "") => (typeof v === "string" ? v : f);

async function isAdmin(env: Env, request: Request): Promise<boolean> {
  const userId = toNum(request.headers.get("x-user-id"), 0);
  if (!userId) return false;
  const row = await env.DB
    .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<{ role: string | null }>();
  return (row?.role || "").toLowerCase() === "admin";
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);
    if (!(await isAdmin(env, request))) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const body: any = await request.json().catch(() => ({}));

    const url = toStr(body.url, "").trim();
    const thumbnail_url = toStr(body.thumbnail_url, "").trim();
    
    if (!url || !thumbnail_url) {
      return json({ success: false, error: "url and thumbnail_url are required" }, 400);
    }

    const category = toStr(body.category, "animated").trim().toLowerCase() || "animated";

    const row = await env.DB
      .prepare(
        `INSERT INTO animated_backgrounds
           (url, thumbnail_url, poster_url, name, format, is_animated,
            width, height, file_size, mime_type,
            thumb_width, thumb_height, thumb_file_size,
            dominant_color, text_color, overlay_color, overlay_opacity,
            category, sort_order, is_active, is_deleted)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)
         RETURNING *`
      )
      .bind(
        url,
        thumbnail_url,
        toStr(body.poster_url, "") || null,
        toStr(body.name, "") || null,
        toStr(body.format, "webp"),
        toNum(body.is_animated, 1),
        toNum(body.width, 0) || null,
        toNum(body.height, 0) || null,
        toNum(body.file_size, 0) || null,
        toStr(body.mime_type, "image/webp") || null,
        toNum(body.thumb_width, 0) || null,
        toNum(body.thumb_height, 0) || null,
        toNum(body.thumb_file_size, 0) || null,
        toStr(body.dominant_color, "") || null,
        toStr(body.text_color, "") || null,
        toStr(body.overlay_color, "") || null,
        body.overlay_opacity != null ? Number(body.overlay_opacity) : null,
        category,
        toNum(body.sort_order, 0)
      )
      .first<any>();

    return json({ success: true, data: row }, 201);
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Insert failed" }, 500);
  }
};
