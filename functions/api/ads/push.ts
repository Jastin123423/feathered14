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
    const { results: tokens } = await env.DB.prepare(
      `SELECT token FROM device_tokens WHERE user_id = ?`
    )
      .bind(n.recipient_id)
      .all<{ token: string }>();

    if (!tokens || tokens.length === 0) {
      console.log(`No device tokens found for user ${n.recipient_id}`);
      return;
    }

    let actorName: string | null = null;
    try {
      const actor = await env.DB.prepare(
        `SELECT name FROM users WHERE id = ? LIMIT 1`
      )
        .bind(n.actor_id)
        .first<{ name: string | null }>();
      actorName = actor?.name ?? null;
    } catch { }

    const title = `New ${n.type}`;
    const body = n.message || `${actorName || 'Someone'} interacted with your post`;
    const groupKey = n.group_key || `feathered_${n.type}`;

    const fcm = getFcm(env);

    // Build a clean data payload (Firebase rejects nulls)
    const dataPayload: Record<string, string> = {
      type: n.type,
      groupKey: groupKey,
      actorId: String(n.actor_id),
    };
    if (n.entity_type) dataPayload.entityType = n.entity_type;
    if (n.entity_id) dataPayload.entityId = n.entity_id;
    if (n.parent_id) dataPayload.parentId = n.parent_id;

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

    const stale: string[] = [];
    await Promise.all(
      tokens.map(async ({ token }) => {
        try {
          console.log(`Attempting to send to token: ${token.substring(0, 10)}...`);
          await fcm.sendToToken(message, token);
          console.log(`Successfully sent to token: ${token.substring(0, 10)}...`);
        } catch (err: any) {
          const code = err?.errorInfo?.code || err?.code;
          console.error("FCM send failed:", code, err);
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            stale.push(token);
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
