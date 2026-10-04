import type { PagesFunction } from '@cloudflare/workers-types';

type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const pickFirst = (...values: any[]) => {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
};

const safeBool = (v: any) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return false;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const getReelById = async (env: Env, reelId: number) => {
  return env.DB.prepare(
    `
    SELECT
      r.id,
      r.user_id,
      r.video_url,
      r.thumbnail_url,
      r.caption,
      r.song_name,
      r.audio_url,
      r.audio_start,
      r.audio_end,
      r.visibility,
      r.location,
      r.views,
      r.shares,
      r.song_id,
      r.sound_id,
      r.sound_key,
      r.created_at,
      u.name,
      u.username,
      u.profile_image_url,
      u.is_verified
    FROM reels r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.id = ?
    LIMIT 1
    `
  )
    .bind(reelId)
    .first();
};

/**
 * GET /api/reels/:id
 */
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  try {
    const reelId = toNum(params?.id, 0);
    if (!reelId) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    const row = await getReelById(env, reelId);
    if (!row) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    return json({
      success: true,
      reel: {
        id: toNum((row as any).id, 0),
        user_id: toNum((row as any).user_id, 0),
        video_url: String((row as any).video_url || ''),
        thumbnail_url: pickFirst((row as any).thumbnail_url),
        caption: pickFirst((row as any).caption),
        song_name: pickFirst((row as any).song_name, 'Original Sound'),
        audio_url: pickFirst((row as any).audio_url),
        audio_start: toNum((row as any).audio_start, 0),
        audio_end: toNum((row as any).audio_end, 0),
        visibility: String((row as any).visibility || 'public'),
        location: pickFirst((row as any).location),
        views: toNum((row as any).views, 0),
        shares: toNum((row as any).shares, 0),
        song_id: (row as any).song_id == null ? null : toNum((row as any).song_id, 0),
        sound_id: (row as any).sound_id == null ? null : toNum((row as any).sound_id, 0),
        sound_key: pickFirst((row as any).sound_key),
        created_at: (row as any).created_at,
        author_name: pickFirst((row as any).name, (row as any).username, 'User'),
        username: pickFirst((row as any).username),
        avatar_url: pickFirst((row as any).profile_image_url),
        verified: safeBool((row as any).is_verified),
      },
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};

/**
 * PATCH /api/reels/:id
 * Body: { user_id?, caption?, visibility?, location?, thumbnail_url? }
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, params, env }) => {
  try {
    const reelId = toNum(params?.id, 0);
    if (!reelId) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    const body = await request.json().catch(() => ({} as any));
    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!userId) {
      return json({ success: false, error: 'user_id is required' }, 400);
    }

    const reel = await env.DB.prepare(
      `SELECT id, user_id FROM reels WHERE id = ? LIMIT 1`
    ).bind(reelId).first();

    if (!reel) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    if (toNum((reel as any).user_id, 0) !== userId) {
      return json({ success: false, error: 'Not allowed to edit this reel' }, 403);
    }

    const caption = body.caption !== undefined ? toText(body.caption) : undefined;
    const location = body.location !== undefined ? toText(body.location) : undefined;
    const thumbnail_url = body.thumbnail_url !== undefined ? toText(body.thumbnail_url) : undefined;

    let visibility: string | undefined = undefined;
    if (body.visibility !== undefined) {
      const raw = String(body.visibility ?? '').trim().toLowerCase();
      visibility = ['public', 'followers', 'private'].includes(raw) ? raw : 'public';
    }

    const updates: string[] = [];
    const binds: any[] = [];

    if (caption !== undefined) {
      updates.push(`caption = ?`);
      binds.push(caption);
    }

    if (location !== undefined) {
      updates.push(`location = ?`);
      binds.push(location);
    }

    if (thumbnail_url !== undefined) {
      updates.push(`thumbnail_url = ?`);
      binds.push(thumbnail_url);
    }

    if (visibility !== undefined) {
      updates.push(`visibility = ?`);
      binds.push(visibility);
    }

    if (!updates.length) {
      return json({ success: false, error: 'Nothing to update' }, 400);
    }

    binds.push(reelId);

    await env.DB.prepare(
      `UPDATE reels SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    const updated = await getReelById(env, reelId);

    return json({
      success: true,
      reel: updated,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};

/**
 * DELETE /api/reels/:id
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, params, env }) => {
  try {
    const reelId = toNum(params?.id, 0);
    if (!reelId) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const url = new URL(request.url);
    const queryUserId = toNum(url.searchParams.get('user_id'), 0);
    const userId = headerUserId || queryUserId || 0;

    if (!userId) {
      return json({ success: false, error: 'user_id is required' }, 400);
    }

    const reel = await env.DB.prepare(
      `SELECT id, user_id FROM reels WHERE id = ? LIMIT 1`
    ).bind(reelId).first();

    if (!reel) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    if (toNum((reel as any).user_id, 0) !== userId) {
      return json({ success: false, error: 'Not allowed to delete this reel' }, 403);
    }

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM reel_reactions WHERE reel_id = ?`).bind(reelId),
      env.DB.prepare(`DELETE FROM reel_shares WHERE reel_id = ?`).bind(reelId),
      env.DB.prepare(`DELETE FROM reel_comments WHERE reel_id = ?`).bind(reelId),
      env.DB.prepare(`DELETE FROM reels WHERE id = ?`).bind(reelId),
    ]);

    return json({
      success: true,
      deleted: true,
      reel_id: reelId,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};
