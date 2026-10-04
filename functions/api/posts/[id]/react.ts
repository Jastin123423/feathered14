
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const post_id = Number((params as any)?.id);
    const body = await request.json().catch(() => ({}));
    const headerUserId = Number(request.headers.get("x-user-id"));
    const bodyUserId = Number(body?.user_id);
    const user_id = headerUserId || bodyUserId;
    const type = String(body?.type || body?.reaction || "like");

    if (!post_id || !user_id) {
      return Response.json({ error: "Invalid data" }, { status: 400, headers: cors });
    }

    const existing: any = await env.DB.prepare(`
      SELECT type FROM post_reactions WHERE post_id=? AND user_id=?
    `)
      .bind(post_id, user_id)
      .first();

    let my_reaction: string | null = null;

    if (existing) {
      if (existing.type === type) {
        // Toggle off if clicking the same reaction
        await env.DB.prepare(`
          DELETE FROM post_reactions
          WHERE post_id=? AND user_id=?
        `)
          .bind(post_id, user_id)
          .run();
        my_reaction = null;
      } else {
        // Switch to the new reaction
        await env.DB.prepare(`
          UPDATE post_reactions SET type=?
          WHERE post_id=? AND user_id=?
        `)
          .bind(type, post_id, user_id)
          .run();
        my_reaction = type;
      }
    } else {
      await env.DB.prepare(`
        INSERT INTO post_reactions(post_id, user_id, type)
        VALUES(?,?,?)
      `)
        .bind(post_id, user_id, type)
        .run();
      my_reaction = type;

      const post: any = await env.DB.prepare(`
        SELECT user_id FROM posts WHERE id=?
      `)
        .bind(post_id)
        .first();

      if (post && post.user_id !== user_id) {
        await createNotification(
          env,
          post.user_id,
          user_id,
          "react",
          "post",
          post_id,
          `react_post_${post_id}`
        );
      }
    }

    const count: any = await env.DB.prepare(`
      SELECT COUNT(*) c FROM post_reactions WHERE post_id=?
    `)
      .bind(post_id)
      .first();

    const reactions_count = Number(count?.c || 0);

    return Response.json(
      {
        success: true,
        reactions_count,
        my_reaction,
        reaction: my_reaction,
      },
      { headers: cors }
    );
  } catch (err: any) {
    return Response.json(
      { error: "Backend crash", message: String(err?.message ?? err) },
      { status: 500, headers: cors }
    );
  }
};

