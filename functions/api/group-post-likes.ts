import type { PagesFunction } from "@cloudflare/workers-types";
import { cors, ok, bad, server } from "./_cors";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

type ReactionType =
  | "like"
  | "love"
  | "haha"
  | "wow"
  | "sad"
  | "angry"
  | "fire"
  | "party";

const ALLOWED: ReactionType[] = ["like", "love", "haha", "wow", "sad", "angry", "fire", "party"];

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeType = (v: any): ReactionType => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "like";
  return ALLOWED.includes(s as ReactionType) ? (s as ReactionType) : "like";
};

const buildReactionMessage = (type: ReactionType) => {
  if (type === "love") return "loved your group post";
  if (type === "haha") return "laughed at your group post";
  if (type === "wow") return "reacted wow to your group post";
  if (type === "sad") return "felt sad about your group post";
  if (type === "angry") return "felt angry about your group post";
  if (type === "fire") return "fired up your group post";
  if (type === "party") return "celebrated your group post";
  return "reacted to your group post";
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/group-post-likes
 * body: { user_id, post_id, type? }
 *
 * Backward compatible:
 * - post_id is group_post_id
 * - if type missing => like
 *
 * Behavior:
 * - If user has no reaction => insert type
 * - If user reaction is same type => remove reaction (toggle off)
 * - If user reaction is different type => update type
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));
    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const post_id = toInt(body.post_id ?? body.group_post_id, 0);
    const type = normalizeType(body.type);

    if (!env?.DB) return server("DB binding missing (DB)");
    if (!user_id || !post_id) return bad("user_id and post_id are required");

    // Ensure post exists + get group_id + owner
    const post = await env.DB.prepare(
      `SELECT id, group_id, user_id
       FROM group_posts
       WHERE id = ?
       LIMIT 1`
    )
      .bind(post_id)
      .first();

    if (!post?.group_id) return bad("Group post not found", 404);

    // Must be a member of that group
    const mem = await env.DB.prepare(
      `SELECT 1 FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(Number(post.group_id), user_id)
      .first();

    if (!mem) return bad("User is not a member of this group", 403);

    const postOwnerId = toInt((post as any)?.user_id, 0);

    // Check existing reaction
    const existing = await env.DB.prepare(
      `SELECT id, type FROM group_post_reactions WHERE group_post_id=? AND user_id=? LIMIT 1`
    )
      .bind(post_id, user_id)
      .first();

    let reacted = false;
    let my_reaction: string | null = null;

    if ((existing as any)?.id) {
      const existingType = String((existing as any).type || "like").toLowerCase();

      // If same type -> toggle off (delete)
      if (existingType === type) {
        await env.DB.prepare(`DELETE FROM group_post_reactions WHERE id=?`)
          .bind(Number((existing as any).id))
          .run();

        reacted = false;
        my_reaction = null;
      } else {
        // Different type -> update
        await env.DB.prepare(`UPDATE group_post_reactions SET type=?, created_at=datetime('now') WHERE id=?`)
          .bind(type, Number((existing as any).id))
          .run();

        reacted = true;
        my_reaction = type;
      }
    } else {
      // No reaction -> insert
      await env.DB.prepare(
        `INSERT INTO group_post_reactions (group_post_id, user_id, type) VALUES (?, ?, ?)`
      )
        .bind(post_id, user_id, type)
        .run();

      reacted = true;
      my_reaction = type;
    }

    // Create notification only when reaction is active
    if (reacted && my_reaction) {
      await createNotification(
        env,
        postOwnerId,
        user_id,
        "react",
        "group_post",
        post_id,
        `group_post:${post_id}:react`,
        buildReactionMessage(my_reaction as ReactionType)
      );
    }

    // total count
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM group_post_reactions WHERE group_post_id=?`
    )
      .bind(post_id)
      .first();
    const reactions_count = Number((row as any)?.c || 0);

    // reactions_by_type (same shape as feeds)
    const byTypeRow = await env.DB.prepare(`
      SELECT json_group_array(
        json_object('type', t.type, 'count', t.c)
      ) AS j
      FROM (
        SELECT LOWER(COALESCE(type,'like')) AS type, COUNT(*) AS c
        FROM group_post_reactions
        WHERE group_post_id = ?
        GROUP BY LOWER(COALESCE(type,'like'))
        ORDER BY c DESC
      ) t
    `).bind(post_id).first();

    // preview (last 30 reactors)
    const previewRow = await env.DB.prepare(`
      SELECT json_group_array(
        json_object(
          'user_id', x.user_id,
          'type', x.type,
          'name', x.name,
          'profile_image_url', x.profile_image_url
        )
      ) AS j
      FROM (
        SELECT
          gpr.user_id AS user_id,
          LOWER(COALESCE(gpr.type,'like')) AS type,
          COALESCE(u.name, u.username, '') AS name,
          CASE
            WHEN u.profile_image_url LIKE 'data:%' THEN NULL
            WHEN length(u.profile_image_url) > 300 THEN NULL
            ELSE u.profile_image_url
          END AS profile_image_url
        FROM group_post_reactions gpr
        LEFT JOIN users u ON u.id = gpr.user_id
        WHERE gpr.group_post_id = ?
        ORDER BY gpr.created_at DESC, gpr.id DESC
        LIMIT 30
      ) x
    `).bind(post_id).first();

    return ok({
      success: true,

      // Backward compat fields
      liked: reacted && my_reaction === "like",
      likes_count: reactions_count,

      // New fields
      reacted,
      my_reaction,
      reactions_count,

      reactions_by_type: byTypeRow?.j ? JSON.parse(String((byTypeRow as any).j)) : [],
      reactions_preview: previewRow?.j ? JSON.parse(String((previewRow as any).j)) : [],
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("UNIQUE")) {
      return ok({ success: true });
    }
    return server(msg || "Failed to react to group post");
  }
};
