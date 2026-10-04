// functions/api/sounds.ts
import type { PagesFunction } from '@cloudflare/workers-types';

type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (v: any) => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/sounds
 * Body:
 *  - creator_user_id
 *  - title
 *  - audio_url (required)
 *  - duration (optional)
 *  - source_song_id (optional)
 *  - source_reel_id (optional)
 *  - original_audio_url (optional)
 *  - trim_start, trim_end (optional)
 *  - sound_key (required + UNIQUE for reuse)
 *
 * Returns: { success, sound }
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const creator_user_id = toNum(body.creator_user_id, 0) || null;
    const title = toText(body.title) ?? 'Original Sound';

    const audio_url = toText(body.audio_url);
    if (!audio_url) return json({ success: false, error: 'audio_url is required' }, 400);

    const duration = toNum(body.duration, 0);

    const source_song_id = body.source_song_id == null ? null : toNum(body.source_song_id, 0);
    const source_reel_id = body.source_reel_id == null ? null : toNum(body.source_reel_id, 0);
    const original_audio_url = toText(body.original_audio_url);

    const trim_start = toNum(body.trim_start, 0);
    const trim_end = toNum(body.trim_end, 0);

    const sound_key = toText(body.sound_key);
    if (!sound_key) return json({ success: false, error: 'sound_key is required' }, 400);

    // 1) If exists, reuse it (THIS is the reuse mechanism)
    const existing = await env.DB.prepare(
      `SELECT id, creator_user_id, title, audio_url, duration, source_song_id, source_reel_id,
              original_audio_url, trim_start, trim_end, sound_key, uses_count, plays_count, created_at
       FROM sounds
       WHERE sound_key = ?
       LIMIT 1`
    ).bind(sound_key).first();

    if (existing) {
      return json({ success: true, sound: existing });
    }

    // 2) Create it
    const ins = await env.DB.prepare(
      `INSERT INTO sounds
        (creator_user_id, title, audio_url, duration, source_song_id, source_reel_id, original_audio_url,
         trim_start, trim_end, sound_key, uses_count, plays_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
      .bind(
        creator_user_id,
        title,
        audio_url,
        duration,
        source_song_id,
        source_reel_id,
        original_audio_url,
        trim_start,
        trim_end,
        sound_key
      )
      .run();

    const id = Number(ins.meta.last_row_id || 0);

    const row = await env.DB.prepare(
      `SELECT id, creator_user_id, title, audio_url, duration, source_song_id, source_reel_id,
              original_audio_url, trim_start, trim_end, sound_key, uses_count, plays_count, created_at
       FROM sounds
       WHERE id = ?
       LIMIT 1`
    ).bind(id).first();

    return json({ success: true, sound: row ?? { id } });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};
