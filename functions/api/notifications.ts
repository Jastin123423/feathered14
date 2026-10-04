import type { PagesFunction } from '@cloudflare/workers-types';

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* ==============================
   GET NOTIFICATIONS
   RETURNS PLAIN ARRAY
================================*/
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const userId = Number(request.headers.get("x-user-id"));

    if (!userId) return json({ error: "Missing user id" }, 400);

    const { results } = await env.DB.prepare(`
      SELECT *
      FROM notifications
      WHERE recipient_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `)
      .bind(userId)
      .all();

    return json(results || []);
  } catch (err) {
    console.error("GET notifications failed:", err);
    return json({ error: "Failed to fetch notifications" }, 500);
  }
};

/* ==============================
   CREATE NOTIFICATION
================================*/
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json();

    const {
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      parent_id,
      group_key,
      message
    } = body || {};

    if (!recipient_id || !actor_id || !type) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (Number(recipient_id) === Number(actor_id)) {
      return json({ success: true, skipped: true });
    }

    await env.DB.prepare(`
      INSERT INTO notifications
      (
        recipient_id,
        actor_id,
        type,
        entity_type,
        entity_id,
        parent_id,
        group_key,
        message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        recipient_id,
        actor_id,
        type,
        entity_type || null,
        entity_id || null,
        parent_id || null,
        group_key || null,
        message || null
      )
      .run();

    return json({ success: true });
  } catch (err) {
    console.error("CREATE notification failed:", err);
    return json({ error: "Failed to create notification" }, 500);
  }
};

/* ==============================
   MARK ALL AS READ
================================*/
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const userId = Number(request.headers.get("x-user-id"));

    if (!userId) return json({ error: "Missing user id" }, 400);

    await env.DB.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE recipient_id = ?
        AND (is_read = 0 OR is_read IS NULL)
    `)
      .bind(userId)
      .run();

    return json({ success: true });
  } catch (err) {
    console.error("PATCH notifications failed:", err);
    return json({ error: "Failed to mark notifications as read" }, 500);
  }
};

/* ==============================
   DELETE NOTIFICATION
   DELETE /api/notifications?id=123
================================*/
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const userId = Number(request.headers.get("x-user-id"));

    if (!userId) return json({ error: "Missing user id" }, 400);

    const url = new URL(request.url);
    const notificationId = Number(url.searchParams.get("id"));

    if (!notificationId) {
      return json({ error: "Missing notification id" }, 400);
    }

    await env.DB.prepare(`
      DELETE FROM notifications
      WHERE id = ?
        AND recipient_id = ?
    `)
      .bind(notificationId, userId)
      .run();

    return json({ success: true, id: notificationId });
  } catch (err) {
    console.error("DELETE notification failed:", err);
    return json({ error: "Failed to delete notification" }, 500);
  }
};
