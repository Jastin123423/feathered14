import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

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

const normalizeType = (v: any) => String(v || "like").trim().toLowerCase();

const ALLOWED = new Set([
  "like","love","haha","wow","sad","angry",
  "fire","party","clap","star","thinking",
  "crying","heart_eyes","kiss","sunglasses",
  "rocket","trophy","crown",
]);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const eventId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId;

    const type = normalizeType(body.type || body.reaction);

    if (!eventId) return json({ success: false, error: "Invalid event id" }, 400);
    if (!userId)  return json({ success: false, error: "user_id required" }, 400);
    if (!ALLOWED.has(type)) return json({ success: false, error: "Invalid reaction" }, 400);

    // ✅ creator_id (not user_id)
    const event = await env.DB
      .prepare(`SELECT id, creator_id FROM events WHERE id=? LIMIT 1`)
      .bind(eventId)
      .first<any>();

    if (!event) return json({ success: false, error: "Event not found" }, 404);

    const existing = await env.DB
      .prepare(`SELECT id, type FROM event_reactions WHERE event_id=? AND user_id=? LIMIT 1`)
      .bind(eventId, userId)
      .first<any>();

    let reacted = false;
    let finalType: string | null = null;
    let action: "added" | "removed" | "changed" = "added";

    if (existing) {
      const prev = normalizeType(existing.type);

      if (prev === type) {
        await env.DB
          .prepare(`DELETE FROM event_reactions WHERE event_id=? AND user_id=?`)
          .bind(eventId, userId)
          .run();
        reacted = false;
        finalType = null;
        action = "removed";
      } else {
        await env.DB
          .prepare(`UPDATE event_reactions SET type=?, created_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(type, existing.id)
          .run();
        reacted = true;
        finalType = type;
        action = "changed";
      }
    } else {
      await env.DB
        .prepare(`INSERT INTO event_reactions (event_id, user_id, type) VALUES (?, ?, ?)`)
        .bind(eventId, userId, type)
        .run();
      reacted = true;
      finalType = type;
      action = "added";
    }

    // 🔔 Notify on add/change, never self
    if (action !== "removed" && finalType) {
      const ownerId = toNum(event.creator_id, 0);
      if (ownerId && ownerId !== userId) {
        try {
          await createNotification(
            env,
            ownerId,
            userId,
            "reaction",
            "event",
            eventId,
            `event:${eventId}:reaction`,
            "reacted to your event"
          );
        } catch (_) {}
      }
    }

    const countRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM event_reactions WHERE event_id=?`)
      .bind(eventId)
      .first<{ c: number }>();

    const { results } = await env.DB
      .prepare(
        `SELECT type, COUNT(*) AS count
         FROM event_reactions
         WHERE event_id=?
         GROUP BY type
         ORDER BY count DESC`
      )
      .bind(eventId)
      .all();

    return json({
      success: true,
      action,
      reacted,
      type: finalType,
      my_reaction: finalType,
      reactions_count: toNum(countRow?.c, 0),
      reactions_breakdown: results || [],
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
