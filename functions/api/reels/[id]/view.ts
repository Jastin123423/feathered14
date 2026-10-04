import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ params, env }) => {
  try {
    const reelId = Number(params.id);
    if (!Number.isFinite(reelId) || reelId <= 0) {
      return json({ success: false, error: "Invalid reel id" }, 400);
    }

    await env.DB.prepare(`
      UPDATE reels
      SET views = COALESCE(views, 0) + 1
      WHERE id = ?
    `).bind(reelId).run();

    const row = await env.DB.prepare(`
      SELECT COALESCE(views, 0) as views
      FROM reels
      WHERE id = ?
    `).bind(reelId).first();

    return json({
      success: true,
      reel_id: reelId,
      views: Number((row as any)?.views || 0),
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};
