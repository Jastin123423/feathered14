type Env = {
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

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claim = {
    iss: env.FCM_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned =
    `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;

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

export const sendPushToUser = async (
  env: Env,
  userId: number,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
) => {
  const tokensRes = await env.DB.prepare(`
    SELECT token FROM push_tokens
    WHERE user_id = ? AND is_active = 1
  `).bind(userId).all();

  const tokens = (tokensRes.results || [])
    .map((r: any) => String(r.token || "").trim())
    .filter(Boolean);

  if (!tokens.length) return { sent: 0 };

  const accessToken = await getAccessToken(env);

  let sent = 0;

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
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data || {},
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "unera_notifications",
                sound: "default",
              },
            },
          },
        }),
      }
    );

    if (res.ok) {
      sent++;
    } else if (res.status === 404 || res.status === 400) {
      await env.DB.prepare(`
        UPDATE push_tokens SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE token = ?
      `).bind(token).run();
    }
  }

  return { sent };
};
