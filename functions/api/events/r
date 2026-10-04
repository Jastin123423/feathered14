// functions/api/events/rsvp.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeStr = (v: any) => (typeof v === "string" ? v.trim() : "");

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const body = await request.json().catch(() => ({} as any));

    const event_id = toInt(body.event_id, 0);
    const user_id = toInt(body.user_id, 0);
    const status = safeStr(body.status); // "going" | "interested" | "not_going"

    if (!event_id || !user_id) {
      return json({ success: false, error: "Missing event_id or user_id" }, 400);
    }

    if (!["going", "interested", "not_going"].includes(status)) {
      return json({ success: false, error: "Invalid status" }, 400);
    }

    // Ensure event exists
    const ev = await env.DB.prepare(`SELECT id FROM events WHERE id = ? LIMIT 1`)
      .bind(event_id)
      .first();
    if (!ev) return json({ success: false, error: "Event not found" }, 404);

    // RSVP logic:
    // going       -> insert attendees, delete interested
    // interested  -> insert interested, delete attendees
    // not_going   -> delete both
    if (status === "going") {
      await env.DB.prepare(`DELETE FROM event_interested WHERE event_id = ? AND user_id = ?`)
        .bind(event_id, user_id)
        .run();

      await env.DB.prepare(
        `INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)`
      )
        .bind(event_id, user_id)
        .run();
    } else if (status === "interested") {
      await env.DB.prepare(`DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?`)
        .bind(event_id, user_id)
        .run();

      await env.DB.prepare(
        `INSERT OR IGNORE INTO event_interested (event_id, user_id) VALUES (?, ?)`
      )
        .bind(event_id, user_id)
        .run();
    } else {
      await env.DB.prepare(`DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?`)
        .bind(event_id, user_id)
        .run();
      await env.DB.prepare(`DELETE FROM event_interested WHERE event_id = ? AND user_id = ?`)
        .bind(event_id, user_id)
        .run();
    }

    // Return updated counts + my status
    const attendingRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM event_attendees WHERE event_id = ?`
    )
      .bind(event_id)
      .first();
    const interestedRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM event_interested WHERE event_id = ?`
    )
      .bind(event_id)
      .first();

    const isGoing = await env.DB.prepare(
      `SELECT 1 FROM event_attendees WHERE event_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(event_id, user_id)
      .first();

    const isInterested = await env.DB.prepare(
      `SELECT 1 FROM event_interested WHERE event_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(event_id, user_id)
      .first();

    const my_status = isGoing ? "going" : isInterested ? "interested" : "";

    return json({
      success: true,
      event_id,
      my_status,
      attending: Number((attendingRow as any)?.c ?? 0),
      interested: Number((interestedRow as any)?.c ?? 0),
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || String(e) }, 500);
  }
};
