// functions/api/posts/by-user.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
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

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const safeStr = (v: any) => String(v ?? "");

const normCreatedAt = (v: any) => {
  const s = safeStr(v).trim();
  return s || "1970-01-01 00:00:00";
};

const sortDescByCreatedAt = (a: any, b: any) =>
  normCreatedAt(b.created_at).localeCompare(normCreatedAt(a.created_at));

const pickDisplayName = (name: any, username: any, fallback = "User") => {
  const n = String(name ?? "").trim();
  if (n) return n;
  const u = String(username ?? "").trim();
  if (u) return u;
  return fallback;
};

const toBooleanVerified = (v: any) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s || s === "0" || s === "false" || s === "null" || s === "undefined")
      return false;
    return true;
  }
  return false;
};

// --------------------
// Media helpers
// --------------------
const cleanUrl = (v: any) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s === "null" || s === "undefined") return "";
  if (s.startsWith("data:")) return "";
  return s;
};

const isHttpUrl = (v: any) => {
  const s = String(v ?? "").trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const parseJsonArrayUrls = (raw: any, maxItems = 20): string[] => {
  if (Array.isArray(raw)) {
    return raw.map(cleanUrl).filter((x) => isHttpUrl(x)).slice(0, maxItems);
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.length > 10000) return [];

    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.map(cleanUrl).filter((x) => isHttpUrl(x)).slice(0, maxItems);
        }
        return [];
      } catch {}
    }

    const one = cleanUrl(s);
    return one && isHttpUrl(one) ? [one] : [];
  }

  return [];
};

const parseJsonArrayStrings = (raw: any, maxItems = 20): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x ?? "").trim())
      .filter((x) => x && x !== "null" && x !== "undefined")
      .slice(0, maxItems);
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.length > 10000) return [];

    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed
            .map((x) => String(x ?? "").trim())
            .filter((x) => x && x !== "null" && x !== "undefined")
            .slice(0, maxItems);
        }
        return [];
      } catch {}
    }

    const one = String(s).trim();
    return one ? [one] : [];
  }

  return [];
};

const guessTypeFromUrl = (url: string) => {
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
    u.includes(".m4a") ||
    u.includes(".ogg") ||
    u.includes(".aac")
  ) {
    return "audio";
  }
  return "image";
};

const parseMediaMeta = (raw: any, maxItems = 20) => {
  let arr: any[] = [];

  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (s && s.length <= 100000) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {}
    }
  }

  return arr
    .slice(0, maxItems)
    .map((m: any) => {
      const thumb = cleanUrl(m?.thumb || m?.thumbnail_url || m?.thumbnail);
      const feed = cleanUrl(m?.feed || m?.feed_url || m?.url || m?.full || m?.full_url);
      const full = cleanUrl(m?.full || m?.full_url || m?.feed || m?.feed_url || m?.url || m?.thumb);
      const type = String(m?.type || "").trim().toLowerCase();

      const finalType =
        type === "image" || type === "video" || type === "audio"
          ? type
          : guessTypeFromUrl(full || feed || thumb);

      return {
        thumb: isHttpUrl(thumb) ? thumb : null,
        feed: isHttpUrl(feed) ? feed : null,
        full: isHttpUrl(full) ? full : null,
        type: finalType,
      };
    })
    .filter((m) => m.thumb || m.feed || m.full);
};

const normalizeMedia = (row: any) => {
  const meta = parseMediaMeta(row?.media_meta);

  if (meta.length > 0) {
    return {
      media: meta,
      media_url: meta[0]?.feed || meta[0]?.full || meta[0]?.thumb || null,
      media_urls: meta.map((m: any) => m.feed || m.full || m.thumb).filter(Boolean),
      media_types: meta.map(
        (m: any) => m.type || guessTypeFromUrl(m.feed || m.full || m.thumb)
      ),
      images: meta
        .filter((m: any) => (m.type || "").toLowerCase() === "image")
        .map((m: any) => m.feed || m.full || m.thumb)
        .filter(Boolean),
      thumb_url: meta[0]?.thumb || null,
      feed_url: meta[0]?.feed || null,
      full_url: meta[0]?.full || null,
    };
  }

  const single = cleanUrl(row?.media_url);
  const urls = parseJsonArrayUrls(row?.media_urls);
  const rawImages = parseJsonArrayUrls(row?.images);
  const combinedUrls = urls.length ? urls : rawImages;
  const outUrls = combinedUrls.length ? combinedUrls : single ? [single] : [];

  const types = parseJsonArrayStrings(row?.media_types);
  let outTypes = types.length ? types : [];

  if (outUrls.length && outTypes.length !== outUrls.length) {
    outTypes = outUrls.map(guessTypeFromUrl);
  }

  const media = outUrls.map((url, i) => {
    const type = outTypes[i] || guessTypeFromUrl(url);
    return {
      thumb: type === "image" ? url : null,
      feed: url,
      full: url,
      type,
    };
  });

  return {
    media,
    media_url: single || outUrls[0] || null,
    media_urls: outUrls,
    media_types: outTypes,
    images: outUrls,
    thumb_url: media[0]?.thumb || null,
    feed_url: media[0]?.feed || null,
    full_url: media[0]?.full || null,
  };
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const url = new URL(request.url);

    const userId = toInt(
      url.searchParams.get("userId") || url.searchParams.get("user_id"),
      0
    );
    const viewerId = toInt(
      url.searchParams.get("viewerId") || url.searchParams.get("viewer_id"),
      0
    );
    const limit = clamp(toInt(url.searchParams.get("limit"), 20), 1, 50);
    const cursorRaw = url.searchParams.get("cursor");
    const cursor = cursorRaw && cursorRaw.trim() ? cursorRaw.trim() : null;

    if (!userId) {
      return json({ success: false, error: "Missing userId" }, 400);
    }

    const perType = clamp(Math.ceil((limit + 1) * 1.5), 10, 80);

    // Ensure colours column exists in posts table
    try {
      await env.DB.prepare(`ALTER TABLE posts ADD COLUMN colours TEXT`).run();
    } catch (_) {}

    // ---------------- POSTS ----------------
    const qPosts = `
      SELECT
        'post' AS source,
        'post' AS item_type,
        p.id AS id,
        ('post:' || CAST(p.id AS TEXT)) AS feed_key,
        p.created_at AS created_at,
        p.updated_at AS updated_at,

        p.id AS post_id,
        NULL AS shared_post_id,
        NULL AS reel_id,
        NULL AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,

        p.user_id AS user_id,
        p.user_id AS owner_id,
        'user_id' AS owner_field,
        COALESCE(NULLIF(TRIM(u.username), ''), 'user') AS username,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''), 'User') AS name,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS avatar_url,

        COALESCE(u.is_verified, 0) AS is_verified,
        COALESCE(u.role, 'user') AS role,

        p.content AS content,
        p.content AS description,
        p.visibility AS visibility,
        p.views AS views,
        p.shares AS shares,
        p.colours AS colours,
        p.colours AS background,
        p.colours AS background_style,

        CASE
          WHEN p.media_url LIKE 'data:%' THEN NULL
          WHEN length(p.media_url) > 300 THEN NULL
          ELSE p.media_url
        END AS media_url,

        CASE
          WHEN p.media_url LIKE 'data:%' THEN NULL
          WHEN length(p.media_url) > 300 THEN NULL
          ELSE p.media_type
        END AS media_type,

        CASE
          WHEN p.media_urls LIKE 'data:%' THEN NULL
          WHEN length(p.media_urls) > 5000 THEN NULL
          ELSE p.media_urls
        END AS media_urls,

        CASE
          WHEN length(p.media_types) > 5000 THEN NULL
          ELSE p.media_types
        END AS media_types,

        CASE
          WHEN length(p.media_meta) > 100000 THEN NULL
          ELSE p.media_meta
        END AS media_meta,

        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND COALESCE(pc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reactions_count,
        (SELECT pr.type FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,

        (
          SELECT COALESCE(NULLIF(TRIM(u2.name), ''), NULLIF(TRIM(u2.username), ''), '')
          FROM post_reactions pr2
          JOIN users u2 ON u2.id = pr2.user_id
          WHERE pr2.post_id = p.id
          ORDER BY pr2.created_at DESC, pr2.id DESC
          LIMIT 1
        ) AS reactor_name,

        (
          SELECT json_group_array(
            json_object(
              'user_id', x.user_id,
              'type', x.type,
              'name', x.name,
              'profile_image_url', x.profile_image_url
            )
          )
          FROM (
            SELECT
              pr3.user_id AS user_id,
              LOWER(COALESCE(pr3.type,'like')) AS type,
              COALESCE(NULLIF(TRIM(u3.name), ''), NULLIF(TRIM(u3.username), ''), '') AS name,
              CASE
                WHEN u3.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u3.profile_image_url) > 300 THEN NULL
                ELSE u3.profile_image_url
              END AS profile_image_url
            FROM post_reactions pr3
            LEFT JOIN users u3 ON u3.id = pr3.user_id
            WHERE pr3.post_id = p.id
            ORDER BY pr3.created_at DESC, pr3.id DESC
            LIMIT 30
          ) x
        ) AS reactions_preview,

        (
          SELECT json_group_array(json_object('type', t.type, 'count', t.c))
          FROM (
            SELECT LOWER(COALESCE(type,'like')) AS type, COUNT(*) AS c
            FROM post_reactions
            WHERE post_id = p.id
            GROUP BY LOWER(COALESCE(type,'like'))
            ORDER BY c DESC
          ) t
        ) AS reactions_by_type,

        CASE
          WHEN p.media_type = 'video' THEN p.media_url
          WHEN p.media_url LIKE '%.mp4%' OR p.media_url LIKE '%.webm%' OR p.media_url LIKE '%.mov%' THEN p.media_url
          ELSE NULL
        END AS video_url,
        NULL AS caption,
        NULL AS song_name,
        NULL AS audio_url,
        0 AS audio_start,
        0 AS audio_end,
        NULL AS location,
        NULL AS sound_key,
        NULL AS sound_id,

        NULL AS song_title,
        NULL AS song_artist_name,
        NULL AS song_album_name,
        NULL AS song_cover_image_url,
        NULL AS song_duration_seconds,
        NULL AS song_genre,
        NULL AS song_likes_count,
        NULL AS song_plays_count,

        NULL AS type,
        NULL AS post_type,
        NULL AS kind,
        NULL AS meta,

        NULL AS shared_post,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM posts p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE
        p.user_id = ?
        AND COALESCE(p.is_deleted, 0) = 0
        AND (
          p.visibility IS NULL OR p.visibility = 'public' OR p.visibility = '' OR p.visibility = 'Public'
        )
        AND (p.content IS NULL OR (
          p.content NOT LIKE '%"post_type":"product"%'
          AND p.content NOT LIKE '%"kind":"product"%'
          AND p.content NOT LIKE '%marketplace%'
          AND p.content NOT LIKE '%Check out my new event:%'
        ))
        AND NOT EXISTS (
          SELECT 1 FROM products pr_dup
          WHERE pr_dup.seller_id = p.user_id
            AND pr_dup.title = p.content
            AND COALESCE(pr_dup.is_deleted, 0) = 0
        )
        ${cursor ? `AND p.created_at < ?` : ""}
      ORDER BY p.created_at DESC
      LIMIT ?
    `;

    // ---------------- POST SHARES ----------------
    const qShares = `
      SELECT
        'share' AS source,
        'share' AS item_type,
        ps.id AS id,
        ('share:' || CAST(ps.id AS TEXT)) AS feed_key,
        ps.created_at AS created_at,
        p.updated_at AS updated_at,

        p.id AS post_id,
        p.id AS shared_post_id,
        NULL AS reel_id,
        NULL AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,

        ps.user_id AS user_id,
        ps.user_id AS owner_id,
        'user_id' AS owner_field,
        COALESCE(NULLIF(TRIM(su.username), ''), 'user') AS username,
        COALESCE(NULLIF(TRIM(su.name), ''), NULLIF(TRIM(su.username), ''), 'User') AS name,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS avatar_url,

        COALESCE(su.is_verified, 0) AS is_verified,
        COALESCE(su.role, 'user') AS role,

        COALESCE(ps.message, '') AS content,
        COALESCE(ps.message, '') AS description,
        p.visibility AS visibility,
        p.views AS views,
        p.shares AS shares,
        p.colours AS colours,
        p.colours AS background,
        p.colours AS background_style,

        NULL AS media_url,
        NULL AS media_type,
        NULL AS media_urls,
        NULL AS media_types,
        NULL AS media_meta,

        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND COALESCE(pc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reactions_count,
        (SELECT pr.type FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,

        (
          SELECT COALESCE(NULLIF(TRIM(u2.name), ''), NULLIF(TRIM(u2.username), ''), '')
          FROM post_reactions pr2
          JOIN users u2 ON u2.id = pr2.user_id
          WHERE pr2.post_id = p.id
          ORDER BY pr2.created_at DESC, pr2.id DESC
          LIMIT 1
        ) AS reactor_name,

        (
          SELECT json_group_array(
            json_object(
              'user_id', x.user_id,
              'type', x.type,
              'name', x.name,
              'profile_image_url', x.profile_image_url
            )
          )
          FROM (
            SELECT
              pr3.user_id AS user_id,
              LOWER(COALESCE(pr3.type,'like')) AS type,
              COALESCE(NULLIF(TRIM(u3.name), ''), NULLIF(TRIM(u3.username), ''), '') AS name,
              CASE
                WHEN u3.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u3.profile_image_url) > 300 THEN NULL
                ELSE u3.profile_image_url
              END AS profile_image_url
            FROM post_reactions pr3
            LEFT JOIN users u3 ON u3.id = pr3.user_id
            WHERE pr3.post_id = p.id
            ORDER BY pr3.created_at DESC, pr3.id DESC
            LIMIT 30
          ) x
        ) AS reactions_preview,

        (
          SELECT json_group_array(json_object('type', t.type, 'count', t.c))
          FROM (
            SELECT LOWER(COALESCE(type,'like')) AS type, COUNT(*) AS c
            FROM post_reactions
            WHERE post_id = p.id
            GROUP BY LOWER(COALESCE(type,'like'))
            ORDER BY c DESC
          ) t
        ) AS reactions_by_type,

        NULL AS video_url,
        NULL AS caption,
        NULL AS song_name,
        NULL AS audio_url,
        0 AS audio_start,
        0 AS audio_end,
        NULL AS location,
        NULL AS sound_key,
        NULL AS sound_id,

        NULL AS song_title,
        NULL AS song_artist_name,
        NULL AS song_album_name,
        NULL AS song_cover_image_url,
        NULL AS song_duration_seconds,
        NULL AS song_genre,
        NULL AS song_likes_count,
        NULL AS song_plays_count,

        'share' AS type,
        'share' AS post_type,
        'share' AS kind,
        json_object(
          'kind', 'share',
          'type', 'share',
          'share_id', ps.id,
          'original_post_id', p.id,
          'destination', ps.destination,
          'message', ps.message,
          'description', ps.message,
          'sharer', json_object(
            'id', ps.user_id,
            'name', COALESCE(NULLIF(TRIM(su.name), ''), NULLIF(TRIM(su.username), ''), ''),
            'username', su.username,
            'profile_image_url', su.profile_image_url
          ),
          'original_author', json_object(
            'id', p.user_id,
            'name', COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''), ''),
            'username', u.username,
            'profile_image_url', u.profile_image_url
          )
        ) AS meta,

        NULL AS shared_post,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM post_shares ps
      JOIN posts p ON p.id = ps.post_id
      LEFT JOIN users su ON su.id = ps.user_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE ps.user_id = ?
        AND ps.destination = 'feed'
        AND COALESCE(p.is_deleted, 0) = 0
        AND (p.visibility IS NULL OR p.visibility = 'public' OR p.visibility = '' OR p.visibility = 'Public')
        ${cursor ? `AND ps.created_at < ?` : ""}
      ORDER BY ps.created_at DESC
      LIMIT ?
    `;

    // ---------------- STORY SHARES ----------------
    const qStoryShares = `
      SELECT
        'story_share' AS source,
        'story_share' AS item_type,
        ss.id AS id,
        ('story_share:' || CAST(ss.id AS TEXT)) AS feed_key,
        ss.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        st.id AS shared_post_id,
        st.id AS story_id,
        NULL AS reel_id,
        NULL AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,
        NULL AS product_id,

        ss.user_id AS user_id,
        ss.user_id AS owner_id,
        'user_id' AS owner_field,

        COALESCE(su.username, 'user') AS username,
        COALESCE(NULLIF(TRIM(su.name), ''), NULLIF(TRIM(su.username), ''), 'User') AS name,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS avatar_url,

        COALESCE(su.is_verified, 0) AS is_verified,
        COALESCE(su.role, 'user') AS role,

        COALESCE(ss.message, '') AS content,
        COALESCE(ss.message, '') AS description,
        'public' AS visibility,
        0 AS views,
        0 AS shares,

        NULL AS media_url,
        NULL AS media_type,
        NULL AS media_urls,
        NULL AS media_types,
        NULL AS media_meta,

        (SELECT COUNT(*) FROM story_comments sc WHERE sc.story_id = st.id AND COALESCE(sc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM story_reactions sr WHERE sr.story_id = st.id) AS reactions_count,
        (SELECT sr.reaction FROM story_reactions sr WHERE sr.story_id = st.id AND sr.user_id = ? LIMIT 1) AS my_reaction,
        (SELECT 1 FROM story_reactions sr WHERE sr.story_id = st.id AND sr.user_id = ? LIMIT 1) AS liked_by_me,

        'story_share' AS type,
        'story_share' AS post_type,
        'story_share' AS kind,
        json_object(
          'kind', 'story_share',
          'type', 'story_share',
          'share_id', ss.id,
          'original_story_id', st.id,
          'destination', ss.destination,
          'message', ss.message,
          'description', ss.message
        ) AS meta,

        json_object(
          'id', st.id,
          'story_id', st.id,
          'user_id', st.user_id,
          'type', st.type,
          'media_url', st.media_url,
          'text_content', st.text_content,
          'background_style', st.background_style,
          'music_url', st.music_url,
          'music_title', st.music_title,
          'media_urls', st.media_urls,
          'media_types', st.media_types,
          'media_meta', st.media_meta,
          'effect_id', st.effect_id,
          'duration', st.duration,
          'created_at', st.created_at,
          'author_name', CASE
            WHEN u.name IS NOT NULL AND trim(u.name) != '' AND lower(trim(u.name)) != 'user' THEN trim(u.name)
            WHEN u.username IS NOT NULL AND trim(u.username) != '' THEN trim(u.username)
            ELSE 'User'
          END,
          'author_full_name', u.name,
          'author_username', u.username,
          'author', json_object(
            'id', st.user_id,
            'name', CASE
              WHEN u.name IS NOT NULL AND trim(u.name) != '' AND lower(trim(u.name)) != 'user' THEN trim(u.name)
              WHEN u.username IS NOT NULL AND trim(u.username) != '' THEN trim(u.username)
              ELSE 'User'
            END,
            'username', COALESCE(u.username, ''),
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'role', COALESCE(u.role, 'user')
          ),
          'user', json_object(
            'id', st.user_id,
            'name', CASE
              WHEN u.name IS NOT NULL AND trim(u.name) != '' AND lower(trim(u.name)) != 'user' THEN trim(u.name)
              WHEN u.username IS NOT NULL AND trim(u.username) != '' THEN trim(u.username)
              ELSE 'User'
            END,
            'username', COALESCE(u.username, ''),
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END
          )
        ) AS shared_story,

        NULL AS shared_post,
        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM story_shares ss
      JOIN stories st ON st.id = ss.story_id
      LEFT JOIN users su ON su.id = ss.user_id
      LEFT JOIN users u ON u.id = st.user_id
      WHERE ss.user_id = ?
        ${cursor ? `AND ss.created_at < ?` : ""}
      ORDER BY ss.created_at DESC
      LIMIT ?
    `;

    // ---------------- PRODUCT SHARES ----------------
    const qProductShares = `
      SELECT
        'product_share' AS source,
        'product_share' AS item_type,
        psh.id AS id,
        ('product_share:' || CAST(psh.id AS TEXT)) AS feed_key,
        psh.shared_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        pr.id AS shared_post_id,
        NULL AS reel_id,
        NULL AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        pr.id AS product_id2,
        pr.id AS product_id,

        psh.user_id AS user_id,
        psh.user_id AS owner_id,
        'user_id' AS owner_field,

        COALESCE(su.username, 'user') AS username,
        COALESCE(su.name, su.username, 'User') AS name,
        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS profile_image_url,
        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS avatar_url,
        COALESCE(su.is_verified, 0) AS is_verified,
        COALESCE(su.role, 'user') AS role,

        COALESCE(psh.message, '') AS content,
        COALESCE(psh.message, '') AS description,
        COALESCE(psh.message, '') AS message,
        'public' AS visibility,
        0 AS views, 0 AS shares,

        NULL AS media_url,
        NULL AS media_type,
        pr.images AS media_urls,
        NULL AS media_types,
        pr.image_variants AS media_meta,

        (SELECT COUNT(*) FROM product_comments pc WHERE pc.product_id = pr.id AND COALESCE(pc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM product_reactions prr WHERE prr.product_id = pr.id) AS reactions_count,
        (SELECT prr.type FROM product_reactions prr WHERE prr.product_id = pr.id AND prr.user_id = ? LIMIT 1) AS my_reaction,
        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name,
        NULL AS audio_url, 0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        'product_share' AS type,
        'product_share' AS post_type,
        'product_share' AS kind,
        json_object(
          'kind', 'product_share',
          'type', 'product_share',
          'share_id', psh.id,
          'original_product_id', pr.id,
          'destination', psh.destination,
          'message', psh.message
        ) AS meta,

        json_object(
          'id', pr.id,
          'product_id', pr.id,
          'seller_id', pr.seller_id,
          'user_id', pr.seller_id,
          'title', pr.title,
          'name', pr.title,
          'category', pr.category,
          'description', pr.description,
          'content', pr.description,
          'country', pr.country,
          'address', pr.address,
          'location', pr.address,
          'main_price', pr.main_price,
          'discount_price', pr.discount_price,
          'price', COALESCE(pr.discount_price, pr.main_price),
          'currency', 'TZS',
          'quantity', pr.quantity,
          'phone_number', pr.phone_number,
          'images', pr.images,
          'media_urls', pr.images,
          'image_variants', pr.image_variants,
          'thumbnail_url', pr.thumbnail_url,
          'created_at', pr.created_at,
          'item_type', 'product',
          'source', 'product',
          'type', 'product',
          'post_type', 'product',
          'kind', 'product',
          'is_product', json('true'),
          'author', json_object(
            'id', pr.seller_id,
            'name', COALESCE(u.name, u.username, 'Seller'),
            'username', u.username,
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'role', COALESCE(u.role, 'user')
          ),
          'user', json_object(
            'id', pr.seller_id,
            'name', COALESCE(u.name, u.username, 'Seller'),
            'username', u.username,
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END
          )
        ) AS shared_product,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM product_shares psh
      JOIN products pr ON pr.id = psh.product_id
      LEFT JOIN users su ON su.id = psh.user_id
      LEFT JOIN users u ON u.id = pr.seller_id
      WHERE psh.user_id = ?
        AND (psh.destination = 'feed' OR psh.destination = 'profile' OR psh.destination IS NULL OR psh.destination = '')
        AND COALESCE(pr.is_deleted, 0) = 0
        ${cursor ? `AND psh.shared_at < ?` : ""}
      ORDER BY psh.shared_at DESC
      LIMIT ?
    `;

    // ---------------- SONG SHARES ----------------
    const qSongShares = `
      SELECT
        'song_share' AS source,
        'song_share' AS item_type,
        ssh.id AS id,
        ('song_share:' || CAST(ssh.id AS TEXT)) AS feed_key,
        ssh.shared_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        NULL AS shared_post_id,
        NULL AS reel_id,
        s.id AS song_id,
        s.id AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,

        ssh.user_id AS user_id,
        ssh.user_id AS owner_id,
        'user_id' AS owner_field,
        COALESCE(NULLIF(TRIM(su.username), ''), 'user') AS username,
        COALESCE(NULLIF(TRIM(su.name), ''), NULLIF(TRIM(su.username), ''), 'User') AS name,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN su.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(su.profile_image_url) > 300 THEN NULL
          ELSE su.profile_image_url
        END AS avatar_url,

        COALESCE(su.is_verified, 0) AS is_verified,
        COALESCE(su.role, 'user') AS role,

        COALESCE(ssh.message, '') AS content,
        'public' AS visibility,
        0 AS views,
        (SELECT COUNT(*) FROM song_shares ssh_cnt WHERE ssh_cnt.song_id = s.id) AS shares,
        (SELECT COUNT(*) FROM song_shares ssh_cnt WHERE ssh_cnt.song_id = s.id) AS shares_count,
        (SELECT COUNT(*) FROM song_shares ssh_cnt WHERE ssh_cnt.song_id = s.id) AS share_count,

        s.cover_image_url AS media_url,
        'image' AS media_type,
        CASE
          WHEN s.cover_image_url IS NOT NULL AND s.cover_image_url != ''
          THEN json_array(s.cover_image_url)
          ELSE json_array()
        END AS media_urls,
        json_array('image') AS media_types,
        NULL AS media_meta,

        (SELECT COUNT(*) FROM song_comments sc WHERE sc.song_id = s.id AND COALESCE(sc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM song_reactions sr WHERE sr.song_id = s.id) AS reactions_count,
        (SELECT sr.type FROM song_reactions sr WHERE sr.song_id = s.id AND sr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url,
        NULL AS caption,
        NULL AS song_name,
        s.audio_url AS audio_url,
        0 AS audio_start,
        0 AS audio_end,
        NULL AS location,
        NULL AS sound_key,
        NULL AS sound_id,

        s.title AS song_title,
        s.artist_name AS song_artist_name,
        s.album_name AS song_album_name,
        s.cover_image_url AS song_cover_image_url,
        s.duration_seconds AS song_duration_seconds,
        s.genre AS song_genre,
        COALESCE(s.likes_count, 0) AS song_likes_count,
        COALESCE(s.plays_count, 0) AS song_plays_count,

        'song_share' AS type,
        'song_share' AS post_type,
        'song_share' AS kind,
        json_object(
          'kind', 'song_share',
          'type', 'song_share',
          'share_id', ssh.id,
          'original_song_id', s.id,
          'destination', ssh.destination,
          'message', ssh.message,
          'item_type', ssh.item_type
        ) AS meta,

        json_object(
          'id', s.id,
          'song_id', s.id,
          'uploader_id', s.uploader_id,
          'user_id', s.uploader_id,
          'title', s.title,
          'artist_name', s.artist_name,
          'album_name', s.album_name,
          'cover_image_url', s.cover_image_url,
          'cover', s.cover_image_url,
          'audio_url', s.audio_url,
          'duration_seconds', s.duration_seconds,
          'genre', s.genre,
          'created_at', s.created_at,
          'item_type', 'music',
          'source', 'song',
          'type', 'music',
          'is_song', json('true'),
          'author', json_object(
            'id', s.uploader_id,
            'name', COALESCE(u.name, u.username, 'Artist'),
            'username', u.username,
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'role', COALESCE(u.role, 'user')
          )
        ) AS shared_song,

        json_object(
          'id', s.id,
          'song_id', s.id,
          'uploader_id', s.uploader_id,
          'user_id', s.uploader_id,
          'title', s.title,
          'artist_name', s.artist_name,
          'album_name', s.album_name,
          'cover_image_url', s.cover_image_url,
          'cover', s.cover_image_url,
          'audio_url', s.audio_url,
          'duration_seconds', s.duration_seconds,
          'genre', s.genre,
          'created_at', s.created_at,
          'item_type', 'music',
          'source', 'song',
          'type', 'music',
          'is_song', json('true'),
          'author', json_object(
            'id', s.uploader_id,
            'name', COALESCE(u.name, u.username, 'Artist'),
            'username', u.username,
            'avatar_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'profile_image_url',
              CASE
                WHEN u.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u.profile_image_url) > 300 THEN NULL
                ELSE u.profile_image_url
              END,
            'is_verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'verified', CASE WHEN COALESCE(u.is_verified, 0) = 1 THEN json('true') ELSE json('false') END,
            'role', COALESCE(u.role, 'user')
          )
        ) AS shared_post,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM song_shares ssh
      JOIN songs s ON s.id = ssh.song_id
      LEFT JOIN users su ON su.id = ssh.user_id
      LEFT JOIN users u ON u.id = s.uploader_id
      WHERE ssh.user_id = ?
        AND (ssh.destination = 'feed' OR ssh.destination = 'profile' OR ssh.destination IS NULL OR ssh.destination = '')
        AND COALESCE(s.is_deleted, 0) = 0
        ${cursor ? `AND ssh.shared_at < ?` : ""}
      ORDER BY ssh.shared_at DESC
      LIMIT ?
    `;

    // ---------------- SONGS ----------------
    const qSongs = `
      SELECT
        'song' AS source,
        'song' AS item_type,
        s.id AS id,
        ('song:' || CAST(s.id AS TEXT)) AS feed_key,
        s.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        NULL AS shared_post_id,
        NULL AS reel_id,
        s.id AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,

        s.uploader_id AS user_id,
        s.uploader_id AS owner_id,
        'uploader_id' AS owner_field,
        COALESCE(NULLIF(TRIM(u.username), ''), 'user') AS username,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''), 'User') AS name,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS avatar_url,

        COALESCE(u.is_verified, 0) AS is_verified,
        COALESCE(u.role, 'user') AS role,

        COALESCE(s.title,'') || CASE
          WHEN s.artist_name IS NOT NULL AND s.artist_name != '' THEN ' — ' || s.artist_name
          ELSE ''
        END AS content,

        'public' AS visibility,
        0 AS views,
        0 AS shares,

        s.audio_url AS media_url,
        'audio/mpeg' AS media_type,

        CASE
          WHEN s.cover_image_url IS NOT NULL AND s.cover_image_url != ''
          THEN json_array(s.cover_image_url)
          ELSE NULL
        END AS media_urls,

        CASE
          WHEN s.cover_image_url IS NOT NULL AND s.cover_image_url != ''
          THEN json_array('image')
          ELSE NULL
        END AS media_types,

        NULL AS media_meta,
        0 AS comments_count,

        (SELECT COUNT(*) FROM song_reactions sr WHERE sr.song_id = s.id) AS reactions_count,
        (SELECT sr.type FROM song_reactions sr WHERE sr.song_id = s.id AND sr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url,
        NULL AS caption,
        NULL AS song_name,
        s.audio_url AS audio_url,
        0 AS audio_start,
        0 AS audio_end,
        NULL AS location,
        NULL AS sound_key,
        NULL AS sound_id,

        s.title AS song_title,
        s.artist_name AS song_artist_name,
        s.album_name AS song_album_name,
        s.cover_image_url AS song_cover_image_url,
        s.duration_seconds AS song_duration_seconds,
        s.genre AS song_genre,

        (SELECT COUNT(*) FROM song_reactions sr WHERE sr.song_id = s.id) AS song_likes_count,
        (
          (SELECT COUNT(*) FROM song_play_events spe WHERE spe.song_id = s.id)
          +
          (SELECT COUNT(*) FROM song_plays sp WHERE sp.song_id = s.id)
        ) AS song_plays_count,

        NULL AS type,
        NULL AS post_type,
        NULL AS kind,
        NULL AS meta,

        NULL AS shared_post,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM songs s
      LEFT JOIN users u ON u.id = s.uploader_id
      WHERE s.uploader_id = ?
        AND COALESCE(s.is_deleted, 0) = 0
        ${cursor ? `AND s.created_at < ?` : ""}
      ORDER BY s.created_at DESC
      LIMIT ?
    `;

    // ---------------- PRODUCTS ----------------
    const qProducts = `
      SELECT
        'product' AS source,
        'product' AS item_type,
        pr.id AS id,
        ('product:' || CAST(pr.id AS TEXT)) AS feed_key,
        pr.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        NULL AS shared_post_id,
        NULL AS reel_id,
        NULL AS song_id2,
        NULL AS event_id,
        NULL AS group_post_id,
        pr.id AS product_id2,
        pr.id AS product_id,

        pr.seller_id AS user_id,
        pr.seller_id AS owner_id,
        'seller_id' AS owner_field,
        COALESCE(NULLIF(TRIM(u.username), ''), 'seller') AS username,
        COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(u.username), ''), 'Seller') AS name,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS profile_image_url,

        CASE
          WHEN u.profile_image_url LIKE 'data:%' THEN NULL
          WHEN length(u.profile_image_url) > 300 THEN NULL
          ELSE u.profile_image_url
        END AS avatar_url,

        COALESCE(u.is_verified, 0) AS is_verified,
        COALESCE(u.role, 'user') AS role,

        pr.title AS content,
        'public' AS visibility,
        0 AS views,
        (SELECT COUNT(*) FROM product_shares psh WHERE psh.product_id = pr.id) AS shares,
        (SELECT COUNT(*) FROM product_shares psh WHERE psh.product_id = pr.id) AS shares_count,
        (SELECT COUNT(*) FROM product_shares psh WHERE psh.product_id = pr.id) AS share_count,

        NULL AS media_url,
        NULL AS media_type,
        pr.images AS media_urls,
        NULL AS media_types,
        pr.image_variants AS media_meta,

        (SELECT COUNT(*) FROM product_comments pc WHERE pc.product_id = pr.id AND COALESCE(pc.is_deleted, 0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM product_reactions prr WHERE prr.product_id = pr.id) AS reactions_count,
        (SELECT prr.type FROM product_reactions prr WHERE prr.product_id = pr.id AND prr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url,
        NULL AS caption,
        NULL AS song_name,
        NULL AS audio_url,
        0 AS audio_start,
        0 AS audio_end,
        NULL AS location,
        NULL AS sound_key,
        NULL AS sound_id,

        NULL AS song_title,
        NULL AS song_artist_name,
        NULL AS song_album_name,
        NULL AS song_cover_image_url,
        NULL AS song_duration_seconds,
        NULL AS song_genre,
        NULL AS song_likes_count,
        NULL AS song_plays_count,

        'marketplace' AS type,
        'product' AS post_type,
        'product' AS kind,
        json_object(
          'kind','product',
          'type','product',
          'product_id', pr.id,
          'marketplace', json_object('id', pr.id)
        ) AS meta,

        NULL AS shared_post,

        NULL AS group_id,
        NULL AS group_name,
        NULL AS group_image

      FROM products pr
      LEFT JOIN users u ON u.id = pr.seller_id
      WHERE pr.seller_id = ?
        AND COALESCE(pr.is_deleted, 0) = 0
        ${cursor ? `AND pr.created_at < ?` : ""}
      ORDER BY pr.created_at DESC
      LIMIT ?
    `;

    const bindCursor = (base: any[]) =>
      cursor ? [...base, cursor, perType] : [...base, perType];

    const runShares = async () => {
      try {
        const res = await env.DB
          .prepare(qShares)
          .bind(...bindCursor([viewerId || 0, userId]))
          .all();
        return Array.isArray(res?.results) ? res.results : [];
      } catch (err) {
        console.warn("by-user qShares query fallback:", err);
        return [];
      }
    };

    const runProductShares = async () => {
      try {
        const res = await env.DB
          .prepare(qProductShares)
          .bind(...bindCursor([viewerId || 0, userId]))
          .all();
        return Array.isArray(res?.results) ? res.results : [];
      } catch (err) {
        console.warn("by-user qProductShares query fallback:", err);
        return [];
      }
    };

    const runSongShares = async () => {
      try {
        const res = await env.DB
          .prepare(qSongShares)
          .bind(...bindCursor([viewerId || 0, userId]))
          .all();
        return Array.isArray(res?.results) ? res.results : [];
      } catch (err) {
        console.warn("by-user qSongShares query fallback:", err);
        return [];
      }
    };

    const runStoryShares = async () => {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS story_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            destination TEXT DEFAULT 'feed',
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
      } catch (_) {}
      try {
        await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN destination TEXT DEFAULT 'feed'`).run();
      } catch (_) {}
      try {
        await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN message TEXT`).run();
      } catch (_) {}
      try {
        await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
      } catch (_) {}

      try {
        const res = await env.DB
          .prepare(qStoryShares)
          .bind(...bindCursor([viewerId || 0, viewerId || 0, userId]))
          .all();
        return Array.isArray(res?.results) ? res.results : [];
      } catch (err) {
        console.warn("by-user qStoryShares query fallback:", err);
        return [];
      }
    };

    const [postsRes, sharesResults, productSharesResults, songSharesResults, storySharesResults, songsRes, productsRes] =
      await Promise.all([
        env.DB.prepare(qPosts).bind(...bindCursor([viewerId || 0, userId])).all(),
        runShares(),
        runProductShares(),
        runSongShares(),
        runStoryShares(),
        env.DB.prepare(qSongs).bind(...bindCursor([viewerId || 0, userId])).all(),
        env.DB.prepare(qProducts).bind(...bindCursor([viewerId || 0, userId])).all(),
      ]);

    const items = [
      ...(Array.isArray(postsRes.results) ? postsRes.results : []),
      ...sharesResults,
      ...productSharesResults,
      ...songSharesResults,
      ...storySharesResults,
      ...(Array.isArray(songsRes.results) ? songsRes.results : []),
      ...(Array.isArray(productsRes.results) ? productsRes.results : []),
    ];

    const map = new Map<string, any>();
    for (const it of items) {
      const k =
        safeStr(it?.feed_key) || `${safeStr(it?.source)}:${Number(it?.id)}`;
      if (!map.has(k)) map.set(k, it);
    }

    const mergedPlusOne = Array.from(map.values())
      .sort(sortDescByCreatedAt)
      .slice(0, limit + 1);

    const hasMore = mergedPlusOne.length > limit;
    const merged = mergedPlusOne.slice(0, limit);

    // ============================================================
    // Normalize + permission flags
    // ============================================================
    const normalized = merged.map((item: any) => {
      const isVerified = toBooleanVerified(item?.is_verified);

      const authorObj = {
        id: item?.user_id || item?.author?.id,
        name: pickDisplayName(
          item?.name || item?.author?.name,
          item?.username || item?.author?.username,
          "User"
        ),
        username: item?.username || item?.author?.username || "",
        avatar_url:
          item?.avatar_url ||
          item?.profile_image_url ||
          item?.author?.profile_image_url ||
          "",
        profile_image_url:
          item?.profile_image_url ||
          item?.avatar_url ||
          item?.author?.profile_image_url ||
          "",
        is_verified: isVerified,
        verified: isVerified,
        role: item?.role || item?.author?.role || "user",
      };

      const source = String(item?.source || "");
      const isShare = source === "share" || source === "product_share";

      const ownerId =
        Number(
          item?.owner_id ??
            item?.user_id ??
            item?.seller_id ??
            item?.uploader_id ??
            0
        ) || 0;

      const editableId =
        Number(
          item?.post_id ??
            item?.product_id ??
            item?.song_id2 ??
            item?.event_id ??
            item?.group_post_id ??
            item?.id ??
            0
        ) || 0;

      const viewerOwnsRow = Boolean(viewerId > 0 && viewerId === ownerId);

      const sharedOwnerId = isShare
        ? Number(
            item?.shared_post?.user_id ??
              item?.shared_product?.seller_id ??
              item?.shared_product?.user_id ??
              0
          ) || 0
        : 0;

      const viewerOwnsShared =
        viewerId > 0 && sharedOwnerId > 0 && viewerId === sharedOwnerId;

      const canEdit =
        !isShare &&
        viewerOwnsRow &&
        (source === "post" || source === "product");

      const canDelete =
        !isShare &&
        viewerOwnsRow &&
        (source === "post" || source === "product" || source === "song");

      return {
        ...item,
        ...normalizeMedia(item),
        colours: item?.colours || item?.background || null,
        background: item?.colours || item?.background || null,
        background_style: item?.colours || item?.background || null,
        description: item?.description ?? item?.content ?? "",
        is_verified: isVerified,
        verified: isVerified,
        author: authorObj,
        user: authorObj,
        comments_count: Number(item?.comments_count ?? 0),
        reactions_count: Number(item?.reactions_count ?? 0),

        owner_id: ownerId,
        editable_id: editableId,
        shared_owner_id: isShare ? sharedOwnerId : null,
        is_share: isShare,

        can_edit: canEdit,
        can_edit_shared: isShare && viewerOwnsShared && !!sharedOwnerId,
        can_delete: canDelete,
        can_delete_shared: isShare && viewerOwnsShared && !!sharedOwnerId,
      };
    });

    // ============================================================
    // Populate shared_post (for post shares)
    // ============================================================
    const sharedPostIds = Array.from(
      new Set(
        normalized
          .filter((it: any) => it?.source === "share")
          .map((it: any) => Number(it?.shared_post_id))
          .filter((id: number) => Boolean(id && !isNaN(id)))
      )
    );

    if (sharedPostIds.length > 0) {
      try {
        const placeholders = sharedPostIds.map(() => "?").join(",");
        const origPostsRes = await env.DB
          .prepare(`
            SELECT
              p.*,
              u.id                 AS author_id,
              u.name               AS author_name,
              u.username           AS author_user_name,
              u.profile_image_url  AS author_avatar,
              u.is_verified        AS author_verified,
              u.role               AS author_role
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id IN (${placeholders})
          `)
          .bind(...sharedPostIds)
          .all();

        const origMap = new Map<number, any>();

        if (Array.isArray(origPostsRes.results)) {
          origPostsRes.results.forEach((row: any) => {
            const rawUrls = row.media_urls
              ? typeof row.media_urls === "string"
                ? JSON.parse(row.media_urls)
                : row.media_urls
              : [];
            const parsedUrls = Array.isArray(rawUrls) ? rawUrls : [];
            const finalMediaUrls =
              parsedUrls.length > 0
                ? parsedUrls
                : row.media_url
                ? [row.media_url]
                : [];

            const isOrigVerified = toBooleanVerified(row.author_verified);

            const origAuthor = {
              id: row.author_id,
              name: pickDisplayName(row.author_name, row.author_user_name, "User"),
              username: row.author_user_name || "",
              user_name: row.author_user_name || "",
              avatar_url: row.author_avatar || "",
              avatar: row.author_avatar || "",
              profile_image_url: row.author_avatar || "",
              is_verified: isOrigVerified,
              verified: isOrigVerified,
              role: row.author_role || "user",
            };

            origMap.set(Number(row.id), {
              ...row,
              description: row.description || row.content || "",
              media_urls: finalMediaUrls,
              images: finalMediaUrls,
              is_verified: isOrigVerified,
              verified: isOrigVerified,
              author: origAuthor,
              user: origAuthor,
            });
          });
        }

        normalized.forEach((it: any) => {
          if (it?.source === "share" && it?.shared_post_id) {
            const sp = origMap.get(Number(it.shared_post_id));
            if (sp) {
              it.shared_post = {
                ...sp,
                ...normalizeMedia(sp),
                description: sp.description || sp.content || "",
              };
            }
          }
        });
      } catch (err) {
        console.error("Failed to populate shared_posts in by-user:", err);
      }
    }

    // ============================================================
    // Normalize shared_product
    // ============================================================
    normalized.forEach((it: any) => {
      if (it?.shared_product) {
        let sp: any = it.shared_product;
        if (typeof sp === "string") {
          try {
            sp = JSON.parse(sp);
          } catch {
            sp = null;
          }
        }
        if (sp && typeof sp === "object") {
          const spVerified = toBooleanVerified(
            sp.author?.is_verified ?? sp.is_verified
          );

          const spAuthor = {
            id: sp.seller_id || sp.user_id || sp.author?.id,
            name: pickDisplayName(
              sp.author?.name,
              sp.author?.username,
              "Seller"
            ),
            username: sp.author?.username || "",
            avatar_url:
              sp.author?.avatar_url || sp.author?.profile_image_url || "",
            profile_image_url:
              sp.author?.profile_image_url || sp.author?.avatar_url || "",
            is_verified: spVerified,
            verified: spVerified,
            role: sp.author?.role || "user",
          };

          // ✅ parseJsonArrayUrls (was parseMediaList)
          const rawImgs = parseJsonArrayUrls(sp.images || sp.media_urls);

          const pNorm = {
            ...sp,
            id: Number(sp.id || sp.product_id || 0),
            product_id: Number(sp.id || sp.product_id || 0),
            title: sp.title || sp.name || "Product",
            name: sp.title || sp.name || "Product",
            description: sp.description || sp.content || "",
            content: sp.description || sp.content || "",
            price: sp.price ?? sp.discount_price ?? sp.main_price ?? null,
            main_price: sp.main_price ?? null,
            discount_price: sp.discount_price ?? null,
            currency: sp.currency || "TZS",
            location: sp.location || sp.address || "Marketplace",
            address: sp.address || sp.location || "",
            images: rawImgs,
            media_urls: rawImgs,
            is_verified: spVerified,
            verified: spVerified,
            author: spAuthor,
            user: spAuthor,
            seller: spAuthor,
            item_type: "product",
            source: "product",
            type: "product",
            post_type: "product",
            kind: "product",
            is_product: true,
          };

          it.shared_product = pNorm;
          if (!it.shared_post) it.shared_post = pNorm;
          if (!it.shared_post_id) it.shared_post_id = pNorm.id;
          if (!it.product_id) it.product_id = pNorm.id;
        }
      }

      // ============================================================
      // Normalize shared_song
      // ============================================================
      if (it?.shared_song) {
        let ss = it.shared_song;
        if (typeof ss === "string") {
          try {
            ss = JSON.parse(ss);
          } catch {
            ss = null;
          }
        }
        if (ss && typeof ss === "object") {
          const ssVerified = toBooleanVerified(
            ss.author?.is_verified ?? ss.is_verified
          );
          const ssAuthor = {
            id: ss.uploader_id || ss.user_id || ss.author?.id,
            name: pickDisplayName(
              ss.author?.name,
              ss.artist_name || ss.author?.username,
              "Artist"
            ),
            username: ss.author?.username || "",
            avatar_url:
              ss.author?.avatar_url || ss.author?.profile_image_url || "",
            profile_image_url:
              ss.author?.profile_image_url || ss.author?.avatar_url || "",
            is_verified: ssVerified,
            verified: ssVerified,
            role: ss.author?.role || "user",
          };

          const sNorm = {
            ...ss,
            id: Number(ss.id || ss.song_id || 0),
            song_id: Number(ss.id || ss.song_id || 0),
            title: ss.title || "Untitled Track",
            artist_name: ss.artist_name || ssAuthor.name || "Artist",
            album_name: ss.album_name || null,
            cover_image_url: ss.cover_image_url || ss.cover || null,
            cover: ss.cover_image_url || ss.cover || null,
            audio_url: ss.audio_url || null,
            duration_seconds: ss.duration_seconds || null,
            genre: ss.genre || null,
            is_verified: ssVerified,
            verified: ssVerified,
            author: ssAuthor,
            user: ssAuthor,
            item_type: "music",
            source: "song",
            type: "music",
            is_song: true,
          };

          it.shared_song = sNorm;
          if (!it.shared_post) it.shared_post = sNorm;
          if (!it.shared_post_id) it.shared_post_id = sNorm.id;
          if (!it.song_id) it.song_id = sNorm.id;
        }
      }

      // ============================================================
      // Normalize shared_story
      // ============================================================
      if (it?.shared_story) {
        let sst = it.shared_story;
        if (typeof sst === "string") {
          try {
            sst = JSON.parse(sst);
          } catch {
            sst = null;
          }
        }
        if (sst && typeof sst === "object") {
          const sstVerified = toBooleanVerified(
            sst.author?.is_verified ?? sst.is_verified
          );
          const authorRaw = sst.author || sst.user || {};
          const rawName = authorRaw?.name || sst.author_name || sst.author_full_name;
          const cleanName = (typeof rawName === 'string' && rawName.trim().length > 0 && rawName.trim().toLowerCase() !== 'user' && rawName.trim().toLowerCase() !== 'un')
            ? rawName.trim()
            : (authorRaw?.username || sst.author_username || sst.username || 'User');

          const sstAuthor = {
            id: sst.user_id || authorRaw?.id,
            name: cleanName,
            username: authorRaw?.username || sst.author_username || sst.username || "",
            avatar_url:
              authorRaw?.avatar_url || authorRaw?.profile_image_url || sst.author_image || "",
            profile_image_url:
              authorRaw?.profile_image_url || authorRaw?.avatar_url || sst.author_image || "",
            is_verified: sstVerified,
            verified: sstVerified,
            role: authorRaw?.role || sst.role || "user",
          };

          const sNorm = {
            ...sst,
            id: Number(sst.id || sst.story_id || 0),
            story_id: Number(sst.id || sst.story_id || 0),
            is_verified: sstVerified,
            verified: sstVerified,
            author: sstAuthor,
            user: sstAuthor,
            author_name: cleanName,
            author_full_name: cleanName,
            author_username: sstAuthor.username,
            author_image: sstAuthor.profile_image_url,
            item_type: "story",
            type: sst.type || "story",
            post_type: "story",
            kind: "story",
          };

          it.shared_story = sNorm;
          if (!it.shared_post) it.shared_post = sNorm;
          if (!it.shared_post_id) it.shared_post_id = sNorm.id;
        }
      }
    });

    const oldest = normalized.reduce((acc: any, cur: any) => {
      if (!acc) return cur;
      return normCreatedAt(cur.created_at) < normCreatedAt(acc.created_at)
        ? cur
        : acc;
    }, null);

    const nextCursor = oldest?.created_at ?? null;

    return json(
      {
        success: true,
        userId,
        viewerId,
        limit,
        cursor,
        nextCursor,
        hasMore,
        posts: normalized,
        data: normalized,
        results: normalized,
      },
      200
    );
  } catch (e: any) {
    return json({ success: false, error: e?.message || String(e) }, 500);
  }
};
