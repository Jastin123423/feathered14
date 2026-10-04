import type { PagesFunction } from '@cloudflare/workers-types';
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };


const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

const cleanText = (v: any) => String(v ?? '').trim();
const cleanUrl = (v: any) => String(v ?? '').trim();

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/reel-comments
 * Body:
 * {
 *   reel_id,
 *   text?,
 *   user_id?,
 *   parent_comment_id?,
 *   image_url?
 * }
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const reel_id = toNum(body.reel_id, 0);
    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;
    const text = cleanText(body.text);
    const image_url = cleanUrl(body.image_url);
    const parent_comment_id = body.parent_comment_id == null ? null : toNum(body.parent_comment_id, 0);

    if (!reel_id) return json({ success: false, error: 'reel_id is required' }, 400);
    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);
    if (!text && !image_url) return json({ success: false, error: 'text or image_url is required' }, 400);
    if (text.length > 2000) return json({ success: false, error: 'Comment is too long' }, 400);

    const reel = await env.DB.prepare(
      `SELECT id, user_id FROM reels WHERE id = ? LIMIT 1`
    ).bind(reel_id).first();

    if (!reel) return json({ success: false, error: 'Reel not found' }, 404);

    const user = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? LIMIT 1`
    ).bind(user_id).first();

    if (!user) return json({ success: false, error: 'User not found' }, 404);

    let parentComment: any = null;

    if (parent_comment_id) {
      parentComment = await env.DB.prepare(
        `SELECT id, reel_id, user_id FROM reel_comments WHERE id = ? LIMIT 1`
      ).bind(parent_comment_id).first();

      if (!parentComment) return json({ success: false, error: 'Parent comment not found' }, 404);
      if (toNum((parentComment as any).reel_id, 0) !== reel_id) {
        return json({ success: false, error: 'Parent comment does not belong to this reel' }, 400);
      }
    }

    const ins = await env.DB.prepare(
      `
      INSERT INTO reel_comments (
        user_id,
        reel_id,
        parent_comment_id,
        text,
        image_url
      )
      VALUES (?, ?, ?, ?, ?)
      `
    )
      .bind(user_id, reel_id, parent_comment_id, text, image_url || null)
      .run();

    const comment_id = Number(ins.meta.last_row_id || 0);

    const comment = await env.DB.prepare(
      `
      SELECT
        id,
        reel_id,
        user_id,
        parent_comment_id,
        text,
        image_url,
        created_at
      FROM reel_comments
      WHERE id = ?
      LIMIT 1
      `
    )
      .bind(comment_id)
      .first();

    const reelOwnerId = toNum((reel as any)?.user_id, 0);

    if (parent_comment_id && parentComment) {
      const parentOwnerId = toNum((parentComment as any)?.user_id, 0);

      await createNotification(
        env,
        parentOwnerId,
        user_id,
        'reply',
        'comment',
        parent_comment_id,
        `reel_comment:${parent_comment_id}:reply`,
        'replied in Discuss'
      );
    } else {
      await createNotification(
        env,
        reelOwnerId,
        user_id,
        'discuss',
        'reel',
        reel_id,
        `reel:${reel_id}:discuss`,
        'discussed your reel'
      );
    }

    return json({
      success: true,
      comment,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};

/**
 * PATCH /api/reel-comments
 * Body:
 * {
 *   id,
 *   user_id?,
 *   text?,
 *   image_url?
 * }
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const id = toNum(body.id, 0);
    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    if (!id) return json({ success: false, error: 'comment id is required' }, 400);
    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);

    const existing = await env.DB.prepare(
      `SELECT id, user_id FROM reel_comments WHERE id = ? LIMIT 1`
    ).bind(id).first();

    if (!existing) {
      return json({ success: false, error: 'Comment not found' }, 404);
    }

    if (toNum((existing as any).user_id, 0) !== user_id) {
      return json({ success: false, error: 'Not allowed to edit this comment' }, 403);
    }

    const updates: string[] = [];
    const binds: any[] = [];

    if (body.text !== undefined) {
      const text = cleanText(body.text);
      if (text.length > 2000) {
        return json({ success: false, error: 'Comment is too long' }, 400);
      }
      updates.push(`text = ?`);
      binds.push(text);
    }

    if (body.image_url !== undefined) {
      updates.push(`image_url = ?`);
      binds.push(cleanUrl(body.image_url) || null);
    }

    if (!updates.length) {
      return json({ success: false, error: 'Nothing to update' }, 400);
    }

    binds.push(id);

    await env.DB.prepare(
      `UPDATE reel_comments SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    const updated = await env.DB.prepare(
      `
      SELECT
        id,
        reel_id,
        user_id,
        parent_comment_id,
        text,
        image_url,
        created_at
      FROM reel_comments
      WHERE id = ?
      LIMIT 1
      `
    ).bind(id).first();

    return json({
      success: true,
      comment: updated,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};

/**
 * DELETE /api/reel-comments?id=123
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const id = toNum(url.searchParams.get('id'), 0);
    const headerUserId = toNum(request.headers.get('x-user-id'), 0);
    const queryUserId = toNum(url.searchParams.get('user_id'), 0);
    const user_id = headerUserId || queryUserId || 0;

    if (!id) return json({ success: false, error: 'comment id is required' }, 400);
    if (!user_id) return json({ success: false, error: 'user_id is required' }, 400);

    const existing = await env.DB.prepare(
      `SELECT id, user_id FROM reel_comments WHERE id = ? LIMIT 1`
    ).bind(id).first();

    if (!existing) {
      return json({ success: false, error: 'Comment not found' }, 404);
    }

    if (toNum((existing as any).user_id, 0) !== user_id) {
      return json({ success: false, error: 'Not allowed to delete this comment' }, 403);
    }

    await env.DB.prepare(`DELETE FROM reel_comments WHERE id = ?`).bind(id).run();

    return json({
      success: true,
      deleted: true,
      id,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Server error' }, 500);
  }
};
