import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

const toText = (v: any, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* =========================================================
   GET /api/groups/:id/events
   Returns group events with RSVP counts + viewer's status
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const groupId = toNum((params as any)?.id, 0);
    if (!groupId) return json({ success: false, error: "Invalid group id" }, 400);

    const url = new URL(request.url);
    const viewerId = toNum(
      request.headers.get("x-user-id") || url.searchParams.get("viewerId") || 0,
      0
    );

    const { results } = await env.DB.prepare(
      `SELECT
         e.*,
         (SELECT COUNT(*) FROM group_event_attendees WHERE group_event_id = e.id) AS attending_count,
         (SELECT COUNT(*) FROM group_event_interested WHERE group_event_id = e.id) AS interested_count,
         (SELECT 1 FROM group_event_attendees WHERE group_event_id = e.id AND user_id = ? LIMIT 1) AS _going,
         (SELECT 1 FROM group_event_interested WHERE group_event_id = e.id AND user_id = ? LIMIT 1) AS _interested
       FROM group_events e
       WHERE e.group_id = ?
         AND COALESCE(e.is_deleted, 0) = 0
         AND COALESCE(e.is_cancelled, 0) = 0
       ORDER BY e.event_date ASC, e.id DESC
       LIMIT 200`
    )
      .bind(viewerId, viewerId, groupId)
      .all();

    const events = (results || []).map((row: any) => {
      const { _going, _interested, ...rest } = row;
      return {
        ...rest,
        my_status: _going ? "going" : _interested ? "interested" : "",
      };
    });

    return json({ success: true, events });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to load group events" },
      500
    );
  }
};

/* =========================================================
   POST /api/groups/:id/events
   Creates a group event (member-only)
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const groupId = toNum((params as any)?.id, 0);
    if (!groupId) return json({ success: false, error: "Invalid group id" }, 400);

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.creator_id ?? body.user_id ?? 0, 0);
    const creator_id = headerUserId || bodyUserId || 0;

    const title = toText(body.title);
    const description = toText(body.description) || null;
    const event_date = toText(body.event_date ?? body.date);
    const end_date = toText(body.end_date) || null;
    const location = toText(body.location) || null;
    const cover_url = toText(body.cover_url ?? body.image) || null;
    const visibility = toText(body.visibility, "group").toLowerCase() || "group";

    if (!creator_id) return json({ success: false, error: "creator_id missing" }, 400);
    if (!title) return json({ success: false, error: "title missing" }, 400);
    if (!event_date) return json({ success: false, error: "event_date missing" }, 400);
    if (isNaN(Date.parse(event_date))) {
      return json({ success: false, error: "Invalid event_date" }, 400);
    }
    if (!["group", "public"].includes(visibility)) {
      return json({ success: false, error: "Invalid visibility" }, 400);
    }

    // Group exists?
    const group = await env.DB
      .prepare(`SELECT id FROM groups WHERE id = ? LIMIT 1`)
      .bind(groupId)
      .first();

    if (!group) return json({ success: false, error: "Group not found" }, 404);

    // Must be a member
    const member = await env.DB
      .prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`)
      .bind(groupId, creator_id)
      .first();

    if (!member) {
      return json({ success: false, error: "Not a member of this group" }, 403);
    }

    const ins = await env.DB.prepare(
      `INSERT INTO group_events
         (group_id, creator_id, title, description, event_date, end_date, location, cover_url, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        groupId,
        creator_id,
        title,
        description,
        event_date,
        end_date,
        location,
        cover_url,
        visibility
      )
      .run();

    const id = toNum(ins.meta?.last_row_id, 0);

    const event = await env.DB
      .prepare(`SELECT * FROM group_events WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();

    return json(
      {
        success: true,
        event: {
          ...(event ?? {}),
          attending_count: 0,
          interested_count: 0,
          my_status: "",
        },
      },
      201
    );
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to create group event" },
      500
    );
  }
};
