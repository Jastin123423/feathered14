// api/post/[id].ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,PUT,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
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

const toStr = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

const TRANSFORM_BASE = "https://featheredsocial.site/cdn-cgi/media";

/* =========================================================
   Detect media type from URL — aware of /cdn-cgi/media/ URLs
   ========================================================= */
const guessTypeFromUrl = (url: string) => {
  const u = String(url || "").toLowerCase();

  if (u.includes("/cdn-cgi/media/")) {
    if (u.includes("mode=video")) return "video";
    if (u.includes("mode=audio")) return "audio";
    if (u.includes("mode=frame") || u.includes("mode=spritesheet")) return "image";
    if (u.includes("mode=image")) return "image";
  }

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

/* =========================================================
   Build structured video variants (thumb, feed, full)
   ========================================================= */
function buildVideoVariants(originalUrl: string, thumbUrl: string | null = null) {
  return {
    thumb: thumbUrl,
    feed: originalUrl,
    full: originalUrl,
    type: "video",
  };
}

function buildImageVariants(imageUrl: string) {
  return {
    thumb: imageUrl,
    feed: imageUrl,
    full: imageUrl,
    url: imageUrl,
    type: "image",
  };
}

/* =========================================================
   Background resolution helpers
   ---------------------------------------------------------
   posts table background storage precedence:
        background_image_url  (highest)
              ↓
        colours               (animated or gradient)
              ↓
        background_color      (legacy solid hex)
              ↓
        default brand gradient (fallback)
   ========================================================= */
type PostBackgroundFields = {
  colours: string | null;
  background_color: string | null;
  background_image_url: string | null;
};

function extractBackgroundFields(post: any): PostBackgroundFields {
  if (!post) {
    return { colours: null, background_color: null, background_image_url: null };
  }
  const colours = toStr(post.colours, "").trim() || null;
  const background_color = toStr(post.background_color, "").trim() || null;
  const background_image_url = toStr(post.background_image_url, "").trim() || null;
  return { colours, background_color, background_image_url };
}

function resolveColoursAlias(fields: PostBackgroundFields): string | null {
  return fields.colours ?? fields.background_color ?? null;
}

function decoratePostWithBackgrounds<T extends Record<string, any> | null>(post: T): T {
  if (!post) return post;

  const bg = extractBackgroundFields(post);
  const alias = resolveColoursAlias(bg);

  return {
    ...post,
    colours: bg.colours,
    background_color: bg.background_color,
    background_image_url: bg.background_image_url,
    background: alias,
    background_style: alias,
  } as T;
}

/* =========================================================
   Analytics helpers
   ---------------------------------------------------------
   Country source precedence:  users.nationality → cf-ipcountry → null ("XX")
   Gender source:              users.gender     → "unknown"
   Both are snapshotted at view time into post_views.
   ========================================================= */

// Resolve viewer country from Cloudflare header (fallback only).
const getCountryFromRequest = (request: Request): string | null => {
  const cc = (request.headers.get("cf-ipcountry") || "").toUpperCase().trim();
  if (!cc || cc === "XX" || cc === "T1" || cc.length !== 2) return null;
  return cc;
};

// Single DB hit for both gender and nationality.
const getViewerProfile = async (
  env: Env,
  viewerId: number
): Promise<{ gender: string | null; nationality: string | null }> => {
  if (!viewerId) return { gender: null, nationality: null };
  try {
    const row = await env.DB
      .prepare(`SELECT gender, nationality FROM users WHERE id = ? LIMIT 1`)
      .bind(viewerId)
      .first<{ gender: string | null; nationality: string | null }>();

    const g = (row?.gender || "").toLowerCase().trim();
    const gender = g === "male" || g === "female" || g === "other" ? g : null;

    const nat = (row?.nationality || "").toUpperCase().trim();
    const nationality = /^[A-Z]{2}$/.test(nat) ? nat : null;

    return { gender, nationality };
  } catch {
    return { gender: null, nationality: null };
  }
};

// Record a view. Never throws, never blocks the response if waitUntil is provided.
const recordView = async (
  env: Env,
  request: Request,
  postId: number,
  viewerId: number,
  ctx?: { waitUntil: (p: Promise<any>) => void }
): Promise<void> => {
  const doWork = (async () => {
    try {
      const profile = await getViewerProfile(env, viewerId);

      const ipCountry = getCountryFromRequest(request);
      const country_code = profile.nationality || ipCountry || null;
      const country_src = profile.nationality
        ? "profile"
        : ipCountry
          ? "ip"
          : null;
      const gender = profile.gender || "unknown";

      await env.DB.batch([
        env.DB
          .prepare(
            `INSERT INTO post_views
               (post_id, viewer_id, country_code, country_src, gender)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(postId, viewerId || null, country_code, country_src, gender),
        env.DB
          .prepare(`UPDATE posts SET views = COALESCE(views,0) + 1 WHERE id = ?`)
          .bind(postId),
      ]);
    } catch {
      /* swallow — analytics must never break reads */
    }
  })();

  if (ctx) ctx.waitUntil(doWork);
  else await doWork;
};

// Compute analytics from raw events for a single post.
const computeAnalytics = async (env: Env, postId: number) => {
  const rows = await env.DB
    .prepare(
      `SELECT
         COALESCE(country_code, 'XX') AS cc,
         COALESCE(gender, 'unknown')  AS g,
         COUNT(*)                     AS c
       FROM post_views
       WHERE post_id = ?
       GROUP BY cc, g`
    )
    .bind(postId)
    .all<{ cc: string; g: string; c: number }>();

  const countryMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  let total = 0;

  for (const r of rows.results || []) {
    const c = Number(r.c) || 0;
    total += c;
    countryMap.set(r.cc, (countryMap.get(r.cc) || 0) + c);
    genderMap.set(r.g, (genderMap.get(r.g) || 0) + c);
  }

  const pct = (n: number) => (total ? Math.round((n / total) * 10000) / 100 : 0);

  const countries = [...countryMap.entries()]
    .map(([code, views]) => ({ code, views, pct: pct(views) }))
    .sort((a, b) => b.views - a.views);

  const genders = [...genderMap.entries()]
    .map(([gender, views]) => ({ gender, views, pct: pct(views) }))
    .sort((a, b) => b.views - a.views);

  const top = countries[0] || null;

  const male = genderMap.get("male") || 0;
  const female = genderMap.get("female") || 0;
  const other = genderMap.get("other") || 0;
  const unknown = genderMap.get("unknown") || 0;

  return {
    total_views: total,
    top_country: top?.code ?? null,
    top_country_pct: top?.pct ?? 0,
    male_pct: pct(male),
    female_pct: pct(female),
    other_pct: pct(other),
    unknown_pct: pct(unknown),
    countries,
    genders,
  };
};

// Persist computed analytics into post_analytics (upsert).
const persistAnalytics = async (env: Env, postId: number) => {
  const a = await computeAnalytics(env, postId);
  await env.DB
    .prepare(
      `INSERT INTO post_analytics
         (post_id, total_views, top_country, top_country_pct,
          male_pct, female_pct, other_pct, unknown_pct,
          country_json, gender_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(post_id) DO UPDATE SET
         total_views     = excluded.total_views,
         top_country     = excluded.top_country,
         top_country_pct = excluded.top_country_pct,
         male_pct        = excluded.male_pct,
         female_pct      = excluded.female_pct,
         other_pct       = excluded.other_pct,
         unknown_pct     = excluded.unknown_pct,
         country_json    = excluded.country_json,
         gender_json     = excluded.gender_json,
         updated_at      = CURRENT_TIMESTAMP`
    )
    .bind(
      postId,
      a.total_views,
      a.top_country,
      a.top_country_pct,
      a.male_pct,
      a.female_pct,
      a.other_pct,
      a.unknown_pct,
      JSON.stringify(a.countries),
      JSON.stringify(a.genders)
    )
    .run();
  return a;
};

// Safe parse of a JSON array column.
function safeJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* =========================================================
   GET — fetch single post
     - ?view=1 | ?track=1   → records a view (non-blocking)
     - ?analytics=1         → returns owner-only analytics
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
  waitUntil,
}) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum((params as any)?.id, 0);
    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);

    const url = new URL(request.url);
    const wantsAnalytics = url.searchParams.get("analytics") === "1";
    const shouldTrack =
      url.searchParams.get("view") === "1" || url.searchParams.get("track") === "1";

    const viewerId =
      toNum(request.headers.get("x-user-id"), 0) ||
      toNum(url.searchParams.get("user_id"), 0);

    /* -------------------- Analytics branch -------------------- */
    if (wantsAnalytics) {
      const owner = await env.DB
        .prepare(
          `SELECT user_id FROM posts
           WHERE id = ? AND COALESCE(is_deleted,0) = 0
           LIMIT 1`
        )
        .bind(postId)
        .first<{ user_id: number }>();

      if (!owner) return json({ success: false, error: "Post not found" }, 404);
      if (toNum(owner.user_id) !== viewerId) {
        return json({ success: false, error: "Not allowed" }, 403);
      }

      const cached = await env.DB
        .prepare(`SELECT * FROM post_analytics WHERE post_id = ? LIMIT 1`)
        .bind(postId)
        .first<any>();

      const live = await env.DB
        .prepare(`SELECT COALESCE(views,0) AS v FROM posts WHERE id = ? LIMIT 1`)
        .bind(postId)
        .first<{ v: number }>();

      const liveViews = toNum(live?.v, 0);
      const isStale = !cached || toNum(cached.total_views, 0) !== liveViews;

      // Recompute on demand if the rollup is out of date.
      const fresh = isStale ? await persistAnalytics(env, postId) : null;

      const data =
        fresh || {
          total_views: toNum(cached?.total_views, 0),
          top_country: cached?.top_country ?? null,
          top_country_pct: toNum(cached?.top_country_pct, 0),
          male_pct: toNum(cached?.male_pct, 0),
          female_pct: toNum(cached?.female_pct, 0),
          other_pct: toNum(cached?.other_pct, 0),
          unknown_pct: toNum(cached?.unknown_pct, 0),
          countries: safeJsonArray(cached?.country_json),
          genders: safeJsonArray(cached?.gender_json),
        };

      // Include author's own declared country/gender for UI context.
      const author = await env.DB
        .prepare(`SELECT gender, nationality FROM users WHERE id = ? LIMIT 1`)
        .bind(toNum(owner.user_id, 0))
        .first<{ gender: string | null; nationality: string | null }>();

      return json({
        success: true,
        post_id: postId,
        analytics: {
          ...data,
          author: {
            gender: (author?.gender || "").toLowerCase() || null,
            country: (author?.nationality || "").toUpperCase() || null,
          },
        },
      });
    }

    /* -------------------- Normal post fetch -------------------- */
    const post = await env.DB
      .prepare(`
        SELECT p.*,
               u.name as author_name,
               u.username as author_username,
               u.avatar_url as author_avatar,
               u.verified as author_verified
        FROM posts p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
        LIMIT 1
      `)
      .bind(postId)
      .first<any>();

    if (!post) return json({ success: false, error: "Post not found" }, 404);

    // Record a view when explicitly asked to. Skip the author viewing own post.
    if (shouldTrack) {
      const authorId = toNum(post.user_id, 0);
      if (viewerId !== authorId) {
        await recordView(env, request, postId, viewerId, { waitUntil });
      }
    }

    // Load shared post if present
    let sharedPost: any = null;
    const sharedId = toNum(post.shared_post_id, 0);
    if (sharedId > 0) {
      sharedPost = await env.DB
        .prepare(`
          SELECT p.*,
                 u.name as author_name,
                 u.username as author_username,
                 u.avatar_url as author_avatar,
                 u.verified as author_verified
          FROM posts p
          LEFT JOIN users u ON u.id = p.user_id
          WHERE p.id = ?
          LIMIT 1
        `)
        .bind(sharedId)
        .first<any>();
    }

    const decoratedPost = decoratePostWithBackgrounds(post);
    const decoratedShared = sharedPost
      ? decoratePostWithBackgrounds(sharedPost)
      : null;

    return json({
      success: true,
      post: {
        ...decoratedPost,
        shared_post: decoratedShared,
      },
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to fetch post" }, 500);
  }
};

/* =========================================================
   POST — lightweight view beacon
   (for IntersectionObserver / impression tracking)
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  params,
  waitUntil,
}) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum((params as any)?.id, 0);
    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);

    const body: any = await request.json().catch(() => ({}));
    const viewerId =
      toNum(request.headers.get("x-user-id"), 0) || toNum(body?.user_id, 0);

    const exists = await env.DB
      .prepare(
        `SELECT user_id FROM posts
         WHERE id = ? AND COALESCE(is_deleted,0) = 0
         LIMIT 1`
      )
      .bind(postId)
      .first<{ user_id: number }>();

    if (!exists) return json({ success: false, error: "Post not found" }, 404);

    // Don't count the author's own view.
    if (viewerId !== toNum(exists.user_id, 0)) {
      await recordView(env, request, postId, viewerId, { waitUntil });
    }

    return json({ success: true, recorded: true, post_id: postId });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to record view" }, 500);
  }
};

/* =========================================================
   DELETE — soft delete (author only) + purge analytics rows
   ========================================================= */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum((params as any)?.id, 0);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);

    const url = new URL(request.url);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);
    if (!userId) return json({ success: false, error: "Login required" }, 401);

    const post = await env.DB
      .prepare(
        `SELECT id, user_id FROM posts
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(postId)
      .first<any>();

    if (!post) return json({ success: false, error: "Post not found" }, 404);
    if (toNum(post.user_id) !== userId) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    // Soft-delete the post AND purge its analytics in one batch.
    // If you'd rather keep analytics for admin dashboards,
    // remove the two DELETE lines below.
    await env.DB.batch([
      env.DB
        .prepare(
          `UPDATE posts
           SET is_deleted = 1,
               deleted_by = ?,
               deleted_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(userId, postId),
      env.DB.prepare(`DELETE FROM post_views     WHERE post_id = ?`).bind(postId),
      env.DB.prepare(`DELETE FROM post_analytics WHERE post_id = ?`).bind(postId),
    ]);

    return json({
      success: true,
      post_id: postId,
      deleted: true,
      deleted_by: userId,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to delete post" }, 500);
  }
};

/* =========================================================
   PUT / PATCH — edit post (author only)
   ========================================================= */
const handleEdit = async (request: Request, env: Env, params: any): Promise<Response> => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum(params?.id, 0);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);

    const body: any = await request.json().catch(() => ({}));
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);
    if (!userId) return json({ success: false, error: "Login required" }, 401);

    const post = await env.DB
      .prepare(
        `SELECT id, user_id, media_meta FROM posts
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(postId)
      .first<any>();

    if (!post) return json({ success: false, error: "Post not found" }, 404);
    if (toNum(post.user_id) !== userId) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    const updates: string[] = [];
    const bindings: any[] = [];

    // -------- Text content (accept "content" or "text") --------
    if (body.content !== undefined || body.text !== undefined) {
      const content = toStr(body.content ?? body.text, "").trim();
      if (content.length > 5000) {
        return json({ success: false, error: "Content is too long" }, 400);
      }
      updates.push("content = ?");
      bindings.push(content);
    }

    // -------- Media handling with full synchronization --------
    const rawMediaUrls = body.media_urls !== undefined ? body.media_urls : body.images;
    if (rawMediaUrls !== undefined) {
      let cleanUrls: string[] = [];
      if (Array.isArray(rawMediaUrls)) {
        cleanUrls = rawMediaUrls.map((u) => String(u || "").trim()).filter(Boolean);
      } else if (typeof rawMediaUrls === "string") {
        try {
          const parsed = JSON.parse(rawMediaUrls);
          if (Array.isArray(parsed)) {
            cleanUrls = parsed.map((u) => String(u || "").trim()).filter(Boolean);
          } else if (rawMediaUrls.trim()) {
            cleanUrls = [rawMediaUrls.trim()];
          }
        } catch {
          if (rawMediaUrls.trim()) cleanUrls = [rawMediaUrls.trim()];
        }
      }
      cleanUrls = cleanUrls.filter(
        (u) => u !== "[object Object]" && u !== "null" && u !== "undefined"
      );

      updates.push("media_urls = ?");
      bindings.push(JSON.stringify(cleanUrls));

      let mediaTypes: string[] = [];
      if (Array.isArray(body.media_types)) {
        mediaTypes = body.media_types.map(String);
      } else {
        mediaTypes = cleanUrls.map(guessTypeFromUrl);
      }
      updates.push("media_types = ?");
      bindings.push(JSON.stringify(mediaTypes));

      if (body.media_meta !== undefined) {
        updates.push("media_meta = ?");
        bindings.push(
          typeof body.media_meta === "string"
            ? body.media_meta
            : JSON.stringify(body.media_meta ?? [])
        );
      } else {
        let existingMeta: any[] = [];
        if (post.media_meta) {
          try {
            const parsed = JSON.parse(post.media_meta);
            if (Array.isArray(parsed)) existingMeta = parsed;
          } catch {
            existingMeta = [];
          }
        }

        const synthMeta = cleanUrls.map((url, i) => {
          const t = mediaTypes[i] || guessTypeFromUrl(url);
          if (t === "video") {
            const existing = existingMeta.find(
              (m: any) =>
                m &&
                (m.full === url ||
                  m.feed === url ||
                  m.feed_720 === url ||
                  m.play === url)
            );
            const thumb = existing?.thumb ?? null;
            return buildVideoVariants(url, thumb);
          }
          return buildImageVariants(url);
        });

        updates.push("media_meta = ?");
        bindings.push(JSON.stringify(synthMeta));
      }

      if (body.media_url !== undefined) {
        updates.push("media_url = ?");
        bindings.push(toStr(body.media_url, "").trim() || null);
      } else {
        updates.push("media_url = ?");
        bindings.push(cleanUrls[0] || null);
      }

      if (body.media_type !== undefined) {
        updates.push("media_type = ?");
        bindings.push(toStr(body.media_type, "").trim() || null);
      } else {
        updates.push("media_type = ?");
        bindings.push(
          cleanUrls[0] ? mediaTypes[0] || guessTypeFromUrl(cleanUrls[0]) : null
        );
      }
    } else {
      if (body.media_url !== undefined) {
        updates.push("media_url = ?");
        bindings.push(toStr(body.media_url, "").trim() || null);
      }
      if (body.media_type !== undefined) {
        updates.push("media_type = ?");
        bindings.push(toStr(body.media_type, "").trim() || null);
      }
      if (body.media_meta !== undefined) {
        updates.push("media_meta = ?");
        bindings.push(
          typeof body.media_meta === "string"
            ? body.media_meta
            : JSON.stringify(body.media_meta ?? {})
        );
      }
    }

    // -------- Visibility --------
    if (body.visibility !== undefined) {
      const visibility = toStr(body.visibility, "").trim();
      const allowed = new Set(["Public", "Private", "Friends", "Group"]);
      if (!allowed.has(visibility)) {
        return json({ success: false, error: "Invalid visibility" }, 400);
      }
      updates.push("visibility = ?");
      bindings.push(visibility);
    }

    // -------- Brand --------
    if (body.brand_id !== undefined) {
      updates.push("brand_id = ?");
      bindings.push(body.brand_id === null ? null : toNum(body.brand_id, 0));
    }

    // -------- Backgrounds --------
    if (
      body.colours !== undefined ||
      body.background !== undefined ||
      body.background_style !== undefined
    ) {
      const col = toStr(
        body.colours ?? body.background ?? body.background_style,
        ""
      ).trim();
      updates.push("colours = ?");
      bindings.push(col || null);
    }

    if (body.background_color !== undefined) {
      const bgColor = toStr(body.background_color, "").trim();
      updates.push("background_color = ?");
      bindings.push(bgColor || null);
    }

    if (body.background_image_url !== undefined) {
      const bgImage = toStr(body.background_image_url, "").trim();
      updates.push("background_image_url = ?");
      bindings.push(bgImage || null);
    }

    if (!updates.length) {
      return json({ success: false, error: "Nothing to update" }, 400);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    const sql = `UPDATE posts SET ${updates.join(", ")} WHERE id = ?`;
    bindings.push(postId);

    await env.DB.prepare(sql).bind(...bindings).run();

    const updated = await env.DB
      .prepare(
        `SELECT
           id, user_id, content, media_url, media_type, media_urls, media_types,
           media_meta, colours, background_color, background_image_url,
           visibility, brand_id, is_boosted, views, shares,
           created_at, updated_at
         FROM posts
         WHERE id = ?
         LIMIT 1`
      )
      .bind(postId)
      .first<any>();

    return json({
      success: true,
      post: updated ? decoratePostWithBackgrounds(updated) : null,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to edit post" }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) =>
  handleEdit(request, env, params);

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) =>
  handleEdit(request, env, params);
