export type Env = {
  DB: D1Database;
  FCM_PROJECT_ID: string;
  FCM_CLIENT_EMAIL: string;
  FCM_PRIVATE_KEY: string;
};

const base64Url = (input: ArrayBuffer | string) => {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);

  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const importPrivateKey = async (privateKeyPem: string) => {
  const pem = privateKeyPem
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
};

const getAccessToken = async (env: Env) => {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };

  const claim = {
    iss: env.FCM_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;

  const key = await importPrivateKey(env.FCM_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error_description || "FCM auth failed");

  return data.access_token as string;
};

// 👈 This is the export that createNotification.ts is looking for
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
    // 1. Get tokens from device_tokens (not push_tokens)
    const tokensRes = await env.DB.prepare(`
      SELECT token FROM device_tokens
      WHERE user_id = ?
    `).bind(n.recipient_id).all();

    const tokens = (tokensRes.results || [])
      .map((r: any) => String(r.token || "").trim())
      .filter(Boolean);

    if (!tokens.length) return;

    // 2. Fetch actor name
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

    const groupKey = n.group_key || `feathered_${n.type}`;
    const accessToken = await getAccessToken(env);

    for (const token of tokens) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
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
              data: {
                type: n.type,
                groupKey: groupKey,
                entityId: n.entity_id || "",
                entityType: n.entity_type || "",
                actorId: String(n.actor_id),
              },
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "feathered_social", // 👈 Matches your Android app
                  sound: "default",
                  tag: groupKey, // 👈 Allows Android to group them natively
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
