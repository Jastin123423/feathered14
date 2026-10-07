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

let _shareSchemaEnsured = false;
async function ensureGroupPostSchema(db: D1Database) {
  if (_shareSchemaEnsured) return;
  const groupPostCols = [
    "ALTER TABLE group_posts ADD COLUMN shared_post_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_from TEXT",
    "ALTER TABLE group_posts ADD COLUMN shared_group_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_group_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN shared_by_user_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN shared_user_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_owner_name TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_owner_id INTEGER",
    "ALTER TABLE group_posts ADD COLUMN original_owner_avatar TEXT",
    "ALTER TABLE group_posts ADD COLUMN original_post_content TEXT",
  ];
  for (const q of groupPostCols) {
    try {
      await db.prepare(q).run();
    } catch (_) {}
  }

  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS group_post_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        group_id INTEGER,
        destination TEXT DEFAULT 'feed',
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}

  try {
    await db.prepare(`
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

  _shareSchemaEnsured = true;
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env?.DB) return json({ success: false, error: "DB binding missing" }, 500);
    await ensureGroupPostSchema(env.DB);

    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const post_id = toNum(body.post_id || body.id, 0);
    const src_group_id = toNum(body.group_id, 0);
    const target_group_id = toNum(
      body.target_group_id || body.targetGroupId || (body.destination === "group" ? body.group_id : 0),
      0
    );

    const destination = String(body.destination || "feed").trim().toLowerCase();
    const source = String(body.source || (src_group_id ? "group" : "feed")).trim().toLowerCase();
    const message = typeof body.message === "string" ? body.message.trim() : null;

    if (!user_id || !post_id) {
      return json({ success: false, error: "user_id and post_id required" }, 400);
    }

    // Lookup sharing user details
    let sharer: any = null;
    try {
      sharer = await env.DB.prepare(
        `SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`
      )
        .bind(user_id)
        .first();
    } catch (_) {}
    const sharerName = sharer?.name || sharer?.username || "User";

    /* ==============================================================
       CASE 1: DESTINATION IS GROUP (Share from feed or another group)
       ============================================================== */
    if (destination === "group") {
      const destinationGroupId = target_group_id || src_group_id;
      if (!destinationGroupId) {
        return json({ success: false, error: "Target group_id is required when sharing to a group" }, 400);
      }

      // 1. Fetch original post: check group_posts first, then posts
      let origPost: any = null;
      let isFromGroup = false;

      if (source === "group" || src_group_id > 0) {
        try {
          origPost = await env.DB.prepare(
            `SELECT * FROM group_posts WHERE id = ? LIMIT 1`
          )
            .bind(post_id)
            .first();
          if (origPost) isFromGroup = true;
        } catch (_) {}
      }

      if (!origPost) {
        try {
          origPost = await env.DB.prepare(
            `SELECT * FROM posts WHERE id = ? LIMIT 1`
          )
            .bind(post_id)
            .first();
        } catch (_) {}
      }

      if (!origPost) {
        try {
          origPost = await env.DB.prepare(
            `SELECT * FROM group_posts WHERE id = ? LIMIT 1`
          )
            .bind(post_id)
            .first();
          if (origPost) isFromGroup = true;
        } catch (_) {}
      }

      if (!origPost && (body.post || body.shared_post)) {
        origPost = body.post || body.shared_post;
        if (origPost?.group_id) isFromGroup = true;
      }

      if (!origPost) {
        return json({ success: false, error: "Post to share was not found" }, 404);
      }

      // 2. Fetch original author details
      const origAuthorId = toNum(origPost.user_id || origPost.author?.id, 0);
      let origAuthor: any = null;
      if (origAuthorId > 0) {
        try {
          origAuthor = await env.DB.prepare(
            `SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`
          )
            .bind(origAuthorId)
            .first();
        } catch (_) {}
      }
      const origAuthorName =
        origAuthor?.name || origAuthor?.username || origPost.author?.name || "User";
      const origAuthorAvatar =
        origAuthor?.profile_image_url || origPost.author?.profile_image_url || origPost.author?.avatar || null;

      // 3. Fetch source group name if original post is from a group
      let sourceGroupName: string | null = null;
      const actualSrcGroupId = toNum(origPost.group_id || src_group_id, 0);
      if (isFromGroup && actualSrcGroupId > 0) {
        try {
          const gRow = await env.DB.prepare(
            `SELECT name FROM groups WHERE id = ? LIMIT 1`
          )
            .bind(actualSrcGroupId)
            .first();
          sourceGroupName = (gRow as any)?.name || origPost.group_name || null;
        } catch (_) {}
      }

      // 4. Resolve media
      const media_url = origPost.media_url || origPost.video_url || null;
      const media_urls = typeof origPost.media_urls === "string" ? origPost.media_urls : Array.isArray(origPost.media_urls) ? JSON.stringify(origPost.media_urls) : null;
      const media_types = typeof origPost.media_types === "string" ? origPost.media_types : Array.isArray(origPost.media_types) ? JSON.stringify(origPost.media_types) : null;
      const original_content = String(origPost.content || origPost.caption || "");

      // 5. Insert shared post into target group's group_posts table
      const { id: newGroupPostId } = await withNewContentId(async (id) => {
        return await env.DB.prepare(
          `INSERT INTO group_posts (
            id, group_id, user_id, content,
            media_url, media_urls, media_types,
            shared_post_id, shared_from,
            shared_group_id, shared_group_name,
            shared_by_user_id, shared_user_name,
            original_owner_name, original_owner_id, original_owner_avatar,
            original_post_content, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', datetime('now'))`
        )
          .bind(
            id,
            destinationGroupId,
            user_id,
            message || original_content,
            media_url,
            media_urls,
            media_types,
            post_id,
            isFromGroup ? "group" : "feed",
            isFromGroup ? actualSrcGroupId : null,
            sourceGroupName,
            user_id,
            sharerName,
            origAuthorName,
            origAuthorId || null,
            origAuthorAvatar,
            original_content,
          )
          .run();
      });

      // 6. Record share in shares tables
      let share_id = 0;
      try {
        if (isFromGroup) {
          const ins = await env.DB.prepare(
            `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
             VALUES (?, ?, ?, 'group', ?)`
          )
            .bind(user_id, post_id, destinationGroupId, message)
            .run();
          share_id = toNum(ins.meta?.last_row_id, 0);
        } else {
          const ins = await env.DB.prepare(
            `INSERT INTO post_shares (user_id, post_id, destination, message, created_at)
             VALUES (?, ?, 'group', ?, datetime('now'))`
          )
            .bind(user_id, post_id, message)
            .run();
          share_id = toNum(ins.meta?.last_row_id, 0);
        }
      } catch (_) {}

      // 7. Increment share counter on original post
      try {
        if (isFromGroup) {
          await env.DB.prepare(
            `UPDATE group_posts SET shares = COALESCE(shares, 0) + 1 WHERE id = ?`
          )
            .bind(post_id)
            .run();
        } else {
          await env.DB.prepare(
            `UPDATE posts SET shares = COALESCE(shares, 0) + 1 WHERE id = ?`
          )
            .bind(post_id)
            .run();
        }
      } catch (_) {}

      // 8. Send notification to original post owner
      if (origAuthorId && origAuthorId !== user_id) {
        try {
          await createNotification(
            env,
            origAuthorId,
            user_id,
            "share",
            isFromGroup ? "group_post" : "post",
            post_id,
            `share:${post_id}:${destinationGroupId}`,
            isFromGroup ? "shared your group post to a group" : "shared your post to a group"
          );
        } catch (_) {}
      }

      // 9. Fetch updated shares count
      let finalCount = 1;
      try {
        if (isFromGroup) {
          const r = await env.DB.prepare(
            `SELECT COUNT(*) as c FROM group_post_shares WHERE group_post_id=?`
          ).bind(post_id).first();
          finalCount = toNum((r as any)?.c, 1);
        } else {
          const r = await env.DB.prepare(
            `SELECT COUNT(*) as c FROM post_shares WHERE post_id=?`
          ).bind(post_id).first();
          finalCount = toNum((r as any)?.c, 1);
        }
      } catch (_) {}

      const createdGroupPost = {
        id: newGroupPostId,
        group_id: destinationGroupId,
        user_id,
        content: message || original_content,
        media_url,
        media_urls: origPost.media_urls || [],
        media_types: origPost.media_types || [],
        shared_post_id: post_id,
        shared_from: isFromGroup ? "group" : "feed",
        shared_group_id: isFromGroup ? actualSrcGroupId : null,
        shared_group_name: sourceGroupName,
        shared_by_user_id: user_id,
        shared_user_name: sharerName,
        original_owner_name: origAuthorName,
        original_owner_id: origAuthorId,
        original_owner_avatar: origAuthorAvatar,
        original_post_content: original_content,
        created_at: new Date().toISOString(),
        shares: 0,
        shares_count: 0,
        reactions_count: 0,
        comments_count: 0,
        author: sharer || { id: user_id, name: sharerName },
      };

      return json({
        success: true,
        share_id,
        shares_count: finalCount,
        shares: finalCount,
        destination: "group",
        target_group_id: destinationGroupId,
        group_post: createdGroupPost,
        post: createdGroupPost,
      });
    }

    /* ==============================================================
       CASE 2: DESTINATION IS FEED / PROFILE (Share group post to feed)
       ============================================================== */
    const post = await env.DB.prepare(
      `SELECT id, user_id, group_id
       FROM group_posts
       WHERE id = ?
       LIMIT 1`
    )
      .bind(post_id)
      .first();

    if (!post && !body.post && !body.shared_post) {
      return json({ success: false, error: "Group post not found" }, 404);
    }

    const actualGroupId = toNum((post as any)?.group_id || src_group_id, 0);

    const insert = await env.DB.prepare(
      `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(user_id, post_id, actualGroupId, destination, message)
      .run();

    const share_id = toNum(insert.meta?.last_row_id, 0);

    const postOwnerId = toNum((post as any)?.user_id || (body.post as any)?.user_id, 0);
    if (postOwnerId && postOwnerId !== user_id) {
      try {
        await createNotification(
          env,
          postOwnerId,
          user_id,
          "share",
          "group_post",
          post_id,
          `group_post:${post_id}:share`,
          "shared your group post"
        );
      } catch (_) {}
    }

    const row = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM group_post_shares WHERE group_post_id=?`
    )
      .bind(post_id)
      .first();

    const shares_count = toNum((row as any)?.c, 0);

    return json({
      success: true,
      share_id,
      shares_count,
      shares: shares_count,
      destination,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
