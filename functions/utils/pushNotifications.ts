export type Env = {
  DB: D1Database;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
};

const textEncoder = new TextEncoder();

const base64UrlEncode = (input: ArrayBuffer | string) => {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = textEncoder.encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const clean = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getServiceAccount = (env: Env) => {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON secret missing");
  }
  const serviceAccount =
    typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === "string"
      ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Invalid Firebase service account JSON");
  }
  return serviceAccount;
};

const getAccessToken = async (env: Env) => {
  const serviceAccount = getServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    textEncoder.encode(unsignedJwt)
  );

  const jwt = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson: any = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`OAuth token failed: ${JSON.stringify(tokenJson)}`);
  }
  return tokenJson.access_token as string;
};

const stringifyData = (data?: Record<string, any>) => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
};

// 👈 This export matches your createNotification.ts
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
    const userId = Number(n.recipient_id);
    if (!userId) return;

    const projectId = env.FIREBASE_PROJECT_ID || getServiceAccount(env).project_id;
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID missing");

    // 1. Fetch tokens from device_tokens
    const tokensRes = await env.DB.prepare(`
      SELECT token FROM device_tokens
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 20
    `).bind(userId).all();

    const tokens = (tokensRes.results || [])
      .map((x: any) => String(x.token || "").trim())
      .filter(Boolean);

    if (tokens.length === 0) return;

    // 2. Fetch actor's real name
    let actorName = "Someone";
    try {
      const actor = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`)
        .bind(n.actor_id)
        .first<{ username: string | null }>();
      if (actor?.username) actorName = actor.username;
    } catch { }

    // 3. Format Title and Body
    let title = "Feathered Social";
    let body = n.message || "You have new activity";

    if (n.type === "discuss" || n.type === "comment") {
      title = "New Discussion";
      body = n.message ? `${actorName}: ${n.message}` : `${actorName} joined Discussion on your post`;
    } else if (n.type === "reply") {
      title = "New Reply";
      body = n.message ? `${actorName}: ${n.message}` : `${actorName} replied to you`;
    } else if (n.type === "follow") {
      title = "New Follower";
      body = `${actorName} started following you`;
    }

    const accessToken = await getAccessToken(env);
    const groupKey = n.group_key || `feathered_${n.type}`;

    // 4. Send to Firebase
    for (const token of tokens) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: stringifyData({
                type: n.type,
                groupKey: groupKey,
                entityId: n.entity_id || "",
                entityType: n.entity_type || "",
                actorId: String(n.actor_id),
              }),
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "feathered_social", // 👈 Matches Android Kotlin
                  sound: "default",
                  tag: groupKey, // 👈 Enables native grouping
                },
              },
            },
          }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        console.error("FCM Push Error:", errorData);
      }
    }
  } catch (err) {
    console.error("sendPushForNotification failed:", err);
  }
}
