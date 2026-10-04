// functions/api/stories.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { withNewContentId } from "../utils/ids";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toNullableNum = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const toStr = (v: any, fallback = "") =>
  typeof v === "string" ? v : fallback;

const isHttpUrl = (v: any) => {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeStringArray = (v: any): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x || "").trim()).filter(Boolean);
      }
    } catch {}
  }

  return [];
};

const normalizeMediaMetaArray = (v: any): any[] => {
  if (Array.isArray(v)) return v.filter(Boolean);

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}
  }

  return [];
};

const normalizeMediaType = (v: any, fallback = "image") => {
  const t = String(v || "").trim().toLowerCase();
  if (t === "image" || t === "video" || t === "audio") return t;
  return fallback;
};

const inferTypeFromUrl = (url: string) => {
  const u = String(url || "").toLowerCase();

  if (
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mov") ||
    u.includes(".m4v") ||
    u.includes(".m3u8")
  ) {
    return "video";
  }

  if (
    u.includes(".mp3") ||
    u.includes(".wav") ||
    u.includes(".ogg") ||
    u.includes(".m4a") ||
    u.includes(".aac")
  ) {
    return "audio";
  }

  return "image";
};

const normalizeStoryMedia = (item: any) => {
  const mediaMeta = normalizeMediaMetaArray(item?.media_meta);
  const mediaUrls = normalizeStringArray(item?.media_urls);
  const mediaTypes = normalizeStringArray(item?.media_types);

  if (mediaMeta.length > 0) {
    const normalized = mediaMeta
      .map((m: any) => {
        const thumb = String(m?.thumb || m?.thumbnail_url || "").trim();

        const feed = String(
          m?.feed || m?.feed_url || m?.url || m?.full || m?.full_url || ""
        ).trim();

        const full = String(
          m?.full ||
            m?.full_url ||
            m?.feed ||
            m?.feed_url ||
            m?.url ||
            m?.thumb ||
            ""
        ).trim();

        const chosenType = normalizeMediaType(
          m?.type,
          inferTypeFromUrl(full || feed || thumb)
        );

        return {
          thumb: isHttpUrl(thumb) ? thumb : null,
          feed: isHttpUrl(feed) ? feed : null,
          full: isHttpUrl(full) ? full : null,
          type: chosenType,
        };
      })
      .filter((m: any) => m.thumb || m.feed || m.full);

    if (normalized.length > 0) return normalized;
  }

  if (mediaUrls.length > 0) {
    const normalized = mediaUrls
      .map((url, i) => {
        const clean = String(url || "").trim();
        if (!isHttpUrl(clean)) return null;

        const t = normalizeMediaType(mediaTypes[i], inferTypeFromUrl(clean));

        return {
          thumb: t === "image" ? clean : null,
          feed: clean,
          full: clean,
          type: t,
        };
      })
      .filter(Boolean);

    if (normalized.length > 0) return normalized;
  }

  const singleUrl = String(item?.media_url || "").trim();

  if (isHttpUrl(singleUrl)) {
    const t = normalizeMediaType(item?.type, inferTypeFromUrl(singleUrl));

    return [
      {
        thumb: t === "image" ? singleUrl : null,
        feed: singleUrl,
        full: singleUrl,
        type: t,
      },
    ];
  }

  return [];
};

const addNormalizedStoryMedia = (story: any) => {
  const media = normalizeStoryMedia(story);
  const isVerified = Boolean(story?.author_is_verified && story?.author_is_verified !== '0');
  const isValidName = (v: any) =>
    typeof v === 'string' &&
    v.trim().length > 0 &&
    v.trim().toLowerCase() !== 'user' &&
    v.trim().toLowerCase() !== 'un';

  const authorName =
    (isValidName(story?.author_full_name) ? story.author_full_name.trim() : null) ||
    (isValidName(story?.author_name) ? story.author_name.trim() : null) ||
    story?.author_username ||
    story?.username ||
    'User';
  const authorUser = {
    id: story.user_id,
    name: authorName,
    username: story?.author_username || '',
    user_name: story?.author_username || '',
    profile_image_url: story?.author_image || '',
    avatar_url: story?.author_image || '',
    is_verified: isVerified,
    verified: isVerified,
  };

  return {
    ...story,

    author_name: authorName,
    author_full_name: story?.author_full_name || authorName,
    user: story?.user || authorUser,
    author: story?.author || authorUser,

    effect_id: story?.effect_id || "none",

    music_start: toNum(story?.music_start, 5),
    music_end: toNullableNum(story?.music_end),
    music_duration: toNum(story?.music_duration, 0),

    duration: clamp(toNum(story?.duration, 90), 1, 90),

    media,
    media_count: media.length,
    thumb_url: media[0]?.thumb || null,
    feed_url: media[0]?.feed || null,
    full_url: media[0]?.full || null,
  };
};

const selectStorySql = `
  SELECT
    s.*,
    CASE
      WHEN u.name IS NOT NULL AND trim(u.name) != '' AND lower(trim(u.name)) != 'user' THEN trim(u.name)
      WHEN u.username IS NOT NULL AND trim(u.username) != '' THEN trim(u.username)
      ELSE 'User'
    END AS author_name,
    u.name as author_full_name,
    u.username as author_username,
    u.profile_image_url as author_image,
    u.is_verified as author_is_verified,

    (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id) AS views_count,
    (SELECT COUNT(*) FROM story_reactions sr WHERE sr.story_id = s.id) AS reactions_count,
    (SELECT COUNT(*) FROM story_comments sc WHERE sc.story_id = s.id AND sc.is_deleted = 0) AS comments_count,
    (SELECT COUNT(*) FROM story_shares ss WHERE ss.story_id = s.id) AS shares_count,

    (SELECT sr.reaction
       FROM story_reactions sr
      WHERE sr.story_id = s.id
        AND sr.user_id = ?
      LIMIT 1
    ) AS my_reaction,

    EXISTS(
      SELECT 1
      FROM story_views sv2
      WHERE sv2.story_id = s.id
        AND sv2.user_id = ?
    ) AS viewed_by_me,

    (SELECT COUNT(*) FROM story_reactions sr WHERE sr.story_id = s.id) AS likes_count,

    (SELECT 1
       FROM story_reactions sr
      WHERE sr.story_id = s.id
        AND sr.user_id = ?
      LIMIT 1
    ) AS liked_by_me

  FROM stories s
  LEFT JOIN users u ON u.id = s.user_id
`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const body = await request.json().catch(() => ({} as any));

    const user_id = toInt(body.user_id, 0);
    const type = toStr(body.type, "").trim().toLowerCase();

    const media_url = body.media_url ? toStr(body.media_url).trim() : null;

    const media_urls_arr = normalizeStringArray(body.media_urls);
    const media_types_arr = normalizeStringArray(body.media_types);
    const media_meta_arr = normalizeMediaMetaArray(body.media_meta);

    const text_content = body.text_content ? toStr(body.text_content).trim() : null;
    const background_style = body.background_style ? toStr(body.background_style).trim() : null;

    const music_url = body.music_url ? toStr(body.music_url).trim() : null;
    const music_title = body.music_title ? toStr(body.music_title).trim() : null;

    const effect_id = toStr(body.effect_id || "none", "none").trim() || "none";

    const music_start = clamp(toNum(body.music_start, 5), 0, 90);
    const music_end = toNullableNum(body.music_end);
    const music_duration = Math.max(0, toNum(body.music_duration, 0));
    const duration = clamp(toNum(body.duration, 90), 1, 90);

    if (!user_id) return json({ success: false, error: "user_id is required" }, 400);

    if (type !== "text" && type !== "image" && type !== "video") {
      return json({ success: false, error: "type must be text, image, or video" }, 400);
    }

    if (type === "text" && !text_content) {
      return json({ success: false, error: "text_content is required" }, 400);
    }

    const filtered_urls = media_urls_arr
      .filter((u) => !String(u).startsWith("data:"))
      .filter((u) => isHttpUrl(u));

    const filtered_types: string[] = [];

    for (let i = 0; i < filtered_urls.length; i++) {
      const t = String(media_types_arr[i] || "").trim();
      filtered_types.push(t || "");
    }

    const mediaMetaFeedUrls = media_meta_arr
      .map((item: any) =>
        String(
          item?.feed ||
            item?.feed_url ||
            item?.url ||
            item?.full ||
            item?.full_url ||
            item?.thumb ||
            ""
        ).trim()
      )
      .filter((u: string) => isHttpUrl(u));

    const mediaMetaTypes = media_meta_arr.map((item: any) =>
      String(
        item?.type ||
          inferTypeFromUrl(item?.full || item?.feed || item?.thumb || "")
      ).trim()
    );

    const final_multi_urls =
      filtered_urls.length > 0 ? filtered_urls : mediaMetaFeedUrls;

    const final_multi_types =
      filtered_types.length > 0 ? filtered_types : mediaMetaTypes;

    const final_media_url =
      typeof media_url === "string" && media_url.trim().length > 0
        ? media_url
        : final_multi_urls[0] ?? null;

    if ((type === "image" || type === "video") && !final_media_url && media_meta_arr.length === 0) {
      return json({ success: false, error: "media_url or media_meta is required" }, 400);
    }

    const media_urls_json = final_multi_urls.length
      ? JSON.stringify(final_multi_urls)
      : null;

    const media_types_json = final_multi_types.length
      ? JSON.stringify(final_multi_types)
      : null;

    const media_meta_json = media_meta_arr.length
      ? JSON.stringify(media_meta_arr)
      : null;

    // ─────────────────────────────────────────────────────────
    // Allocate hard, globally-unique content ID.
    // Three fallback INSERTs (new / medium / ancient schema).
    // Each gets `id` as the first column and first bind arg.
    // ─────────────────────────────────────────────────────────
    let story_id: number;

    try {
      // ── Primary INSERT ──
      // Columns (17): id, user_id, type, media_url, media_urls,
      //   media_types, media_meta, text_content, background_style,
      //   music_url, music_title, music_start, music_end,
      //   music_duration, effect_id, duration, expires_at (literal)
      // Placeholders: 16 `?` + literal '9999-12-31' for expires_at
      // Bind args: 16
      const { id } = await withNewContentId(async (id) => {
        const stmt = `
          INSERT INTO stories
          (
            id,
            user_id,
            type,
            media_url,
            media_urls,
            media_types,
            media_meta,
            text_content,
            background_style,
            music_url,
            music_title,
            music_start,
            music_end,
            music_duration,
            effect_id,
            duration,
            expires_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '9999-12-31')
        `;

        return await env.DB.prepare(stmt)
          .bind(
            id,
            user_id,
            type,
            final_media_url,
            media_urls_json,
            media_types_json,
            media_meta_json,
            text_content,
            background_style,
            music_url,
            music_title,
            music_start,
            music_end,
            music_duration,
            effect_id,
            duration
          )
          .run();
      });
      story_id = id;
    } catch {
      try {
        // ── Medium INSERT (no effect/music/duration columns) ──
        // Columns: id + 10 originals = 11
        // Placeholders: 10 `?` + literal '9999-12-31'
        const { id } = await withNewContentId(async (id) => {
          const stmt = `
            INSERT INTO stories
            (
              id,
              user_id,
              type,
              media_url,
              media_urls,
              media_types,
              media_meta,
              text_content,
              background_style,
              music_url,
              music_title,
              expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '9999-12-31')
          `;

          return await env.DB.prepare(stmt)
            .bind(
              id,
              user_id,
              type,
              final_media_url,
              media_urls_json,
              media_types_json,
              media_meta_json,
              text_content,
              background_style,
              music_url,
              music_title
            )
            .run();
        });
        story_id = id;
      } catch {
        // ── Ancient INSERT (only base columns) ──
        // Columns: id + 7 originals = 8
        // Placeholders: 7 `?` + literal '9999-12-31'
        const { id } = await withNewContentId(async (id) => {
          const stmt = `
            INSERT INTO stories
            (
              id,
              user_id,
              type,
              media_url,
              text_content,
              background_style,
              music_url,
              music_title,
              expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '9999-12-31')
          `;

          return await env.DB.prepare(stmt)
            .bind(
              id,
              user_id,
              type,
              final_media_url,
              text_content,
              background_style,
              music_url,
              music_title
            )
            .run();
        });
        story_id = id;
      }
    }

    let story: any = await env.DB.prepare(
      `
      ${selectStorySql}
      WHERE s.id = ?
      LIMIT 1
      `
    )
      .bind(user_id, user_id, user_id, story_id)
      .first();

    if (!story) {
      return json({ success: false, error: "Story created but not found" }, 500);
    }

    return json({ success: true, story: addNormalizedStoryMedia(story) }, 201);
  } catch (err: any) {
    return json(
      {
        success: false,
        error: "Backend crash",
        message: String(err?.message ?? err),
      },
      500
    );
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const url = new URL(request.url);
    const viewerId = toInt(url.searchParams.get("viewerId"), 0);

    let results: any[] = [];

    const q = `
      ${selectStorySql}
      ORDER BY s.created_at DESC
      LIMIT 500
    `;

    const res = await env.DB
      .prepare(q)
      .bind(viewerId || 0, viewerId || 0, viewerId || 0)
      .all();

    results = Array.isArray(res.results) ? res.results : [];

    return json(results.map(addNormalizedStoryMedia));
  } catch (err: any) {
    return json(
      {
        success: false,
        error: "Backend crash",
        message: String(err?.message ?? err),
      },
      500
    );
  }
};
