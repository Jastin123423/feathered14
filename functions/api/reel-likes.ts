// functions/api/reel-likes.ts
import type { PagesFunction } from '@cloudflare/workers-types';
type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/reel-likes
 * Body: { reel_id, user_id, type? }
 * Returns: { success:true, liked:boolean, likes_count:number, type:string }
 *
 * ✅ Safe toggle like/unlike
 * ✅ Returns count for instant UI update
 * ✅ Keeps "type" (reaction) in DB
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const reel_id = toNum(body.reel_id, 0);
    const user_id = toNum(body.user_id, 0);
    const type = String(body.type || 'love');

    if (!reel_id || !user_id) {
      return json({ success: false, error: 'reel_id and user_id are required' }, 400);
    }

    // check if already reacted
    const existing = await env.DB.prepare(
      `SELECT id, type FROM reel_likes WHERE reel_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(reel_id, user_id)
      .first();

    let liked = false;
    let finalType: string | null = null;

    if ((existing as any)?.id) {
      // If same type -> unlike (toggle off). If different type -> update type.
      const existingType = String((existing as any)?.type || 'love');

      if (existingType === type) {
        await env.DB.prepare(`DELETE FROM reel_likes WHERE reel_id = ? AND user_id = ?`)
          .bind(reel_id, user_id)
          .run();
        liked = false;
        finalType = null;
      } else {
        await env.DB.prepare(`UPDATE reel_likes SET type = ? WHERE reel_id = ? AND user_id = ?`)
          .bind(type, reel_id, user_id)
          .run();
        liked = true;
        finalType = type;
      }
    } else {
      await env.DB.prepare(`INSERT INTO reel_likes (reel_id, user_id, type) VALUES (?, ?, ?)`)
        .bind(reel_id, user_id, type)
        .run();
      liked = true;
      finalType = type;
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM reel_likes WHERE reel_id = ?`
    )
      .bind(reel_id)
      .first();

    const likes_count = toNum((countRow as any)?.c, 0);

    return json({ success: true, liked, likes_count, type: finalType });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};
