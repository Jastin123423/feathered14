// functions/api/songs.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { withNewContentId } from "../utils/ids";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const DEFAULT_SONG_COVER =
  "https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp";

const safeStr = (v: any) => String(v ?? "").trim();

const safeNum = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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

/**
 * POST /api/songs
 * Create song
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const body = await request.json().catch(() => ({} as any));

    const uploader_id = safeNum(
      body.uploader_id ?? body.user_id ?? body.artist_id ?? body.creator_id
    );

    const title = safeStr(body.title);

    const artist_name = safeStr(
      body.artist_name ?? body.artist ?? body.uploader_name ?? body.creator_name
    );

    const album_name = safeStr(body.album_name ?? body.album) || null;

    const cover_image_url =
      safeStr(body.cover_image_url ?? body.cover_url ?? body.cover) ||
      DEFAULT_SONG_COVER;

    const audio_url = safeStr(
      body.audio_url ?? body.audio ?? body.url ?? body.media_url
    );

    const duration_seconds =
      safeNum(body.duration_seconds ?? body.duration ?? body.durationSecs) || null;

    const genre = safeStr(body.genre) || null;

    const missing: string[] = [];
    if (!uploader_id) missing.push("uploader_id (or user_id)");
    if (!title) missing.push("title");
    if (!artist_name) missing.push("artist_name (or artist)");
    if (!audio_url) missing.push("audio_url (or audio/url/media_url)");

    if (missing.length) {
      return json(
        {
          success: false,
          error: "Missing required fields",
          missing,
          received: {
            uploader_id,
            title: Boolean(title),
            artist_name: Boolean(artist_name),
            audio_url: Boolean(audio_url),
            cover_image_url,
          },
        },
        400
      );
    }

    const { id: song_id } = await withNewContentId(async (id) => {
      return await env.DB.prepare(`
        INSERT INTO songs
          (
            id,
            uploader_id,
            title,
            artist_name,
            album_name,
            cover_image_url,
            audio_url,
            duration_seconds,
            genre,
            plays_count,
            is_deleted
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `)
        .bind(
          id,
          uploader_id,
          title,
          artist_name,
          album_name,
          cover_image_url,
          audio_url,
          duration_seconds,
          genre
        )
        .run();
    });

    return json({
      success: true,
      song_id,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};

/**
 * GET /api/songs
 * Fetch songs with real plays count (excludes deleted)
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const { results } = await env.DB.prepare(`
      SELECT
        id,
        uploader_id,
        title,
        artist_name,
        album_name,

        CASE
          WHEN cover_image_url IS NULL OR TRIM(cover_image_url) = ''
          THEN '${DEFAULT_SONG_COVER}'
          ELSE cover_image_url
        END AS cover_image_url,

        audio_url,
        duration_seconds,
        genre,
        created_at,

        COALESCE(plays_count, 0) AS plays_count

      FROM songs
      WHERE COALESCE(is_deleted, 0) = 0
      ORDER BY created_at DESC
    `).all();

    return json(results || []);
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};

/**
 * DELETE /api/songs?id=X&user_id=Y
 * Soft-deletes a song (sets is_deleted = 1) - uploader only
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const url = new URL(request.url);
    const id = safeNum(url.searchParams.get("id"));
    const headerUserId = safeNum(request.headers.get("x-user-id"));
    const queryUserId = safeNum(url.searchParams.get("user_id"));
    let bodyUserId = 0;
    try {
      const body = await request.json();
      bodyUserId = safeNum(body?.user_id || body?.uploader_id);
    } catch {}
    const userId = headerUserId || queryUserId || bodyUserId;

    if (!id) {
      return json({ success: false, error: "Missing song id" }, 400);
    }
    if (!userId) {
      return json({ success: false, error: "Missing user authentication" }, 401);
    }

    const song = await env.DB.prepare("SELECT * FROM songs WHERE id = ?").bind(id).first<any>();
    if (!song) {
      return json({ success: false, error: "Song not found" }, 404);
    }

    if (safeNum(song.uploader_id) !== userId) {
      return json({ success: false, error: "Not authorized to delete this song" }, 403);
    }

    await env.DB.prepare("UPDATE songs SET is_deleted = 1 WHERE id = ?").bind(id).run();

    return json({ success: true, deleted: true, id });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Failed to delete song" }, 500);
  }
};
