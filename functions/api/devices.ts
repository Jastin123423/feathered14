import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};
const json = (d: any, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

// POST /api/devices  { token, platform? }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    if (!userId) return json({ error: "Missing user id" }, 400);

    const { token, platform } = (await request.json()) as {
      token?: string;
      platform?: string;
    };
    if (!token) return json({ error: "Missing token" }, 400);

    await env.DB.prepare(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES (?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         user_id    = excluded.user_id,
         platform   = excluded.platform,
         updated_at = unixepoch()`
    )
      .bind(userId, token, platform || "android")
      .run();

    return json({ success: true });
  } catch (err) {
    console.error("register device failed:", err);
    return json({ error: "Failed to register device" }, 500);
  }
};

// DELETE /api/devices?token=...
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    if (!userId) return json({ error: "Missing user id" }, 400);

    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "Missing token" }, 400);

    await env.DB.prepare(
      `DELETE FROM device_tokens WHERE token = ? AND user_id = ?`
    )
      .bind(token, userId)
      .run();

    return json({ success: true });
  } catch (err) {
    console.error("unregister device failed:", err);
    return json({ error: "Failed to unregister device" }, 500);
  }
};
