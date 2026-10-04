export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors() });

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  try {
    const episodeId = Number((params as any)?.id);
    if (!episodeId) return Response.json({ error: "Invalid episode id" }, { status: 400, headers: cors() });

    const body = await request.json().catch(() => ({} as any));
    const user_id = body?.user_id ?? null;

    await env.DB.prepare(
      `INSERT INTO podcast_episode_plays (episode_id, user_id) VALUES (?, ?)`
    ).bind(episodeId, user_id).run();

    await env.DB.prepare(
      `UPDATE podcasts SET plays_count = COALESCE(plays_count, 0) + 1 WHERE id = ?`
    ).bind(episodeId).run();

    const row = await env.DB.prepare(
      `SELECT plays_count FROM podcasts WHERE id = ?`
    ).bind(episodeId).first();

    return Response.json({ success: true, plays_count: Number((row as any)?.plays_count || 0) }, { headers: cors() });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors() });
  }
};
