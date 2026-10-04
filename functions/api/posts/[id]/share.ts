import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";
import { withNewContentId } from "../../../utils/ids";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const ALLOWED_DESTINATIONS = new Set([
  "feed","profile","story","message","copy_link","group","external",
]);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const postId = toNum((params as any)?.id, 0);
    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const destination = String(body.destination || "feed").trim().toLowerCase();
    const message = typeof body.message === "string" ? body.message.trim() : (typeof body.content === "string" ? body.content.trim() : null);

    if (!postId) return json({ success: false, error: "Invalid post id" }, 400);
    if (!userId)  return json({ success: false, error: "user_id is required" }, 400);
    if (!ALLOWED_DESTINATIONS.has(destination)) {
      return json({ success: false, error: `Invalid destination: ${destination}` }, 400);
    }
    if (message && message.length > 1000) {
      return json({ success: false, error: "Message is too long" }, 400);
    }

    // Verify post exists (safe query without risky column aliases)
    let post = await env.DB
      .prepare(`SELECT * FROM posts WHERE id = ? LIMIT 1`)
      .bind(postId)
      .first<any>();

    if (!post) {
      try {
        const reel = await env.DB
          .prepare(`SELECT * FROM reels WHERE id = ? LIMIT 1`)
          .bind(postId)
          .first<any>();
        if (reel) {
          post = {
            ...reel,
            id: reel.id,
            post_id: reel.id,
            reel_id: reel.id,
            user_id: reel.user_id,
            content: reel.caption || '',
            description: reel.caption || '',
            caption: reel.caption || '',
            video_url: reel.video_url || reel.video_url_medium || reel.video_url_hd || reel.video_url_low,
            media_url: reel.video_url || reel.video_url_medium || reel.video_url_hd || reel.video_url_low,
            thumbnail_url: reel.thumbnail_url,
            song_name: reel.song_name,
            type: 'reel',
            post_type: 'reel',
            media_type: 'video',
          };
        }
      } catch (_) {}
    }

    if (!post) {
      if (body?.post || body?.shared_post) {
        post = body.post || body.shared_post;
      } else {
        return json({ success: false, error: "Post not found" }, 404);
      }
    }

    // Safely lookup original author info
    let author: any = null;
    const postOwnerId = toNum(post?.user_id, 0);
    if (postOwnerId > 0) {
      try {
        const u = await env.DB
          .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
          .bind(postOwnerId)
          .first<any>();
        if (u) {
          author = {
            id: u.id,
            name: u.name || u.username || 'User',
            username: u.username || '',
            user_name: u.username || '',
            avatar_url: u.profile_image_url || '',
            avatar: u.profile_image_url || '',
            profile_image_url: u.profile_image_url || '',
            verified: Boolean(u.is_verified),
            is_verified: Boolean(u.is_verified),
          };
        }
      } catch (_) {}
    }

    // Ensure share tables exist (supports both 'post_shares' and 'shares' schema conventions)
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS post_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          destination TEXT DEFAULT 'feed',
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          destination TEXT DEFAULT 'feed',
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    // Record the share in post_shares table
    let shareId = 0;
    try {
      const ins1 = await env.DB
        .prepare(`
          INSERT INTO post_shares (post_id, user_id, destination, message, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `)
        .bind(postId, userId, destination, message)
        .run();
      shareId = toNum(ins1.meta?.last_row_id, 0);
    } catch (errIns1) {
      console.error("Failed to insert into post_shares:", errIns1);
    }

    // Also record into shares table so all share table queries succeed
    try {
      const ins2 = await env.DB
        .prepare(`
          INSERT INTO shares (post_id, user_id, destination, message, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `)
        .bind(postId, userId, destination, message)
        .run();
      if (!shareId) shareId = toNum(ins2.meta?.last_row_id, 0);
    } catch (errIns2) {
      console.error("Failed to insert into shares:", errIns2);
    }

    // Create the shared post entry in the posts table so it appears in feeds and user profile
    let createdSharedPost: any = null;
    if (destination === "feed" || destination === "profile") {
      let newPostId = 0;
      try {
        const res = await withNewContentId(async (id) => {
          return await env.DB.prepare(`
            INSERT INTO posts (id, user_id, content, shared_post_id, visibility, is_deleted, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'public', 0, datetime('now'), datetime('now'))
          `)
          .bind(id, userId, message || '', postId)
          .run();
        });
        newPostId = res.id;
      } catch (errWithId) {
        try {
          const insPost = await env.DB
            .prepare(`
              INSERT INTO posts (user_id, content, shared_post_id, visibility, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, 'public', 0, datetime('now'), datetime('now'))
            `)
            .bind(userId, message || '', postId)
            .run();
          newPostId = toNum(insPost.meta?.last_row_id, Date.now());
        } catch (errPost) {
          console.error("Failed to insert into posts:", errPost);
        }
      }

      // Fetch sharing user details
      let sharingUser: any = null;
      try {
        sharingUser = await env.DB
          .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
          .bind(userId)
          .first<any>();
      } catch (_) {}

      const resolvedVidUrl = post?.video_url || post?.media_url || (body?.post?.video_url) || (body?.shared_post?.video_url) || null;
      const isVideo = Boolean(
        resolvedVidUrl &&
        (post?.media_type === 'video' || (typeof resolvedVidUrl === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(resolvedVidUrl)))
      );

      const sharedPostPayload = {
        ...post,
        type: 'post',
        post_type: 'post',
        item_type: isVideo ? 'post' : (post?.item_type || 'post'),
        media_type: isVideo ? 'video' : (post?.media_type || undefined),
        video_url: resolvedVidUrl,
        media_url: post?.media_url || resolvedVidUrl || (body?.post?.media_url) || (body?.shared_post?.media_url) || null,
        thumbnail_url: post?.thumbnail_url || (body?.post?.thumbnail_url) || (body?.shared_post?.thumbnail_url) || null,
        caption: post?.caption || post?.content || (body?.post?.caption) || '',
        content: post?.content || post?.caption || (body?.post?.content) || '',
        song_name: post?.song_name || (body?.post?.song_name) || undefined,
        author: author || post?.author || (body?.post?.author) || {
          id: post?.user_id,
          name: post?.author_name || 'User',
          username: post?.author_username || '',
          avatar_url: post?.author_avatar || '',
          profile_image_url: post?.author_avatar || '',
        },
        user: author || post?.user || (body?.post?.user),
      };

      createdSharedPost = {
        id: newPostId || Date.now(),
        post_id: newPostId || Date.now(),
        user_id: userId,
        author: sharingUser ? {
          id: sharingUser.id,
          name: sharingUser.name || sharingUser.username || 'User',
          username: sharingUser.username || '',
          user_name: sharingUser.username || '',
          avatar_url: sharingUser.profile_image_url || '',
          avatar: sharingUser.profile_image_url || '',
          profile_image_url: sharingUser.profile_image_url || '',
          verified: Boolean(sharingUser.is_verified),
          is_verified: Boolean(sharingUser.is_verified),
        } : null,
        user: sharingUser,
        content: message || '',
        shared_post_id: postId,
        shared_post: sharedPostPayload,
        created_at: new Date().toISOString(),
        reactions_count: 0,
        comments_count: 0,
        shares: 0,
        shares_count: 0,
        visibility: 'public',
      };
    }

    // Keep the denormalized counter in sync on original post (best-effort)
    try {
      await env.DB
        .prepare(`UPDATE posts SET shares = COALESCE(shares, 0) + 1 WHERE id = ?`)
        .bind(postId)
        .run();
    } catch (_) {}

    // Notify post owner (never self)
    const ownerId = toNum(post?.user_id, 0);
    if (ownerId && ownerId !== userId) {
      try {
        await createNotification(
          env,
          ownerId,
          userId,
          "share",
          "post",
          postId,
          `share_post_${postId}`
        );
      } catch (_) {}
    }

    // Return fresh count
    let finalSharesCount = toNum(post.shares, 0) + 1;
    try {
      const countRow = await env.DB
        .prepare(`SELECT COUNT(*) AS c FROM post_shares WHERE post_id = ?`)
        .bind(postId)
        .first<{ c: number }>();
      if (countRow?.c) finalSharesCount = toNum(countRow.c, finalSharesCount);
    } catch (_) {
      try {
        const countRow2 = await env.DB
          .prepare(`SELECT COUNT(*) AS c FROM shares WHERE post_id = ?`)
          .bind(postId)
          .first<{ c: number }>();
        if (countRow2?.c) finalSharesCount = toNum(countRow2.c, finalSharesCount);
      } catch (_) {}
    }

    return json({
      success: true,
      share_id: shareId,
      post_id: postId,
      destination,
      shares: finalSharesCount,
      shares_count: finalSharesCount,
      post: createdSharedPost,
      shared_post: createdSharedPost?.shared_post || post,
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to share post" },
      500
    );
  }
};
