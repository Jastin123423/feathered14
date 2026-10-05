import type { PagesFunction } from "@cloudflare/workers-types";
import { withNewContentId } from "../utils/ids";

type Env = { DB: D1Database };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const safeString = (v: any) => (typeof v === "string" ? v : "");
const safeNumber = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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
  if (Array.isArray(v)) {
    return v.map((x) => String(x || "").trim()).filter(Boolean);
  }
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

const normalizePostMedia = (item: any) => {
  const mediaMeta = normalizeMediaMetaArray(item?.media_meta);
  const mediaUrls = normalizeStringArray(item?.media_urls);
  const mediaTypes = normalizeStringArray(item?.media_types);

  // 1) Best source: media_meta with thumb/feed/full
  if (mediaMeta.length > 0) {
    const normalized = mediaMeta
      .map((m: any) => {
        const rawThumb = String(m?.thumbnail_url || m?.thumb || "").trim();
        // A thumbnail must be an image, NEVER a video file
        const isThumbVideo = rawThumb.match(/\.(mp4|webm|mov|m4v|3gp|avi|mkv)(\?|$)/i);
        const thumb = isThumbVideo ? "" : rawThumb;

        const feed = String(
          m?.['720'] || m?.feed || m?.feed_url || m?.url || m?.full || m?.['1080'] || ""
        ).trim();
        const full = String(
          m?.['1080'] || m?.full || m?.full_url || m?.original || m?.feed || m?.['720'] || ""
        ).trim();
        const original = String(
          m?.original || m?.['1080'] || m?.full || m?.['720'] || m?.feed || ""
        ).trim();

        const chosenType = normalizeMediaType(
          m?.type,
          inferTypeFromUrl(full || feed || thumb)
        );

        return {
          original: isHttpUrl(original) ? original : undefined,
          '1080': isHttpUrl(full) ? full : undefined,
          '720': isHttpUrl(feed) ? feed : undefined,
          thumbnail_url: isHttpUrl(thumb) ? thumb : undefined,
          thumb: isHttpUrl(thumb) ? thumb : null,
          feed: isHttpUrl(feed) ? feed : null,
          full: isHttpUrl(full) ? full : null,
          type: chosenType,
        };
      })
      .filter((m: any) => m.thumb || m.feed || m.full);

    if (normalized.length > 0) return normalized;
  }

  // 2) Fallback: media_urls + media_types
  if (mediaUrls.length > 0) {
    // If exactly 4 URLs: original, 1080, 720, and thumbnail_url
    if (mediaUrls.length === 4) {
      const orig = mediaUrls[0];
      const u1080 = mediaUrls[1];
      const u720 = mediaUrls[2];
      const thumb = mediaUrls[3];
      const isVideo0 = inferTypeFromUrl(orig) === 'video';
      const isImage3 = inferTypeFromUrl(thumb) === 'image' || thumb.includes('/thumbnails/');
      if (isVideo0 && isImage3 && isHttpUrl(orig) && isHttpUrl(thumb)) {
        return [
          {
            original: orig,
            '1080': u1080,
            '720': u720,
            thumbnail_url: thumb,
            thumb: thumb,
            feed: u720,
            full: u1080,
            type: 'video',
          },
        ];
      }
    }

    // If exactly 2 URLs: video + thumbnail image
    if (mediaUrls.length === 2) {
      const t0 = normalizeMediaType(mediaTypes[0], inferTypeFromUrl(mediaUrls[0]));
      const t1 = normalizeMediaType(mediaTypes[1], inferTypeFromUrl(mediaUrls[1]));
      if (t0 === 'video' && t1 === 'image' && isHttpUrl(mediaUrls[0]) && isHttpUrl(mediaUrls[1])) {
        return [
          {
            original: mediaUrls[0],
            '1080': mediaUrls[0],
            '720': mediaUrls[0],
            thumbnail_url: mediaUrls[1],
            thumb: mediaUrls[1],
            feed: mediaUrls[0],
            full: mediaUrls[0],
            type: 'video',
          },
        ];
      }
    }

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

  // 3) Final fallback: single media_url/media_type
  const singleUrl = String(item?.media_url || "").trim();
  if (isHttpUrl(singleUrl)) {
    const t = normalizeMediaType(item?.media_type, inferTypeFromUrl(singleUrl));
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

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json(
        { error: "D1 binding missing. Set Pages D1 binding name to DB." },
        500
      );
    }

    const body = await request.json().catch(() => ({} as any));

    const content = safeString(body.content).trim();

    // old single-media compatibility
    const media_url = body.media_url ?? null;
    const media_type = body.media_type ?? null;

    // new multi-media support
    const media_urls_arr = normalizeStringArray(body.media_urls);
    const media_types_arr = normalizeStringArray(body.media_types);
    const media_meta_arr = normalizeMediaMetaArray(body.media_meta);

    // Allow guest posts: user_id can be null
    const user_id = body.user_id ?? null;

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
        item?.type || inferTypeFromUrl(item?.full || item?.feed || item?.thumb || "")
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

    const final_media_type =
      typeof media_type === "string" && media_type.trim().length > 0
        ? media_type
        : final_multi_types[0] ?? null;

    const hasSingle =
      typeof final_media_url === "string" && final_media_url.trim().length > 0;
    const hasMulti = final_multi_urls.length > 0;
    const hasMeta = media_meta_arr.length > 0;

    if (!content && !hasSingle && !hasMulti && !hasMeta) {
      return json(
        { error: "content or media_url or media_urls is required" },
        400
      );
    }

    if (
      body?.type === "event" ||
      body?.event_id != null ||
      (content && content.includes("Check out my new event:"))
    ) {
      return json(
        {
          success: false,
          error: "Events must be created via /api/events, not in the posts table.",
        },
        400
      );
    }

    if (
      body?.type === "marketplace" ||
      body?.type === "product" ||
      body?.post_type === "product" ||
      body?.kind === "product" ||
      body?.product_id != null ||
      body?.meta?.kind === "product" ||
      body?.meta?.type === "product" ||
      body?.meta?.marketplace != null
    ) {
      return json(
        {
          success: false,
          error: "Products must be created via /api/products, not in the posts table.",
        },
        400
      );
    }

    if (
      typeof final_media_url === "string" &&
      final_media_url.startsWith("data:")
    ) {
      return json(
        {
          error: "Media upload not supported in base64.",
          message:
            "Upload to R2/Cloudflare Images and store a normal https URL in media_url/media_urls.",
        },
        413
      );
    }

    if (
      typeof final_media_url === "string" &&
      final_media_url.length > 0 &&
      !isHttpUrl(final_media_url)
    ) {
      return json({ error: "media_url must be a valid http/https URL" }, 400);
    }

    const background =
      typeof body.background === "string" && body.background.trim()
        ? body.background.trim()
        : null;
    if (background) {
      media_meta_arr.push({ type: "background", background });
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

    // ---- Allocate a hard, globally-unique content ID and insert ----
    let insertedWithMediaMeta = true;
    let post_id: number;

    try {
      const { id } = await withNewContentId(async (id) => {
        return await env.DB.prepare(
          `INSERT INTO posts
             (id, user_id, content, media_url, media_type,
              media_urls, media_types, media_meta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            id,
            user_id,
            content || null,
            final_media_url,
            final_media_type,
            media_urls_json,
            media_types_json,
            media_meta_json
          )
          .run();
      });
      post_id = id;
    } catch (e: any) {
      // Fallback: older schema without media_meta
      const msg = String(e?.message || "");
      const looksLikeMissingColumn =
        msg.includes("no such column") || msg.includes("media_meta");
      if (!looksLikeMissingColumn) throw e;

      insertedWithMediaMeta = false;
      const { id } = await withNewContentId(async (id) => {
        return await env.DB.prepare(
          `INSERT INTO posts
             (id, user_id, content, media_url, media_type,
              media_urls, media_types)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            id,
            user_id,
            content || null,
            final_media_url,
            final_media_type,
            media_urls_json,
            media_types_json
          )
          .run();
      });
      post_id = id;
    }

    const media = insertedWithMediaMeta
      ? normalizePostMedia({
          media_url: final_media_url,
          media_type: final_media_type,
          media_urls: media_urls_json,
          media_types: media_types_json,
          media_meta: media_meta_json,
        })
      : normalizePostMedia({
          media_url: final_media_url,
          media_type: final_media_type,
          media_urls: media_urls_json,
          media_types: media_types_json,
        });

    return json(
      {
        success: true,
        post_id,
        post: {
          id: post_id,
          user_id,
          content: content || "",
          background: background || null,
          background_style: background || null,
          media_url: final_media_url,
          media_type: final_media_type,
          media_urls: media_urls_json,
          media_types: media_types_json,
          media_meta: insertedWithMediaMeta ? media_meta_json : null,
          media,
          thumb_url: media[0]?.thumb || null,
          feed_url: media[0]?.feed || null,
          full_url: media[0]?.full || null,
          created_at: new Date().toISOString(),
        },
      },
      201
    );
  } catch (err: any) {
    return json(
      { error: "Backend crash", message: String(err?.message ?? err) },
      500
    );
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    let rawList: any[] = [];
    if (env?.DB) {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM posts ORDER BY created_at DESC"
        ).all();
        if (Array.isArray(results) && results.length > 0) {
          rawList = results;
        }
      } catch (dbErr) {
        console.warn("DB query warning:", dbErr);
      }
    }

    const normalized = rawList.map((item: any) => {
      const media = normalizePostMedia(item);
      const rawMeta = normalizeMediaMetaArray(item?.media_meta);
      const bgItem = rawMeta.find((m: any) => m?.type === "background" || m?.background);
      const background = item.background || bgItem?.background || null;

      return {
        ...item,
        background,
        background_style: background,
        media,
        media_count: media.length,
        thumb_url: media[0]?.thumb || (media[0]?.type === "image" ? item.media_url : null),
        thumbnail_url: media[0]?.thumb || (media[0]?.type === "image" ? item.media_url : null),
        feed_url: media[0]?.feed || item.media_url || null,
        full_url: media[0]?.full || item.media_url || null,
        video_url:
          item.video_url ||
          (item.media_type === "video" ? item.media_url : null) ||
          media.find((m: any) => m.type === "video")?.feed ||
          null,
      };
    });

    return json(normalized, 200);
  } catch (err: any) {
    return json(
      { error: "Backend crash", message: String(err?.message ?? err) },
      500
    );
  }
};
