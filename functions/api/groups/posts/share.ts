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

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

async function ensureShareSchema(db: D1Database) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS group_post_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        group_post_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        destination TEXT DEFAULT 'feed',
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}

  // Columns on group_posts for cross-sharing
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

  // Ensure posts table has group_id
  try {
    await db.prepare("ALTER TABLE posts ADD COLUMN group_id INTEGER").run();
  } catch (_) {}
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const post_id = toNum(body.post_id, 0);
    let group_id = toNum(body.group_id, 0);
    const target_group_id = toNum(body.target_group_id || body.destination_group_id || (body.destination === "group" ? body.group_id : 0), 0);

    const destination = String(body.destination || "feed").trim().toLowerCase();
    const source = String(body.source || body.source_type || "").trim().toLowerCase();
    const message = typeof body.message === "string" ? body.message.trim() : null;

    if (!user_id || !post_id) {
      return json({ success: false, error: "user_id and post_id are required" }, 400);
    }

    await ensureShareSchema(env.DB);

    // Fetch sharing user details
    const sharingUser = await env.DB.prepare(
      `SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`
    )
      .bind(user_id)
      .first<any>();

    const sharingUserName = sharingUser?.name || sharingUser?.username || "User";

    /* ==============================================================
       CASE 1: DESTINATION IS FEED / PROFILE (group post -> feed)
       "when group post is shared to feed it should exactly appear exactly as group post card is but it should show first the name of shared user and original owner which is group name"
    ============================================================== */
    if (destination === "feed" || destination === "profile") {
      // Find source group post
      let groupPost = await env.DB.prepare(
        `SELECT gp.*, g.name AS group_name, g.profile_image AS group_image, g.category AS group_category, g.is_verified AS group_verified
         FROM group_posts gp
         LEFT JOIN groups g ON g.id = gp.group_id
         WHERE gp.id = ?
         LIMIT 1`
      )
        .bind(post_id)
        .first<any>();

      if (!groupPost) {
        // Fallback: check if post_id was from posts table
        const feedPost = await env.DB.prepare(
          `SELECT * FROM posts WHERE id = ? LIMIT 1`
        )
          .bind(post_id)
          .first<any>();

        if (!feedPost) {
          return json({ success: false, error: "Post not found" }, 404);
        }

        // It's a feed post being shared to feed; insert share
        const insShare = await env.DB.prepare(
          `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
           VALUES (?, ?, ?, ?, ?)`
        )
          .bind(user_id, post_id, group_id || 0, "feed", message)
          .run();

        return json({
          success: true,
          share_id: toNum(insShare.meta?.last_row_id, 0),
          destination: "feed",
        });
      }

      const sourceGroupId = toNum(groupPost.group_id || group_id, 0);

      // Insert share into group_post_shares
      const insShare = await env.DB.prepare(
        `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
         VALUES (?, ?, ?, 'feed', ?)`
      )
        .bind(user_id, post_id, sourceGroupId, message)
        .run();

      const share_id = toNum(insShare.meta?.last_row_id, 0);

      // Also create an entry in posts table so any profile query shows the post
      try {
        await withNewContentId(async (newPostId) => {
          return await env.DB.prepare(`
            INSERT INTO posts (id, user_id, content, shared_post_id, group_id, visibility, is_deleted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'public', 0, datetime('now'), datetime('now'))
          `)
            .bind(newPostId, user_id, message || "", post_id, sourceGroupId)
            .run();
        });
      } catch (_) {}

      // Notify original post author
      const postOwnerId = toNum(groupPost.user_id, 0);
      if (postOwnerId && postOwnerId !== user_id) {
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
      }

      // Total count
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) as c FROM group_post_shares WHERE group_post_id = ?`
      )
        .bind(post_id)
        .first<any>();

      const shares_count = toNum(countRow?.c, 0);

      return json({
        success: true,
        share_id,
        shares_count,
        destination: "feed",
        group_id: sourceGroupId,
        group_name: groupPost.group_name || "Group",
        shared_by_name: sharingUserName,
        post: {
          id: post_id,
          ...groupPost,
          is_shared: true,
          shared_by_user_id: user_id,
          shared_by_name: sharingUserName,
          shared_message: message,
          original_owner_name: groupPost.group_name || "Group",
        },
      });
    }

    /* ==============================================================
       CASE 2 & 3: DESTINATION IS GROUP
       - From Feed -> Group ("show first name of shared and post owner name")
       - From Group -> Group ("show name of shared user and name of the group")
    ============================================================== */
    const destGroupId = target_group_id || group_id;
    if (!destGroupId) {
      return json({ success: false, error: "target group_id required" }, 400);
    }

    // Fetch destination group
    const destGroup = await env.DB.prepare(
      `SELECT id, name, category, admin_id, type FROM groups WHERE id = ? LIMIT 1`
    )
      .bind(destGroupId)
      .first<any>();

    if (!destGroup) {
      return json({ success: false, error: "Destination group not found" }, 404);
    }

    // Verify user is a member or admin of the destination group
    const isOwner = Number(destGroup.admin_id) === user_id;
    const destMember = await env.DB.prepare(
      `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(destGroupId, user_id)
      .first();

    if (!isOwner && !destMember && String(destGroup.type || '').toLowerCase() === 'private') {
      return json({ success: false, error: "User is not a member of destination group" }, 403);
    }

    // Check if source post is from group_posts or from posts (feed)
    let sourceGroupPost: any = null;
    let sourceFeedPost: any = null;

    if (source === "group" || (group_id && group_id !== destGroupId)) {
      sourceGroupPost = await env.DB.prepare(
        `SELECT gp.*, g.name AS source_group_name, g.profile_image AS source_group_image
         FROM group_posts gp
         LEFT JOIN groups g ON g.id = gp.group_id
         WHERE gp.id = ?
         LIMIT 1`
      )
        .bind(post_id)
        .first<any>();
    }

    if (!sourceGroupPost) {
      // Could be feed post or group post without explicit source
      sourceGroupPost = await env.DB.prepare(
        `SELECT gp.*, g.name AS source_group_name, g.profile_image AS source_group_image
         FROM group_posts gp
         LEFT JOIN groups g ON g.id = gp.group_id
         WHERE gp.id = ?
         LIMIT 1`
      )
        .bind(post_id)
        .first<any>();

      if (!sourceGroupPost) {
        sourceFeedPost = await env.DB.prepare(
          `SELECT p.*, u.name AS author_name, u.username AS author_username, u.profile_image_url AS author_avatar
           FROM posts p
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.id = ?
           LIMIT 1`
        )
          .bind(post_id)
          .first<any>();
      }
    }

    // -------------------------------------------------------------
    // SUB-CASE 3: GROUP TO GROUP
    // "When shared from group to group, show the name of shared user and name of the group"
    // -------------------------------------------------------------
    if (sourceGroupPost) {
      const sourceGroupName = sourceGroupPost.source_group_name || "Group";
      const sourcePostGroupId = toNum(sourceGroupPost.group_id, 0);

      const { id: newGroupPostId } = await withNewContentId(async (newId) => {
        return await env.DB.prepare(`
          INSERT INTO group_posts (
            id, group_id, user_id, content,
            media_url, media_urls, media_types, media_meta,
            visibility,
            job_title, company, job_type, salary,
            street, district, region, country, location,
            application_type, application_value, expiry_date,
            price, currency, condition, status,
            artist, series, episode, duration,
            shared_post_id, shared_from, shared_group_id, shared_group_name,
            shared_by_user_id, shared_user_name,
            original_owner_name, original_post_content,
            created_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            'public',
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, 'group', ?, ?,
            ?, ?,
            ?, ?,
            datetime('now'), datetime('now')
          )
        `)
          .bind(
            newId,
            destGroupId,
            user_id,
            message || sourceGroupPost.content || "",

            sourceGroupPost.media_url || null,
            sourceGroupPost.media_urls || null,
            sourceGroupPost.media_types || null,
            sourceGroupPost.media_meta || null,

            sourceGroupPost.job_title || null,
            sourceGroupPost.company || null,
            sourceGroupPost.job_type || null,
            sourceGroupPost.salary || null,

            sourceGroupPost.street || null,
            sourceGroupPost.district || null,
            sourceGroupPost.region || null,
            sourceGroupPost.country || null,
            sourceGroupPost.location || null,

            sourceGroupPost.application_type || null,
            sourceGroupPost.application_value || null,
            sourceGroupPost.expiry_date || null,

            sourceGroupPost.price || null,
            sourceGroupPost.currency || null,
            sourceGroupPost.condition || null,
            sourceGroupPost.status || "available",

            sourceGroupPost.artist || null,
            sourceGroupPost.series || null,
            sourceGroupPost.episode || null,
            sourceGroupPost.duration || null,

            post_id,
            sourcePostGroupId,
            sourceGroupName,

            user_id,
            sharingUserName,

            sourceGroupName, // original owner name is the group name!
            sourceGroupPost.content || null
          )
          .run();
      });

      // Record share in group_post_shares
      const insShare = await env.DB.prepare(
        `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
         VALUES (?, ?, ?, 'group', ?)`
      )
        .bind(user_id, post_id, destGroupId, message)
        .run();

      // Notify original post author
      const postOwnerId = toNum(sourceGroupPost.user_id, 0);
      if (postOwnerId && postOwnerId !== user_id) {
        await createNotification(
          env,
          postOwnerId,
          user_id,
          "share",
          "group_post",
          post_id,
          `group_post:${post_id}:share`,
          `shared your post to ${destGroup.name}`
        );
      }

      return json({
        success: true,
        share_id: toNum(insShare.meta?.last_row_id, 0),
        new_post_id: newGroupPostId,
        destination: "group",
        shared_from: "group",
        shared_by_name: sharingUserName,
        original_group_name: sourceGroupName,
        original_owner_name: sourceGroupName,
      });
    }

    // -------------------------------------------------------------
    // SUB-CASE 2: FEED POST TO GROUP
    // "When post is shared to group from feeds it should show fist the name of shared and post owner name"
    // -------------------------------------------------------------
    if (sourceFeedPost) {
      const originalOwnerName = sourceFeedPost.author_name || sourceFeedPost.author_username || "User";
      const originalOwnerId = toNum(sourceFeedPost.user_id, 0);

      const { id: newGroupPostId } = await withNewContentId(async (newId) => {
        return await env.DB.prepare(`
          INSERT INTO group_posts (
            id, group_id, user_id, content,
            media_url, media_urls, media_types, media_meta,
            visibility,
            shared_post_id, shared_from,
            shared_by_user_id, shared_user_name,
            original_owner_name, original_owner_id, original_owner_avatar,
            original_post_content,
            created_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            'public',
            ?, 'feed',
            ?, ?,
            ?, ?, ?,
            ?,
            datetime('now'), datetime('now')
          )
        `)
          .bind(
            newId,
            destGroupId,
            user_id,
            message || sourceFeedPost.content || "",

            sourceFeedPost.media_url || null,
            sourceFeedPost.media_urls || null,
            sourceFeedPost.media_types || null,
            sourceFeedPost.media_meta || null,

            post_id,

            user_id,
            sharingUserName,

            originalOwnerName, // original owner name is the post owner name!
            originalOwnerId,
            sourceFeedPost.author_avatar || null,
            sourceFeedPost.content || null
          )
          .run();
      });

      // Record share in group_post_shares
      const insShare = await env.DB.prepare(
        `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
         VALUES (?, ?, ?, 'group', ?)`
      )
        .bind(user_id, post_id, destGroupId, message)
        .run();

      // Notify original post author
      if (originalOwnerId && originalOwnerId !== user_id) {
        await createNotification(
          env,
          originalOwnerId,
          user_id,
          "share",
          "post",
          post_id,
          `post:${post_id}:share`,
          `shared your post to ${destGroup.name}`
        );
      }

      return json({
        success: true,
        share_id: toNum(insShare.meta?.last_row_id, 0),
        new_post_id: newGroupPostId,
        destination: "group",
        shared_from: "feed",
        shared_by_name: sharingUserName,
        original_owner_name: originalOwnerName,
      });
    }

    return json({ success: false, error: "Original post not found" }, 404);
  } catch (err: any) {
    console.error("Group post share failed:", err);
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
