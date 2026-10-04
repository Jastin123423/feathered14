import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  DB: D1Database;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toInt = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const cleanStr = (v: any) => String(v ?? "").trim();

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing" }, 500);
    }

    const body = await request.json().catch(() => ({} as any));

    const userId = toInt(body.user_id);
    const token = cleanStr(body.token || body.fcm_token);
    const platform = cleanStr(body.platform || "android") || "android";
    const deviceId = cleanStr(body.device_id || body.deviceId || "");

    if (!userId) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    if (!token) {
      return json({ success: false, error: "token is required" }, 400);
    }

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT DEFAULT 'android',
        device_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.DB.prepare(`
      INSERT INTO push_tokens
        (user_id, token, platform, device_id, is_active, updated_at)
      VALUES
        (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET
        user_id = excluded.user_id,
        platform = excluded.platform,
        device_id = excluded.device_id,
        is_active = 1,
        updated_at = CURRENT_TIMESTAMP
    `)
      .bind(userId, token, platform, deviceId || null)
      .run();

    return json({
      success: true,
      message: "Push token registered",
    });
  } catch (err: any) {
    return json(
      {
        success: false,
        error: "Backend crash",
        message: String(err?.message ?? err),
      },
      500
    );
  }
};
