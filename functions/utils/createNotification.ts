import { sendPushForNotification } from "./pushNotifications";

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
  console.log("🚀 [CREATE_NOTIF] START", { recipient_id, actor_id, type, group_key, message });

  try {
    if (!env?.DB) {
      console.log("🚨 [CREATE_NOTIF] ABORT: no DB");
      return;
    }
    if (!recipient_id || !actor_id || !type) {
      console.log("🚨 [CREATE_NOTIF] ABORT: missing required fields");
      return;
    }
    if (recipient_id === actor_id) {
      console.log("🚨 [CREATE_NOTIF] ABORT: self-action (recipient === actor)");
      return;
    }

    console.log("✅ [CREATE_NOTIF] Passed guards, processing...");

    const entityIdValue = entity_id != null ? String(entity_id) : null;
    const cleanGroupKey = typeof group_key === "string" ? group_key.trim() : "";
    const cleanMessage = typeof message === "string" && message.trim() ? message.trim() : null;

    const sendNativePush = async () => {
      console.log("🚀 [CREATE_NOTIF] Calling sendPushForNotification...");
      await sendPushForNotification(env, {
        recipient_id,
        actor_id,
        type,
        entity_type: entity_type || null,
        entity_id: entityIdValue,
        parent_id: null,
        group_key: cleanGroupKey || `feathered_${type}`,
        message: cleanMessage,
      });
      console.log("✅ [CREATE_NOTIF] sendPushForNotification returned");
    };

    const queuePush = async () => {
      const pushPromise = sendNativePush().catch((e) => console.error("🚨 Native push failed:", e));
      if (ctx?.waitUntil) {
        console.log("🚀 [CREATE_NOTIF] Using waitUntil");
        ctx.waitUntil(pushPromise);
      } else {
        console.log("🚀 [CREATE_NOTIF] Awaiting push (no waitUntil)");
        await pushPromise;
      }
    };

    if (!cleanGroupKey) {
      console.log("🚀 [CREATE_NOTIF] Branch: no groupKey - INSERT");
      await env.DB.prepare(`
        INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, group_key, message, is_read, actors_count, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 1, CURRENT_TIMESTAMP)
      `).bind(recipient_id, actor_id, type, entity_type || null, entityIdValue, cleanMessage).run();
      await queuePush();
      return;
    }

    const existing = await env.DB.prepare(`
      SELECT id, actor_id, actors_count FROM notifications
      WHERE recipient_id = ? AND group_key = ? AND created_at > datetime('now', '-24 hours')
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT 1
    `).bind(recipient_id, cleanGroupKey).first<{ id: number; actor_id: number; actors_count: number | null }>();

    if (!existing) {
      console.log("🚀 [CREATE_NOTIF] Branch: no existing group - INSERT");
      await env.DB.prepare(`
        INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, group_key, message, is_read, actors_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)
      `).bind(recipient_id, actor_id, type, entity_type || null, entityIdValue, cleanGroupKey, cleanMessage).run();
      await queuePush();
      return;
    }

    const sameActorRecent = await env.DB.prepare(`
      SELECT id FROM notifications
      WHERE recipient_id = ? AND group_key = ? AND actor_id = ? AND created_at > datetime('now', '-24 hours') LIMIT 1
    `).bind(recipient_id, cleanGroupKey, actor_id).first();

    if (sameActorRecent) {
      console.log("🚀 [CREATE_NOTIF] Branch: same actor recent - UPDATE");
      await env.DB.prepare(`
        UPDATE notifications SET actor_id = ?, message = COALESCE(?, message), is_read = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(actor_id, cleanMessage, existing.id).run();
      await queuePush();
      return;
    }

    console.log("🚀 [CREATE_NOTIF] Branch: new actor - UPDATE + count");
    await env.DB.prepare(`
      UPDATE notifications SET actor_id = ?, message = COALESCE(?, message), is_read = 0, actors_count = COALESCE(actors_count, 1) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(actor_id, cleanMessage, existing.id).run();

    await queuePush();
    console.log("✅ [CREATE_NOTIF] DONE");
  } catch (error) {
    console.error("🚨 [CREATE_NOTIF] FATAL:", error);
  }
}
