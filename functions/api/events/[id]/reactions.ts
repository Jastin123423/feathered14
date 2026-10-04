import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

const normalizeType = (v: any) => String(v || "like").trim().toLowerCase();

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const eventId = toNum((params as any)?.id, 0);
    if (!eventId) return json({ success: false, error: "Invalid event id" }, 400);

    const url = new URL(request.url);
    const viewerId = toNum(
      url.searchParams.get("viewerId") || request.headers.get("x-user-id") || 0,
      0
    );

    const { results: reactions } = await env.DB.prepare(
      `SELECT er.user_id, er.type, er.created_at,
              u.username, u.name, u.profile_image_url, u.is_verified
       FROM event_reactions er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE er.event_id = ?
       ORDER BY er.created_at DESC
       LIMIT 500`
    ).bind(eventId).all();

    const { results: counts } = await env.DB.prepare(
      `SELECT type, COUNT(*) AS count
       FROM event_reactions
       WHERE event_id = ?
       GROUP BY type`
    ).bind(eventId).all();

    const countMap: Record<string, number> = {};
    let totalCount = 0;
    for (const c of (counts ?? []) as any[]) {
      const type = normalizeType(c.type);
      const count = toNum(c.count, 0);
      countMap[type] = count;
      totalCount += count;
    }

    let my_reaction: string | null = null;
    if (viewerId > 0) {
      const row = await env.DB
        .prepare(`SELECT type FROM event_reactions WHERE event_id = ? AND user_id = ? LIMIT 1`)
        .bind(eventId, viewerId)
        .first<any>();
      if (row) my_reaction = normalizeType(row.type);
    }

    const commentsRow = await env.DB
      .prepare(
        `SELECT COUNT(*) AS c FROM event_comments
         WHERE event_id = ? AND COALESCE(is_deleted,0) = 0`
      )
      .bind(eventId)
      .first<{ c: number }>();

    const sharesRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM event_shares WHERE event_id = ?`)
      .bind(eventId)
      .first<{ c: number }>();

    return json({
      success: true,
      reactions: (reactions ?? []).map((r: any) => ({
        user_id: r.user_id,
        type: normalizeType(r.type),
        created_at: r.created_at,
        user: {
          id: r.user_id,
          username: r.username,
          name: r.name,
          profile_image_url: r.profile_image_url,
          is_verified: r.is_verified || false,
        },
      })),
      reactions_count: totalCount,
      counts: countMap,
      my_reaction,
      comments_count: toNum(commentsRow?.c, 0),
      shares_count: toNum(sharesRow?.c, 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to fetch event reactions" },
      500
    );
  }
};
