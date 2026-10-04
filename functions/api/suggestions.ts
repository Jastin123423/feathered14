// functions/api/suggestions.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  DB: D1Database;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const userId = toInt(url.searchParams.get("user_id"));
    const limit = Math.max(1, Math.min(20, toInt(url.searchParams.get("limit"), 8)));

    if (!userId) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    // users I already follow
    const followingRes = await env.DB.prepare(`
      SELECT following_id
      FROM user_follows
      WHERE follower_id = ?
    `)
      .bind(userId)
      .all();

    const followingIds = Array.isArray(followingRes.results)
      ? followingRes.results.map((r: any) => Number(r.following_id)).filter(Number.isFinite)
      : [];

    // my followers (for mutual count)
    const myFollowersRes = await env.DB.prepare(`
      SELECT follower_id
      FROM user_follows
      WHERE following_id = ?
    `)
      .bind(userId)
      .all();

    const myFollowerIds = Array.isArray(myFollowersRes.results)
      ? myFollowersRes.results.map((r: any) => Number(r.follower_id)).filter(Number.isFinite)
      : [];

    const excluded = [userId, ...followingIds];
    const placeholders = excluded.map(() => "?").join(",");

    const usersSql = `
      SELECT
        id,
        username,
        name,
        profile_image_url,
        is_verified,
        role
      FROM users
      WHERE id NOT IN (${placeholders})
      ORDER BY id DESC
      LIMIT ?
    `;

    const usersRes = await env.DB.prepare(usersSql)
      .bind(...excluded, limit * 3)
      .all();

    const candidates = Array.isArray(usersRes.results) ? usersRes.results : [];

    const suggestions = [];

    for (const u of candidates) {
      const candidateId = Number((u as any).id);
      if (!Number.isFinite(candidateId) || candidateId <= 0) continue;

      // followers of candidate
      const candidateFollowersRes = await env.DB.prepare(`
        SELECT follower_id
        FROM user_follows
        WHERE following_id = ?
      `)
        .bind(candidateId)
        .all();

      const candidateFollowerIds = Array.isArray(candidateFollowersRes.results)
        ? candidateFollowersRes.results.map((r: any) => Number(r.follower_id)).filter(Number.isFinite)
        : [];

      const myFollowerSet = new Set(myFollowerIds);
      let mutualCount = 0;

      for (const id of candidateFollowerIds) {
        if (myFollowerSet.has(id)) mutualCount++;
      }

      suggestions.push({
        id: candidateId,
        username: String((u as any).username || "user"),
        name: String((u as any).name || (u as any).username || "User"),
        profile_image_url: String((u as any).profile_image_url || ""),
        is_verified: !!(u as any).is_verified,
        role: String((u as any).role || "user"),
        mutual_count: mutualCount,
        is_following: false,
        score: mutualCount,
      });
    }

    suggestions.sort((a, b) => b.score - a.score || b.id - a.id);

    return json({
      success: true,
      suggestions: suggestions.slice(0, limit),
    });
  } catch (error: any) {
    return json(
      {
        success: false,
        error: error?.message || "Failed to fetch suggestions",
      },
      500
    );
  }
};
