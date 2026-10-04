// functions/api/calls/signal.ts
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
const safeStr = (v: any) => (typeof v === "string" ? v : "");

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (ctx.request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const me = safeNum(ctx.request.headers.get("x-user-id"));
  if (!me) return json({ error: "Missing x-user-id" }, 401);

  const body = await ctx.request.json().catch(() => ({}));
  const call_id = safeStr(body?.call_id);
  const to_user_id = safeNum(body?.to_user_id);
  const type = safeStr(body?.type);
  const payload = body?.payload ?? null;

  const allowed = new Set(["offer", "answer", "ice", "accept", "decline", "hangup"]);
  if (!call_id || !to_user_id || !allowed.has(type)) {
    return json({ error: "Bad request" }, 400);
  }

  // ✅ Verify call exists and sender is a participant
  const callRow = await ctx.env.DB.prepare(
    `SELECT caller_id, callee_id, status FROM calls WHERE id=? LIMIT 1`
  )
    .bind(call_id)
    .first<any>();

  if (!callRow) return json({ error: "Call not found" }, 404);

  const caller = safeNum(callRow.caller_id);
  const callee = safeNum(callRow.callee_id);

  // Only caller/callee can signal
  if (me !== caller && me !== callee) return json({ error: "Forbidden" }, 403);

  // Only signal the other participant
  const other = me === caller ? callee : caller;
  if (to_user_id !== other) return json({ error: "Bad to_user_id" }, 400);

  const status = safeStr(callRow.status);

  // ✅ Block signaling after final states (except hangup)
  if ((status === "ended" || status === "declined" || status === "missed") && type !== "hangup") {
    return json({ error: "Call already ended" }, 409);
  }

  // ✅ Enforce sensible transitions
  // - accept/decline only valid while ringing
  if ((type === "accept" || type === "decline") && status !== "ringing") {
    return json({ error: "Call is not ringing" }, 409);
  }

  // - offer/answer/ice should not happen after declined/missed/ended (already blocked above),
  //   but also avoid offer if call is already accepted
  if (type === "offer" && status !== "ringing") {
    // allow re-offer only while ringing (helps avoid weird retries after accept)
    return json({ error: "Cannot offer in this state" }, 409);
  }

  // Store signal event (always store first for debugging / history)
  await ctx.env.DB.prepare(
    `INSERT INTO call_signals (call_id, from_user_id, to_user_id, type, payload)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(call_id, me, to_user_id, type, payload ? JSON.stringify(payload) : null)
    .run();

  // ✅ Update call status for key types (state machine)
  if (type === "accept") {
    // ringing -> accepted
    await ctx.env.DB.prepare(
      `UPDATE calls SET status='accepted', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ringing'`
    )
      .bind(call_id)
      .run();
  }

  if (type === "decline") {
    // ringing -> declined
    await ctx.env.DB.prepare(
      `UPDATE calls SET status='declined', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ringing'`
    )
      .bind(call_id)
      .run();
  }

  if (type === "hangup") {
    // ✅ IMPORTANT FIX:
    // - ringing -> missed   (this stops your /incoming from returning it forever)
    // - accepted -> ended
    // - anything else -> ended
    await ctx.env.DB.prepare(
      `UPDATE calls
       SET status = CASE
         WHEN status='ringing' THEN 'missed'
         WHEN status='accepted' THEN 'ended'
         ELSE 'ended'
       END,
       updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    )
      .bind(call_id)
      .run();
  }

  return json({ ok: true });
};
