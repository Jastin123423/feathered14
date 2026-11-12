export type Env = {
  DB: D1Database;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID?: string;
};

const textEncoder = new TextEncoder();

const base64UrlEncode = (input: ArrayBuffer | string) => {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = textEncoder.encode(input);
  else bytes = new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string) => {
  const clean = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const getServiceAccount = (env: Env) => {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON secret missing");
  const sa = typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === "string" ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) : env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return sa;
};

const getAccessToken = async (env: Env) => {
  const sa = getServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, textEncoder.encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`OAuth token failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
};

const stringifyData = (data?: Record<string, any>) => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
};

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
  console.log("🚀 [PUSH 1/6] sendPushForNotification called for recipient:", n.recipient_id);
  try {
    const projectId = env.FIREBASE_PROJECT_ID || getServiceAccount(env).project_id;
    console.log("🚀 [PUSH 2/6] Project ID:", projectId);

    const tokensRes = await env.DB.prepare(`SELECT token FROM device_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`).bind(n.recipient_id).all();
    const tokens = (tokensRes.results || []).map((x: any) => String(x.token || "").trim()).filter(Boolean);
    console.log("🚀 [PUSH 3/6] Tokens found:", tokens.length);

    if (tokens.length === 0) {
      console.log("🚨 [PUSH] ABORT: No tokens for user", n.recipient_id);
      return;
    }

    let actorName = "Someone";
    try {
      const actor = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(n.actor_id).first<{ username: string | null }>();
      if (actor?.username) actorName = actor.username;
    } catch (e) { console.log("🚨 [PUSH] Actor lookup failed:", e); }

    let title = "Feathered Social";
    let body = n.message || "You have new activity";
    if (n.type === "discuss" || n.type === "comment") {
      title = "New Discussion";
      body = n.message ? `${actorName}: ${n.message}` : `${actorName} joined Discussion on your post`;
    } else if (n.type === "reply") {
      title = "New Reply";
      body = n.message ? `${actorName}: ${n.message}` : `${actorName} replied to you`;
    }

    console.log("🚀 [PUSH 4/6] Getting OAuth token...");
    const accessToken = await getAccessToken(env);
    console.log("✅ [PUSH 5/6] Got OAuth token!");

    const groupKey = n.group_key || `feathered_${n.type}`;

    for (const token of tokens) {
      console.log("🚀 [PUSH 6/6] Sending to token:", token.substring(0, 20) + "...");
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: stringifyData({ type: n.type, groupKey, entityId: n.entity_id || "", entityType: n.entity_type || "", actorId: String(n.actor_id) }),
            android: {
              priority: "HIGH",
              notification: { channel_id: "feathered_social", sound: "default", tag: groupKey },
            },
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("🚨 [PUSH] FCM rejected:", errorData);
      } else {
        console.log("✅ [PUSH] Delivered to:", token.substring(0, 20) + "...");
      }
    }
  } catch (err) {
    console.error("🚨 [PUSH] FATAL:", err);
  }
}
