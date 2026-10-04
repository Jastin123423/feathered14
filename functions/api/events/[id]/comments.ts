import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    const eventId = toNum((params as any)?.id, 0);
    const url = new URL(request.url);
    const viewerId =
      toNum(request.headers.get("x-user-id"), 0) ||
      toNum(url.searchParams.get("viewerId"), 0);

    if (!eventId) {
      return json({ success: false, error: "Invalid event id" }, 400);
    }

    const event = await env.DB.prepare(
      `SELECT id FROM events WHERE id = ? LIMIT 1`
    ).bind(eventId).first();

    if (!event) {
      return json({ success: false, error: "Event not found" }, 404);
    }

    const { results } = await env.DB.prepare(
      `
      SELECT
        ec.id,
        ec.event_id,
        ec.user_id,
        ec.parent_comment_id,
        ec.text,
        ec.image_url,
        ec.created_at,
        ec.updated_at,

        u.name,
        u.username,
        u.profile_image_url,
        u.role,
        u.is_verified,

        (
          SELECT COUNT(*)
          FROM event_comment_likes ecl
          WHERE ecl.comment_id = ec.id
        ) AS likes_count,

        (
          SELECT COUNT(*)
          FROM event_comments child
          WHERE child.parent_comment_id = ec.id
            AND COALESCE(child.is_deleted, 0) = 0
        ) AS replies_count,

        CASE
          WHEN ? > 0 AND EXISTS (
            SELECT 1
            FROM event_comment_likes me
            WHERE me.comment_id = ec.id
              AND me.user_id = ?
          ) THEN 1
          ELSE 0
        END AS liked_by_me

      FROM event_comments ec
      LEFT JOIN users u ON u.id = ec.user_id
      WHERE ec.event_id = ?
        AND COALESCE(ec.is_deleted, 0) = 0
      ORDER BY ec.created_at ASC, ec.id ASC
      `
    )
      .bind(viewerId, viewerId, eventId)
      .all();

    return json({
      success: true,
      comments: Array.isArray(results) ? results : [],
    });
  } catch (err: any) {
    return json(
      {
        success: false,
        error: err?.message || "Failed to fetch event comments",
      },
      500
    );
  }
};
