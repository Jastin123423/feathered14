import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const safeNum = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const onRequestPost: PagesFunction = async ({ env, request, params }) => {
  try {
    const songId = safeNum((params as any)?.id);
    if (!songId) return new Response(JSON.stringify({ error: "Invalid song id" }), { status: 400, headers: cors });

    const body = await request.json().catch(() => ({} as any));
    const userId = safeNum(body?.user_id);
    if (!userId) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: cors });

    // Check if liked
    const existing = await env.DB.prepare(`
      SELECT id FROM song_likes WHERE song_id = ? AND user_id = ?
    `).bind(songId, userId).first();

    let liked = false;

    if (existing?.id) {
      // unlike
      await env.DB.prepare(`DELETE FROM song_likes WHERE song_id = ? AND user_id = ?`)
        .bind(songId, userId)
        .run();

      await env.DB.prepare(`
        UPDATE songs SET likes_count = MAX(0, COALESCE(likes_count,0) - 1) WHERE id = ?
      `).bind(songId).run();

      liked = false;
    } else {
      // like
      await env.DB.prepare(`INSERT INTO song_likes (song_id, user_id) VALUES (?, ?)`)
        .bind(songId, userId)
        .run();

      await env.DB.prepare(`
        UPDATE songs SET likes_count = COALESCE(likes_count,0) + 1 WHERE id = ?
      `).bind(songId).run();

      liked = true;
    }

    const row = await env.DB.prepare(`
      SELECT COALESCE(likes_count,0) AS likes_count FROM songs WHERE id=?
    `).bind(songId).first();

    return new Response(JSON.stringify({
      success: true,
      liked,
      likes_count: row?.likes_count ?? 0
    }), { status: 200, headers: cors });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), { status: 500, headers: cors });
  }
};
