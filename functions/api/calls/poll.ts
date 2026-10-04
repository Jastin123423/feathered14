// functions/api/calls/poll.ts
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
const safeStr = (v: any) => (typeof v === "string" ? v : "");

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (ctx.request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(ctx.request.url);
  const me = toInt(ctx.request.headers.get("x-user-id"));
  if (!me) return json({ error: "Missing x-user-id" }, 401);

  const call_id = safeStr(url.searchParams.get("call_id"));
  const after = toInt(url.searchParams.get("after"), 0);
  if (!call_id) return json({ error: "Missing call_id" }, 400);

  // ✅ Ensure requester is part of the call (prevents leaking call events)
  const callRow = await ctx.env.DB.prepare(
    `SELECT caller_id, callee_id FROM calls WHERE id=? LIMIT 1`
  )
    .bind(call_id)
    .first<any>();

  if (!callRow) return json({ error: "Call not found" }, 404);

  const caller = toInt(callRow.caller_id);
  const callee = toInt(callRow.callee_id);
  if (me !== caller && me !== callee) return json({ error: "Forbidden" }, 403);

  const res = await ctx.env.DB.prepare(
    `SELECT id, call_id, from_user_id, to_user_id, type, payload, created_at
     FROM call_signals
     WHERE call_id=? AND to_user_id=? AND id>?
     ORDER BY id ASC
     LIMIT 50`
  )
    .bind(call_id, me, after)
    .all();

  const rows = (res.results || []).map((r: any) => {
    let payloadObj: any = null;
    if (r.payload) {
      try {
        payloadObj = JSON.parse(r.payload);
      } catch {
        payloadObj = null;
      }
    }
    return {
      ...r,
      payload: payloadObj,
    };
  });

  const lastId = rows.length ? rows[rows.length - 1].id : after;

  return json({ ok: true, events: rows, cursor: lastId });
};
