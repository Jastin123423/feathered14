const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const creator_id = Number(body.creator_id);
    const title = String(body.title ?? "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const audio_url = String(body.audio_url ?? "").trim();
    const cover_url = body.cover_url ? String(body.cover_url).trim() : null;

    if (!creator_id || !title || !audio_url) {
      return Response.json({ error: "Missing required fields" }, { status: 400, headers: cors });
    }

    const result = await env.DB.prepare(`
      INSERT INTO podcasts (creator_id, title, description, audio_url, cover_url)
      VALUES (?, ?, ?, ?, ?)
    `)
      .bind(creator_id, title, description, audio_url, cover_url)
      .run();

    return Response.json(
      { success: true, podcast_id: result.meta.last_row_id },
      { status: 200, headers: cors }
    );
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || "Server error" }, { status: 500, headers: cors });
  }
};

export const onRequestGet: PagesFunction = async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT * FROM podcasts ORDER BY created_at DESC").all();
  return Response.json(results || [], { status: 200, headers: cors });
};
