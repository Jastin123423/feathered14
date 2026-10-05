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

const parseSeenIds = (raw: string | null, max = 250) => {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(ids)).slice(0, max);
};

const parseSeenKeys = (raw: string | null, max = 250) => {
  if (!raw) return [];
  const keys = raw
    .split(",")
    .map((x) => String(x).trim())
    .filter(Boolean);
  return Array.from(new Set(keys)).slice(0, max);
};

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
    u.includes(".ogg")
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
      const thumb = cleanUrl(m?.thumbnail_url || m?.thumb || m?.thumbnail || m?.thumb_url);
      const feed = cleanUrl(
        m?.['720'] || m?.feed || m?.feed_url || m?.url || m?.full || m?.full_url
      );
      const full = cleanUrl(
        m?.['1080'] || m?.full || m?.full_url || m?.original || m?.feed || m?.feed_url || m?.url || m?.thumb
      );
      const type = String(m?.type || "").trim().toLowerCase();
      const finalType =
        type === "image" || type === "video" || type === "audio"
          ? type
          : guessTypeFromUrl(full || feed || thumb);
      const validFeed = isHttpUrl(feed) ? feed : null;
      const validFull = isHttpUrl(full) ? full : null;
      const isThumbVideo = thumb && (thumb.includes('.mp4') || thumb.includes('.webm') || thumb.includes('.mov') || thumb.includes('.m4v'));
      const validThumb = isHttpUrl(thumb) && !isThumbVideo
        ? thumb
        : finalType === "image"
        ? validFeed || validFull
        : null;
      return {
        thumb: validThumb,
        feed: validFeed,
        full: validFull,
        type: finalType,
      };
    })
    .filter((m) => m.thumb || m.feed || m.full);
};

const normalizeMedia = (row: any) => {
  const meta = parseMediaMeta(row?.media_meta);
  if (meta.length > 0) {
    const rawImageItems = meta.filter(
      (m: any) =>
        (m.type || "").toLowerCase() === "image" ||
        guessTypeFromUrl(m.feed || m.full || m.thumb) === "image"
    );
    const imageItems = rawImageItems.length > 0 ? rawImageItems : meta;
    return {
      media: meta,
      media_url: meta[0]?.feed || meta[0]?.full || meta[0]?.thumb || null,
      media_urls: meta.map((m: any) => m.feed || m.full || m.thumb).filter(Boolean),
      media_types: meta.map(
        (m: any) => m.type || guessTypeFromUrl(m.feed || m.full || m.thumb)
      ),
      images: imageItems.map((m: any) => m.feed || m.full || m.thumb).filter(Boolean),
      thumb_url: meta[0]?.thumb || null,
      feed_url: meta[0]?.feed || null,
      full_url: meta[0]?.full || null,
    };
  }
  const directVid = cleanUrl(row?.video_url || row?.video_url_medium || row?.video_url_hd || row?.video || null);
  const single = cleanUrl(row?.media_url) || directVid;
  const urls = parseJsonArrayUrls(row?.media_urls);
  const rawImages = parseJsonArrayUrls(row?.images);
  const combinedUrls = urls.length ? urls : rawImages;
  if (directVid && !combinedUrls.includes(directVid)) {
    combinedUrls.unshift(directVid);
  }
  const outUrls = combinedUrls.length ? combinedUrls : single ? [single] : [];
  const types = parseJsonArrayStrings(row?.media_types);
  let outTypes = types.length ? types : [];
  if (outUrls.length && outTypes.length !== outUrls.length) {
    outTypes = outUrls.map(guessTypeFromUrl);
  }
  let media = outUrls.map((url, i) => {
    const type = outTypes[i] || guessTypeFromUrl(url);
    return {
      thumb: type === "image" ? url : null,
      feed: url,
      full: url,
      type,
    };
  });
  if (outUrls.length === 2 && (outTypes[0] === 'video' || guessTypeFromUrl(outUrls[0]) === 'video') && (outTypes[1] === 'image' || guessTypeFromUrl(outUrls[1]) === 'image')) {
    media = [
      {
        thumb: outUrls[1],
        feed: outUrls[0],
        full: outUrls[0],
        type: 'video',
      },
    ];
  }
  return {
    media,
    media_url: single || outUrls[0] || null,
    video_url: directVid || (outTypes[0] === 'video' ? outUrls[0] : null) || row?.video_url || null,
    media_urls: outUrls,
    media_types: outTypes,
    images: outUrls,
    thumb_url: media[0]?.thumb || null,
    feed_url: media[0]?.feed || null,
    full_url: media[0]?.full || null,
  };
};

const mulberry32 = (seed: number) => {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seededShuffle = <T,>(arr: T[], seed: number) => {
  const a = arr.slice();
  const rnd = mulberry32(seed || 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const url = new URL(request.url);

    const userId =
      toInt(url.searchParams.get("userId"), 0) ||
      toInt(url.searchParams.get("user_id"), 0) ||
      toInt(request.headers.get("x-user-id"), 0);
    const reactionUserId = userId || 0;

    const limit = clamp(toInt(url.searchParams.get("limit"), 20), 1, 50);
    const cursor = url.searchParams.get("cursor");
    const seed = toInt(url.searchParams.get("seed"), 1);
    const seen = parseSeenIds(url.searchParams.get("seen"), 250);
    const seenKeys = parseSeenKeys(url.searchParams.get("seenKeys"), 250);
    const debug = url.searchParams.get("debug") === "1";
    const pinPostId = toInt(url.searchParams.get("pinPostId"), 0);

    const freshCount = Math.max(5, Math.floor(limit * 0.65));
    const exploreCount = Math.max(0, limit - freshCount);

    // Ensure colours column exists in posts table
    try {
      await env.DB.prepare(`ALTER TABLE posts ADD COLUMN colours TEXT`).run();
    } catch (_) {}

    // ============================================================
    // 1) POSTS
    // ============================================================
    const wherePosts: string[] = [];
    const bindsPosts: any[] = [];

    wherePosts.push(
      `(p.visibility IS NULL OR p.visibility = 'public' OR p.visibility = '' OR p.visibility = 'Public')`
    );
    wherePosts.push(`COALESCE(p.is_deleted, 0) = 0`);

    wherePosts.push(`(p.content IS NULL OR (
      p.content NOT LIKE '%"post_type":"product"%'
      AND p.content NOT LIKE '%"kind":"product"%'
      AND p.content NOT LIKE '%"product_id"%'
      AND p.content NOT LIKE '%marketplace%'
      AND p.content NOT LIKE '%Check out my new event:%'
    ))`);

    wherePosts.push(`NOT EXISTS (
      SELECT 1 FROM products pr_dup
      WHERE pr_dup.seller_id = p.user_id
        AND pr_dup.title = p.content
        AND COALESCE(pr_dup.is_deleted, 0) = 0
    )`);

    if (cursor && cursor.trim()) {
      wherePosts.push(`p.created_at < ?`);
      bindsPosts.push(cursor.trim());
    }
    if (seen.length > 0) {
      wherePosts.push(`p.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsPosts.push(...seen);
    }

    const wherePostsSql = wherePosts.length ? `WHERE ${wherePosts.join(" AND ")}` : "";

    const baseSelectPosts = `
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
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND COALESCE(pc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reactions_count,
        (SELECT pr.type FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,

        (
          SELECT COALESCE(u2.name, u2.username, '')
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
              COALESCE(u3.name, u3.username, '') AS name,
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
          SELECT json_group_array(
            json_object('type', t.type, 'count', t.c)
          )
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
        END AS video_url, NULL AS caption, NULL AS song_name,
        NULL AS audio_url, 0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        NULL AS type, NULL AS post_type, NULL AS kind, NULL AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM posts p
      LEFT JOIN users u ON u.id = p.user_id
    `;

    // ============================================================
    // 1b) POST SHARES (reshare cards)
    // ============================================================
    const whereShares: string[] = [];
    const bindsShares: any[] = [];

    whereShares.push(`ps.destination = 'feed'`);
    whereShares.push(`COALESCE(p.is_deleted, 0) = 0`);
    whereShares.push(`(
      p.visibility IS NULL OR p.visibility = 'public' OR p.visibility = '' OR p.visibility = 'Public'
    )`);

    if (cursor && cursor.trim()) {
      whereShares.push(`ps.created_at < ?`);
      bindsShares.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereShares.push(`ps.post_id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsShares.push(...seen);
    }
    if (seenKeys.length > 0) {
      whereShares.push(
        `('share:' || CAST(ps.id AS TEXT)) NOT IN (${seenKeys.map(() => "?").join(",")})`
      );
      bindsShares.push(...seenKeys);
    }

    const whereSharesSql = whereShares.length
      ? `WHERE ${whereShares.join(" AND ")}`
      : "";

    const baseSelectShares = `
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

        COALESCE(ps.message, '') AS content,
        COALESCE(ps.message, '') AS description,
        COALESCE(ps.message, '') AS message,
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

        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND COALESCE(pc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reactions_count,
        (SELECT pr.type FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,

        (
          SELECT COALESCE(u2.name, u2.username, '')
          FROM post_reactions pr2
          JOIN users u2 ON u2.id = pr2.user_id
          WHERE pr2.post_id = p.id
          ORDER BY pr2.created_at DESC, pr2.id DESC
          LIMIT 1
        ) AS reactor_name,

        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name,
        NULL AS audio_url, 0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        'share' AS type,
        'share' AS post_type,
        'share' AS kind,

        json_object(
          'kind', 'share',
          'type', 'share',
          'share_id', ps.id,
          'original_post_id', p.id,
          'destination', ps.destination,
          'message', ps.message
        ) AS meta,

        json_object(
          'id', p.id,
          'user_id', p.user_id,
          'content', p.content,
          'description', p.content,
          'visibility', p.visibility,
          'views', COALESCE(p.views, 0),
          'shares', COALESCE(p.shares, 0),
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'is_deleted', COALESCE(p.is_deleted, 0),

          'media_url',
            CASE
              WHEN p.media_url LIKE 'data:%' THEN NULL
              WHEN length(p.media_url) > 300 THEN NULL
              ELSE p.media_url
            END,
          'media_type',
            CASE
              WHEN p.media_url LIKE 'data:%' THEN NULL
              WHEN length(p.media_url) > 300 THEN NULL
              ELSE p.media_type
            END,
          'video_url',
            CASE
              WHEN p.media_url LIKE '%.mp4%' OR p.media_url LIKE '%.webm%' OR p.media_url LIKE '%.mov%' OR p.media_url LIKE '%.m4v%' THEN p.media_url
              WHEN p.media_type = 'video' THEN p.media_url
              ELSE NULL
            END,
          'media_urls',
            CASE
              WHEN p.media_urls LIKE 'data:%' THEN NULL
              WHEN length(p.media_urls) > 5000 THEN NULL
              ELSE p.media_urls
            END,
          'media_types',
            CASE
              WHEN length(p.media_types) > 5000 THEN NULL
              ELSE p.media_types
            END,
          'media_meta',
            CASE
              WHEN length(p.media_meta) > 100000 THEN NULL
              ELSE p.media_meta
            END,

          'author', json_object(
            'id', p.user_id,
            'name', COALESCE(u.name, u.username, ''),
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
            'id', p.user_id,
            'name', COALESCE(u.name, u.username, ''),
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
          ),

          'comments_count',
            (SELECT COUNT(*) FROM post_comments pc2 WHERE pc2.post_id = p.id AND COALESCE(pc2.is_deleted,0) = 0),
          'reactions_count',
            (SELECT COUNT(*) FROM post_reactions pr2 WHERE pr2.post_id = p.id),
          'my_reaction',
            (SELECT pr3.type FROM post_reactions pr3 WHERE pr3.post_id = p.id AND pr3.user_id = ? LIMIT 1)
        ) AS shared_post,

        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM post_shares ps
      JOIN posts p ON p.id = ps.post_id
      LEFT JOIN users su ON su.id = ps.user_id
      LEFT JOIN users u ON u.id = p.user_id
    `;

    // ============================================================
    // 1c) PRODUCT SHARES
    // ============================================================
    const whereProductShares: string[] = [];
    const bindsProductShares: any[] = [];

    whereProductShares.push(
      `(psh.destination = 'feed' OR psh.destination = 'profile' OR psh.destination IS NULL OR psh.destination = '')`
    );
    whereProductShares.push(`COALESCE(pr.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereProductShares.push(`psh.shared_at < ?`);
      bindsProductShares.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereProductShares.push(`pr.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsProductShares.push(...seen);
    }
    if (seenKeys.length > 0) {
      whereProductShares.push(
        `('product_share:' || CAST(psh.id AS TEXT)) NOT IN (${seenKeys.map(() => "?").join(",")})`
      );
      bindsProductShares.push(...seenKeys);
    }

    const whereProductSharesSql = whereProductShares.length
      ? `WHERE ${whereProductShares.join(" AND ")}`
      : "";

    const baseSelectProductShares = `
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
        0 AS views,
        (SELECT COUNT(*) FROM product_shares psh_ct WHERE psh_ct.product_id = pr.id) AS shares,
        (SELECT COUNT(*) FROM product_shares psh_ct WHERE psh_ct.product_id = pr.id) AS shares_count,
        (SELECT COUNT(*) FROM product_shares psh_ct WHERE psh_ct.product_id = pr.id) AS share_count,

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

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

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

        NULL AS shared_post,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM product_shares psh
      JOIN products pr ON pr.id = psh.product_id
      LEFT JOIN users su ON su.id = psh.user_id
      LEFT JOIN users u ON u.id = pr.seller_id
    `;

    // ============================================================
    // 1d) SONG SHARES  (✅ viewerId bug fixed)
    // ============================================================
    const whereSongShares: string[] = [];
    const bindsSongShares: any[] = [];

    whereSongShares.push(`ssh.destination = 'feed'`);
    whereSongShares.push(`COALESCE(s.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereSongShares.push(`ssh.shared_at < ?`);
      bindsSongShares.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereSongShares.push(`s.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsSongShares.push(...seen);
    }
    if (seenKeys.length > 0) {
      whereSongShares.push(
        `('song_share:' || CAST(ssh.id AS TEXT)) NOT IN (${seenKeys.map(() => "?").join(",")})`
      );
      bindsSongShares.push(...seenKeys);
    }

    const whereSongSharesSql = whereSongShares.length
      ? `WHERE ${whereSongShares.join(" AND ")}`
      : "";

    const baseSelectSongShares = `
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

        COALESCE(ssh.message, '') AS content,
        COALESCE(ssh.message, '') AS description,
        COALESCE(ssh.message, '') AS message,
        'public' AS visibility,
        0 AS views,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS shares,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS shares_count,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS share_count,

        s.cover_image_url AS media_url,
        'image' AS media_type,
        NULL AS media_urls,
        NULL AS media_types,
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

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

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
          'uploader_id', s.uploader_id,
          'user_id', s.uploader_id,
          'title', s.title,
          'artist_name', s.artist_name,
          'album_name', s.album_name,
          'cover_image_url', s.cover_image_url,
          'audio_url', s.audio_url,
          'duration_seconds', s.duration_seconds,
          'genre', s.genre,
          'created_at', s.created_at,

          'author', json_object(
            'id', s.uploader_id,
            'name', COALESCE(u.name, u.username, ''),
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
            'id', s.uploader_id,
            'name', COALESCE(u.name, u.username, ''),
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
        ) AS shared_song,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM song_shares ssh
      JOIN songs s ON s.id = ssh.song_id
      LEFT JOIN users su ON su.id = ssh.user_id
      LEFT JOIN users u ON u.id = s.uploader_id
    `;

    // ============================================================
    // 1e) EVENT SHARES
    // ============================================================
    const whereEventShares: string[] = [];
    const bindsEventShares: any[] = [];

    whereEventShares.push(`esh.destination = 'feed'`);
    whereEventShares.push(`COALESCE(e.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereEventShares.push(`esh.shared_at < ?`);
      bindsEventShares.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereEventShares.push(`e.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsEventShares.push(...seen);
    }
    if (seenKeys.length > 0) {
      whereEventShares.push(
        `('event_share:' || CAST(esh.id AS TEXT)) NOT IN (${seenKeys.map(() => "?").join(",")})`
      );
      bindsEventShares.push(...seenKeys);
    }

    const whereEventSharesSql = whereEventShares.length
      ? `WHERE ${whereEventShares.join(" AND ")}`
      : "";

    const baseSelectEventShares = `
      SELECT
        'event_share' AS source,
        'event_share' AS item_type,

        esh.id AS id,
        ('event_share:' || CAST(esh.id AS TEXT)) AS feed_key,

        esh.shared_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id,
        NULL AS shared_post_id,
        NULL AS reel_id,
        NULL AS song_id2,
        e.id AS event_id,
        NULL AS group_post_id,
        NULL AS product_id2,

        esh.user_id AS user_id,
        esh.user_id AS owner_id,
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

        COALESCE(esh.message, '') AS content,
        COALESCE(esh.message, '') AS description,
        COALESCE(esh.message, '') AS message,
        'public' AS visibility,
        0 AS views, 0 AS shares,

        NULL AS media_url,
        NULL AS media_type,
        NULL AS media_urls,
        NULL AS media_types,
        NULL AS media_meta,

        0 AS comments_count,
        0 AS reactions_count,
        NULL AS my_reaction,
        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name,
        NULL AS audio_url, 0 AS audio_start, 0 AS audio_end,
        e.location AS location,
        NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        e.event_date AS event_date,
        e.description AS event_description,
        0 AS attending_count,
        0 AS interested_count,
        '' AS my_rsvp_status,

        'event_share' AS type,
        'event_share' AS post_type,
        'event_share' AS kind,

        json_object(
          'kind', 'event_share',
          'type', 'event_share',
          'share_id', esh.id,
          'original_event_id', e.id,
          'destination', esh.destination,
          'message', esh.message
        ) AS meta,

        json_object(
          'id', e.id,
          'creator_id', e.creator_id,
          'user_id', e.creator_id,
          'title', e.title,
          'description', e.description,
          'event_date', e.event_date,
          'location', e.location,
          'cover_url', e.cover_url,
          'visibility', e.visibility,
          'created_at', e.created_at,

          'author', json_object(
            'id', e.creator_id,
            'name', COALESCE(u.name, u.username, ''),
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
            'id', e.creator_id,
            'name', COALESCE(u.name, u.username, ''),
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
        ) AS shared_event,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM event_shares esh
      JOIN events e ON e.id = esh.event_id
      LEFT JOIN users su ON su.id = esh.user_id
      LEFT JOIN users u ON u.id = e.creator_id
    `;

    // ============================================================
    // 1f) STORY SHARES
    // ============================================================
    const whereStoryShares: string[] = [];
    const bindsStoryShares: any[] = [];

    // Note: Do not filter on st.is_deleted since stories table has no is_deleted column

    if (cursor && cursor.trim()) {
      whereStoryShares.push(`ss.created_at < ?`);
      bindsStoryShares.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereStoryShares.push(`ss.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsStoryShares.push(...seen);
    }
    if (seenKeys.length > 0) {
      whereStoryShares.push(
        `('story_share:' || CAST(ss.id AS TEXT)) NOT IN (${seenKeys.map(() => "?").join(",")})`
      );
      bindsStoryShares.push(...seenKeys);
    }

    const whereStorySharesSql = whereStoryShares.length
      ? `WHERE ${whereStoryShares.join(" AND ")}`
      : "";

    const baseSelectStoryShares = `
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

        ss.user_id AS user_id,
        ss.user_id AS owner_id,
        'user_id' AS owner_field,

        COALESCE(su.username, 'user') AS username,
        COALESCE(NULLIF(trim(su.name), ''), NULLIF(trim(su.username), ''), 'User') AS name,
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
        ss.message AS message,
        'public' AS visibility,
        0 AS views, 0 AS shares,

        NULL AS media_url,
        NULL AS media_type,
        NULL AS media_urls,
        NULL AS media_types,
        NULL AS media_meta,

        0 AS comments_count,
        0 AS reactions_count,
        NULL AS my_reaction,
        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name,
        NULL AS audio_url, 0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        'story_share' AS type,
        'story_share' AS post_type,
        'story_share' AS kind,

        json_object(
          'kind', 'story_share',
          'type', 'story_share',
          'share_id', ss.id,
          'original_story_id', st.id
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
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM story_shares ss
      JOIN stories st ON st.id = ss.story_id
      LEFT JOIN users su ON su.id = ss.user_id
      LEFT JOIN users u ON u.id = st.user_id
    `;

    // ============================================================
    // 2) SONGS
    // ============================================================
    const whereSongs: string[] = [];
    const bindsSongs: any[] = [];

    whereSongs.push(`COALESCE(s.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereSongs.push(`s.created_at < ?`);
      bindsSongs.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereSongs.push(`s.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsSongs.push(...seen);
    }

    const whereSongsSql = whereSongs.length ? `WHERE ${whereSongs.join(" AND ")}` : "";

    const baseSelectSongs = `
      SELECT
        'song' AS source,
        'song' AS item_type,

        s.id AS id,
        ('song:' || CAST(s.id AS TEXT)) AS feed_key,

        s.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id, NULL AS shared_post_id, NULL AS reel_id,
        s.id AS song_id2,
        NULL AS event_id, NULL AS group_post_id, NULL AS product_id2,

        s.uploader_id AS user_id,
        s.uploader_id AS owner_id,
        'uploader_id' AS owner_field,
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        (
          COALESCE(s.title,'')
          || CASE
               WHEN s.artist_name IS NOT NULL AND s.artist_name != '' THEN ' — ' || s.artist_name
               ELSE ''
             END
        ) AS content,

        'public' AS visibility,
        0 AS views,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS shares,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS shares_count,
        (SELECT COUNT(*) FROM song_shares ssh_ct WHERE ssh_ct.song_id = s.id) AS share_count,

        NULL AS media_url, NULL AS media_type,
        NULL AS media_urls, NULL AS media_types, NULL AS media_meta,

        (SELECT COUNT(*) FROM song_comments sc WHERE sc.song_id = s.id AND COALESCE(sc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM song_reactions sr WHERE sr.song_id = s.id) AS reactions_count,
        (SELECT sr.type FROM song_reactions sr WHERE sr.song_id = s.id AND sr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption,
        NULL AS song_name,
        s.audio_url AS audio_url,
        0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

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

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        'music' AS type,
        'music' AS post_type,
        'music' AS kind,
        json_object(
          'kind', 'music',
          'type', 'music',
          'song', json_object(
            'id', s.id,
            'title', s.title,
            'artist_name', s.artist_name,
            'album_name', s.album_name,
            'cover_image_url', s.cover_image_url,
            'audio_url', s.audio_url,
            'duration_seconds', s.duration_seconds,
            'genre', s.genre,
            'uploader_id', s.uploader_id
          )
        ) AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM songs s
      LEFT JOIN users u ON u.id = s.uploader_id
    `;

    // ============================================================
    // 3) EVENTS
    // ============================================================
    const whereEvents: string[] = [];
    const bindsEvents: any[] = [];

    whereEvents.push(
      `(e.visibility IS NULL OR e.visibility = 'worldwide' OR e.visibility = 'targeted')`
    );
    whereEvents.push(`COALESCE(e.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereEvents.push(`e.created_at < ?`);
      bindsEvents.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereEvents.push(`e.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsEvents.push(...seen);
    }

    const whereEventsSql = whereEvents.length ? `WHERE ${whereEvents.join(" AND ")}` : "";

    const baseSelectEvents = `
      SELECT
        'event' AS source,
        'event' AS item_type,

        e.id AS id,
        ('event:' || CAST(e.id AS TEXT)) AS feed_key,

        e.created_at AS created_at,
        e.updated_at AS updated_at,

        NULL AS post_id, NULL AS shared_post_id, NULL AS reel_id, NULL AS song_id2,
        e.id AS event_id,
        NULL AS group_post_id, NULL AS product_id2,

        e.creator_id AS user_id,
        e.creator_id AS owner_id,
        'creator_id' AS owner_field,
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        e.title AS content,
        'public' AS visibility,
        0 AS views,
        (SELECT COUNT(*) FROM event_shares es WHERE es.event_id = e.id) AS shares,

        CASE
          WHEN e.cover_url LIKE 'data:%' THEN NULL
          WHEN length(e.cover_url) > 300 THEN NULL
          ELSE e.cover_url
        END AS media_url,

        CASE
          WHEN e.cover_url IS NOT NULL AND e.cover_url != '' THEN 'image'
          ELSE NULL
        END AS media_type,

        CASE
          WHEN e.cover_url IS NOT NULL AND e.cover_url != ''
          THEN json_array(e.cover_url)
          ELSE NULL
        END AS media_urls,

        CASE
          WHEN e.cover_url IS NOT NULL AND e.cover_url != ''
          THEN json_array('image')
          ELSE NULL
        END AS media_types,

        NULL AS media_meta,

        (SELECT COUNT(*) FROM event_comments ec WHERE ec.event_id = e.id AND COALESCE(ec.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM event_reactions er WHERE er.event_id = e.id) AS reactions_count,
        (SELECT er.type FROM event_reactions er WHERE er.event_id = e.id AND er.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name, NULL AS audio_url,
        0 AS audio_start, 0 AS audio_end,
        e.location AS location,
        NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        e.event_date AS event_date,
        e.description AS event_description,

        (SELECT COUNT(*) FROM event_attendees ea WHERE ea.event_id = e.id) AS attending_count,
        (SELECT COUNT(*) FROM event_interested ei WHERE ei.event_id = e.id) AS interested_count,

        CASE
          WHEN EXISTS (SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = ?) THEN 'going'
          WHEN EXISTS (SELECT 1 FROM event_interested ei WHERE ei.event_id = e.id AND ei.user_id = ?) THEN 'interested'
          ELSE ''
        END AS my_rsvp_status,

        'event' AS type,
        'event' AS post_type,
        'event' AS kind,
        json_object(
          'kind', 'event',
          'type', 'event',
          'event_id', e.id,
          'comments_count', (SELECT COUNT(*) FROM event_comments ec WHERE ec.event_id = e.id AND COALESCE(ec.is_deleted, 0) = 0),
          'reactions_count', (SELECT COUNT(*) FROM event_reactions er WHERE er.event_id = e.id),
          'shares_count', (SELECT COUNT(*) FROM event_shares es WHERE es.event_id = e.id),
          'event', json_object(
            'id', e.id,
            'title', e.title,
            'description', e.description,
            'event_date', e.event_date,
            'location', e.location,
            'cover_url', e.cover_url
          )
        ) AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM events e
      LEFT JOIN users u ON u.id = e.creator_id
    `;

    // ============================================================
    // 4) GROUP POSTS
    // ============================================================
    const whereGroupPosts: string[] = [];
    const bindsGroupPosts: any[] = [];

    whereGroupPosts.push(`(gp.visibility IS NULL OR gp.visibility = 'public')`);
    whereGroupPosts.push(`COALESCE(gp.is_deleted, 0) = 0`);

    whereGroupPosts.push(`(
      COALESCE(LOWER(gp.media_url), '') NOT LIKE '%.mp4%'
      AND COALESCE(LOWER(gp.media_url), '') NOT LIKE '%.webm%'
      AND COALESCE(LOWER(gp.media_url), '') NOT LIKE '%.mov%'
      AND COALESCE(LOWER(gp.media_url), '') NOT LIKE '%.m4v%'
      AND COALESCE(LOWER(gp.media_url), '') NOT LIKE '%.m3u8%'
      AND COALESCE(LOWER(gp.media_urls), '') NOT LIKE '%.mp4%'
      AND COALESCE(LOWER(gp.media_urls), '') NOT LIKE '%.webm%'
      AND COALESCE(LOWER(gp.media_urls), '') NOT LIKE '%.mov%'
      AND COALESCE(LOWER(gp.media_urls), '') NOT LIKE '%.m4v%'
      AND COALESCE(LOWER(gp.media_urls), '') NOT LIKE '%.m3u8%'
    )`);

    if (cursor && cursor.trim()) {
      whereGroupPosts.push(`gp.created_at < ?`);
      bindsGroupPosts.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereGroupPosts.push(`gp.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsGroupPosts.push(...seen);
    }

    const whereGroupPostsSql = whereGroupPosts.length
      ? `WHERE ${whereGroupPosts.join(" AND ")}`
      : "";

    const baseSelectGroupPosts = `
      SELECT
        'group_post' AS source,
        'group_post' AS item_type,

        gp.id AS id,
        ('group_post:' || CAST(gp.id AS TEXT)) AS feed_key,

        gp.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id, NULL AS shared_post_id, NULL AS reel_id, NULL AS song_id2, NULL AS event_id,
        gp.id AS group_post_id,
        NULL AS product_id2,

        gp.user_id AS user_id,
        gp.user_id AS owner_id,
        'user_id' AS owner_field,
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        gp.group_id AS group_id,
        COALESCE(g.name, 'Group') AS group_name,
        CASE
          WHEN g.profile_image LIKE 'data:%' THEN NULL
          WHEN length(g.profile_image) > 300 THEN NULL
          ELSE g.profile_image
        END AS group_image,

        gp.content AS content,
        gp.visibility AS visibility,
        0 AS views, 0 AS shares,

        CASE
          WHEN gp.media_url LIKE 'data:%' THEN NULL
          WHEN length(gp.media_url) > 300 THEN NULL
          ELSE gp.media_url
        END AS media_url,

        CASE
          WHEN gp.media_url LIKE 'data:%' THEN NULL
          WHEN length(gp.media_url) > 300 THEN NULL
          ELSE
            CASE
              WHEN gp.media_url LIKE '%.mp4%' OR gp.media_url LIKE '%.webm%' OR gp.media_url LIKE '%.mov%' OR gp.media_url LIKE '%.m4v%' OR gp.media_url LIKE '%.m3u8%' THEN 'video'
              ELSE 'image'
            END
        END AS media_type,

        CASE
          WHEN gp.media_urls LIKE 'data:%' THEN NULL
          WHEN length(gp.media_urls) > 5000 THEN NULL
          ELSE gp.media_urls
        END AS media_urls,

        gp.media_types AS media_types,
        gp.media_meta AS media_meta,

        (SELECT COUNT(*) FROM group_post_comments gpc WHERE gpc.group_post_id = gp.id AND COALESCE(gpc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM group_post_reactions gpr WHERE gpr.group_post_id = gp.id) AS reactions_count,
        (SELECT gpr.type FROM group_post_reactions gpr WHERE gpr.group_post_id = gp.id AND gpr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name, NULL AS audio_url,
        0 AS audio_start, 0 AS audio_end,
        gp.location AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        NULL AS type, NULL AS post_type, NULL AS kind,
        json_object(
          'job_title', gp.job_title,
          'company', gp.company,
          'job_type', gp.job_type,
          'salary', gp.salary,
          'location', gp.location,
          'street', gp.street,
          'district', gp.district,
          'region', gp.region,
          'country', gp.country,
          'application_type', gp.application_type,
          'application_value', gp.application_value,
          'expiry_date', gp.expiry_date,
          'price', gp.price,
          'currency', gp.currency,
          'condition', gp.condition,
          'status', gp.status,
          'group_category', g.category
        ) AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story
      FROM group_posts gp
      LEFT JOIN users u ON u.id = gp.user_id
      LEFT JOIN groups g ON g.id = gp.group_id
    `;

    // ============================================================
    // 5) PRODUCTS feed-injection
    // ============================================================
    const whereProductsFeed: string[] = [];
    const bindsProductsFeed: any[] = [];

    whereProductsFeed.push(`COALESCE(pr.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereProductsFeed.push(`pr.created_at < ?`);
      bindsProductsFeed.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereProductsFeed.push(`pr.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsProductsFeed.push(...seen);
    }

    const whereProductsFeedSql = whereProductsFeed.length
      ? `WHERE ${whereProductsFeed.join(" AND ")}`
      : "";

    const baseSelectProductsFeed = `
      SELECT
        'product' AS source,
        'product' AS item_type,

        pr.id AS id,
        ('product:' || CAST(pr.id AS TEXT)) AS feed_key,

        pr.created_at AS created_at,
        NULL AS updated_at,

        NULL AS post_id, NULL AS shared_post_id, NULL AS reel_id, NULL AS song_id2, NULL AS event_id,
        NULL AS group_post_id,
        pr.id AS product_id2,

        pr.seller_id AS user_id,
        pr.seller_id AS owner_id,
        'seller_id' AS owner_field,
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        NULL AS media_url, NULL AS media_type,
        pr.images AS media_urls,
        NULL AS media_types,
        pr.image_variants AS media_meta,

        (SELECT COUNT(*) FROM product_comments pc WHERE pc.product_id = pr.id AND COALESCE(pc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM product_reactions prr WHERE prr.product_id = pr.id) AS reactions_count,
        (SELECT prr.type FROM product_reactions prr WHERE prr.product_id = pr.id AND prr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name, NULL AS audio_url,
        0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        'marketplace' AS type,
        'product' AS post_type,
        'product' AS kind,
        json_object(
          'kind','product',
          'type','product',
          'product_id', pr.id,
          'title', pr.title,
          'description', pr.description,
          'price', COALESCE(pr.discount_price, pr.main_price),
          'main_price', pr.main_price,
          'discount_price', pr.discount_price,
          'currency', 'TZS',
          'location', pr.address,
          'address', pr.address,
          'images', pr.images,
          'image_variants', pr.image_variants,
          'shares', (SELECT COUNT(*) FROM product_shares psh_m WHERE psh_m.product_id = pr.id),
          'shares_count', (SELECT COUNT(*) FROM product_shares psh_m WHERE psh_m.product_id = pr.id),
          'share_count', (SELECT COUNT(*) FROM product_shares psh_m WHERE psh_m.product_id = pr.id),
          'marketplace', json_object(
            'id', pr.id,
            'product_id', pr.id,
            'title', pr.title,
            'price', COALESCE(pr.discount_price, pr.main_price),
            'currency', 'TZS',
            'location', pr.address,
            'images', pr.images,
            'image_variants', pr.image_variants
          )
        ) AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM products pr
      LEFT JOIN users u ON u.id = pr.seller_id
    `;

    // ============================================================
    // 6) PRODUCTS (separate list)
    // ============================================================
    const whereProducts: string[] = [];
    const bindsProducts: any[] = [];

    whereProducts.push(`COALESCE(pr.is_deleted, 0) = 0`);

    if (cursor && cursor.trim()) {
      whereProducts.push(`pr.created_at < ?`);
      bindsProducts.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereProducts.push(`pr.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsProducts.push(...seen);
    }

    const whereProductsSql = whereProducts.length
      ? `WHERE ${whereProducts.join(" AND ")}`
      : "";

    const selectProducts = `
      SELECT
        pr.id, pr.seller_id, pr.title, pr.category, pr.description,
        pr.country, pr.address, pr.main_price, pr.discount_price,
        pr.quantity, pr.phone_number, pr.images, pr.created_at
      FROM products pr
      ${whereProductsSql}
      ORDER BY pr.created_at DESC
      LIMIT ?
    `;

    // ============================================================
    // 7) BOOSTED POSTS FROM ADS
    // ============================================================
    const whereAds: string[] = [];
    const bindsAds: any[] = [];

    whereAds.push(`a.status = 'active'`);
    whereAds.push(`a.post_id IS NOT NULL`);
    whereAds.push(`COALESCE(p.is_deleted, 0) = 0`);

    whereAds.push(`(
      COALESCE(LOWER(p.media_type), '') NOT LIKE '%video%'
      AND COALESCE(LOWER(COALESCE(a.media_url, p.media_url)), '') NOT LIKE '%.mp4%'
      AND COALESCE(LOWER(COALESCE(a.media_url, p.media_url)), '') NOT LIKE '%.webm%'
      AND COALESCE(LOWER(COALESCE(a.media_url, p.media_url)), '') NOT LIKE '%.mov%'
      AND COALESCE(LOWER(COALESCE(a.media_url, p.media_url)), '') NOT LIKE '%.m4v%'
      AND COALESCE(LOWER(COALESCE(a.media_url, p.media_url)), '') NOT LIKE '%.m3u8%'
      AND COALESCE(LOWER(COALESCE(a.media_urls, p.media_urls)), '') NOT LIKE '%.mp4%'
      AND COALESCE(LOWER(COALESCE(a.media_urls, p.media_urls)), '') NOT LIKE '%.webm%'
      AND COALESCE(LOWER(COALESCE(a.media_urls, p.media_urls)), '') NOT LIKE '%.mov%'
      AND COALESCE(LOWER(COALESCE(a.media_urls, p.media_urls)), '') NOT LIKE '%.m4v%'
      AND COALESCE(LOWER(COALESCE(a.media_urls, p.media_urls)), '') NOT LIKE '%.m3u8%'
      AND (p.media_meta IS NULL OR LOWER(p.media_meta) NOT LIKE '%"type":"video"%')
    )`);

    if (cursor && cursor.trim()) {
      whereAds.push(`a.created_at < ?`);
      bindsAds.push(cursor.trim());
    }
    if (seen.length > 0) {
      whereAds.push(`a.id NOT IN (${seen.map(() => "?").join(",")})`);
      bindsAds.push(...seen);
    }

    const whereAdsSql = whereAds.length ? `WHERE ${whereAds.join(" AND ")}` : "";

    const baseSelectAds = `
      SELECT
        'post' AS source,
        'post' AS item_type,

        p.id AS id,
        ('ad_post:' || CAST(a.id AS TEXT) || ':' || CAST(p.id AS TEXT)) AS feed_key,

        COALESCE(a.created_at, p.created_at) AS created_at,
        p.updated_at AS updated_at,

        p.id AS post_id, NULL AS shared_post_id, NULL AS reel_id, NULL AS song_id2, NULL AS event_id,
        NULL AS group_post_id, NULL AS product_id2,

        p.user_id AS user_id,
        p.user_id AS owner_id,
        'user_id' AS owner_field,
        COALESCE(u.username, 'user') AS username,
        COALESCE(u.name, u.username, 'User') AS name,
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

        COALESCE(NULLIF(a.description, ''), p.content) AS content,
        COALESCE(p.visibility, 'Public') AS visibility,
        COALESCE(p.views, 0) AS views,
        COALESCE(p.shares, 0) AS shares,
        p.colours AS colours,
        p.colours AS background,
        p.colours AS background_style,

        CASE
          WHEN COALESCE(a.media_url, p.media_url) LIKE 'data:%' THEN NULL
          WHEN length(COALESCE(a.media_url, p.media_url)) > 300 THEN NULL
          ELSE COALESCE(a.media_url, p.media_url)
        END AS media_url,

        COALESCE(NULLIF(a.media_type, ''), NULLIF(p.media_type, ''), 'image') AS media_type,

        CASE
          WHEN COALESCE(a.media_urls, p.media_urls) LIKE 'data:%' THEN NULL
          WHEN length(COALESCE(a.media_urls, p.media_urls)) > 5000 THEN NULL
          ELSE COALESCE(a.media_urls, p.media_urls)
        END AS media_urls,

        CASE
          WHEN length(COALESCE(a.media_types, p.media_types)) > 5000 THEN NULL
          ELSE COALESCE(a.media_types, p.media_types)
        END AS media_types,

        CASE
          WHEN length(p.media_meta) > 100000 THEN NULL
          ELSE p.media_meta
        END AS media_meta,

        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id AND COALESCE(pc.is_deleted,0) = 0) AS comments_count,

        (SELECT COUNT(*) FROM post_reactions pr WHERE pr.post_id = p.id) AS reactions_count,
        (SELECT pr.type FROM post_reactions pr WHERE pr.post_id = p.id AND pr.user_id = ? LIMIT 1) AS my_reaction,

        NULL AS reactor_name,
        NULL AS reactions_preview,
        NULL AS reactions_by_type,

        NULL AS video_url, NULL AS caption, NULL AS song_name, NULL AS audio_url,
        0 AS audio_start, 0 AS audio_end,
        NULL AS location, NULL AS sound_key, NULL AS sound_id,

        NULL AS song_title, NULL AS song_artist_name, NULL AS song_album_name,
        NULL AS song_cover_image_url, NULL AS song_duration_seconds,
        NULL AS song_genre, NULL AS song_likes_count, NULL AS song_plays_count,

        NULL AS event_date, NULL AS event_description,
        NULL AS attending_count, NULL AS interested_count,
        NULL AS my_rsvp_status,

        'post' AS type,
        'post' AS post_type,
        'post' AS kind,
        json_object(
          'kind','post',
          'type','post',
          'post_id', p.id,
          'is_sponsored', 1,
          'sponsored_meta', json_object(
            'ad_id', a.id,
            'advertiser_id', a.advertiser_id,
            'campaign_name', a.campaign_name,
            'headline', a.title,
            'cta_text', a.cta_button,
            'cta_url', a.destination_url,
            'contact_type', a.contact_type,
            'phone_number', a.phone_number,
            'email_address', a.email_address
          )
        ) AS meta,

        NULL AS shared_post,
        NULL AS shared_product,
        NULL AS shared_song,
        NULL AS shared_event,
        NULL AS shared_story,

        NULL AS group_id, NULL AS group_name, NULL AS group_image
      FROM ads a
      JOIN posts p ON p.id = a.post_id
      LEFT JOIN users u ON u.id = p.user_id
    `;

    // ============================================================
    // RUN QUERIES (Fresh)
    // ============================================================
    const freshPostsRes = await env.DB.prepare(
      `${baseSelectPosts} ${wherePostsSql} ORDER BY p.created_at DESC LIMIT ?`
    )
      .bind(reactionUserId, ...bindsPosts, freshCount)
      .all();
    const freshPosts = Array.isArray(freshPostsRes?.results)
      ? freshPostsRes.results
      : [];

    let freshShares: any[] = [];
    try {
      const freshSharesRes = await env.DB.prepare(
        `${baseSelectShares} ${whereSharesSql} ORDER BY ps.created_at DESC LIMIT ?`
      )
        .bind(reactionUserId, reactionUserId, ...bindsShares, freshCount)
        .all();
      freshShares = Array.isArray(freshSharesRes?.results)
        ? freshSharesRes.results
        : [];
    } catch (errShares) {
      console.warn("freshShares query fallback:", errShares);
    }

    let freshProductShares: any[] = [];
    try {
      const res = await env.DB.prepare(
        `${baseSelectProductShares} ${whereProductSharesSql} ORDER BY psh.shared_at DESC LIMIT ?`
      )
        .bind(reactionUserId, ...bindsProductShares, freshCount)
        .all();
      freshProductShares = Array.isArray(res?.results) ? res.results : [];
    } catch (err) {
      console.warn("freshProductShares fallback:", err);
    }

    // ✅ FIX: bind reactionUserId for the my_reaction subquery in baseSelectSongShares
    let freshSongShares: any[] = [];
    try {
      const res = await env.DB.prepare(
        `${baseSelectSongShares} ${whereSongSharesSql} ORDER BY ssh.shared_at DESC LIMIT ?`
      )
        .bind(reactionUserId, ...bindsSongShares, freshCount)
        .all();
      freshSongShares = Array.isArray(res?.results) ? res.results : [];
    } catch (err) {
      console.warn("freshSongShares fallback:", err);
    }

    let freshEventShares: any[] = [];
    try {
      const res = await env.DB.prepare(
        `${baseSelectEventShares} ${whereEventSharesSql} ORDER BY esh.shared_at DESC LIMIT ?`
      )
        .bind(...bindsEventShares, freshCount)
        .all();
      freshEventShares = Array.isArray(res?.results) ? res.results : [];
    } catch (err) {
      console.warn("freshEventShares fallback:", err);
    }

    let freshStoryShares: any[] = [];
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
      const res = await env.DB.prepare(
        `${baseSelectStoryShares} ${whereStorySharesSql} ORDER BY ss.created_at DESC LIMIT ?`
      )
        .bind(...bindsStoryShares, freshCount)
        .all();
      freshStoryShares = Array.isArray(res?.results) ? res.results : [];
    } catch (err) {
      console.warn("freshStoryShares fallback:", err);
    }

    const freshSongsRes = await env.DB.prepare(
      `${baseSelectSongs} ${whereSongsSql} ORDER BY s.created_at DESC LIMIT ?`
    )
      .bind(reactionUserId, ...bindsSongs, freshCount)
      .all();
    const freshSongs = Array.isArray(freshSongsRes?.results)
      ? freshSongsRes.results
      : [];

    const freshEventsRes = await env.DB.prepare(
      `${baseSelectEvents} ${whereEventsSql} ORDER BY e.created_at DESC LIMIT ?`
    )
      .bind(reactionUserId, reactionUserId, reactionUserId, ...bindsEvents, freshCount)
      .all();
    const freshEvents = Array.isArray(freshEventsRes?.results)
      ? freshEventsRes.results
      : [];

    const freshGroupPostsRes = await env.DB.prepare(
      `${baseSelectGroupPosts} ${whereGroupPostsSql} ORDER BY gp.created_at DESC LIMIT ?`
    )
      .bind(reactionUserId, ...bindsGroupPosts, freshCount)
      .all();
    const freshGroupPosts = Array.isArray(freshGroupPostsRes?.results)
      ? freshGroupPostsRes.results
      : [];

    const freshProductsFeedRes = await env.DB.prepare(
      `${baseSelectProductsFeed} ${whereProductsFeedSql} ORDER BY pr.created_at DESC LIMIT ?`
    )
      .bind(reactionUserId, ...bindsProductsFeed, freshCount)
      .all();
    const freshProductsFeed = Array.isArray(freshProductsFeedRes?.results)
      ? freshProductsFeedRes.results
      : [];

    const freshAdsRes = await env.DB.prepare(
      `${baseSelectAds} ${whereAdsSql} ORDER BY RANDOM() LIMIT ?`
    )
      .bind(reactionUserId, ...bindsAds, Math.min(3, freshCount))
      .all();
    const freshAds = Array.isArray(freshAdsRes?.results) ? freshAdsRes.results : [];

    const freshProductsRes = await env.DB.prepare(selectProducts)
      .bind(...bindsProducts, freshCount)
      .all();
    const freshProducts = Array.isArray(freshProductsRes?.results)
      ? freshProductsRes.results
      : [];

    // ============================================================
    // RUN QUERIES (Explore)
    // ============================================================
    let explorePosts: any[] = [];
    let exploreShares: any[] = [];
    let exploreProductShares: any[] = [];
    let exploreSongShares: any[] = [];
    let exploreEventShares: any[] = [];
    let exploreStoryShares: any[] = [];
    let exploreSongs: any[] = [];
    let exploreEvents: any[] = [];
    let exploreGroupPosts: any[] = [];
    let exploreProductsFeed: any[] = [];
    let exploreAds: any[] = [];
    let exploreProducts: any[] = [];

    if (exploreCount > 0) {
      const explorePostsRes = await env.DB.prepare(
        `${baseSelectPosts} ${wherePostsSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, ...bindsPosts, exploreCount)
        .all();
      explorePosts = Array.isArray(explorePostsRes?.results) ? explorePostsRes.results : [];

      try {
        const res = await env.DB.prepare(
          `${baseSelectShares} ${whereSharesSql} ORDER BY RANDOM() LIMIT ?`
        )
          .bind(reactionUserId, reactionUserId, ...bindsShares, exploreCount)
          .all();
        exploreShares = Array.isArray(res?.results) ? res.results : [];
      } catch {}

      try {
        const res = await env.DB.prepare(
          `${baseSelectProductShares} ${whereProductSharesSql} ORDER BY RANDOM() LIMIT ?`
        )
          .bind(reactionUserId, ...bindsProductShares, exploreCount)
          .all();
        exploreProductShares = Array.isArray(res?.results) ? res.results : [];
      } catch {}

      // ✅ FIX: bind reactionUserId
      try {
        const res = await env.DB.prepare(
          `${baseSelectSongShares} ${whereSongSharesSql} ORDER BY RANDOM() LIMIT ?`
        )
          .bind(reactionUserId, ...bindsSongShares, exploreCount)
          .all();
        exploreSongShares = Array.isArray(res?.results) ? res.results : [];
      } catch {}

      try {
        const res = await env.DB.prepare(
          `${baseSelectEventShares} ${whereEventSharesSql} ORDER BY RANDOM() LIMIT ?`
        )
          .bind(...bindsEventShares, exploreCount)
          .all();
        exploreEventShares = Array.isArray(res?.results) ? res.results : [];
      } catch {}

      try {
        const res = await env.DB.prepare(
          `${baseSelectStoryShares} ${whereStorySharesSql} ORDER BY RANDOM() LIMIT ?`
        )
          .bind(...bindsStoryShares, exploreCount)
          .all();
        exploreStoryShares = Array.isArray(res?.results) ? res.results : [];
      } catch {}

      const exploreSongsRes = await env.DB.prepare(
        `${baseSelectSongs} ${whereSongsSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, ...bindsSongs, exploreCount)
        .all();
      exploreSongs = Array.isArray(exploreSongsRes?.results) ? exploreSongsRes.results : [];

      const exploreEventsRes = await env.DB.prepare(
        `${baseSelectEvents} ${whereEventsSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, reactionUserId, reactionUserId, ...bindsEvents, exploreCount)
        .all();
      exploreEvents = Array.isArray(exploreEventsRes?.results) ? exploreEventsRes.results : [];

      const exploreGroupPostsRes = await env.DB.prepare(
        `${baseSelectGroupPosts} ${whereGroupPostsSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, ...bindsGroupPosts, exploreCount)
        .all();
      exploreGroupPosts = Array.isArray(exploreGroupPostsRes?.results)
        ? exploreGroupPostsRes.results
        : [];

      const exploreProductsFeedRes = await env.DB.prepare(
        `${baseSelectProductsFeed} ${whereProductsFeedSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, ...bindsProductsFeed, exploreCount)
        .all();
      exploreProductsFeed = Array.isArray(exploreProductsFeedRes?.results)
        ? exploreProductsFeedRes.results
        : [];

      const exploreAdsRes = await env.DB.prepare(
        `${baseSelectAds} ${whereAdsSql} ORDER BY RANDOM() LIMIT ?`
      )
        .bind(reactionUserId, ...bindsAds, Math.min(2, exploreCount))
        .all();
      exploreAds = Array.isArray(exploreAdsRes?.results) ? exploreAdsRes.results : [];

      const exploreProductsRes = await env.DB.prepare(
        `
          SELECT
            pr.id, pr.seller_id, pr.title, pr.category, pr.description, pr.country, pr.address,
            pr.main_price, pr.discount_price, pr.quantity, pr.phone_number, pr.images, pr.created_at
          FROM products pr
          ${whereProductsSql}
          ORDER BY RANDOM()
          LIMIT ?
        `
      )
        .bind(...bindsProducts, exploreCount)
        .all();
      exploreProducts = Array.isArray(exploreProductsRes?.results)
        ? exploreProductsRes.results
        : [];
    }

    // ============================================================
    // Merge + dedup FEED
    // ============================================================
    const map = new Map<string, any>();
    const allFeedRows = [
      ...freshPosts,
      ...freshShares,
      ...freshProductShares,
      ...freshSongShares,
      ...freshEventShares,
      ...freshStoryShares,
      ...freshSongs,
      ...freshEvents,
      ...freshGroupPosts,
      ...freshProductsFeed,
      ...freshAds,
      ...explorePosts,
      ...exploreShares,
      ...exploreProductShares,
      ...exploreSongShares,
      ...exploreEventShares,
      ...exploreStoryShares,
      ...exploreSongs,
      ...exploreEvents,
      ...exploreGroupPosts,
      ...exploreProductsFeed,
      ...exploreAds,
    ];

    for (const row of allFeedRows) {
      const fk = String((row as any)?.feed_key || "");
      if (fk) {
        if (!map.has(fk)) map.set(fk, row);
        continue;
      }
      const src = String((row as any)?.source || "");
      const id = Number((row as any)?.id);
      if (!src || !Number.isFinite(id)) continue;
      const key = `${src}:${id}`;
      if (!map.has(key)) map.set(key, row);
    }

    const merged = Array.from(map.values());

    const oldest = merged.reduce((acc: any, cur: any) => {
      if (!acc) return cur;
      return String(cur.created_at) < String(acc.created_at) ? cur : acc;
    }, null as any);

    const nextCursor = oldest?.created_at ?? null;

    const mixed = seededShuffle(merged, seed);
    const isFirstPage = !cursor || !cursor.trim();

    let orderedRaw = mixed;

    if (isFirstPage && pinPostId > 0) {
      const pinnedIndex = mixed.findIndex(
        (item: any) =>
          String(item?.source) === "post" &&
          Number(item?.id) === pinPostId &&
          Number(item?.user_id) === userId
      );

      if (pinnedIndex >= 0) {
        const pinnedItem = mixed[pinnedIndex];
        const rest = mixed.filter((_: any, i: number) => i !== pinnedIndex);
        orderedRaw = [pinnedItem, ...rest];
      }
    }

    const ordered = orderedRaw.slice(0, limit).map((item: any) => {
      const isVerified = Boolean(
        item?.is_verified &&
          item.is_verified !== 0 &&
          item.is_verified !== "0" &&
          item.is_verified !== false
      );

      const authorObj = {
        id: item?.user_id || item?.author?.id,
        name: item?.name || item?.author?.name || item?.username || "User",
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

      const normalized: any = {
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
      };

      if (item?.meta) {
        let metaObj = item.meta;
        if (typeof metaObj === "string") {
          try {
            metaObj = JSON.parse(metaObj);
          } catch {
            metaObj = null;
          }
        }
        if (metaObj && typeof metaObj === "object") {
          normalized.meta = metaObj;
          if (metaObj.job_title && !normalized.job_title) normalized.job_title = metaObj.job_title;
          if (metaObj.company && !normalized.company) normalized.company = metaObj.company;
          if (metaObj.job_type && !normalized.job_type) normalized.job_type = metaObj.job_type;
          if (metaObj.salary && !normalized.salary) normalized.salary = metaObj.salary;
          if (metaObj.location && !normalized.location) normalized.location = metaObj.location;
          if (metaObj.application_type && !normalized.application_type) normalized.application_type = metaObj.application_type;
          if (metaObj.application_value && !normalized.application_value) normalized.application_value = metaObj.application_value;
          if (metaObj.expiry_date && !normalized.expiry_date) normalized.expiry_date = metaObj.expiry_date;
          if (metaObj.group_category && !normalized.group_category) normalized.group_category = metaObj.group_category;
        }
      }

      // Normalize nested shared_post
      if ((item as any)?.shared_post) {
        let sp: any = (item as any).shared_post;
        if (typeof sp === "string") {
          try {
            sp = JSON.parse(sp);
          } catch {
            sp = null;
          }
        }
        if (sp && typeof sp === "object") {
          const spVerified = Boolean(
            (sp.is_verified ||
              sp.verified ||
              sp.author?.is_verified ||
              sp.author?.verified ||
              sp.user?.is_verified) &&
              sp.is_verified !== 0 &&
              sp.is_verified !== "0" &&
              sp.verified !== 0 &&
              sp.verified !== "0"
          );

          const spAuthor = {
            id: sp.seller_id || sp.user_id || sp.uploader_id || sp.author?.id,
            name:
              sp.author?.name ||
              sp.author_name ||
              sp.user?.name ||
              sp.name ||
              sp.artist_name ||
              "User",
            username:
              sp.author?.username ||
              sp.author_username ||
              sp.user?.username ||
              sp.username ||
              "",
            avatar_url:
              sp.author?.avatar_url ||
              sp.author?.profile_image_url ||
              sp.author_avatar ||
              sp.author_image ||
              "",
            profile_image_url:
              sp.author?.profile_image_url ||
              sp.author?.avatar_url ||
              sp.author_avatar ||
              sp.author_image ||
              "",
            is_verified: spVerified,
            verified: spVerified,
            role: sp.author?.role || sp.user?.role || "user",
          };

          const isProductLike = Boolean(
            sp.is_product ||
            sp.item_type === 'product' ||
            sp.source === 'product' ||
            sp.type === 'product' ||
            sp.post_type === 'product' ||
            sp.kind === 'product' ||
            sp.price != null ||
            sp.main_price != null ||
            item.source === 'product_share' ||
            item.item_type === 'product_share'
          );

          const spImages = parseJsonArrayUrls(sp.images || sp.media_urls);
          const normalizedShared = {
            ...sp,
            ...normalizeMedia(sp),
            colours: sp?.colours || sp?.background || null,
            background: sp?.colours || sp?.background || null,
            background_style: sp?.colours || sp?.background || null,
            id: Number(sp.id || sp.product_id || 0),
            ...(isProductLike ? { product_id: Number(sp.product_id || sp.id || 0) } : {}),
            title: sp.title || sp.name || "",
            name: sp.title || sp.name || "",
            description: sp.description ?? sp.content ?? "",
            content: sp.content ?? sp.description ?? "",
            price: sp.price ?? sp.discount_price ?? sp.main_price ?? null,
            main_price: sp.main_price ?? null,
            discount_price: sp.discount_price ?? null,
            currency: sp.currency || "TZS",
            location: sp.location || sp.address || "Marketplace",
            address: sp.address || sp.location || "",
            images: spImages.length > 0 ? spImages : undefined,
            media_urls: spImages.length > 0 ? spImages : undefined,
            is_verified: spVerified,
            verified: spVerified,
            author: spAuthor,
            user: spAuthor,
            seller: spAuthor,
            ...(isProductLike ? {
              item_type: 'product',
              source: 'product',
              type: 'product',
              post_type: 'product',
              kind: 'product',
              is_product: true,
            } : {}),
          };

          normalized.shared_post = normalizedShared;
          if (isProductLike) {
            normalized.shared_product = normalizedShared;
            normalized.shared_post_id = normalizedShared.id;
            normalized.product_id = normalizedShared.id;
          }
        }
      }

      // Normalize nested shared_product
      if ((item as any)?.shared_product) {
        let sp: any = (item as any).shared_product;
        if (typeof sp === "string") {
          try {
            sp = JSON.parse(sp);
          } catch {
            sp = null;
          }
        }
        if (sp && typeof sp === "object") {
          const spVerified = Boolean(
            (sp.author?.is_verified ||
              sp.author?.verified ||
              sp.user?.is_verified ||
              sp.user?.verified ||
              sp.is_verified ||
              sp.verified) &&
              sp.is_verified !== 0 &&
              sp.is_verified !== "0" &&
              sp.verified !== 0 &&
              sp.verified !== "0"
          );
          const spAuthor = {
            id: sp.seller_id || sp.user_id || sp.author?.id || sp.user?.id,
            name:
              sp.author?.name ||
              sp.user?.name ||
              sp.author_name ||
              sp.seller_name ||
              "Seller",
            username:
              sp.author?.username ||
              sp.user?.username ||
              sp.author_username ||
              "",
            avatar_url:
              sp.author?.avatar_url ||
              sp.author?.profile_image_url ||
              sp.user?.avatar_url ||
              sp.user?.profile_image_url ||
              "",
            profile_image_url:
              sp.author?.profile_image_url ||
              sp.author?.avatar_url ||
              sp.user?.profile_image_url ||
              sp.user?.avatar_url ||
              "",
            is_verified: spVerified,
            verified: spVerified,
            role: sp.author?.role || sp.user?.role || "user",
          };
          const pImages = parseJsonArrayUrls(sp.images || sp.media_urls);
          const normalizedProduct = {
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
            images: pImages,
            media_urls: pImages,
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
          normalized.shared_product = normalizedProduct;
          if (!normalized.shared_post) {
            normalized.shared_post = normalizedProduct;
          }
          if (!normalized.shared_post_id) {
            normalized.shared_post_id = normalizedProduct.id;
          }
          if (!normalized.product_id) {
            normalized.product_id = normalizedProduct.id;
          }
        }
      }

      // Normalize nested shared_song
      if ((item as any)?.shared_song) {
        let ss: any = (item as any).shared_song;
        if (typeof ss === "string") {
          try {
            ss = JSON.parse(ss);
          } catch {
            ss = null;
          }
        }
        if (ss && typeof ss === "object") {
          const ssVerified = Boolean(ss.author?.is_verified || ss.author?.verified);
          const ssAuthor = {
            id: ss.uploader_id || ss.user_id || ss.author?.id,
            name: ss.author?.name || ss.artist_name || ss.author_name || "User",
            username: ss.author?.username || ss.author_username || "",
            avatar_url:
              ss.author?.avatar_url || ss.author?.profile_image_url || "",
            profile_image_url:
              ss.author?.profile_image_url || ss.author?.avatar_url || "",
            is_verified: ssVerified,
            verified: ssVerified,
            role: ss.author?.role || "user",
          };
          const normalizedSong = {
            ...ss,
            is_verified: ssVerified,
            verified: ssVerified,
            author: ssAuthor,
            user: ssAuthor,
          };
          normalized.shared_song = normalizedSong;
          if (!normalized.shared_post) {
            normalized.shared_post = normalizedSong;
          }
        }
      }

      // Normalize nested shared_event
      if ((item as any)?.shared_event) {
        let se: any = (item as any).shared_event;
        if (typeof se === "string") {
          try {
            se = JSON.parse(se);
          } catch {
            se = null;
          }
        }
        if (se && typeof se === "object") {
          const seVerified = Boolean(se.author?.is_verified || se.author?.verified);
          const seAuthor = {
            id: se.creator_id || se.user_id || se.author?.id,
            name: se.author?.name || se.author_name || "User",
            username: se.author?.username || se.author_username || "",
            avatar_url:
              se.author?.avatar_url || se.author?.profile_image_url || "",
            profile_image_url:
              se.author?.profile_image_url || se.author?.avatar_url || "",
            is_verified: seVerified,
            verified: seVerified,
            role: se.author?.role || "user",
          };
          const normalizedEvent = {
            ...se,
            is_verified: seVerified,
            verified: seVerified,
            author: seAuthor,
            user: seAuthor,
          };
          normalized.shared_event = normalizedEvent;
          if (!normalized.shared_post) {
            normalized.shared_post = normalizedEvent;
          }
        }
      }

      // Normalize nested shared_story
      if ((item as any)?.shared_story) {
        let sst: any = (item as any).shared_story;
        if (typeof sst === "string") {
          try {
            sst = JSON.parse(sst);
          } catch {
            sst = null;
          }
        }
        if (sst && typeof sst === "object") {
          const sstVerified = Boolean(
            sst.author?.is_verified || sst.author?.verified || sst.is_verified || sst.verified
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
          const normalizedStory = {
            ...sst,
            id: Number(sst.id || sst.story_id || 0),
            story_id: Number(sst.id || sst.story_id || 0),
            item_type: 'story',
            type: sst.type || 'story',
            post_type: 'story',
            kind: 'story',
            is_verified: sstVerified,
            verified: sstVerified,
            author: sstAuthor,
            user: sstAuthor,
            author_name: cleanName,
            author_full_name: cleanName,
            author_username: sstAuthor.username,
            author_image: sstAuthor.profile_image_url,
          };
          normalized.shared_story = normalizedStory;
          if (!normalized.shared_post) {
            normalized.shared_post = normalizedStory;
          }
          if (!normalized.shared_post_id) {
            normalized.shared_post_id = normalizedStory.id;
          }
        }
      }

      return normalized;
    });

    // ============================================================
    // Merge + dedup PRODUCTS
    // ============================================================
    const productMap = new Map<number, any>();
    for (const row of [...freshProducts, ...exploreProducts]) {
      const id = Number((row as any)?.id);
      if (!Number.isFinite(id)) continue;
      if (!productMap.has(id)) {
        const imgs = parseJsonArrayUrls((row as any)?.images);
        productMap.set(id, {
          ...row,
          images: imgs,
          media_urls: imgs,
        });
      }
    }
    const products = Array.from(productMap.values());

    // ============================================================
    // hasMore
    // ============================================================
    let hasMore = false;
    if (nextCursor) {
      const qMore = `
        SELECT p.id
        FROM posts p
        WHERE
          (p.visibility IS NULL OR p.visibility = 'public' OR p.visibility = '' OR p.visibility = 'Public')
          AND COALESCE(p.is_deleted, 0) = 0
          AND (p.content IS NULL OR (
            p.content NOT LIKE '%"post_type":"product"%'
            AND p.content NOT LIKE '%"kind":"product"%'
            AND p.content NOT LIKE '%"product_id"%'
            AND p.content NOT LIKE '%marketplace%'
            AND p.content NOT LIKE '%Check out my new event:%'
          ))
          AND p.created_at < ?
        ORDER BY p.created_at DESC
        LIMIT 1
      `;
      const more = await env.DB.prepare(qMore).bind(nextCursor).first();
      hasMore = !!more;
    }

    const payload = {
      success: true,
      userId,
      limit,
      cursor: cursor ?? null,
      nextCursor,
      hasMore,
      feed: ordered,
      products,
    };

    if (debug) {
      return json({
        ...payload,
        debug: {
          pinPostId,
          seenCount: seen.length,
          seenKeysCount: seenKeys.length,
          returnedFeed: ordered.length,
          returnedProducts: products.length,
          fresh: {
            posts: freshPosts.length,
            shares: freshShares.length,
            productShares: freshProductShares.length,
            songShares: freshSongShares.length,
            eventShares: freshEventShares.length,
            storyShares: freshStoryShares.length,
            songs: freshSongs.length,
            events: freshEvents.length,
            groupPosts: freshGroupPosts.length,
            productsFeed: freshProductsFeed.length,
            boostedPosts: freshAds.length,
            products: freshProducts.length,
          },
          explore: {
            posts: explorePosts.length,
            shares: exploreShares.length,
            productShares: exploreProductShares.length,
            songShares: exploreSongShares.length,
            eventShares: exploreEventShares.length,
            storyShares: exploreStoryShares.length,
            songs: exploreSongs.length,
            events: exploreEvents.length,
            groupPosts: exploreGroupPosts.length,
            productsFeed: exploreProductsFeed.length,
            boostedPosts: exploreAds.length,
            products: exploreProducts.length,
          },
        },
      });
    }

    return json(payload);
  } catch (e: any) {
    return json({ success: false, error: e?.message || String(e) }, 500);
  }
};
