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

/**
 * Human-friendly title/body per notification type.
 * Matches the shape of your notifications row.
 */
function buildText(
  type: string,
  message: string | null,
  actorName: string | null
) {
  const who = actorName || "Someone";
  switch (type) {
    case "like":
      return { title: "New like", body: `${who} liked your post` };
    case "comment":
      return { title: "New comment", body: message || `${who} commented on your post` };
    case "reply":
      return { title: "New reply", body: message || `${who} replied to your comment` };
    case "follow":
      return { title: "New follower", body: `${who} started following you` };
    case "share":
      return { title: "New share", body: `${who} shared your post` };
    default:
      return { title: "Feathered", body: message || "You have new activity" };
  }
}

/**
 * Send a push for a single notification row to every device token
 * belonging to `recipient_id`. Fire-and-forget safe (never throws).
 */
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
    // 1. Look up recipient's device tokens
    const { results: tokens } = await env.DB.prepare(
      `SELECT token FROM device_tokens WHERE user_id = ?`
    )
      .bind(n.recipient_id)
      .all<{ token: string }>();

    if (!tokens || tokens.length === 0) return;

    // 2. Look up actor's display name (best-effort)
    let actorName: string | null = null;
    try {
      const actor = await env.DB.prepare(
        `SELECT name FROM users WHERE id = ? LIMIT 1`
      )
        .bind(n.actor_id)
        .first<{ name: string | null }>();
      actorName = actor?.name ?? null;
    } catch {
      /* users table schema may differ — non-fatal */
    }

    const { title, body } = buildText(n.type, n.message, actorName);

    // 3. groupKey: prefer the row's group_key, else fall back to type
    const groupKey = n.group_key || `feathered_${n.type}`;

    const fcm = getFcm(env);

    // 4. Build the FCM message.
    //    - notification payload -> shown by OS even if app is killed
    //    - data payload         -> read by FirebaseMessagingService for navigation + grouping
    const message = {
      notification: { title, body },
      data: {
        type: n.type,
        groupKey,
        entityType: n.entity_type ?? "",
        entityId: n.entity_id ?? "",
        parentId: n.parent_id ?? "",
        actorId: String(n.actor_id),
      },
      android: {
        priority: "high" as const,
        notification: {
          channel_id: "feathered_social",
          click_action: "OPEN_NOTIFICATION",
          // OS-level tag: notifications with the same tag are grouped
          tag: groupKey,
        },
      },
    };

    // 5. Fan out to all tokens
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

    // 6. Prune dead tokens
    if (stale.length) {
      await Promise.all(
        stale.map((t) =>
          env.DB.prepare(`DELETE FROM device_tokens WHERE token = ?`)
            .bind(t)
            .run()
        )
      );
    }
  } catch (err) {
    // Push failures must never break the notification insert
    console.error("sendPushForNotification failed:", err);
  }
}
