import type { PagesFunction } from "@cloudflare/workers-types";
import { withNewContentId } from "../utils/ids";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const str = (v: any) => String(v ?? "").trim();
const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getGroupIdFromPath = (path: string): number | null => {
  const m = path.match(/^\/api\/groups\/(\d+)\/events$/);
  return m ? parseInt(m[1], 10) : null;
};

const getEventIdFromPath = (path: string): number | null => {
  const m = path.match(/^\/api\/events\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // GET /api/events
  if (method === "GET" && path === "/api/events") return handleGetEvents(env, null);

  // GET /api/groups/:id/events
  if (method === "GET" && path.match(/^\/api\/groups\/\d+\/events$/)) {
    const groupId = getGroupIdFromPath(path);
    if (!groupId) return json({ success: false, error: "Invalid group ID" }, 400);
    return handleGetEvents(env, groupId);
  }

  // POST /api/events
  if (method === "POST" && path === "/api/events") return handleCreateEvent(request, env, null);

  // POST /api/groups/:id/events
  if (method === "POST" && path.match(/^\/api\/groups\/\d+\/events$/)) {
    const groupId = getGroupIdFromPath(path);
    if (!groupId) return json({ success: false, error: "Invalid group ID" }, 400);
    return handleCreateEvent(request, env, groupId);
  }

  // PATCH/PUT /api/events/:id
  if ((method === "PATCH" || method === "PUT") && path.match(/^\/api\/events\/\d+$/)) {
    const eventId = getEventIdFromPath(path);
    if (!eventId) return json({ success: false, error: "Invalid event ID" }, 400);
    return handleEditEvent(request, env, eventId);
  }

  // DELETE /api/events/:id
  if (method === "DELETE" && path.match(/^\/api\/events\/\d+$/)) {
    const eventId = getEventIdFromPath(path);
    if (!eventId) return json({ success: false, error: "Invalid event ID" }, 400);
    return handleDeleteEvent(request, env, eventId);
  }

  return json({ success: false, error: "Not found" }, 404);
};

/* =========================================================
   GET — list events (all or per group), excluding deleted
   ========================================================= */
async function handleGetEvents(env: Env, groupId: number | null) {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const sql = groupId
      ? `SELECT e.* FROM events e
         WHERE e.group_id = ? AND COALESCE(e.is_deleted, 0) = 0
         ORDER BY e.event_date DESC, e.id DESC
         LIMIT 200`
      : `SELECT e.* FROM events e
         WHERE COALESCE(e.is_deleted, 0) = 0
         ORDER BY e.event_date DESC, e.id DESC
         LIMIT 200`;

    const stmt = groupId ? env.DB.prepare(sql).bind(groupId) : env.DB.prepare(sql);
    const events = await stmt.all();

    const list = (events.results || []) as any[];
    const eventIds = list.map((e) => Number(e.id)).filter(Boolean);
    if (!eventIds.length) return json({ success: true, events: [] });

    const ph = eventIds.map(() => "?").join(",");

    const attendeesRows = await env.DB.prepare(
      `SELECT event_id, user_id FROM event_attendees WHERE event_id IN (${ph})`
    ).bind(...eventIds).all();

    const interestedRows = await env.DB.prepare(
      `SELECT event_id, user_id FROM event_interested WHERE event_id IN (${ph})`
    ).bind(...eventIds).all();

    const reactionsRows = await env.DB.prepare(
      `SELECT event_id, COUNT(*) AS c FROM event_reactions WHERE event_id IN (${ph}) GROUP BY event_id`
    ).bind(...eventIds).all().catch(() => ({ results: [] }));

    const commentsRows = await env.DB.prepare(
      `SELECT event_id, COUNT(*) AS c FROM event_comments
       WHERE event_id IN (${ph}) AND COALESCE(is_deleted, 0) = 0 GROUP BY event_id`
    ).bind(...eventIds).all().catch(() => ({ results: [] }));

    const sharesRows = await env.DB.prepare(
      `SELECT event_id, COUNT(*) AS c FROM event_shares WHERE event_id IN (${ph}) GROUP BY event_id`
    ).bind(...eventIds).all().catch(() => ({ results: [] }));

    const attendeesMap = new Map<number, number[]>();
    for (const r of (attendeesRows.results || []) as any[]) {
      const eid = Number(r.event_id);
      const uid = Number(r.user_id);
      if (!attendeesMap.has(eid)) attendeesMap.set(eid, []);
      attendeesMap.get(eid)!.push(uid);
    }

    const interestedMap = new Map<number, number[]>();
    for (const r of (interestedRows.results || []) as any[]) {
      const eid = Number(r.event_id);
      const uid = Number(r.user_id);
      if (!interestedMap.has(eid)) interestedMap.set(eid, []);
      interestedMap.get(eid)!.push(uid);
    }

    const reactionsMap = new Map<number, number>();
    for (const r of (reactionsRows.results || []) as any[]) {
      reactionsMap.set(Number(r.event_id), Number(r.c || 0));
    }

    const commentsMap = new Map<number, number>();
    for (const r of (commentsRows.results || []) as any[]) {
      commentsMap.set(Number(r.event_id), Number(r.c || 0));
    }

    const sharesMap = new Map<number, number>();
    for (const r of (sharesRows.results || []) as any[]) {
      sharesMap.set(Number(r.event_id), Number(r.c || 0));
    }

    const hydrated = list.map((e) => ({
      ...e,
      attendees: attendeesMap.get(Number(e.id)) || [],
      interested_ids: interestedMap.get(Number(e.id)) || [],
      organizerId: e.creator_id,
      date: e.event_date,
      image: e.cover_url,
      reactions_count: reactionsMap.get(Number(e.id)) || 0,
      comments_count: commentsMap.get(Number(e.id)) || 0,
      shares_count: sharesMap.get(Number(e.id)) || 0,
      shares: sharesMap.get(Number(e.id)) || 0,
    }));

    return json({ success: true, events: hydrated });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to load events" }, 500);
  }
}

/* =========================================================
   POST — create event
   ========================================================= */
async function handleCreateEvent(request: Request, env: Env, groupId: number | null) {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.creator_id ?? body.organizerId ?? body.user_id ?? 0, 0);
    const creator_id = headerUserId || bodyUserId || 0;

    const title = str(body.title);
    const description = str(body.description);
    const event_date = str(body.event_date ?? body.date);
    const location = str(body.location);
    const cover_url = str(body.cover_url ?? body.image ?? body.cover_image);
    const visibility = str(body.visibility || "worldwide") || "worldwide";
    const gid = groupId ?? (body.group_id != null ? Number(body.group_id) : null);

    if (!creator_id) return json({ success: false, error: "creator_id missing" }, 400);
    if (!title) return json({ success: false, error: "title missing" }, 400);
    if (!event_date) return json({ success: false, error: "event_date missing" }, 400);
    if (isNaN(Date.parse(event_date))) return json({ success: false, error: "Invalid event_date" }, 400);
    if (!["worldwide", "targeted"].includes(visibility)) {
      return json({ success: false, error: "Invalid visibility" }, 400);
    }

    if (gid) {
      const group = await env.DB
        .prepare(`SELECT id FROM groups WHERE id = ? LIMIT 1`)
        .bind(gid).first();
      if (!group) return json({ success: false, error: "Group not found" }, 404);

      const member = await env.DB
        .prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`)
        .bind(gid, creator_id).first();
      if (!member) return json({ success: false, error: "Not a member of this group" }, 403);
    }

    const created_at = new Date().toISOString();

    const { id } = await withNewContentId(async (id) => {
      return await env.DB.prepare(
        `INSERT INTO events
           (id, creator_id, title, description, event_date,
            location, cover_url, visibility, group_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id, creator_id, title, description, event_date,
          location, cover_url, visibility, gid, created_at
        )
        .run();
    });

    const row = await env.DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first<any>();

    return json(
      {
        success: true,
        event: {
          ...(row ?? {}),
          attendees: [],
          interested_ids: [],
          organizerId: row?.creator_id ?? creator_id,
          date: row?.event_date ?? event_date,
          image: row?.cover_url ?? cover_url,
        },
      },
      201
    );
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to create event" }, 500);
  }
}

/* =========================================================
   PATCH / PUT — edit event (creator only)
   ========================================================= */
async function handleEditEvent(request: Request, env: Env, eventId: number) {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const body: any = await request.json().catch(() => ({}));
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!userId) return json({ success: false, error: "Login required" }, 401);

    const event = await env.DB
      .prepare(
        `SELECT id, creator_id FROM events
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
      )
      .bind(eventId).first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);
    if (toNum(event.creator_id) !== userId) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    const updates: string[] = [];
    const bindings: any[] = [];

    if (body.title !== undefined) {
      const title = str(body.title);
      if (!title) return json({ success: false, error: "title cannot be empty" }, 400);
      updates.push("title = ?"); bindings.push(title);
    }
    if (body.description !== undefined) {
      updates.push("description = ?"); bindings.push(str(body.description) || null);
    }
    if (body.event_date !== undefined || body.date !== undefined) {
      const d = str(body.event_date ?? body.date);
      if (!d || isNaN(Date.parse(d))) {
        return json({ success: false, error: "Invalid event_date" }, 400);
      }
      updates.push("event_date = ?"); bindings.push(d);
    }
    if (body.location !== undefined) {
      updates.push("location = ?"); bindings.push(str(body.location) || null);
    }
    if (body.cover_url !== undefined || body.image !== undefined) {
      updates.push("cover_url = ?"); bindings.push(str(body.cover_url ?? body.image) || null);
    }
    if (body.visibility !== undefined) {
      const v = str(body.visibility);
      if (!["worldwide", "targeted"].includes(v)) {
        return json({ success: false, error: "Invalid visibility" }, 400);
      }
      updates.push("visibility = ?"); bindings.push(v);
    }

    if (!updates.length) return json({ success: false, error: "Nothing to update" }, 400);

    updates.push("updated_at = CURRENT_TIMESTAMP");

    await env.DB
      .prepare(`UPDATE events SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...bindings, eventId)
      .run();

    const updated = await env.DB
      .prepare(`SELECT * FROM events WHERE id = ? LIMIT 1`)
      .bind(eventId).first();

    return json({ success: true, event: updated ?? null });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to edit event" }, 500);
  }
}

/* =========================================================
   DELETE — soft delete (creator only)
   ========================================================= */
async function handleDeleteEvent(request: Request, env: Env, eventId: number) {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const url = new URL(request.url);
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    if (!userId) return json({ success: false, error: "Login required" }, 401);

    const event = await env.DB
      .prepare(
        `SELECT id, creator_id FROM events
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
      )
      .bind(eventId).first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);
    if (toNum(event.creator_id) !== userId) {
      return json({ success: false, error: "Not allowed" }, 403);
    }

    await env.DB
      .prepare(
        `UPDATE events
         SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(userId, eventId).run();

    return json({
      success: true,
      event_id: eventId,
      deleted: true,
      deleted_by: userId,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to delete event" }, 500);
  }
}
