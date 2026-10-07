import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const post_id = toNum(body.post_id, 0);
    const group_id = toNum(body.group_id, 0);

    const destination = String(body.destination || "feed").trim().toLowerCase();
    const message = typeof body.message === "string" ? body.message.trim() : null;

    if (!user_id || !post_id || !group_id) {
      return json({ success: false, error: "user_id, post_id, group_id required" }, 400);
    }

    /* --------------------------------------------------
       Ensure group post exists
    ---------------------------------------------------*/
    const post = await env.DB.prepare(
      `SELECT id, user_id, group_id
       FROM group_posts
       WHERE id = ?
       LIMIT 1`
    )
      .bind(post_id)
      .first();

    if (!post) {
      return json({ success: false, error: "Group post not found" }, 404);
    }

    /* --------------------------------------------------
       Ensure user is group member
    ---------------------------------------------------*/
    const member = await env.DB.prepare(
      `SELECT 1 FROM group_members WHERE group_id=? AND user_id=? LIMIT 1`
    )
      .bind(group_id, user_id)
      .first();

    if (!member) {
      return json({ success: false, error: "User is not a member of this group" }, 403);
    }

    /* --------------------------------------------------
       Insert share
    ---------------------------------------------------*/
    const insert = await env.DB.prepare(
      `INSERT INTO group_post_shares (user_id, group_post_id, group_id, destination, message)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(user_id, post_id, group_id, destination, message)
      .run();

    const share_id = toNum(insert.meta?.last_row_id, 0);

    /* --------------------------------------------------
       Notification
    ---------------------------------------------------*/
    const postOwnerId = toNum((post as any)?.user_id, 0);

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

    /* --------------------------------------------------
       Count
    ---------------------------------------------------*/
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
      destination,
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Server error" }, 500);
  }
};
