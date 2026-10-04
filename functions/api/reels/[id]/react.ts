import type { PagesFunction } from '@cloudflare/workers-types';
import { createNotification } from '../../../utils/createNotification';

type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

const normalizeReactionType = (value: any) =>
  String(value || 'love').trim().toLowerCase();

const ALLOWED_REACTIONS = [
  'like',
  'love',
  'haha',
  'wow',
  'sad',
  'angry',
  'fire',
  'party',
  'clap',
  'star',
  'thinking',
  'crying',
  'heart_eyes',
  'kiss',
  'sunglasses',
  'rocket',
  'trophy',
  'crown',
];

const mapReactionRow = (row: any) => ({
  id: Number(row.id || 0),
  reel_id: Number(row.reel_id || 0),
  user_id: Number(row.user_id || 0),
  type: String(row.type || 'like').toLowerCase(),
  created_at: row.created_at || null,
  name: row.name || null,
  username: row.username || null,
  profile_image_url:
    row.profile_image_url ||
    row.profileImage ||
    row.avatar ||
    row.profile_photo ||
    null,
  user: {
    id: Number(row.user_id || 0),
    name: row.name || null,
    username: row.username || null,
    profile_image_url:
      row.profile_image_url ||
      row.profileImage ||
      row.avatar ||
      row.profile_photo ||
      null,
  },
});

const fetchReactionBreakdown = async (db: D1Database, reel_id: number) => {
  const res = await db
    .prepare(
      `SELECT type, COUNT(*) as count
       FROM reel_reactions
       WHERE reel_id = ?
       GROUP BY type
       ORDER BY count DESC, type ASC`
    )
    .bind(reel_id)
    .all();

  return Array.isArray(res.results)
    ? res.results.map((r: any) => ({
        type: String(r.type || 'like').toLowerCase(),
        count: toNum(r.count, 0),
      }))
    : [];
};

const fetchReactionCount = async (db: D1Database, reel_id: number) => {
  const row = await db
    .prepare(
      `SELECT COUNT(*) as c
       FROM reel_reactions
       WHERE reel_id = ?`
    )
    .bind(reel_id)
    .first();

  return toNum((row as any)?.c, 0);
};

const fetchReactionList = async (
  db: D1Database,
  reel_id: number,
  opts?: { limit?: number; offset?: number; type?: string }
) => {
  const limit = Math.min(toNum(opts?.limit, 100), 500);
  const offset = Math.max(toNum(opts?.offset, 0), 0);
  const type = normalizeReactionType(opts?.type || '');

  const filterByType = !!type && ALLOWED_REACTIONS.includes(type);

  const sql = `
    SELECT
      rr.id,
      rr.reel_id,
      rr.user_id,
      rr.type,
      rr.created_at,
      u.name,
      u.username,
      u.profile_image_url,
      u.profileImage,
      u.avatar,
      u.profile_photo
    FROM reel_reactions rr
    LEFT JOIN users u ON u.id = rr.user_id
    WHERE rr.reel_id = ?
    ${filterByType ? 'AND rr.type = ?' : ''}
    ORDER BY rr.created_at DESC, rr.id DESC
    LIMIT ? OFFSET ?
  `;

  const stmt = filterByType
    ? db.prepare(sql).bind(reel_id, type, limit, offset)
    : db.prepare(sql).bind(reel_id, limit, offset);

  const res = await stmt.all();
  return Array.isArray(res.results) ? res.results.map(mapReactionRow) : [];
};

const buildReactionMessage = (reactionType: string) => {
  const rt = normalizeReactionType(reactionType);

  if (rt === 'love') return 'loved your reel';
  if (rt === 'haha') return 'laughed at your reel';
  if (rt === 'wow') return 'reacted wow to your reel';
  if (rt === 'sad') return 'felt sad about your reel';
  if (rt === 'angry') return 'felt angry about your reel';
  if (rt === 'fire') return 'fired up your reel';
  if (rt === 'party') return 'celebrated your reel';
  if (rt === 'clap') return 'applauded your reel';
  if (rt === 'star') return 'starred your reel';
  if (rt === 'thinking') return 'reacted thoughtfully to your reel';
  if (rt === 'crying') return 'cried over your reel';
  if (rt === 'heart_eyes') return 'reacted heart-eyes to your reel';
  if (rt === 'kiss') return 'kissed your reel';
  if (rt === 'sunglasses') return 'reacted cool to your reel';
  if (rt === 'rocket') return 'rocketed your reel';
  if (rt === 'trophy') return 'awarded your reel';
  if (rt === 'crown') return 'crowned your reel';

  return 'reacted to your reel';
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const reel_id = toNum((params as any)?.id, 0);
    const url = new URL(request.url);

    const limit = Math.min(toNum(url.searchParams.get('limit'), 100), 500);
    const offset = Math.max(toNum(url.searchParams.get('offset'), 0), 0);
    const type = normalizeReactionType(url.searchParams.get('type') || '');

    if (!reel_id) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    const reel = await env.DB
      .prepare(`SELECT id FROM reels WHERE id = ? LIMIT 1`)
      .bind(reel_id)
      .first();

    if (!reel) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    const reactions = await fetchReactionList(env.DB, reel_id, { limit, offset, type });
    const reactions_count = await fetchReactionCount(env.DB, reel_id);
    const reactions_breakdown = await fetchReactionBreakdown(env.DB, reel_id);

    return json({
      success: true,
      reel_id,
      reactions,
      reactions_count,
      reactions_breakdown,
      limit,
      offset,
    });
  } catch (e: any) {
    return json(
      { success: false, error: e?.message || 'Failed to fetch reel reactions' },
      500
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const reel_id = toNum((params as any)?.id, 0);
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const type = normalizeReactionType(body.type || 'love');

    if (!reel_id) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    if (!user_id) {
      return json({ success: false, error: 'user_id is required' }, 400);
    }

    if (!ALLOWED_REACTIONS.includes(type)) {
      return json({ success: false, error: 'Invalid reaction type' }, 400);
    }

    const reel = await env.DB
      .prepare(`SELECT id, user_id FROM reels WHERE id = ? LIMIT 1`)
      .bind(reel_id)
      .first();

    if (!reel) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    const user = await env.DB
      .prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`)
      .bind(user_id)
      .first();

    if (!user) {
      return json({ success: false, error: 'User not found' }, 404);
    }

    const reelOwnerId = toNum((reel as any)?.user_id, 0);

    const existing = await env.DB
      .prepare(
        `SELECT id, type
         FROM reel_reactions
         WHERE reel_id = ? AND user_id = ?
         LIMIT 1`
      )
      .bind(reel_id, user_id)
      .first();

    let reacted = false;
    let finalType: string | null = null;

    if ((existing as any)?.id) {
      const existingType = normalizeReactionType((existing as any)?.type || 'love');

      if (existingType === type) {
        await env.DB
          .prepare(
            `DELETE FROM reel_reactions
             WHERE reel_id = ? AND user_id = ?`
          )
          .bind(reel_id, user_id)
          .run();

        reacted = false;
        finalType = null;
      } else {
        await env.DB
          .prepare(
            `UPDATE reel_reactions
             SET type = ?, created_at = datetime('now')
             WHERE reel_id = ? AND user_id = ?`
          )
          .bind(type, reel_id, user_id)
          .run();

        reacted = true;
        finalType = type;
      }
    } else {
      await env.DB
        .prepare(
          `INSERT INTO reel_reactions (reel_id, user_id, type)
           VALUES (?, ?, ?)`
        )
        .bind(reel_id, user_id, type)
        .run();

      reacted = true;
      finalType = type;
    }

    if (reacted && finalType && reelOwnerId && reelOwnerId !== user_id) {
      await createNotification(
        env,
        reelOwnerId,
        user_id,
        'react',
        'reel',
        reel_id,
        `reel:${reel_id}:react`,
        buildReactionMessage(finalType)
      );
    }

    const reactions_count = await fetchReactionCount(env.DB, reel_id);
    const reactions_breakdown = await fetchReactionBreakdown(env.DB, reel_id);

    const myReactionRow = await env.DB
      .prepare(
        `SELECT
           rr.id,
           rr.reel_id,
           rr.user_id,
           rr.type,
           rr.created_at,
           u.name,
           u.username,
           u.profile_image_url,
           u.profileImage,
           u.avatar,
           u.profile_photo
         FROM reel_reactions rr
         LEFT JOIN users u ON u.id = rr.user_id
         WHERE rr.reel_id = ? AND rr.user_id = ?
         LIMIT 1`
      )
      .bind(reel_id, user_id)
      .first();

    const my_reaction = myReactionRow ? mapReactionRow(myReactionRow) : null;

    return json({
      success: true,
      reacted,
      reel_id,
      user_id,
      type: finalType,
      my_reaction,
      reactions_count,
      reactions_breakdown,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};
