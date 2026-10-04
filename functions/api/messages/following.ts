import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  DB: D1Database;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    const userId =
      Number(request.headers.get("x-user-id") || 0) ||
      Number(url.searchParams.get("user_id") || 0);

    if (!userId) {
      return json({ error: "Unauthorized" }, 401);
    }

    const limitRaw = Number(url.searchParams.get("limit") || 30);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(100, limitRaw))
      : 30;

    let results: any[] = [];

    try {
      const withPresence = await env.DB.prepare(
        `
        SELECT
          u.id,
          u.name,
          u.username,
          u.profile_image_url,
          CASE
            WHEN p.user_id IS NOT NULL THEN 1
            ELSE 0
          END AS is_online,
          p.last_seen,
          f.created_at
        FROM user_follows f
        INNER JOIN users u
          ON u.id = f.following_id
        LEFT JOIN presence p
          ON p.user_id = u.id
        WHERE f.follower_id = ?
        ORDER BY f.created_at DESC
        LIMIT ?
        `
      )
        .bind(userId, limit)
        .all();

      results = Array.isArray(withPresence.results) ? withPresence.results : [];
    } catch (presenceError) {
      const withoutPresence = await env.DB.prepare(
        `
        SELECT
          u.id,
          u.name,
          u.username,
          u.profile_image_url,
          0 AS is_online,
          NULL AS last_seen,
          f.created_at
        FROM user_follows f
        INNER JOIN users u
          ON u.id = f.following_id
        WHERE f.follower_id = ?
        ORDER BY f.created_at DESC
        LIMIT ?
        `
      )
        .bind(userId, limit)
        .all();

      results = Array.isArray(withoutPresence.results) ? withoutPresence.results : [];
    }

    const cleaned = results.map((row: any) => ({
      id: Number(row?.id || 0),
      name:
        String(row?.name || "").trim() ||
        String(row?.username || "").trim() ||
        "User",
      profile_image_url: row?.profile_image_url ? String(row.profile_image_url) : null,
      is_online: Number(row?.is_online || 0),
      last_seen: row?.last_seen ? String(row.last_seen) : null,
      followed_at: row?.created_at ? String(row.created_at) : null,
    }));

    return json(cleaned, 200);
  } catch (error: any) {
    console.error("GET /api/messages/following error:", error);
    return json(
      {
        error: error?.message || "Failed to fetch following users",
      },
      500
    );
  }
};
