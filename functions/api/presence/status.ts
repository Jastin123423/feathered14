// functions/api/presence/status.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("user_id"));

    if (!userId) {
      return json({ success: false, error: "user_id required" }, 400);
    }

    const row = await env.DB.prepare(`
      SELECT last_seen_at, online_until
      FROM user_presence
      WHERE user_id = ?
    `)
      .bind(userId)
      .first();

    if (!row) {
      return json({
        user_id: userId,
        online: false,
        last_seen_at: null,
      });
    }

    const now = Date.now();
    const onlineUntil = row.online_until
      ? new Date(row.online_until).getTime()
      : 0;

    const online = onlineUntil > now;

    return json({
      user_id: userId,
      online,
      last_seen_at: row.last_seen_at || null,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
