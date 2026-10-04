import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,DELETE,PUT,PATCH,OPTIONS",
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

  // Cloudflare Media Transformation URLs
  if (u.includes("/cdn-cgi/media/")) {
    if (u.includes("mode=video")) return "video";
    if (u.includes("mode=audio")) return "audio";
    if (u.includes("mode=frame") || u.includes("mode=spritesheet")) return "image";
    // default for /cdn-cgi/media/ without explicit mode is image (auto)
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
   preserving original video URL and thumbnail image URL
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

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* =========================================================
   GET — fetch single post with author, reactions, and shared_post
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum((params as any)?.id, 0);
    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);

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

    return json({
      success: true,
      post: {
        ...post,
        shared_post: sharedPost,
      },
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to fetch post" }, 500);
  }
};

/* =========================================================
   DELETE — soft delete (author only)
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

    await env.DB
      .prepare(
        `UPDATE posts
         SET is_deleted = 1,
             deleted_by = ?,
             deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(userId, postId)
      .run();

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
   Accepts any subset of: content, media_url, media_type,
   media_urls, media_types, media_meta, visibility, brand_id
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

    // -------- Build dynamic UPDATE from provided fields --------
    const updates: string[] = [];
    const bindings: any[] = [];

    // Text content (accept "content" or "text")
    if (body.content !== undefined || body.text !== undefined) {
      const content = toStr(body.content ?? body.text, "").trim();
      if (content.length > 5000) {
        return json({ success: false, error: "Content is too long" }, 400);
      }
      updates.push("content = ?");
      bindings.push(content);
    }

    // Media handling with full synchronization
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

      // Synchronize media_types
      let mediaTypes: string[] = [];
      if (Array.isArray(body.media_types)) {
        mediaTypes = body.media_types.map(String);
      } else {
        mediaTypes = cleanUrls.map(guessTypeFromUrl);
      }
      updates.push("media_types = ?");
      bindings.push(JSON.stringify(mediaTypes));

      // Synchronize media_meta
      if (body.media_meta !== undefined) {
        updates.push("media_meta = ?");
        bindings.push(
          typeof body.media_meta === "string"
            ? body.media_meta
            : JSON.stringify(body.media_meta ?? [])
        );
      } else {
        // Try to preserve existing rich video metadata when possible
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
            // Reuse existing thumb for this URL if available
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

          // Image fallback
          return buildImageVariants(url);
        });

        updates.push("media_meta = ?");
        bindings.push(JSON.stringify(synthMeta));
      }

      // Synchronize media_url and media_type
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
      // Primary media single fields when media_urls is omitted
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

    // Visibility
    if (body.visibility !== undefined) {
      const visibility = toStr(body.visibility, "").trim();
      const allowed = new Set(["Public", "Private", "Friends", "Group"]);
      if (!allowed.has(visibility)) {
        return json({ success: false, error: "Invalid visibility" }, 400);
      }
      updates.push("visibility = ?");
      bindings.push(visibility);
    }

    // Brand
    if (body.brand_id !== undefined) {
      updates.push("brand_id = ?");
      bindings.push(body.brand_id === null ? null : toNum(body.brand_id, 0));
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
           media_meta, visibility, brand_id, is_boosted, views, shares,
           created_at, updated_at
         FROM posts
         WHERE id = ?
         LIMIT 1`
      )
      .bind(postId)
      .first();

    return json({ success: true, post: updated ?? null });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to edit post" }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) =>
  handleEdit(request, env, params);

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) =>
  handleEdit(request, env, params);
