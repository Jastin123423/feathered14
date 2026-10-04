export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors() });

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const onRequestGet: PagesFunction = async ({ env, params }) => {
  try {
    const userId = Number((params as any)?.id);
    if (!userId) return Response.json({ error: "Invalid user id" }, { status: 400, headers: cors() });

    const songsRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(plays_count,0)),0) AS total FROM songs WHERE uploader_id = ?`
    ).bind(userId).first();

    const podcastsRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(COALESCE(plays_count,0)),0) AS total FROM podcasts WHERE creator_id = ? OR uploader_id = ?`
    ).bind(userId, userId).first();

    const total =
      Number((songsRow as any)?.total || 0) +
      Number((podcastsRow as any)?.total || 0);

    return Response.json({ success: true, total_plays: total }, { headers: cors() });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors() });
  }
};
