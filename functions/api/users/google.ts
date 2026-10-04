// functions/api/users/google.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { signJWT } from "./_jwt";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string; // This must match the variable name in Cloudflare
};

// ... (keep your existing cors and json helpers) ...

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // ... (keep your initial checks for DB, JWT_SECRET, GOOGLE_CLIENT_ID) ...

    const body: any = await request.json().catch(() => ({}));
    const idToken = String(body.id_token || "").trim();

    if (!idToken) return json({ error: "id_token is required" }, 400);

    // ✅ VERIFY with Google's public keys (RECOMMENDED)
    // Use the tokeninfo endpoint for quick verification without a library
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    
    if (!verifyRes.ok) {
      return json({ error: "Invalid Google token" }, 401);
    }
    const info: any = await verifyRes.json();

    // ✅ CRITICAL: Verify the token was issued for YOUR app
    if (info.aud !== env.GOOGLE_CLIENT_ID) {
      return json({ error: "Token audience mismatch" }, 401);
    }

    // ... (keep the rest of your logic: find/create user, signJWT, return token) ...
  } catch (e: any) {
    console.error("google login error:", e);
    return json({ error: "Server error" }, 500);
  }
};
