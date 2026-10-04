type Env = {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
};

type PushPayload = {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, any>;
  image?: string;
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
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT secret missing");
  }

  const serviceAccount =
    typeof env.FIREBASE_SERVICE_ACCOUNT === "string"
      ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
      : env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Invalid Firebase service account JSON");
  }

  return serviceAccount;
};

const getAccessToken = async (env: Env) => {
  const serviceAccount = getServiceAccount(env);

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claimSet)
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
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

export const sendPushToUser = async (env: Env, payload: PushPayload) => {
  const userId = Number(payload.userId || 0);
  if (!userId) return { success: false, sent: 0, error: "Missing userId" };

  const projectId =
    env.FIREBASE_PROJECT_ID || getServiceAccount(env).project_id;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID missing");
  }

  const tokensRes = await env.DB.prepare(`
    SELECT token
    FROM push_tokens
    WHERE user_id = ?
      AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 20
  `)
    .bind(userId)
    .all();

  const tokens = (tokensRes.results || [])
    .map((x: any) => String(x.token || "").trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { success: true, sent: 0, message: "No active push tokens" };
  }

  const accessToken = await getAccessToken(env);

  let sent = 0;
  let failed = 0;

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
            notification: {
              title: payload.title || "UNERA",
              body: payload.body || "You have a new notification",
              ...(payload.image ? { image: payload.image } : {}),
            },
            data: stringifyData(payload.data),
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "unera_notifications",
                sound: "default",
                click_action: "FLUTTER_NOTIFICATION_CLICK",
              },
            },
          },
        }),
      }
    );

    const body: any = await res.json().catch(() => ({}));

    if (res.ok) {
      sent++;
      continue;
    }

    failed++;

    const errorText = JSON.stringify(body).toLowerCase();

    if (
      errorText.includes("unregistered") ||
      errorText.includes("registration-token-not-registered") ||
      errorText.includes("not found")
    ) {
      await env.DB.prepare(`
        UPDATE push_tokens
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE token = ?
      `)
        .bind(token)
        .run();
    }
  }

  return {
    success: true,
    sent,
    failed,
  };
};
