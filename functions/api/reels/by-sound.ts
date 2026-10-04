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
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const pickFirst = (...values: any[]) => {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
};

const safeBool = (v: any) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
  }
  return false;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    const soundKey = (url.searchParams.get("sound_key") || "").trim();
    const audioUrl = (url.searchParams.get("audio_url") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 60), 120);

    if (!soundKey && !audioUrl) {
      return json(
        { success: false, error: "sound_key or audio_url is required" },
        400
      );
    }

    const rowsRes = await env.DB.prepare(
      `
      SELECT
        r.id,
        r.user_id,

        r.video_url,
        r.video_url_low,
        r.video_url_medium,
        r.video_url_hd,
        r.thumbnail_url,

        r.caption,
        r.song_name,
        r.audio_url,
        r.audio_start,
        r.audio_end,

        r.views,
        r.shares,
        r.song_id,
        r.sound_id,
        r.sound_key,

        r.is_original_sound,
        r.original_audio_url,
        r.original_sound_title,
        r.original_sound_owner_id,

        r.visibility,
        r.location,
        r.created_at,

        u.username,
        u.name,
        u.profile_image_url,
        u.is_verified
      FROM reels r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE
        (
          ? != ''
          AND r.sound_key = ?
        )
        OR
        (
          ? != ''
          AND (
            r.audio_url = ?
            OR r.original_audio_url = ?
          )
        )
        OR
        (
          ? != ''
          AND r.is_original_sound = 1
          AND (
            r.sound_key = ?
            OR r.audio_url = ?
            OR r.original_audio_url = ?
          )
        )
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ?
      `
    )
      .bind(
        soundKey,
        soundKey,

        audioUrl,
        audioUrl,
        audioUrl,

        soundKey,
        soundKey,
        audioUrl,
        audioUrl,

        limit
      )
      .all();

    const rows = Array.isArray(rowsRes.results) ? rowsRes.results : [];

    const ownerCandidate =
      [...rows].sort((a: any, b: any) => {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        if (at !== bt) return at - bt;
        return toNum(a.id) - toNum(b.id);
      })[0] || null;

    const originalOwnerId =
      ownerCandidate?.original_sound_owner_id == null
        ? toNum(ownerCandidate?.user_id, 0)
        : toNum(ownerCandidate?.original_sound_owner_id, 0);

    let ownerRow: any = ownerCandidate;

    if (originalOwnerId) {
      const foundOwner = rows.find(
        (r: any) => toNum(r.user_id, 0) === originalOwnerId
      );
      if (foundOwner) ownerRow = foundOwner;
      else {
        const user = await env.DB.prepare(
          `
          SELECT id, name, username, profile_image_url, is_verified
          FROM users
          WHERE id = ?
          LIMIT 1
          `
        )
          .bind(originalOwnerId)
          .first();

        if (user) {
          ownerRow = {
            ...ownerCandidate,
            user_id: (user as any).id,
            name: (user as any).name,
            username: (user as any).username,
            profile_image_url: (user as any).profile_image_url,
            is_verified: (user as any).is_verified,
          };
        }
      }
    }

    const totalViews = rows.reduce(
      (sum: number, r: any) => sum + toNum(r.views, 0),
      0
    );

    const totalShares = rows.reduce(
      (sum: number, r: any) => sum + toNum(r.shares, 0),
      0
    );

    const soundTitle = pickFirst(
      ownerCandidate?.original_sound_title,
      ownerCandidate?.song_name,
      rows[0]?.original_sound_title,
      rows[0]?.song_name,
      "Original Sound"
    );

    const resolvedSoundKey = pickFirst(
      soundKey,
      ownerCandidate?.sound_key,
      rows[0]?.sound_key,
      "original:none"
    );

    const resolvedAudioUrl = pickFirst(
      audioUrl,
      ownerCandidate?.original_audio_url,
      ownerCandidate?.audio_url,
      rows[0]?.original_audio_url,
      rows[0]?.audio_url
    );

    const reels = rows.map((r: any) => ({
      id: toNum(r.id),
      userId: toNum(r.user_id),
      user_id: toNum(r.user_id),

      videoUrl: pickFirst(r.video_url_medium, r.video_url, r.video_url_low, r.video_url_hd),
      video_url: pickFirst(r.video_url_medium, r.video_url, r.video_url_low, r.video_url_hd),
      video_url_low: pickFirst(r.video_url_low),
      video_url_medium: pickFirst(r.video_url_medium, r.video_url),
      video_url_hd: pickFirst(r.video_url_hd),

      thumbnail_url: pickFirst(r.thumbnail_url),
      thumbnail: pickFirst(r.thumbnail_url),

      caption: pickFirst(r.caption),
      songName: pickFirst(r.original_sound_title, r.song_name, soundTitle),
      song_name: pickFirst(r.original_sound_title, r.song_name, soundTitle),

      audioUrl: pickFirst(r.original_audio_url, r.audio_url, resolvedAudioUrl),
      audio_url: pickFirst(r.original_audio_url, r.audio_url, resolvedAudioUrl),
      audioStart: toNum(r.audio_start, 0),
      audio_start: toNum(r.audio_start, 0),
      audioEnd: toNum(r.audio_end, 0),
      audio_end: toNum(r.audio_end, 0),

      views: toNum(r.views, 0),
      shares: toNum(r.shares, 0),

      songId: r.song_id == null ? null : toNum(r.song_id),
      song_id: r.song_id == null ? null : toNum(r.song_id),
      soundId: r.sound_id == null ? null : toNum(r.sound_id),
      sound_id: r.sound_id == null ? null : toNum(r.sound_id),
      soundKey: pickFirst(r.sound_key, resolvedSoundKey),
      sound_key: pickFirst(r.sound_key, resolvedSoundKey),

      isOriginalSound: safeBool(r.is_original_sound),
      is_original_sound: safeBool(r.is_original_sound) ? 1 : 0,
      originalAudioUrl: pickFirst(r.original_audio_url),
      original_audio_url: pickFirst(r.original_audio_url),
      originalSoundTitle: pickFirst(r.original_sound_title, soundTitle),
      original_sound_title: pickFirst(r.original_sound_title, soundTitle),
      originalSoundOwnerId:
        r.original_sound_owner_id == null ? originalOwnerId : toNum(r.original_sound_owner_id),
      original_sound_owner_id:
        r.original_sound_owner_id == null ? originalOwnerId : toNum(r.original_sound_owner_id),

      visibility: pickFirst(r.visibility, "public"),
      location: pickFirst(r.location),
      createdAt: r.created_at,
      created_at: r.created_at,

      author: {
        id: toNum(r.user_id),
        username: pickFirst(r.username),
        name: pickFirst(r.name, r.username, "User"),
        profile_image_url: pickFirst(r.profile_image_url),
        is_verified: safeBool(r.is_verified),
      },

      author_name: pickFirst(r.name, r.username, "User"),
      username: pickFirst(r.username),
      avatar_url: pickFirst(r.profile_image_url),
      verified: safeBool(r.is_verified),

      reactions: [],
      comments: [],
      reactions_count: 0,
      comments_count: 0,
      my_reaction: null,
    }));

    return json({
      success: true,
      sound_key: resolvedSoundKey,
      audio_url: resolvedAudioUrl,
      count: reels.length,

      sound: {
        sound_key: resolvedSoundKey,
        audio_url: resolvedAudioUrl,
        name: soundTitle,
        title: soundTitle,

        creator_id: toNum(ownerRow?.user_id, originalOwnerId),
        creator_name: pickFirst(ownerRow?.name, ownerRow?.username, "User"),
        creator_username: pickFirst(ownerRow?.username),
        creator_avatar: pickFirst(ownerRow?.profile_image_url),
        creator_verified: safeBool(ownerRow?.is_verified),

        total_uses: reels.length,
        total_views: totalViews,
        total_shares: totalShares,
      },

      reels,
    });
  } catch (e: any) {
    return json(
      { success: false, error: e?.message || "Server error" },
      500
    );
  }
};
