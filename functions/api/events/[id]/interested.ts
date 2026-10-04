import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const eventId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    // Also accept event_id from body as fallback if route param missing
    const eventIdFromBody = toNum(body.event_id, 0);
    const finalEventId = eventId || eventIdFromBody;

    const rawAction = String(body.action ?? "add").trim().toLowerCase();
    const isAdd = ["add", "interested"].includes(rawAction);
    const isRemove = ["remove", "cancel", "uninterested", "not_interested"].includes(rawAction);

    if (!finalEventId) return json({ success: false, error: "event_id missing" }, 400);
    if (!userId)       return json({ success: false, error: "user_id missing" }, 400);
    if (!isAdd && !isRemove) {
      return json({ success: false, error: "Invalid action" }, 400);
    }

    // ✅ events table uses creator_id (NOT user_id)
    const event = await env.DB
      .prepare(`SELECT id, creator_id FROM events WHERE id = ? LIMIT 1`)
      .bind(finalEventId)
      .first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);

    const eventOwnerId = toNum(event.creator_id, 0);

    if (isAdd) {
      const already = await env.DB
        .prepare(`SELECT 1 AS ok FROM event_interested WHERE event_id=? AND user_id=? LIMIT 1`)
        .bind(finalEventId, userId)
        .first<{ ok: number }>();

      if (!already) {
        await env.DB
          .prepare(`INSERT INTO event_interested (event_id, user_id) VALUES (?, ?)`)
          .bind(finalEventId, userId)
          .run();

        // mutual exclusion: interested removes going
        await env.DB
          .prepare(`DELETE FROM event_attendees WHERE event_id=? AND user_id=?`)
          .bind(finalEventId, userId)
          .run();

        // notify only on first-time interest, never self
        if (eventOwnerId && eventOwnerId !== userId) {
          try {
            await createNotification(
              env,
              eventOwnerId,
              userId,
              "interested",
              "event",
              finalEventId,
              `event:${finalEventId}:interested`,
              "marked interested in your event"
            );
          } catch (_) {}
        }
      }
    } else {
      await env.DB
        .prepare(`DELETE FROM event_interested WHERE event_id=? AND user_id=?`)
        .bind(finalEventId, userId)
        .run();
    }

    const attending = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM event_attendees WHERE event_id=?`)
      .bind(finalEventId)
      .first<{ c: number }>();

    const interested = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM event_interested WHERE event_id=?`)
      .bind(finalEventId)
      .first<{ c: number }>();

    const myGoing = await env.DB
      .prepare(`SELECT 1 AS ok FROM event_attendees WHERE event_id=? AND user_id=? LIMIT 1`)
      .bind(finalEventId, userId)
      .first();

    const myInterested = await env.DB
      .prepare(`SELECT 1 AS ok FROM event_interested WHERE event_id=? AND user_id=? LIMIT 1`)
      .bind(finalEventId, userId)
      .first();

    const my_status = myGoing ? "going" : myInterested ? "interested" : "";

    return json({
      success: true,
      event_id: finalEventId,
      attending_count: Number(attending?.c ?? 0),
      interested_count: Number(interested?.c ?? 0),
      my_status,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Failed to mark interested" }, 500);
  }
};
