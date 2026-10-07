// functions/api/group-posts.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { cors, ok, bad, server } from "./_cors";
import { withNewContentId } from "../utils/ids";

type Env = { DB: D1Database };

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/** -------------------------
 * Helpers
 * -------------------------- */
const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toNumOrNull = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeStr = (v: any) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

const cleanUrl = (v: any) => {
  const s = safeStr(v);
  if (!s) return "";
  if (s.startsWith("data:")) return "";
  if (s.length > 4000) return "";
  return s;
};

const parseJsonArray = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseMediaUrls = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map(cleanUrl).filter(Boolean);

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];

    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed.map(cleanUrl).filter(Boolean) : [];
      } catch {
        // continue
      }
    }

    if (s.includes(",") && !s.includes("://")) {
      return s.split(",").map((x) => cleanUrl(x)).filter(Boolean);
    }

    const one = cleanUrl(s);
    return one ? [one] : [];
  }

  return [];
};

const parseMediaTypes = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((x) => safeStr(x).toLowerCase()).filter(Boolean);

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];

    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed)
          ? parsed.map((x) => safeStr(x).toLowerCase()).filter(Boolean)
          : [];
      } catch {
        return [];
      }
    }
  }

  return [];
};

const parseMediaMeta = (raw: any): Array<{
  thumb?: string;
  feed?: string;
  full?: string;
  type?: string;
}> => {
  const arr = parseJsonArray(raw);

  return arr
    .map((item: any) => {
      let x = item;
      if (typeof x === "string") {
        try {
          x = JSON.parse(x);
        } catch {
          x = null;
        }
      }
      if (!x || typeof x !== "object") return null;

      const thumb = cleanUrl(x.thumb || x.thumbnail_url);
      const feed = cleanUrl(x.feed || x.feed_url);
      const full = cleanUrl(x.full || x.full_url);
      const type = safeStr(x.type).toLowerCase() || "image";

      if (!thumb && !feed && !full) return null;

      return {
        thumb: thumb || undefined,
        feed: feed || undefined,
        full: full || feed || thumb || undefined,
        type,
      };
    })
    .filter(Boolean) as Array<{
    thumb?: string;
    feed?: string;
    full?: string;
    type?: string;
  }>;
};

const normalizeImagesForResponse = (row: any): string[] => {
  const meta = parseMediaMeta(row?.media_meta);
  if (meta.length > 0) {
    return meta
      .map((m) => cleanUrl(m.feed || m.full || m.thumb))
      .filter(Boolean);
  }

  const urls = parseMediaUrls(row?.media_urls);
  if (urls.length) return urls;

  const single = cleanUrl(row?.media_url);
  return single ? [single] : [];
};

const normalizeCategory = (v: any) => {
  const key = safeStr(v).toLowerCase();
  if (key === "buy_sell" || key === "buysell" || key === "buy-sell") return "buy_sell";
  if (key === "recruitment" || key === "jobs" || key === "job") return "recruitment";
  if (key === "music_drama" || key === "musicdrama" || key === "music-drama") return "music_drama";
  return key || "general";
};

const normalizeVisibility = (v: any) => {
  const s = safeStr(v).toLowerCase();
  return s === "private" ? "private" : "public";
};

const normalizeApplicationType = (v: any) => {
  const t = safeStr(v).toLowerCase();
  return t === "email" || t === "link" ? t : "";
};

const normalizeStatus = (v: any) => {
  const s = safeStr(v).toLowerCase();
  return s === "sold" || s === "pending" || s === "available" ? s : "available";
};

const isMemberOrAdmin = async (env: any, group_id: number, user_id: number) => {
  try {
    const mem = await env.DB.prepare(
      `SELECT role, COALESCE(posting_disabled, 0) AS posting_disabled FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(group_id, user_id)
      .first();
    return mem
      ? { ok: true, role: String((mem as any).role || ""), posting_disabled: !!(mem as any).posting_disabled }
      : { ok: false, role: "", posting_disabled: false };
  } catch {
    const mem = await env.DB.prepare(
      `SELECT role FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(group_id, user_id)
      .first();
    return mem
      ? { ok: true, role: String((mem as any).role || ""), posting_disabled: false }
      : { ok: false, role: "", posting_disabled: false };
  }
};

const getGroupCategory = async (env: any, group_id: number) => {
  const g = await env.DB.prepare(`SELECT id, admin_id, category, member_posting_allowed FROM groups WHERE id=? LIMIT 1`)
    .bind(group_id)
    .first();
  if (!g) return { ok: false as const, category: "general", group: null };
  return { ok: true as const, category: normalizeCategory((g as any).category), group: g };
};

let _groupPostSchemaEnsured = false;
async function ensureGroupPostSchema(db: D1Database) {
  if (_groupPostSchemaEnsured) return;
  const groupPostCols = [
    "ALTER TABLE group_posts ADD COLUMN shared_post_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_from TEXT",
    "ALTER TABLE group_posts ADD COLUMN shared_group_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_group_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN shared_by_user_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_user_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_owner_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_owner_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN original_owner_avatar TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_post_content TEXT",
  ];
  for (const q of groupPostCols) {
    try {
      await db.prepare(q).run();
    } catch (_) {}
  }
  _groupPostSchemaEnsured = true;
}

/** ============================================================
 * CREATE: POST /api/group-posts
 * ============================================================ */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return server("DB binding missing (DB)");
    await ensureGroupPostSchema(env.DB);

    const body = await request.json().catch(() => ({} as any));

    const group_id = toInt(body.group_id, 0);
    const user_id = toInt(body.user_id, 0);

    const content = body.content == null ? null : String(body.content);
    const media_url = body.media_url == null ? null : cleanUrl(body.media_url);

    const media_urls_arr = parseMediaUrls(body.media_urls);
    const media_types_arr = parseMediaTypes(body.media_types);
    const media_meta_arr = parseMediaMeta(body.media_meta);

    const media_urls_json = media_urls_arr.length ? JSON.stringify(media_urls_arr) : null;
    const media_types_json = media_types_arr.length ? JSON.stringify(media_types_arr) : null;
    const media_meta_json = media_meta_arr.length ? JSON.stringify(media_meta_arr) : null;

    const visibility = normalizeVisibility(body.visibility);

    if (!group_id || !user_id) return bad("group_id and user_id are required");

    const hasText = !!safeStr(content ?? "");
    const hasSingle = !!media_url;
    const hasMulti = media_urls_arr.length > 0;
    const hasMeta = media_meta_arr.length > 0;

    if (!hasText && !hasSingle && !hasMulti && !hasMeta) {
      return bad("content or media_url or media_urls or media_meta required");
    }

    const catRes = await getGroupCategory(env, group_id);
    if (!catRes.ok || !catRes.group) return bad("Group not found", 404);
    const groupCategory = catRes.category;
    const groupRow = catRes.group;

    const isOwner = toInt((groupRow as any).admin_id, 0) === user_id;
    const mem = await isMemberOrAdmin(env, group_id, user_id);
    if (!mem.ok && !isOwner) return bad("User is not a member of this group", 403);

    const isGroupAdmin = isOwner || mem.role === "admin";
    if (!isGroupAdmin) {
      if (mem.posting_disabled) {
        return bad("Posting is disabled for your account in this group", 403);
      }
      if ((groupRow as any).member_posting_allowed === 0 || (groupRow as any).member_posting_allowed === false) {
        return bad("Posting is disabled for members in this group", 403);
      }
    }

    const meta = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    // recruitment
    const job_title = safeStr(meta.job_title ?? body.job_title);
    const company = safeStr(meta.company ?? body.company);
    const job_type = safeStr(meta.job_type ?? body.job_type);
    const salary = safeStr(meta.salary ?? body.salary);

    const street = safeStr(meta.street ?? body.street);
    const district = safeStr(meta.district ?? body.district);
    const region = safeStr(meta.region ?? body.region);
    const country = safeStr(meta.country ?? body.country);
    const location = safeStr(meta.location ?? body.location);

    const application_type = normalizeApplicationType(meta.application_type ?? body.application_type);
    const application_value = safeStr(meta.application_value ?? body.application_value);
    const expiry_date = safeStr(meta.expiry_date ?? body.expiry_date);

    // buy_sell
    const price = toNumOrNull(meta.price ?? body.price);
    const currency = safeStr(meta.currency ?? body.currency) || "USD";
    const condition = safeStr(meta.condition ?? body.condition);
    const status = normalizeStatus(meta.status ?? body.status);

    // music_drama
    const artist = safeStr(meta.artist ?? body.artist);
    const series = safeStr(meta.series ?? body.series);
    const episode = safeStr(meta.episode ?? body.episode);
    const duration = safeStr(meta.duration ?? body.duration);

    if (groupCategory === "recruitment") {
      if (!job_title) return bad("job_title is required for recruitment posts");
      if (application_type && !application_value) {
        return bad("application_value is required when application_type is set");
      }
    }

    if (groupCategory === "buy_sell") {
      if (price === null) return bad("price is required for buy_sell posts");
      if (!condition) return bad("condition is required for buy_sell posts");
    }

    // ---- Allocate hard, globally-unique content ID + insert ----
    const { id: post_id } = await withNewContentId(async (id) => {
      return await env.DB.prepare(
        `INSERT INTO group_posts (
          id,
          group_id, user_id, content,
          media_url, media_urls, media_types, media_meta,
          visibility,
          job_title, company, job_type, salary,
          street, district, region, country, location,
          application_type, application_value, expiry_date,
          price, currency, condition, status,
          artist, series, episode, duration
        )
        VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )`
      )
        .bind(
          id,
          group_id,
          user_id,
          content,

          media_url,
          media_urls_json,
          media_types_json,
          media_meta_json,

          visibility,

          job_title || null,
          company || null,
          job_type || null,
          salary || null,

          street || null,
          district || null,
          region || null,
          country || null,
          location || null,

          application_type || null,
          application_value || null,
          expiry_date || null,

          price,
          currency,
          condition || null,
          status,

          artist || null,
          series || null,
          episode || null,
          duration || null
        )
        .run();
    });

    return ok({
      success: true,
      post_id,
      media_urls: media_urls_arr,
      media_types: media_types_arr,
      media_meta: media_meta_arr,
      group_category: groupCategory,
    });
  } catch (e: any) {
    // ─── DIAGNOSTIC CATCH — remove after confirming it works ───
    const err: any = e || {};
    return new Response(
      JSON.stringify({
        stage: "group_posts.onRequestPost",
        message: String(err?.message || err),
        name: String(err?.name || ""),
        cause: String(err?.cause || ""),
        stack: String(err?.stack || "").split("\n").slice(0, 5).join(" | "),
      }),
      {
        status: 500,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
};

/** ============================================================
 * LIST
 * ============================================================ */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return server("DB binding missing (DB)");
    await ensureGroupPostSchema(env.DB);

    const url = new URL(request.url);
    const group_id = toInt(url.searchParams.get("group_id"), 0);
    const viewerId = toInt(url.searchParams.get("viewerId"), 0);
    const limit = url.searchParams.has("limit") ? Math.min(Math.max(toInt(url.searchParams.get("limit"), 15), 1), 100) : 15;
    const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

    const where = group_id ? `WHERE gp.group_id = ?` : ``;
    const binds: any[] = [];
    if (group_id) binds.push(group_id);
    binds.push(limit, offset);

    const myReactionSelect = viewerId
      ? `(SELECT LOWER(COALESCE(r.type,'like'))
          FROM group_post_reactions r
          WHERE r.group_post_id = gp.id AND r.user_id = ${viewerId}
          LIMIT 1
        ) AS my_reaction`
      : `NULL AS my_reaction`;

    const stmt = `
      SELECT
        gp.*,
        u.username,
        u.name,
        u.profile_image_url,
        u.is_verified,
        u.role,

        (SELECT COUNT(*) FROM group_post_reactions r WHERE r.group_post_id = gp.id) AS reactions_count,
        (SELECT COUNT(*) FROM group_post_comments c WHERE c.group_post_id = gp.id) AS comments_count,

        ${myReactionSelect},

        (
          SELECT COALESCE(u2.name, u2.username, '')
          FROM group_post_reactions r2
          JOIN users u2 ON u2.id = r2.user_id
          WHERE r2.group_post_id = gp.id
          ORDER BY r2.created_at DESC, r2.id DESC
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
              r3.user_id AS user_id,
              LOWER(COALESCE(r3.type,'like')) AS type,
              COALESCE(u3.name, u3.username, '') AS name,
              CASE
                WHEN u3.profile_image_url LIKE 'data:%' THEN NULL
                WHEN length(u3.profile_image_url) > 300 THEN NULL
                ELSE u3.profile_image_url
              END AS profile_image_url
            FROM group_post_reactions r3
            LEFT JOIN users u3 ON u3.id = r3.user_id
            WHERE r3.group_post_id = gp.id
            ORDER BY r3.created_at DESC, r3.id DESC
            LIMIT 30
          ) x
        ) AS reactions_preview,

        (
          SELECT json_group_array(
            json_object('type', t.type, 'count', t.c)
          )
          FROM (
            SELECT LOWER(COALESCE(type,'like')) AS type, COUNT(*) AS c
            FROM group_post_reactions
            WHERE group_post_id = gp.id
            GROUP BY LOWER(COALESCE(type,'like'))
            ORDER BY c DESC
          ) t
        ) AS reactions_by_type

      FROM group_posts gp
      JOIN users u ON u.id = gp.user_id
      ${where}
      ORDER BY gp.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const q = env.DB.prepare(stmt);
    const { results } = await q.bind(...binds).all();

    const posts = (results || []).map((r: any) => {
      const images = normalizeImagesForResponse(r);
      const media_meta = parseMediaMeta(r?.media_meta);
      const media_types = parseMediaTypes(r?.media_types);

      return {
        ...r,
        images,
        media_urls: images,
        media_types,
        media_meta,
      };
    });

    return ok({ success: true, posts });
  } catch (e: any) {
    return server(e?.message || "Failed to fetch group posts");
  }
};

/** ============================================================
 * EDIT
 * ============================================================ */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return server("DB binding missing (DB)");

    const url = new URL(request.url);
    const post_id = toInt(url.searchParams.get("post_id"), 0);
    if (!post_id) return bad("post_id is required");

    const body = await request.json().catch(() => ({} as any));
    const user_id = toInt(body.user_id, 0);
    if (!user_id) return bad("user_id is required");

    const post = await env.DB.prepare(
      `SELECT id, group_id, user_id FROM group_posts WHERE id=? LIMIT 1`
    )
      .bind(post_id)
      .first();
    if (!post) return bad("Post not found", 404);

    const group_id = toInt((post as any).group_id, 0);
    const author_id = toInt((post as any).user_id, 0);

    const member = await env.DB.prepare(
      `SELECT role FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(group_id, user_id)
      .first();

    const isGroupAdmin = String((member as any)?.role || "") === "admin";
    const isAuthor = author_id === user_id;
    if (!isAuthor && !isGroupAdmin) return bad("Not allowed to edit this post", 403);

    const meta = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    const content = body.content == null ? null : String(body.content).trim();
    const media_url = body.media_url == null ? null : cleanUrl(body.media_url);

    const media_urls_arr = body.media_urls == null ? null : parseMediaUrls(body.media_urls);
    const media_types_arr = body.media_types == null ? null : parseMediaTypes(body.media_types);
    const media_meta_arr = body.media_meta == null ? null : parseMediaMeta(body.media_meta);

    const media_urls_json =
      media_urls_arr && media_urls_arr.length ? JSON.stringify(media_urls_arr) : null;
    const media_types_json =
      media_types_arr && media_types_arr.length ? JSON.stringify(media_types_arr) : null;
    const media_meta_json =
      media_meta_arr && media_meta_arr.length ? JSON.stringify(media_meta_arr) : null;

    const visibility = body.visibility !== undefined ? normalizeVisibility(body.visibility) : undefined;

    const sets: string[] = [];
    const binds: any[] = [];

    const setIf = (key: string, val: any) => {
      sets.push(`${key}=?`);
      binds.push(val);
    };

    if (body.content !== undefined) setIf("content", content);
    if (body.media_url !== undefined) setIf("media_url", media_url);
    if (body.media_urls !== undefined) setIf("media_urls", media_urls_json);
    if (body.media_types !== undefined) setIf("media_types", media_types_json);
    if (body.media_meta !== undefined) setIf("media_meta", media_meta_json);
    if (visibility !== undefined) setIf("visibility", visibility);

    const fieldMap: Array<[string, any]> = [
      ["job_title", safeStr(meta.job_title ?? body.job_title) || null],
      ["company", safeStr(meta.company ?? body.company) || null],
      ["job_type", safeStr(meta.job_type ?? body.job_type) || null],
      ["salary", safeStr(meta.salary ?? body.salary) || null],

      ["street", safeStr(meta.street ?? body.street) || null],
      ["district", safeStr(meta.district ?? body.district) || null],
      ["region", safeStr(meta.region ?? body.region) || null],
      ["country", safeStr(meta.country ?? body.country) || null],
      ["location", safeStr(meta.location ?? body.location) || null],

      ["application_type", normalizeApplicationType(meta.application_type ?? body.application_type) || null],
      ["application_value", safeStr(meta.application_value ?? body.application_value) || null],
      ["expiry_date", safeStr(meta.expiry_date ?? body.expiry_date) || null],

      ["price", body.price !== undefined || meta.price !== undefined ? toNumOrNull(meta.price ?? body.price) : undefined],
      ["currency", body.currency !== undefined || meta.currency !== undefined ? (safeStr(meta.currency ?? body.currency) || "USD") : undefined],
      ["condition", body.condition !== undefined || meta.condition !== undefined ? (safeStr(meta.condition ?? body.condition) || null) : undefined],
      ["status", body.status !== undefined || meta.status !== undefined ? normalizeStatus(meta.status ?? body.status) : undefined],

      ["artist", body.artist !== undefined || meta.artist !== undefined ? (safeStr(meta.artist ?? body.artist) || null) : undefined],
      ["series", body.series !== undefined || meta.series !== undefined ? (safeStr(meta.series ?? body.series) || null) : undefined],
      ["episode", body.episode !== undefined || meta.episode !== undefined ? (safeStr(meta.episode ?? body.episode) || null) : undefined],
      ["duration", body.duration !== undefined || meta.duration !== undefined ? (safeStr(meta.duration ?? body.duration) || null) : undefined],
    ];

    for (const [col, val] of fieldMap) {
      if (val !== undefined) setIf(col, val);
    }

    if (sets.length === 0) return bad("Nothing to update");

    const willClearText = body.content !== undefined && !safeStr(content ?? "");
    const willClearSingle = body.media_url !== undefined && !media_url;
    const willClearMulti = body.media_urls !== undefined && !(media_urls_arr?.length);
    const willClearMeta = body.media_meta !== undefined && !(media_meta_arr?.length);

    if (willClearText && willClearSingle && willClearMulti && willClearMeta) {
      return bad("content or media_url or media_urls or media_meta required");
    }

    const sql = `UPDATE group_posts SET ${sets.join(", ")} WHERE id=?`;
    binds.push(post_id);

    await env.DB.prepare(sql).bind(...binds).run();

    return ok({ success: true });
  } catch (e: any) {
    return server(e?.message || "Failed to edit group post");
  }
};

/** ============================================================
 * DELETE
 * ============================================================ */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return server("DB binding missing (DB)");

    const url = new URL(request.url);
    const post_id = toInt(url.searchParams.get("post_id"), 0);
    const user_id = toInt(url.searchParams.get("user_id"), 0);

    if (!post_id) return bad("post_id is required");
    if (!user_id) return bad("user_id is required");

    const post = await env.DB.prepare(
      `SELECT id, group_id, user_id FROM group_posts WHERE id=? LIMIT 1`
    )
      .bind(post_id)
      .first();
    if (!post) return bad("Post not found", 404);

    const group_id = toInt((post as any).group_id, 0);
    const author_id = toInt((post as any).user_id, 0);

    const member = await env.DB.prepare(
      `SELECT role FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(group_id, user_id)
      .first();

    const isGroupAdmin = String((member as any)?.role || "") === "admin";
    const isAuthor = author_id === user_id;

    if (!isAuthor && !isGroupAdmin) return bad("Not allowed to delete this post", 403);

    await env.DB.prepare(`DELETE FROM group_posts WHERE id=?`).bind(post_id).run();

    return ok({ success: true });
  } catch (e: any) {
    return server(e?.message || "Failed to delete group post");
  }
};
