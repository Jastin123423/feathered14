// functions/api/users/_jwt.ts

const b64url = (input: ArrayBuffer | Uint8Array | string) => {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);

  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export async function signJWT(
  payload: Record<string, any>,
  secret: string,
  expiresInSec = 60 * 60 * 24 * 7 // 7 days
) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };

  const headerPart = b64url(JSON.stringify(header));
  const payloadPart = b64url(JSON.stringify(body));
  const data = `${headerPart}.${payloadPart}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}
