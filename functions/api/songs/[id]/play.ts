export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors() });

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  try {
    const songId = Number((params as any)?.id);
    if (!songId) return Response.json({ error: "Invalid song id" }, { status: 400, headers: cors() });

    const body = await request.json().catch(() => ({} as any));
    const user_id = body?.user_id ?? null;

    // 1) Insert event (optional but recommended)
    await env.DB.prepare(
      `INSERT INTO song_plays (song_id, user_id) VALUES (?, ?)`
    ).bind(songId, user_id).run();

    // 2) Increment counter
    await env.DB.prepare(
      `UPDATE songs SET plays_count = COALESCE(plays_count, 0) + 1 WHERE id = ?`
    ).bind(songId).run();

    // 3) Return new count
    const row = await env.DB.prepare(
      `SELECT plays_count FROM songs WHERE id = ?`
    ).bind(songId).first();

    return Response.json({ success: true, plays_count: Number((row as any)?.plays_count || 0) }, { headers: cors() });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors() });
  }
};
