import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const uploader_id = Number(body.uploader_id);
    const title = String(body.title ?? "").trim();
    const description = body.description != null ? String(body.description) : null;
    const cover_image_url = body.cover_image_url != null ? String(body.cover_image_url) : null;
    const audio_url = String(body.audio_url ?? "").trim();

    const duration_seconds =
      body.duration_seconds == null ? null : Number(body.duration_seconds);
    const season_number = body.season_number == null ? null : Number(body.season_number);
    const episode_number = body.episode_number == null ? null : Number(body.episode_number);

    if (!uploader_id || !title || !audio_url) {
      return Response.json(
        { error: "uploader_id, title, and audio_url are required" },
        { status: 400, headers: cors }
      );
    }

    const result = await env.DB.prepare(
      `INSERT INTO podcast_episodes
        (uploader_id, title, description, cover_image_url, audio_url, duration_seconds, season_number, episode_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        uploader_id,
        title,
        description,
        cover_image_url,
        audio_url,
        Number.isFinite(duration_seconds as any) ? duration_seconds : null,
        Number.isFinite(season_number as any) ? season_number : null,
        Number.isFinite(episode_number as any) ? episode_number : null
      )
      .run();

    return Response.json(
      { success: true, episode_id: result.meta.last_row_id },
      { status: 201, headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { error: e?.message || "Failed to create episode" },
      { status: 500, headers: cors }
    );
  }
};

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    const viewerId = Number(url.searchParams.get("viewerId") || "0") || 0;
    const uploaderId = Number(url.searchParams.get("uploaderId") || "0") || 0;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "50") || 50));

    // Filter optional by uploader
    const where = uploaderId ? `WHERE e.uploader_id = ?` : ``;

    const q = `
      SELECT
        e.*,
        COALESCE(l.likes_count, 0) AS likes_count,
        COALESCE(r.reactions_count, 0) AS reactions_count,
        COALESCE(r.my_reaction, NULL) AS my_reaction,
        COALESCE(l.liked_by_me, 0) AS liked_by_me
      FROM podcast_episodes e
      LEFT JOIN (
        SELECT episode_id, COUNT(*) AS likes_count,
               SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS liked_by_me
        FROM podcast_episode_likes
        GROUP BY episode_id
      ) l ON l.episode_id = e.id
      LEFT JOIN (
        SELECT episode_id,
               COUNT(*) AS reactions_count,
               MAX(CASE WHEN user_id = ? THEN type ELSE NULL END) AS my_reaction
        FROM podcast_episode_reactions
        GROUP BY episode_id
      ) r ON r.episode_id = e.id
      ${where}
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;

    const stmt = env.DB.prepare(q);

    const bindArgs: any[] = [viewerId, viewerId];
    if (uploaderId) bindArgs.push(uploaderId);

    const { results } = await stmt.bind(...bindArgs).all();

    return Response.json(results || [], { status: 200, headers: cors });
  } catch (e: any) {
    return Response.json(
      { error: e?.message || "Failed to fetch episodes" },
      { status: 500, headers: cors }
    );
  }
};
