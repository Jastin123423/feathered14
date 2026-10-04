import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt(params.id, 0);
    const url = new URL(request.url);
    const queryUserId = toInt(url.searchParams.get("user_id"), 0);
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const body = await request.json().catch(() => ({} as any));
    const bodyUserId = toInt(body?.user_id, 0);
    const userId = queryUserId || headerUserId || bodyUserId;

    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const story = await env.DB
      .prepare(`SELECT id, user_id FROM stories WHERE id = ? LIMIT 1`)
      .bind(storyId)
      .first();

    if (!story) {
      return json({ success: false, error: "Story not found" }, 404);
    }

    if (Number((story as any).user_id) !== userId) {
      return json({ success: false, error: "Not allowed to delete this story" }, 403);
    }

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM story_views WHERE story_id = ?`).bind(storyId),
      env.DB.prepare(`DELETE FROM story_reactions WHERE story_id = ?`).bind(storyId),
      env.DB.prepare(`DELETE FROM stories WHERE id = ?`).bind(storyId),
    ]);

    return json({ success: true, deleted: true, id: storyId });
  } catch (err: any) {
    return json(
      { success: false, error: "Backend crash", message: String(err?.message ?? err) },
      500
    );
  }
};
