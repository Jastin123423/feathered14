import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST = toggle like/unlike
 * Body: { user_id, episode_id }
 * Returns: { success, action: "liked"|"unliked", likes_count, liked_by_me }
 */
export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));
    const user_id = Number(body.user_id);
    const episode_id = Number(body.episode_id);

    if (!user_id || !episode_id) {
      return Response.json(
        { error: "user_id and episode_id are required" },
        { status: 400, headers: cors }
      );
    }

    // Check if already liked
    const existing = await env.DB.prepare(
      `SELECT id FROM podcast_episode_likes WHERE user_id = ? AND episode_id = ?`
    )
      .bind(user_id, episode_id)
      .first();

    if (existing?.id) {
      // Unlike
      await env.DB.prepare(`DELETE FROM podcast_episode_likes WHERE id = ?`)
        .bind(existing.id)
        .run();

      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS likes_count FROM podcast_episode_likes WHERE episode_id = ?`
      )
        .bind(episode_id)
        .first();

      return Response.json(
        {
          success: true,
          action: "unliked",
          liked_by_me: 0,
          likes_count: Number((countRow as any)?.likes_count || 0),
        },
        { status: 200, headers: cors }
      );
    }

    // Like
    await env.DB.prepare(
      `INSERT INTO podcast_episode_likes (user_id, episode_id) VALUES (?, ?)`
    )
      .bind(user_id, episode_id)
      .run();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS likes_count FROM podcast_episode_likes WHERE episode_id = ?`
    )
      .bind(episode_id)
      .first();

    return Response.json(
      {
        success: true,
        action: "liked",
        liked_by_me: 1,
        likes_count: Number((countRow as any)?.likes_count || 0),
      },
      { status: 201, headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { error: e?.message || "Failed to toggle like" },
      { status: 500, headers: cors }
    );
  }
};

/**
 * GET = stats
 * /api/podcast-episode-likes?episode_id=123&user_id=1
 * Returns: { episode_id, likes_count, liked_by_me }
 */
export const onRequestGet: PagesFunction = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const episode_id = Number(url.searchParams.get("episode_id") || "0") || 0;
    const user_id = Number(url.searchParams.get("user_id") || "0") || 0;

    if (!episode_id) {
      return Response.json(
        { error: "episode_id is required" },
        { status: 400, headers: cors }
      );
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS likes_count FROM podcast_episode_likes WHERE episode_id = ?`
    )
      .bind(episode_id)
      .first();

    let liked_by_me = 0;
    if (user_id) {
      const me = await env.DB.prepare(
        `SELECT 1 AS ok FROM podcast_episode_likes WHERE episode_id = ? AND user_id = ?`
      )
        .bind(episode_id, user_id)
        .first();
      liked_by_me = me ? 1 : 0;
    }

    return Response.json(
      {
        episode_id,
        likes_count: Number((countRow as any)?.likes_count || 0),
        liked_by_me,
      },
      { status: 200, headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { error: e?.message || "Failed to fetch like stats" },
      { status: 500, headers: cors }
    );
  }
};
