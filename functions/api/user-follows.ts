import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const countRecentContent = async (db: D1Database, userId: number) => {
  const [postsRow, reelsRow, storiesRow, songsRow, podcastsRow, groupPostsRow] =
    await Promise.all([
      db.prepare(
        `SELECT COUNT(*) as c
         FROM posts
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),

      db.prepare(
        `SELECT COUNT(*) as c
         FROM reels
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),

      db.prepare(
        `SELECT COUNT(*) as c
         FROM stories
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),

      db.prepare(
        `SELECT COUNT(*) as c
         FROM songs
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),

      db.prepare(
        `SELECT COUNT(*) as c
         FROM podcasts
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),

      db.prepare(
        `SELECT COUNT(*) as c
         FROM group_posts
         WHERE user_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(userId)
        .first(),
    ]);

  return (
    toNum((postsRow as any)?.c, 0) +
    toNum((reelsRow as any)?.c, 0) +
    toNum((storiesRow as any)?.c, 0) +
    toNum((songsRow as any)?.c, 0) +
    toNum((podcastsRow as any)?.c, 0) +
    toNum((groupPostsRow as any)?.c, 0)
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyFollowerId = toNum(body.follower_id, 0);
    const follower_id = headerUserId || bodyFollowerId || 0;
    const following_id = toNum(body.following_id, 0);

    if (!follower_id || !following_id) {
      return Response.json(
        { error: "follower_id and following_id are required" },
        { status: 400, headers: cors }
      );
    }

    if (follower_id === following_id) {
      return Response.json(
        { error: "You cannot follow yourself" },
        { status: 400, headers: cors }
      );
    }

    // Ensure users exist
    const follower = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? LIMIT 1`
    )
      .bind(follower_id)
      .first();

    const following = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? LIMIT 1`
    )
      .bind(following_id)
      .first();

    if (!follower || !following) {
      return Response.json(
        { error: "Invalid follower_id or following_id" },
        { status: 400, headers: cors }
      );
    }

    // Prevent duplicate follow first
    const existing = await env.DB.prepare(
      `SELECT 1
       FROM user_follows
       WHERE follower_id = ? AND following_id = ?
       LIMIT 1`
    )
      .bind(follower_id, following_id)
      .first();

    if (existing) {
      return Response.json(
        { success: true, already_following: true },
        { status: 200, headers: cors }
      );
    }

    /* ==================================================
       UNERA FOLLOW GROWTH RULE
       - under 1000 followers => no limit
       - 1000+ followers:
         - 0 recent content => block
         - 1-5 recent content items => 200 follows/day
         - 6+ recent content items => 500 follows/day

       NOTE:
       UNERA creates both directions, so one follow action
       creates 2 rows in user_follows. We divide by 2.
    =================================================== */

    const followerCountRow = await env.DB.prepare(
      `SELECT COUNT(*) as c
       FROM user_follows
       WHERE following_id = ?`
    )
      .bind(follower_id)
      .first();

    const followerCount = toNum((followerCountRow as any)?.c, 0);

    if (followerCount >= 1000) {
      const contentToday = await countRecentContent(env.DB, follower_id);

      if (contentToday <= 0) {
        return Response.json(
          { error: "Create a post to follow more people." },
          { status: 429, headers: cors }
        );
      }

      const followsRow = await env.DB.prepare(
        `SELECT COUNT(*) as c
         FROM user_follows
         WHERE follower_id = ?
           AND created_at > datetime('now','-1 day')`
      )
        .bind(follower_id)
        .first();

      const rawFollowsToday = toNum((followsRow as any)?.c, 0);
      const followsToday = Math.floor(rawFollowsToday / 2);

      const dailyLimit = contentToday > 5 ? 500 : 200;

      if (followsToday >= dailyLimit) {
        return Response.json(
          { error: "Create a post to follow more people." },
          { status: 429, headers: cors }
        );
      }
    }

    // ✅ UNERA RULE: create BOTH directions (A->B and B->A)
    const stmt1 = env.DB.prepare(
      `INSERT OR IGNORE INTO user_follows (follower_id, following_id)
       VALUES (?, ?)`
    ).bind(follower_id, following_id);

    const stmt2 = env.DB.prepare(
      `INSERT OR IGNORE INTO user_follows (follower_id, following_id)
       VALUES (?, ?)`
    ).bind(following_id, follower_id);

    await env.DB.batch([stmt1, stmt2]);

    // ✅ Notify only the user who was followed
    await createNotification(
      env,
      following_id,
      follower_id,
      "follow",
      "profile",
      following_id,
      `profile:${following_id}:follow`,
      "followed you"
    );

    return Response.json({ success: true }, { status: 201, headers: cors });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg.includes("FOREIGN KEY")) {
      return Response.json(
        { error: "Invalid follower_id or following_id" },
        { status: 400, headers: cors }
      );
    }
    return Response.json(
      { error: msg || "Server error" },
      { status: 500, headers: cors }
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryFollowerId = toNum(url.searchParams.get("follower_id"), 0);
    const follower_id = headerUserId || queryFollowerId || 0;
    const following_id = toNum(url.searchParams.get("following_id"), 0);

    if (!follower_id || !following_id) {
      return Response.json(
        { error: "follower_id and following_id are required" },
        { status: 400, headers: cors }
      );
    }

    if (follower_id === following_id) {
      return Response.json(
        { error: "You cannot unfollow yourself" },
        { status: 400, headers: cors }
      );
    }

    // ✅ UNERA RULE: delete BOTH directions
    const stmt1 = env.DB.prepare(
      `DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?`
    ).bind(follower_id, following_id);

    const stmt2 = env.DB.prepare(
      `DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?`
    ).bind(following_id, follower_id);

    const results = await env.DB.batch([stmt1, stmt2]);
    const changes = results.reduce((sum, r: any) => sum + (r?.meta?.changes ?? 0), 0);

    if (changes === 0) {
      return Response.json({ error: "Not following" }, { status: 404, headers: cors });
    }

    return Response.json({ success: true }, { status: 200, headers: cors });
  } catch (e: any) {
    return Response.json(
      { error: String(e?.message || e || "Server error") },
      { status: 500, headers: cors }
    );
  }
};
