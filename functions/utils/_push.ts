import { FCM, FcmOptions } from "fcm-cloudflare-workers";

export type Env = {
  DB: D1Database;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FCM_KV?: KVNamespace;
};

let fcmClient: FCM | null = null;

function getFcm(env: Env): FCM {
  if (fcmClient) return fcmClient;
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  fcmClient = new FCM(
    new FcmOptions({
      serviceAccount,
      kvStore: env.FCM_KV,
      kvCacheKey: "fcm_access_token",
    })
  );
  return fcmClient;
}

export async function sendPushForNotification(
  env: Env,
  n: {
    recipient_id: number;
    actor_id: number;
    type: string;
    entity_type: string | null;
    entity_id: string | null;
    parent_id: string | null;
    group_key: string | null;
    message: string | null;
  }
): Promise<void> {
  try {
    // 1. Get device tokens
    const { results: tokens } = await env.DB.prepare(
      `SELECT token FROM device_tokens WHERE user_id = ?`
    )
      .bind(n.recipient_id)
      .all<{ token: string }>();

    if (!tokens || tokens.length === 0) return;

    // 2. Fetch the real actor's username
    let actorName = "Someone";
    try {
      const actor = await env.DB.prepare(
        `SELECT username FROM users WHERE id = ? LIMIT 1`
      )
        .bind(n.actor_id)
        .first<{ username: string | null }>();
      if (actor?.username) actorName = actor.username;
    } catch { }

    // 3. Format the Title and Body based on your requirements
    let title = "Feathered Social";
    let body = n.message || "You have new activity";

    if (n.type === "discuss" || n.type === "comment") {
      title = "New Discussion";
      // If there is a specific message passed from the web (like the comment text), use it. 
      // Otherwise, use the formatted "Username joined Discussion..."
      body = n.message 
        ? `${actorName}: ${n.message}` 
        : `${actorName} joined Discussion on your post`;
    } else if (n.type === "reply") {
      title = "New Reply";
      body = n.message ? `${actorName}: ${n.message}` : `${actorName} replied to you`;
    } else if (n.type === "follow") {
      title = "New Follower";
      body = `${actorName} started following you`;
    }

    const groupKey = n.group_key || `feathered_${n.type}`;
    const fcm = getFcm(env);

    const dataPayload: Record<string, string> = {
      type: n.type,
      groupKey: groupKey,
      actorId: String(n.actor_id),
      actorName: actorName,
    };
    if (n.entity_type) dataPayload.entityType = n.entity_type;
    if (n.entity_id) dataPayload.entityId = n.entity_id;

    const message = {
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: "high" as const,
        notification: {
          channel_id: "feathered_social",
          click_action: "OPEN_NOTIFICATION",
          tag: groupKey,
        },
      },
    };

    // 4. Send to all devices
    const stale: string[] = [];
    await Promise.all(
      tokens.map(async ({ token }) => {
        try {
          await fcm.sendToToken(message, token);
        } catch (err: any) {
          const code = err?.errorInfo?.code || err?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            stale.push(token);
          } else {
            console.error("FCM send failed:", code, err);
          }
        }
      })
    );

    if (stale.length) {
      await Promise.all(
        stale.map((t) =>
          env.DB.prepare(`DELETE FROM device_tokens WHERE token = ?`).bind(t).run()
        )
      );
    }
  } catch (err) {
    console.error("sendPushForNotification failed:", err);
  }
}
