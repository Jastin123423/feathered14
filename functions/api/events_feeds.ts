// functions/api/events_feeds.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const safeStr = (v: any) => String(v ?? "").trim();

type EventFilter = "all" | "upcoming" | "past" | "today" | "this-week" | "this-month";
type EventSort = "date" | "popular" | "trending";

// NOTE: Uses your schema:
// events(event_date, cover_url, group_id)
// event_attendees, event_interested
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const url = new URL(request.url);
    const q = safeStr(url.searchParams.get("q"));
    const page = clamp(toInt(url.searchParams.get("page"), 1), 1, 10_000);
    const limit = clamp(toInt(url.searchParams.get("limit"), 12), 1, 50);

    const filter = (safeStr(url.searchParams.get("filter")) || "upcoming") as EventFilter;
    const sort = (safeStr(url.searchParams.get("sort")) || "date") as EventSort;

    // ✅ For user RSVP status, we accept user_id from query.
    // (Frontend should pass currentUser.id; if 0, status becomes "")
    const userId = clamp(toInt(url.searchParams.get("user_id"), 0), 0, 1_000_000_000);

    const offset = (page - 1) * limit;

    // ---------- WHERE conditions ----------
    // Search across title/description/location
    const whereParts: string[] = [];
    const binds: any[] = [];

    if (q) {
      whereParts.push(`(
        e.title LIKE ? OR
        e.description LIKE ? OR
        e.location LIKE ?
      )`);
      const like = `%${q}%`;
      binds.push(like, like, like);
    }

    // Filters based on event_date (TEXT). We assume it's ISO-ish (YYYY-MM-DD or ISO datetime).
    // Using SQLite date() for safety.
    if (filter === "upcoming") {
      whereParts.push(`datetime(e.event_date) >= datetime('now')`);
    } else if (filter === "past") {
      whereParts.push(`datetime(e.event_date) < datetime('now')`);
    } else if (filter === "today") {
      whereParts.push(`date(e.event_date) = date('now')`);
    } else if (filter === "this-week") {
      whereParts.push(`datetime(e.event_date) >= datetime('now') AND datetime(e.event_date) < datetime('now', '+7 days')`);
    } else if (filter === "this-month") {
      whereParts.push(`datetime(e.event_date) >= datetime('now') AND datetime(e.event_date) < datetime('now', '+30 days')`);
    } // "all" => no extra filter

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    // ---------- ORDER BY ----------
    let orderBy = `ORDER BY datetime(e.event_date) ASC`;
    if (sort === "popular") {
      orderBy = `ORDER BY COALESCE(a.attendees_count,0) DESC, datetime(e.event_date) ASC`;
    } else if (sort === "trending") {
      // trending score = attendees*2 + interested
      orderBy = `ORDER BY (COALESCE(a.attendees_count,0) * 2 + COALESCE(i.interested_count,0)) DESC, datetime(e.event_date) ASC`;
    }

    // ---------- Main query (unified feed from ONE table) ----------
    // includes group events automatically because they are rows in events (group_id may be NULL)
    const eventsSql = `
      SELECT
        e.id,
        e.creator_id,
        e.title,
        e.description,
        e.event_date,
        e.location,
        e.cover_url,
        e.visibility,
        e.group_id,
        e.created_at,

        u.id AS creator_user_id,
        u.name AS creator_name,
        u.username AS creator_username,
        u.profile_image_url AS creator_profile_image_url,

        COALESCE(a.attendees_count, 0) AS attendees_count,
        COALESCE(i.interested_count, 0) AS interested_count,

        (SELECT COUNT(*) FROM event_reactions er WHERE er.event_id = e.id) AS reactions_count,
        (SELECT er.type FROM event_reactions er WHERE er.event_id = e.id AND er.user_id = ? LIMIT 1) AS my_reaction,
        (SELECT COUNT(*) FROM event_comments ec WHERE ec.event_id = e.id AND COALESCE(ec.is_deleted,0) = 0) AS comments_count,
        (SELECT COUNT(*) FROM event_shares es WHERE es.event_id = e.id) AS shares_count,

        CASE
          WHEN ua.event_id IS NOT NULL THEN 'going'
          WHEN ui.event_id IS NOT NULL THEN 'interested'
          ELSE ''
        END AS user_rsvp_status

      FROM events e
      LEFT JOIN users u ON u.id = e.creator_id

      LEFT JOIN (
        SELECT event_id, COUNT(*) AS attendees_count
        FROM event_attendees
        GROUP BY event_id
      ) a ON a.event_id = e.id

      LEFT JOIN (
        SELECT event_id, COUNT(*) AS interested_count
        FROM event_interested
        GROUP BY event_id
      ) i ON i.event_id = e.id

      LEFT JOIN (
        SELECT event_id
        FROM event_attendees
        WHERE user_id = ?
      ) ua ON ua.event_id = e.id

      LEFT JOIN (
        SELECT event_id
        FROM event_interested
        WHERE user_id = ?
      ) ui ON ui.event_id = e.id

      ${whereSql}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const eventsBinds = [userId, userId, userId, ...binds, limit, offset];

    const evRes = await env.DB.prepare(eventsSql).bind(...eventsBinds).all();
    const rows = (evRes?.results || []) as any[];

    const events = rows.map((r) => ({
      // ✅ stable key to avoid any UI blinking / collisions
      event_key: `event:${r.id}`,

      id: r.id,
      creator_id: r.creator_id,
      title: r.title,
      description: r.description,
      event_date: r.event_date,
      location: r.location,
      cover_url: r.cover_url,
      visibility: r.visibility,
      group_id: r.group_id,
      created_at: r.created_at,

      attendees_count: r.attendees_count ?? 0,
      interested_count: r.interested_count ?? 0,
      user_rsvp_status: (r.user_rsvp_status || "") as "" | "going" | "interested",

      reactions_count: Number(r.reactions_count ?? 0),
      my_reaction: r.my_reaction ?? null,
      comments_count: Number(r.comments_count ?? 0),
      shares_count: Number(r.shares_count ?? 0),
      shares: Number(r.shares_count ?? 0),

      creator: {
        id: r.creator_user_id ?? r.creator_id,
        name: r.creator_name ?? "Event Organizer",
        username: r.creator_username ?? "",
        profile_image_url: r.creator_profile_image_url ?? null,
      },
    }));

    // ---------- Stats (optional, useful for header) ----------
    // apply search q but not the UI filter (so stats stay consistent)
    const statsWhereParts: string[] = [];
    const statsBinds: any[] = [];
    if (q) {
      statsWhereParts.push(`(
        title LIKE ? OR description LIKE ? OR location LIKE ?
      )`);
      const like = `%${q}%`;
      statsBinds.push(like, like, like);
    }
    const statsWhere = statsWhereParts.length ? `WHERE ${statsWhereParts.join(" AND ")}` : "";

    const statsSql = `
      SELECT
        (SELECT COUNT(*) FROM events ${statsWhere}) AS total,
        (SELECT COUNT(*) FROM events ${statsWhere} AND datetime(event_date) >= datetime('now')) AS upcoming,
        (SELECT COUNT(*) FROM events ${statsWhere} AND date(event_date) = date('now')) AS today,
        (SELECT COUNT(*) FROM events ${statsWhere} AND datetime(event_date) >= datetime('now') AND datetime(event_date) < datetime('now', '+7 days')) AS thisWeek
    `;

    // If statsWhere is empty, the "AND ..." will be invalid.
    // So we build them safely:
    const hasStatsWhere = !!statsWhere;
    const totalSql = `SELECT COUNT(*) AS c FROM events ${statsWhere}`;
    const upcomingSql = `SELECT COUNT(*) AS c FROM events ${statsWhere ? statsWhere + " AND " : "WHERE "} datetime(event_date) >= datetime('now')`;
    const todaySql = `SELECT COUNT(*) AS c FROM events ${statsWhere ? statsWhere + " AND " : "WHERE "} date(event_date) = date('now')`;
    const thisWeekSql = `SELECT COUNT(*) AS c FROM events ${statsWhere ? statsWhere + " AND " : "WHERE "} datetime(event_date) >= datetime('now') AND datetime(event_date) < datetime('now', '+7 days')`;

    const [totalR, upcomingR, todayR, weekR] = await Promise.all([
      env.DB.prepare(totalSql).bind(...statsBinds).first(),
      env.DB.prepare(upcomingSql).bind(...statsBinds).first(),
      env.DB.prepare(todaySql).bind(...statsBinds).first(),
      env.DB.prepare(thisWeekSql).bind(...statsBinds).first(),
    ]);

    const stats = {
      total: toInt((totalR as any)?.c, 0),
      upcoming: toInt((upcomingR as any)?.c, 0),
      today: toInt((todayR as any)?.c, 0),
      thisWeek: toInt((weekR as any)?.c, 0),
    };

    const has_more = rows.length === limit;

    return json({ success: true, events, stats, page, limit, has_more });
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Failed to load events feed" }, 500);
  }
};
