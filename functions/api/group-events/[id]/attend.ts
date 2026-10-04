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

    const eventIdFromBody = toNum(body.event_id ?? body.group_event_id, 0);
    const finalEventId = eventId || eventIdFromBody;

    const rawAction = String(body.action ?? "add").trim().toLowerCase();
    const isAdd = ["add", "attend", "going"].includes(rawAction);
    const isRemove = ["remove", "cancel", "not_going"].includes(rawAction);

    if (!finalEventId) return json({ success: false, error: "event_id missing" }, 400);
    if (!userId) return json({ success: false, error: "user_id missing" }, 400);
    if (!isAdd && !isRemove) {
      return json({ success: false, error: "Invalid action" }, 400);
    }

    const event = await env.DB
      .prepare(`SELECT id, creator_id, group_id, title FROM group_events WHERE id = ? LIMIT 1`)
      .bind(finalEventId)
      .first<any>();

    if (!event) return json({ success: false, error: "Group event not found" }, 404);

    const eventOwnerId = toNum(event.creator_id, 0);

    // Ensure table exists
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS group_event_attendees (
        group_event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_event_id, user_id)
      )`
    ).run().catch(() => {});

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS group_event_interested (
        group_event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_event_id, user_id)
      )`
    ).run().catch(() => {});

    if (isAdd) {
      const already = await env.DB
        .prepare(`SELECT 1 AS ok FROM group_event_attendees WHERE group_event_id = ? AND user_id = ? LIMIT 1`)
        .bind(finalEventId, userId)
        .first<{ ok: number }>();

      if (!already) {
        await env.DB
          .prepare(`INSERT INTO group_event_attendees (group_event_id, user_id) VALUES (?, ?)`)
          .bind(finalEventId, userId)
          .run();

        await env.DB
          .prepare(`DELETE FROM group_event_interested WHERE group_event_id = ? AND user_id = ?`)
          .bind(finalEventId, userId)
          .run();

        if (eventOwnerId && eventOwnerId !== userId) {
          try {
            await createNotification(
              env,
              eventOwnerId,
              userId,
              "going",
              "group_event",
              finalEventId,
              `group_event:${finalEventId}:going`,
              `is attending your group event "${event.title || 'Event'}"`
            );
          } catch (_) {}
        }
      }
    } else {
      await env.DB
        .prepare(`DELETE FROM group_event_attendees WHERE group_event_id = ? AND user_id = ?`)
        .bind(finalEventId, userId)
        .run();
    }

    const attending = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM group_event_attendees WHERE group_event_id = ?`)
      .bind(finalEventId)
      .first<{ c: number }>();

    const interested = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM group_event_interested WHERE group_event_id = ?`)
      .bind(finalEventId)
      .first<{ c: number }>();

    const myGoing = await env.DB
      .prepare(`SELECT 1 AS ok FROM group_event_attendees WHERE group_event_id = ? AND user_id = ? LIMIT 1`)
      .bind(finalEventId, userId)
      .first();

    const myInterested = await env.DB
      .prepare(`SELECT 1 AS ok FROM group_event_interested WHERE group_event_id = ? AND user_id = ? LIMIT 1`)
      .bind(finalEventId, userId)
      .first();

    return json({
      success: true,
      data: {
        event_id: finalEventId,
        attending_count: toNum(attending?.c, 0),
        interested_count: toNum(interested?.c, 0),
        going: !!myGoing,
        interested: !!myInterested,
        status: myGoing ? "going" : (myInterested ? "interested" : null),
      },
    });
  } catch (error: any) {
    return json({ success: false, error: error?.message || "Internal error" }, 500);
  }
};
