import type { PagesFunction } from '@cloudflare/workers-types';
import { createNotification } from '../../../utils/createNotification';

type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id',
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const reel_id = toNum((params as any)?.id, 0);

    if (!reel_id) {
      return json({ success: false, error: 'Invalid reel id' }, 400);
    }

    const body = await request.json().catch(() => ({} as any));

    const user_id =
      toNum(request.headers.get('x-user-id'), 0) ||
      toNum((body as any).user_id, 0);

    if (!user_id) {
      return json({ success: false, error: 'user_id required' }, 400);
    }

    const destination =
      typeof (body as any)?.destination === 'string'
        ? String((body as any).destination).trim()
        : null;

    const reel = await env.DB
      .prepare(`SELECT * FROM reels WHERE id = ? LIMIT 1`)
      .bind(reel_id)
      .first<any>();

    if (!reel) {
      return json({ success: false, error: 'Reel not found' }, 404);
    }

    const reelOwnerId = toNum((reel as any)?.user_id, 0);

    // Look up original reel owner
    let reelAuthor: any = null;
    if (reelOwnerId > 0) {
      try {
        const u = await env.DB
          .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
          .bind(reelOwnerId)
          .first<any>();
        if (u) {
          reelAuthor = {
            id: u.id,
            name: u.name || u.username || 'Creator',
            username: u.username || '',
            avatar_url: u.profile_image_url || '',
            profile_image_url: u.profile_image_url || '',
            is_verified: Boolean(u.is_verified),
            verified: Boolean(u.is_verified),
          };
        }
      } catch (_) {}
    }

    const message = typeof (body as any)?.message === 'string' ? String((body as any).message).trim() : '';

    const result = await env.DB
      .prepare(`
        INSERT INTO reel_shares (reel_id, user_id, destination)
        VALUES (?, ?, ?)
      `)
      .bind(reel_id, user_id, destination)
      .run();

    const share_id = toNum(result?.meta?.last_row_id, 0);

    // Also record into post_shares if table exists
    try {
      await env.DB
        .prepare(`
          INSERT INTO post_shares (post_id, user_id, destination, message, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `)
        .bind(reel_id, user_id, destination || 'feed', message)
        .run();
    } catch (_) {}

    // Fetch sharing user details
    let sharingUser: any = null;
    try {
      sharingUser = await env.DB
        .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
        .bind(user_id)
        .first<any>();
    } catch (_) {}

    const originalReelPayload = {
      ...reel,
      id: reel.id,
      reel_id: reel.id,
      post_id: reel.id,
      type: 'reel',
      post_type: 'reel',
      media_type: 'video',
      video_url: reel.video_url || reel.video_url_medium || reel.video_url_hd || reel.video_url_low || '',
      media_url: reel.video_url || reel.video_url_medium || reel.video_url_hd || reel.video_url_low || '',
      thumbnail_url: reel.thumbnail_url || '',
      caption: reel.caption || '',
      content: reel.caption || '',
      song_name: reel.song_name || 'Original Audio',
      author: reelAuthor || {
        id: reelOwnerId,
        name: 'Creator',
        username: 'creator',
      },
      user: reelAuthor,
    };

    let createdSharedPost: any = null;
    if (destination === 'feed' || destination === 'profile') {
      let newPostId = Date.now();
      try {
        const insPost = await env.DB
          .prepare(`
            INSERT INTO posts (user_id, content, shared_post_id, visibility, is_deleted, created_at, updated_at)
            VALUES (?, ?, ?, 'public', 0, datetime('now'), datetime('now'))
          `)
          .bind(user_id, message, reel_id)
          .run();
        newPostId = toNum(insPost.meta?.last_row_id, Date.now());
      } catch (_) {}

      createdSharedPost = {
        id: newPostId,
        post_id: newPostId,
        user_id,
        author: sharingUser ? {
          id: sharingUser.id,
          name: sharingUser.name || sharingUser.username || 'User',
          username: sharingUser.username || '',
          avatar_url: sharingUser.profile_image_url || '',
          profile_image_url: sharingUser.profile_image_url || '',
          is_verified: Boolean(sharingUser.is_verified),
          verified: Boolean(sharingUser.is_verified),
        } : null,
        user: sharingUser,
        content: message,
        shared_post_id: reel_id,
        shared_post: originalReelPayload,
        created_at: new Date().toISOString(),
        reactions_count: 0,
        comments_count: 0,
        shares: 0,
        shares_count: 0,
        visibility: 'public',
      };
    }

    const share = await env.DB
      .prepare(`
        SELECT id, reel_id, user_id, destination, created_at
        FROM reel_shares
        WHERE id = ?
        LIMIT 1
      `)
      .bind(share_id)
      .first();

    if (reelOwnerId && reelOwnerId !== user_id) {
      await createNotification(
        env,
        reelOwnerId,
        user_id,
        'share',
        'reel',
        reel_id,
        `reel:${reel_id}:share`,
        'shared your reel'
      );
    }

    const countRow = await env.DB
      .prepare(`
        SELECT COUNT(*) as cnt
        FROM reel_shares
        WHERE reel_id = ?
      `)
      .bind(reel_id)
      .first();

    const totalShares = toNum((countRow as any)?.cnt, 1);

    return json({
      success: true,
      share,
      shares: totalShares,
      shares_count: totalShares,
      post: createdSharedPost,
      shared_post: originalReelPayload,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || 'Server error' }, 500);
  }
};
