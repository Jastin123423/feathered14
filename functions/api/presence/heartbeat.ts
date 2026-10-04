// functions/api/presence/heartbeat.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));

    const userId =
      Number(body?.user_id) ||
      Number(request.headers.get("x-user-id"));

    if (!userId) {
      return json({ success: false, error: "user_id required" }, 400);
    }

    const now = new Date();
    const onlineUntil = new Date(now.getTime() + 35000); // 35 seconds online window

    await env.DB.prepare(`
      INSERT INTO user_presence (user_id, last_seen_at, online_until)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        online_until = excluded.online_until
    `)
      .bind(
        userId,
        now.toISOString(),
        onlineUntil.toISOString()
      )
      .run();

    return json({
      success: true,
      user_id: userId,
      online_until: onlineUntil.toISOString(),
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
