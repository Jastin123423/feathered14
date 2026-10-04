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
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fb;
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (ctx.request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const me = toInt(ctx.request.headers.get("x-user-id"));
  if (!me) return json({ error: "Missing x-user-id" }, 401);

  const r = await ctx.env.DB.prepare(
    `
    SELECT
      c.id,
      c.caller_id,
      c.callee_id,
      c.call_type,
      c.status,
      c.created_at,

      -- ✅ caller details from users table
      COALESCE(NULLIF(TRIM(u.name), ''), u.username, 'User') AS caller_name,
      u.username AS caller_username,
      u.profile_image_url AS caller_avatar,
      u.profile_image_url AS caller_profile_image_url

    FROM calls c
    LEFT JOIN users u ON u.id = c.caller_id
    WHERE c.callee_id = ? AND c.status = 'ringing'
    ORDER BY c.created_at DESC
    LIMIT 1
    `
  )
    .bind(me)
    .first();

  return json({ ok: true, call: r || null });
};
