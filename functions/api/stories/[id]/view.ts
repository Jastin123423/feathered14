// functions/api/stories/[id]/view.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);

    const body = await request.json().catch(() => ({} as any));
    const userId = toInt(body.user_id, 0);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const exists = await env.DB.prepare(`SELECT id FROM stories WHERE id = ? LIMIT 1`)
      .bind(storyId)
      .first();
    if (!exists?.id) return json({ success: false, error: "Story not found" }, 404);

    // ✅ Pre-check to know if it was first time
    const already = await env.DB.prepare(
      `SELECT 1 as ok FROM story_views WHERE story_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(storyId, userId)
      .first();

    // ✅ Insert or refresh created_at (treat created_at as last viewed time)
    await env.DB.prepare(`
      INSERT INTO story_views (story_id, user_id, created_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(story_id, user_id)
      DO UPDATE SET created_at = datetime('now')
    `)
      .bind(storyId, userId)
      .run();

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as views_count FROM story_views WHERE story_id = ?`
    )
      .bind(storyId)
      .first();

    return json({
      success: true,
      viewed: !already, // true only if first time
      views_count: Number((countRow as any)?.views_count ?? 0),
    });
  } catch (err: any) {
    return json(
      { success: false, error: "Backend crash", message: String(err?.message ?? err) },
      500
    );
  }
};
