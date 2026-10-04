import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));
    const admin_id = Number(body.admin_id);
    const user_id = Number(body.user_id);
    const make = String(body.make ?? "moderator"); // "moderator" | "user"

    if (!admin_id || !user_id) {
      return Response.json({ error: "admin_id and user_id are required" }, { status: 400, headers: cors });
    }

    // ✅ Check admin role from DB (never trust frontend)
    const admin = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(admin_id).first();
    if (!admin || admin.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }

    // prevent changing admins via this endpoint
    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(user_id).first();
    if (!target) return Response.json({ error: "User not found" }, { status: 404, headers: cors });
    if (target.role === "admin") {
      return Response.json({ error: "Cannot change admin role" }, { status: 403, headers: cors });
    }

    const nextRole = make === "moderator" ? "moderator" : "user";

    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(nextRole, user_id).run();

    return Response.json({ success: true, user_id, role: nextRole }, { status: 200, headers: cors });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors });
  }
};
