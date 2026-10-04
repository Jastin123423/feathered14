// functions/api/users/login-phone.ts
// body: { phone, password, nationality }
// - If user doesn't exist → create with password_hash + nationality
// - If user exists → verify password with PBKDF2

import type { PagesFunction } from "@cloudflare/workers-types";
import { signJWT } from "./_jwt";
import { hashPassword, verifyPassword } from "./_password";

type Env = { DB: D1Database; JWT_SECRET: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ error: "DB binding missing" }, 500);
    if (!env.JWT_SECRET) return json({ error: "JWT_SECRET not configured" }, 500);

    const body: any = await request.json().catch(() => ({}));
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");
    const nationality = String(body.nationality || "").trim() || null;

    if (!phone || !password) return json({ error: "phone and password are required" }, 400);
    if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

    let user: any = await env.DB
      .prepare(`SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1`)
      .bind(phone, `${phone}@phone.local`)
      .first();

    if (user) {
      // Verify existing user
      const ok = await verifyPassword(password, user.password_hash || "");
      if (!ok) return json({ error: "Invalid phone or password" }, 401);
    } else {
      // Create new
      const password_hash = await hashPassword(password);
      const result = await env.DB
        .prepare(
          `INSERT INTO users (username, email, password_hash, nationality, joined_date, created_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
        .bind(phone, `${phone}@phone.local`, password_hash, nationality)
        .run();

      user = await env.DB
        .prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`)
        .bind(result.meta.last_row_id)
        .first();
    }

    if (!user) return json({ error: "User not found" }, 500);

    const { password_hash, ...safeUser } = user;
    const token = await signJWT(
      { sub: safeUser.id, email: safeUser.email, role: safeUser.role || "user" },
      env.JWT_SECRET
    );

    return json({ success: true, token, user: safeUser }, 200);
  } catch (e: any) {
    console.error("login-phone error:", e);
    return json({ error: "Server error" }, 500);
  }
};
