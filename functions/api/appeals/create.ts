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
    const user_id = Number(body.user_id);
    const message = String(body.message || "").trim();

    if (!user_id || !message) {
      return Response.json({ error: "user_id and message are required" }, { status: 400, headers: cors });
    }

    await env.DB.prepare(
      `INSERT INTO user_appeals (user_id, message) VALUES (?, ?)`
    ).bind(user_id, message).run();

    return Response.json({ success: true }, { status: 201, headers: cors });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors });
  }
};
