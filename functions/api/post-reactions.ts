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
    const post_id = Number(body.post_id);
    const user_id = Number(body.user_id);
    const type = String(body.type || "like");

    if (!post_id || !user_id) {
      return Response.json({ error: "post_id and user_id are required" }, { status: 400, headers: cors });
    }

    // toggle behavior: if same reaction exists -> remove, else upsert
    const existing = await env.DB.prepare(
      `SELECT id, type FROM post_reactions WHERE post_id = ? AND user_id = ?`
    ).bind(post_id, user_id).first();

    if (existing && String((existing as any).type) === type) {
      await env.DB.prepare(`DELETE FROM post_reactions WHERE id = ?`).bind((existing as any).id).run();
      return Response.json({ success: true, action: "removed" }, { status: 200, headers: cors });
    }

    if (existing) {
      await env.DB.prepare(`UPDATE post_reactions SET type = ?, created_at = datetime('now') WHERE id = ?`)
        .bind(type, (existing as any).id)
        .run();
      return Response.json({ success: true, action: "updated", type }, { status: 200, headers: cors });
    }

    await env.DB.prepare(
      `INSERT INTO post_reactions (post_id, user_id, type) VALUES (?, ?, ?)`
    ).bind(post_id, user_id, type).run();

    return Response.json({ success: true, action: "added", type }, { status: 201, headers: cors });
  } catch (err: any) {
    return Response.json({ error: "Backend crash", message: String(err?.message ?? err) }, { status: 500, headers: cors });
  }
};
