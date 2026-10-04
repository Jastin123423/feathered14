import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const isModOrAdmin = (role: any) => role === "admin" || role === "moderator";

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));
    const actor_id = Number(body.actor_id);
    const user_id = Number(body.user_id);

    if (!actor_id || !user_id) {
      return Response.json({ error: "actor_id and user_id are required" }, { status: 400, headers: cors });
    }

    const actor = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(actor_id).first();
    if (!actor || !isModOrAdmin(actor.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(user_id).first();
    if (!target) return Response.json({ error: "User not found" }, { status: 404, headers: cors });

    // moderators cannot unsuspend admins (rare case)
    if (actor.role === "moderator" && target.role === "admin") {
      return Response.json({ error: "Cannot modify admin" }, { status: 403, headers: cors });
    }

    await env.DB.prepare(
      `UPDATE users
       SET suspended_until = NULL, suspended_reason = NULL, suspended_by = NULL, suspended_at = NULL
       WHERE id = ?`
    ).bind(user_id).run();

    return Response.json({ success: true, user_id }, { status: 200, headers: cors });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors });
  }
};
