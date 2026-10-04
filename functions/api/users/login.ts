// functions/api/users/login.ts-
import type { PagesFunction } from "@cloudflare/workers-types";
import { signJWT } from "./_jwt";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const sha256Hex = async (password: string) => {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

    const password = String(body.password ?? "");

    if (!email || !password) return json({ error: "email and password are required" }, 400);

    if (!env.JWT_SECRET) return json({ error: "JWT_SECRET not configured" }, 500);

    const user = await env.DB
      .prepare("SELECT * FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (!user) return json({ error: "Invalid email or password" }, 401);

    // Optional: suspension check (keep if your table has these columns)
    const until = (user as any)?.suspended_until ? Date.parse((user as any).suspended_until) : 0;
    if (until && Number.isFinite(until) && until > Date.now()) {
      return json(
        {
          error: "Account suspended",
          suspended_until: (user as any).suspended_until,
          suspended_reason: (user as any).suspended_reason || null,
        },
        403
      );
    }

    const incomingHash = await sha256Hex(password);
    if (incomingHash !== (user as any).password_hash) {
      return json({ error: "Invalid email or password" }, 401);
    }

    // Return safe user fields (remove password_hash)
    const { password_hash, ...safeUser } = user as any;

    const token = await signJWT(
      { sub: safeUser.id, email: safeUser.email, role: safeUser.role || "user" },
      env.JWT_SECRET
    );

    return json({ success: true, token, user: safeUser }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message || "Server error") }, 500);
  }
};
