import { sendPushForNotification } from "../functions/api/_push"; // 👈 Updated to import our working push function

export async function createNotification(
  env: any,
  recipient_id: number,
  actor_id: number,
  type: string,
  entity_type: string,
  entity_id: number | string,
  group_key: string,
  message?: string | null,
  ctx?: ExecutionContext
) {
  try {
    if (!env?.DB) return;
    if (!recipient_id || !actor_id || !type) return;
    if (recipient_id === actor_id) return;

    const entityIdValue = entity_id != null ? String(entity_id) : null;
    const cleanGroupKey = typeof group_key === "string" ? group_key.trim() : "";
    const cleanMessage =
      typeof message === "string" && message.trim() ? message.trim() : null;

    // 👈 We wrap our push function so it matches your waitUntil logic
    const queuePush = async () => {
      const pushPromise = sendPushForNotification(env, {
        recipient_id,
        actor_id,
        type,
        entity_type: entity_type || null,
        entity_id: entityIdValue,
        parent_id: null, // You can pass this if you have it
        group_key: cleanGroupKey || `feathered_${type}`,
        message: cleanMessage,
      }).catch((e) => console.error("Native push failed:", e));

      if (ctx?.waitUntil) {
        ctx.waitUntil(pushPromise);
      } else {
        await pushPromise;
      }
    };

    if (!cleanGroupKey) {
      await env.DB.prepare(`
        INSERT INTO notifications
        (
          recipient_id, actor_id, type, entity_type, entity_id,
          group_key, message, is_read, actors_count, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `)
        .bind(
          recipient_id,
          actor_id,
          type,
          entity_type || null,
          entityIdValue,
          null,
          cleanMessage
        )
        .run();

      await queuePush();
      return;
    }

    const existing = await env.DB.prepare(`
      SELECT id, actor_id, actors_count
      FROM notifications
      WHERE recipient_id = ?
        AND group_key = ?
        AND created_at > datetime('now', '-24 hours')
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1
    `)
      .bind(recipient_id, cleanGroupKey)
      .first<{ id: number; actor_id: number; actors_count: number | null }>();

    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO notifications
        (
          recipient_id, actor_id, type, entity_type, entity_id,
          group_key, message, is_read, actors_count, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `)
        .bind(
          recipient_id,
          actor_id,
          type,
          entity_type || null,
          entityIdValue,
          cleanGroupKey,
          cleanMessage
        )
        .run();

      await queuePush();
      return;
    }

    const sameActorRecent = await env.DB.prepare(`
      SELECT id
      FROM notifications
      WHERE recipient_id = ?
        AND group_key = ?
        AND actor_id = ?
        AND created_at > datetime('now', '-24 hours')
      LIMIT 1
    `)
      .bind(recipient_id, cleanGroupKey, actor_id)
      .first();

    if (sameActorRecent) {
      await env.DB.prepare(`
        UPDATE notifications
        SET actor_id = ?,
            message = COALESCE(?, message),
            is_read = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(actor_id, cleanMessage, existing.id)
        .run();

      await queuePush();
      return;
    }

    await env.DB.prepare(`
      UPDATE notifications
      SET actor_id = ?,
          message = COALESCE(?, message),
          is_read = 0,
          actors_count = COALESCE(actors_count, 1) + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(actor_id, cleanMessage, existing.id)
      .run();

    await queuePush();
  } catch (error) {
    console.error("createNotification failed:", error);
  }
}
