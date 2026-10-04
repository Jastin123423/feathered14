import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const storyId = toInt((params as any)?.id, 0);
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    const destination = typeof body.destination === "string" ? body.destination.trim().toLowerCase() : "feed";
    const message = typeof body.message === "string" ? body.message.trim() : (typeof body.content === "string" ? body.content.trim() : "");

    if (!storyId) return json({ success: false, error: "Invalid story id" }, 400);
    if (!userId) return json({ success: false, error: "user_id is required" }, 400);

    const story = await env.DB.prepare(
      `SELECT s.*,
              COALESCE(NULLIF(trim(u.name), ''), NULLIF(trim(u.username), ''), 'User') as author_name,
              u.name as author_full_name,
              u.username as author_username,
              u.profile_image_url as author_avatar,
              u.is_verified as author_verified
       FROM stories s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
       LIMIT 1`
    ).bind(storyId).first<any>();

    if (!story) {
      return json({ success: false, error: "Story not found" }, 404);
    }

    const storyOwnerId = toInt((story as any)?.user_id, 0);

    // Fetch story owner details directly from users table to ensure full profile info
    let storyOwner: any = null;
    if (storyOwnerId) {
      try {
        storyOwner = await env.DB
          .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
          .bind(storyOwnerId)
          .first<any>();
      } catch (_) {}
    }

    // Ensure story_shares table and all columns exist
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS story_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          story_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          destination TEXT DEFAULT 'feed',
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch (_) {}

    try {
      await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN destination TEXT DEFAULT 'feed'`).run();
    } catch (_) {}
    try {
      await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN message TEXT`).run();
    } catch (_) {}
    try {
      await env.DB.prepare(`ALTER TABLE story_shares ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`).run();
    } catch (_) {}

    const ins = await env.DB.prepare(
      `
      INSERT INTO story_shares (story_id, user_id, destination, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      `
    ).bind(storyId, userId, destination, message).run();

    const shareId = toInt(ins.meta?.last_row_id, Date.now());

    if (storyOwnerId && storyOwnerId !== userId) {
      await createNotification(
        env,
        storyOwnerId,
        userId,
        "share",
        "story",
        storyId,
        `story:${storyId}:share`,
        "shared your story"
      );
    }

    // Fetch sharing user details
    let sharingUser: any = null;
    try {
      sharingUser = await env.DB
        .prepare(`SELECT id, name, username, profile_image_url, is_verified FROM users WHERE id = ? LIMIT 1`)
        .bind(userId)
        .first<any>();
    } catch (_) {}

    const isValidName = (v: any) =>
      typeof v === "string" &&
      v.trim().length > 0 &&
      v.trim().toLowerCase() !== "user" &&
      v.trim().toLowerCase() !== "un";

    const ownerName =
      (isValidName(storyOwner?.name) ? storyOwner.name.trim() : null) ||
      (isValidName(story?.author_full_name) ? story.author_full_name.trim() : null) ||
      (isValidName(story?.author_name) ? story.author_name.trim() : null) ||
      storyOwner?.username ||
      story?.author_username ||
      story?.username ||
      "User";

    const ownerUsername = storyOwner?.username || story?.author_username || story?.username || "";
    const ownerAvatar = storyOwner?.profile_image_url || story?.author_avatar || "";
    const isOwnerVerified = Boolean(
      (storyOwner?.is_verified && storyOwner?.is_verified !== '0') ||
      (story?.author_verified && story?.author_verified !== '0')
    );

    const isSharerVerified = Boolean(sharingUser?.is_verified && sharingUser?.is_verified !== '0');
    const sharerName =
      (isValidName(sharingUser?.name) ? sharingUser.name.trim() : null) ||
      sharingUser?.username ||
      "User";

    const authorObj = {
      id: storyOwnerId,
      name: ownerName,
      username: ownerUsername,
      user_name: ownerUsername,
      avatar_url: ownerAvatar,
      profile_image_url: ownerAvatar,
      is_verified: isOwnerVerified,
      verified: isOwnerVerified,
    };

    const sharerAuthor = {
      id: userId,
      name: sharerName,
      username: sharingUser?.username || "",
      user_name: sharingUser?.username || "",
      avatar_url: sharingUser?.profile_image_url || "",
      profile_image_url: sharingUser?.profile_image_url || "",
      is_verified: isSharerVerified,
      verified: isSharerVerified,
    };

    const fullSharedStory = {
      ...story,
      id: storyId,
      story_id: storyId,
      item_type: 'story',
      type: story.type || 'story',
      post_type: 'story',
      kind: 'story',
      author: authorObj,
      user: authorObj,
      author_name: ownerName,
      author_full_name: ownerName,
      author_username: ownerUsername,
      author_image: ownerAvatar,
    };

    const createdSharedPost = {
      id: shareId,
      post_id: shareId,
      feed_key: `story_share:${shareId}`,
      source: 'story_share',
      item_type: 'story_share',
      type: 'story_share',
      post_type: 'story_share',
      kind: 'story_share',
      user_id: userId,
      author: sharerAuthor,
      user: sharerAuthor,
      content: message || '',
      description: message || '',
      shared_post_id: storyId,
      shared_story_id: storyId,
      shared_story: fullSharedStory,
      shared_post: fullSharedStory,
      created_at: new Date().toISOString(),
      reactions_count: 0,
      comments_count: 0,
      shares: 0,
      shares_count: 0,
      visibility: 'public',
    };

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as shares_count
       FROM story_shares
       WHERE story_id = ?`
    ).bind(storyId).first();

    const finalSharesCount = toInt((countRow as any)?.shares_count, 1);

    return json({
      success: true,
      share_id: shareId,
      post_id: shareId,
      story_id: storyId,
      destination,
      shares: finalSharesCount,
      shares_count: finalSharesCount,
      post: createdSharedPost,
      shared_post: fullSharedStory,
      shared_story: fullSharedStory,
    });
  } catch (err: any) {
    return json(
      { success: false, error: "Backend crash", message: String(err?.message ?? err) },
      500
    );
  }
};
