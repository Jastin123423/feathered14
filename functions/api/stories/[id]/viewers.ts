// functions/api/stories/[id]/viewers.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);

    const url = new URL(request.url);
    const limit = Math.min(Math.max(toInt(url.searchParams.get("limit"), 50), 1), 200);
    const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

    const exists = await env.DB.prepare(`SELECT id FROM stories WHERE id = ? LIMIT 1`)
      .bind(storyId)
      .first();
    if (!exists?.id) return json({ success: false, error: "Story not found" }, 404);

    const q = `
      SELECT
        sv.id,
        sv.story_id,
        sv.user_id,
        sv.created_at as viewed_at,

        u.username,
        u.name,
        u.profile_image_url,
        u.is_verified,
        u.role,

        sr.reaction as reaction

      FROM story_views sv
      LEFT JOIN users u ON u.id = sv.user_id
      LEFT JOIN story_reactions sr
        ON sr.story_id = sv.story_id
       AND sr.user_id = sv.user_id

      WHERE sv.story_id = ?
      ORDER BY sv.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(q).bind(storyId, limit, offset).all();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM story_views WHERE story_id = ?`
    )
      .bind(storyId)
      .first();

    return json({
      success: true,
      story_id: storyId,
      total: Number((countRow as any)?.total ?? 0),
      viewers: Array.isArray(results) ? results : [],
    });
  } catch (err: any) {
    return json({ success: false, error: "Backend crash", message: String(err?.message ?? err) }, 500);
  }
};
