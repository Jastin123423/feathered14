import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId;

    const eventId = toNum(body.event_id, 0);
    const destination = toText(body.destination, "feed").toLowerCase() || "feed";
    const itemType = toText(body.item_type, "event").toLowerCase() || "event";
    const message = toText(body.message) || null;

    if (!eventId) return json({ success: false, error: "event_id missing" }, 400);
    if (!userId)  return json({ success: false, error: "user_id missing" }, 400);

    // ✅ creator_id
    const event = await env.DB
      .prepare(`SELECT id, creator_id FROM events WHERE id=? LIMIT 1`)
      .bind(eventId)
      .first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);

    const eventOwnerId = toNum(event.creator_id, 0);

    // ✅ no shared_at from client — DB default handles it
    const ins = await env.DB
      .prepare(
        `INSERT INTO event_shares (event_id, user_id, destination, item_type, message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(eventId, userId, destination, itemType, message)
      .run();

    const shareId = toNum(ins.meta?.last_row_id, 0);

    const share = await env.DB
      .prepare(
        `SELECT id, event_id, user_id, destination, item_type, shared_at, message
         FROM event_shares
         WHERE id = ?
         LIMIT 1`
      )
      .bind(shareId)
      .first();

    if (eventOwnerId && eventOwnerId !== userId) {
      try {
        await createNotification(
          env,
          eventOwnerId,
          userId,
          "share",
          "event",
          eventId,
          `event:${eventId}:share`,
          "shared your event"
        );
      } catch (_) {}
    }

    const countRow = await env.DB
      .prepare(`SELECT COUNT(*) AS shares_count FROM event_shares WHERE event_id = ?`)
      .bind(eventId)
      .first<{ shares_count: number }>();

    return json({
      success: true,
      share: share ?? null,
      shares_count: toNum(countRow?.shares_count, 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to share event" },
      500
    );
  }
};
