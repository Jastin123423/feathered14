// functions/api/users/signup.ts-
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

    const username = String(body.username ?? "")
      .trim()
      .replace(/\s+/g, " ");

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

    const password = String(body.password ?? "");

    const birth_date = body.birth_date ? String(body.birth_date) : null;
    const gender = body.gender ? String(body.gender) : null;
    const nationality = body.nationality ? String(body.nationality) : null;
    const location = body.location ? String(body.location) : null;

    if (!username || !email || !password) {
      return json({ error: "username, email and password are required" }, 400);
    }

    if (password.length < 6) {
      return json({ error: "Password must be at least 6 characters." }, 400);
    }

    if (!env.JWT_SECRET) {
      return json({ error: "JWT_SECRET not configured" }, 500);
    }

    const password_hash = await sha256Hex(password);

    // Insert user (handle UNIQUE via catch error message)
    const result = await env.DB
      .prepare(
        `
        INSERT INTO users (
          username, email, password_hash,
          birth_date, gender, nationality, location,
          joined_date, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `
      )
      .bind(username, email, password_hash, birth_date, gender, nationality, location)
      .run();

    const userId = result.meta.last_row_id;

    // Fetch inserted user
    const user = await env.DB
      .prepare(
        `SELECT id, username, email, profile_image_url, cover_image_url, bio, work, education,
                location, website, birth_date, gender, nationality, is_verified, role,
                joined_date, created_at
         FROM users WHERE id = ?`
      )
      .bind(userId)
      .first();

    if (!user) return json({ error: "User created but not found" }, 500);

    // Auto-login token
    const token = await signJWT(
      { sub: (user as any).id, email: (user as any).email, role: (user as any).role || "user" },
      env.JWT_SECRET
    );

    return json({ success: true, token, user }, 201);
  } catch (e: any) {
    const msg = String(e?.message || "");

    // D1 UNIQUE constraint message usually includes "UNIQUE"
    if (msg.toUpperCase().includes("UNIQUE")) {
      return json({ error: "Username or email already exists" }, 409);
    }

    return json({ error: msg || "Server error" }, 500);
  }
};
