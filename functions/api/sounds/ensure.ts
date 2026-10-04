// functions/api/sounds/ensure.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Expected D1 table (example):
 *
 * CREATE TABLE IF NOT EXISTS sounds (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   sound_key TEXT NOT NULL UNIQUE,
 *   title TEXT NOT NULL,
 *   audio_url TEXT NOT NULL,
 *   trim_start REAL NOT NULL DEFAULT 0,
 *   trim_end REAL NOT NULL DEFAULT 0,
 *   source_song_id INTEGER,
 *   user_id INTEGER,
 *   plays INTEGER NOT NULL DEFAULT 0,
 *   is_public INTEGER NOT NULL DEFAULT 1,
 *   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 * );
 */

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const body = await request.json().catch(() => ({}));

    const sound_key = toStr(body?.sound_key).trim();
    const title = toStr(body?.title, "Original Sound").trim() || "Original Sound";
    const audio_url = toStr(body?.audio_url).trim();

    // trims
    let trim_start = toNum(body?.trim_start, 0);
    let trim_end = toNum(body?.trim_end, 0);

    // optional meta
    const source_song_id =
      body?.source_song_id === null || body?.source_song_id === undefined
        ? null
        : toNum(body?.source_song_id, 0) || null;

    const user_id =
      body?.user_id === null || body?.user_id === undefined
        ? null
        : toNum(body?.user_id, 0) || null;

    const is_public = body?.is_public === undefined ? 1 : (body?.is_public ? 1 : 0);

    // Validate
    if (!sound_key) return json({ success: false, error: "sound_key is required" }, 400);
    if (!audio_url) return json({ success: false, error: "audio_url is required" }, 400);

    // Normalize trim values
    // - allow 0..(very large) but keep sane
    trim_start = clamp(trim_start, 0, 60 * 60 * 6); // up to 6 hours
    trim_end = clamp(trim_end, 0, 60 * 60 * 6);

    // If end is before start, swap (common UI bug)
    if (trim_end > 0 && trim_end < trim_start) {
      const tmp = trim_start;
      trim_start = trim_end;
      trim_end = tmp;
    }

    // 1) Return existing by sound_key (idempotent)
    const existing = await env.DB.prepare(
      `SELECT id, sound_key, title, audio_url, trim_start, trim_end, source_song_id, created_at, user_id, plays, is_public
       FROM sounds
       WHERE sound_key = ?1
       LIMIT 1`
    )
      .bind(sound_key)
      .first<any>();

    if (existing?.id) {
      // Optional: if caller sends better title/audio_url, you can refresh metadata safely.
      // Keep it conservative (don’t overwrite audio_url unless identical key means identical audio).
      // Here we only update title if it changed and is non-empty.
      const incomingTitle = title.trim();
      if (incomingTitle && incomingTitle !== existing.title) {
        await env.DB.prepare(`UPDATE sounds SET title = ?1 WHERE id = ?2`)
          .bind(incomingTitle, existing.id)
          .run();
        existing.title = incomingTitle;
      }

      return json({ success: true, sound: existing });
    }

    // 2) Insert new sound
    await env.DB.prepare(
      `INSERT INTO sounds (sound_key, title, audio_url, trim_start, trim_end, source_song_id, user_id, is_public)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
      .bind(
        sound_key,
        title,
        audio_url,
        trim_start,
        trim_end,
        source_song_id,
        user_id,
        is_public
      )
      .run();

    // 3) Read back inserted row (safe even if insert raced—unique sound_key)
    const created = await env.DB.prepare(
      `SELECT id, sound_key, title, audio_url, trim_start, trim_end, source_song_id, created_at, user_id, plays, is_public
       FROM sounds
       WHERE sound_key = ?1
       LIMIT 1`
    )
      .bind(sound_key)
      .first<any>();

    if (!created?.id) {
      return json({ success: false, error: "Sound ensure failed: could not read created row" }, 500);
    }

    return json({ success: true, sound: created });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    // Common failure: UNIQUE constraint if race happened; in that case re-select
    if (String(msg).toLowerCase().includes("unique")) {
      try {
        // best-effort recover by reselecting (sound_key is unique)
        const body = await request.clone().json().catch(() => ({}));
        const sound_key = toStr(body?.sound_key).trim();
        if (sound_key) {
          const existing = await env.DB.prepare(
            `SELECT id, sound_key, title, audio_url, trim_start, trim_end, source_song_id, created_at, user_id, plays, is_public
             FROM sounds
             WHERE sound_key = ?1
             LIMIT 1`
          )
            .bind(sound_key)
            .first<any>();
          if (existing?.id) return json({ success: true, sound: existing });
        }
      } catch {}
    }

    return json({ success: false, error: msg }, 500);
  }
};
