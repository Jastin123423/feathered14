// functions/api/sounds/detail.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    // ✅ Prefer numeric sound_id, but keep old sound_key support
    const soundId = toNum(url.searchParams.get("sound_id"), 0);
    const soundKey = (url.searchParams.get("sound_key") || "").trim();

    if (!soundId && !soundKey) {
      return json({ success: false, error: "sound_id or sound_key is required" }, 400);
    }

    const row = await env.DB.prepare(
      `
      SELECT
        s.id,
        s.sound_key,
        s.title,
        s.audio_url,
        s.trim_start,
        s.trim_end,
        s.source_song_id,
        s.creator_user_id,
        s.uses_count,
        s.plays_count,

        u.username,
        u.name,
        u.profile_image_url,
        u.is_verified
      FROM sounds s
      LEFT JOIN users u ON u.id = s.creator_user_id
      WHERE ${soundId ? "s.id = ?" : "s.sound_key = ?"}
      LIMIT 1
      `
    ).bind(soundId ? soundId : soundKey).first();

    if (!row) return json({ success: false, error: "Sound not found" }, 404);

    // Stats from reels using this sound
    const stats = await env.DB.prepare(
      `
      SELECT
        COUNT(*) AS uses,
        COALESCE(SUM(views), 0) AS total_views,
        COALESCE(SUM(shares), 0) AS total_shares
      FROM reels
      WHERE sound_id = ?
      `
    ).bind(Number((row as any).id)).first();

    const uses = toNum((stats as any)?.uses, 0);
    const totalViews = toNum((stats as any)?.total_views, 0);
    const totalShares = toNum((stats as any)?.total_shares, 0);

    const start = toNum((row as any).trim_start, 0);
    const end = toNum((row as any).trim_end, 0);
    const duration = end > start ? Math.max(1, end - start) : 30;

    const sound = {
      id: Number((row as any).id),            // ✅ now numeric id
      soundKey: (row as any).sound_key,
      name: (row as any).title || "Original Sound",
      url: (row as any).audio_url || "",
      start,
      end,
      songId: (row as any).source_song_id ? Number((row as any).source_song_id) : null,
      isOriginal: String((row as any).sound_key || "").startsWith("original:"),
      duration,

      creationCount: uses,
      viewCount: totalViews,
      playCount: totalViews, // keep your old approximation

      creator: {
        id: toNum((row as any).creator_user_id, 0),
        username: (row as any).username || "",
        name: (row as any).name || (row as any).username || "User",
        profile_image_url: (row as any).profile_image_url || null,
        is_verified: toNum((row as any).is_verified, 0),
      },

      totalShares,
    };

    return json({ success: true, sound });
  } catch (e: any) {
    return json({ success: false, error: String(e?.message || e) }, 500);
  }
};
