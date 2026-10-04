// functions/api/sounds/popular.ts
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
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);

    const rows = await env.DB.prepare(
      `
      SELECT
        s.id,
        s.sound_key,
        s.title,
        s.audio_url,
        s.trim_start,
        s.trim_end,
        s.source_song_id,
        s.uses_count,
        s.plays_count
      FROM sounds s
      ORDER BY s.uses_count DESC, s.plays_count DESC, s.created_at DESC
      LIMIT ?
      `
    ).bind(limit).all();

    const sounds = (rows.results || []).map((r: any) => {
      const start = toNum(r.trim_start, 0);
      const end = toNum(r.trim_end, 0);
      const duration = end > start ? Math.max(1, end - start) : 30;

      return {
        id: Number(r.id),                 // ✅ now numeric id
        soundKey: r.sound_key,
        name: r.title || "Original Sound",
        url: r.audio_url || "",
        start,
        end,
        songId: r.source_song_id ? Number(r.source_song_id) : null,
        duration,

        creationCount: toNum(r.uses_count, 0),
        viewCount: toNum(r.plays_count, 0),   // you can rename later if you track views separately
        playCount: toNum(r.plays_count, 0),

        isOriginal: String(r.sound_key || "").startsWith("original:"),
      };
    });

    return json({ success: true, sounds });
  } catch (e: any) {
    return json({ success: false, error: String(e?.message || e) }, 500);
  }
};
