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
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fb;
};

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (ctx.request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const me = safeNum(ctx.request.headers.get("x-user-id"));
  if (!me) return json({ error: "Missing x-user-id" }, 401);

  const body = await ctx.request.json().catch(() => ({}));
  const callee_id = safeNum(body?.callee_id);
  const call_type = body?.call_type === "video" ? "video" : "voice";

  if (!callee_id) return json({ error: "Missing callee_id" }, 400);
  if (callee_id === me) return json({ error: "You cannot call yourself" }, 400);

  // Optional: reuse existing ringing call (prevents duplicates)
  const existing = await ctx.env.DB.prepare(
    `SELECT id FROM calls
     WHERE caller_id=? AND callee_id=? AND status='ringing'
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(me, callee_id).first<any>();

  if (existing?.id) {
    return json({ ok: true, call_id: String(existing.id), call_type, reused: true });
  }

  const call_id = newId();

  await ctx.env.DB.prepare(
    `INSERT INTO calls (id, caller_id, callee_id, call_type, status)
     VALUES (?, ?, ?, ?, 'ringing')`
  )
    .bind(call_id, me, callee_id, call_type)
    .run();

  // ✅ NO call_signals insert here.
  // Frontend will send the REAL SDP "offer" via /api/calls/signal

  return json({ ok: true, call_id, call_type });
};
