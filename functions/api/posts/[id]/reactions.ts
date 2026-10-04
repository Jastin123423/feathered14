import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  Response.json(data, { status, headers: cors });

const toInt = (v: any, fallback = 0) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normType = (v: any) => String(v ?? "like").trim().toLowerCase() || "like";

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  try {
    const post_id = toInt((params as any)?.id);
    if (!post_id) return json({ success: false, error: "Invalid post id" }, 400);

    const url = new URL(request.url);

    // ✅ Fixed limit/offset parsing
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");
    const limit = limitParam
      ? Math.min(Math.max(Number(limitParam), 1), 500)
      : 100;
    const offset = offsetParam ? Math.max(Number(offsetParam), 0) : 0;

    const viewerId = toInt(
      request.headers.get("x-user-id") || url.searchParams.get("viewerId"),
      0
    );

    // Reactions with user info
    const list = await env.DB.prepare(
      `SELECT
         pr.user_id,
         pr.type,
         pr.created_at,
         u.id AS id,
         u.name AS name,
         u.username AS username,
         u.profile_image_url AS profile_image_url
       FROM post_reactions pr
       LEFT JOIN users u ON u.id = pr.user_id
       WHERE pr.post_id = ?
       ORDER BY pr.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(post_id, limit, offset)
      .all();

    const reactions = (list?.results || []).map((r: any) => ({
      user_id: toInt(r.user_id),
      type: normType(r.type),
      created_at: r.created_at,
      user: r.id
        ? {
            id: toInt(r.id),
            name: String(r.name ?? ""),
            username: String(r.username ?? ""),
            profile_image_url: r.profile_image_url ? String(r.profile_image_url) : null,
          }
        : null,
    }));

    // Total count
    const countRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM post_reactions WHERE post_id = ?`)
      .bind(post_id)
      .first<{ c: number }>();

    const reactions_count = toInt(countRow?.c);

    // ✅ Per-type counts
    const { results: countRows } = await env.DB
      .prepare(
        `SELECT type, COUNT(*) AS c
         FROM post_reactions
         WHERE post_id = ?
         GROUP BY type`
      )
      .bind(post_id)
      .all();

    const counts: Record<string, number> = {};
    for (const r of (countRows ?? []) as any[]) {
      counts[normType(r.type)] = toInt(r.c);
    }

    // ✅ Viewer's own reaction
    let my_reaction: string | null = null;
    if (viewerId > 0) {
      const mine = await env.DB
        .prepare(`SELECT type FROM post_reactions WHERE post_id = ? AND user_id = ? LIMIT 1`)
        .bind(post_id, viewerId)
        .first<any>();
      if (mine) my_reaction = normType(mine.type);
    }

    return json({
      success: true,
      post_id,
      reactions_count,
      counts,
      my_reaction,
      reactions,
      limit,
      offset,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Failed to load reactions" }, 500);
  }
};
