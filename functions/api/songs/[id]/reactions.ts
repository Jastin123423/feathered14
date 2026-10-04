// api/songs/[id]/reactions.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeType = (v: any) => String(v || "like").trim().toLowerCase();

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing" }, 500);
    }

    const songId = toNum((params as any)?.id, 0);
    const url = new URL(request.url);
    const viewerId = toNum(url.searchParams.get("viewerId") || request.headers.get("x-user-id") || 0);

    if (!songId) {
      return json({ success: false, error: "Invalid song id" }, 400);
    }

    // Fetch all reactions with user data
    const { results: reactions } = await env.DB.prepare(
      `SELECT 
         sr.user_id,
         sr.type,
         sr.created_at,
         u.username,
         u.name,
         u.profile_image_url,
         u.is_verified
       FROM song_reactions sr
       LEFT JOIN users u ON sr.user_id = u.id
       WHERE sr.song_id = ?
       ORDER BY sr.created_at DESC
       LIMIT 500`
    ).bind(songId).all();

    // Get reaction counts by type
    const { results: counts } = await env.DB.prepare(
      `SELECT 
         type,
         COUNT(*) as count
       FROM song_reactions
       WHERE song_id = ?
       GROUP BY type`
    ).bind(songId).all();

    const countMap: Record<string, number> = {};
    let totalCount = 0;
    for (const c of counts || []) {
      const type = normalizeType((c as any).type);
      const count = toNum((c as any).count, 0);
      countMap[type] = count;
      totalCount += count;
    }

    // Get current user's reaction
    let myReaction = null;
    if (viewerId > 0) {
      const myReactionRow = await env.DB.prepare(
        `SELECT type
         FROM song_reactions
         WHERE song_id = ? AND user_id = ?
         LIMIT 1`
      ).bind(songId, viewerId).first();
      
      if (myReactionRow) {
        myReaction = normalizeType((myReactionRow as any).type);
      }
    }

    // Get comments count
    const commentsCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM song_comments
       WHERE song_id = ? AND COALESCE(is_deleted, 0) = 0`
    ).bind(songId).first();
    const commentsCount = toNum((commentsCountRow as any)?.count, 0);

    // Get shares count
    const sharesCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM song_shares
       WHERE song_id = ?`
    ).bind(songId).first();
    const sharesCount = toNum((sharesCountRow as any)?.count, 0);

    // Format reactions for frontend
    const formattedReactions = (reactions || []).map((r: any) => ({
      user_id: r.user_id,
      type: normalizeType(r.type),
      created_at: r.created_at,
      user: {
        id: r.user_id,
        username: r.username,
        name: r.name,
        profile_image_url: r.profile_image_url,
        is_verified: r.is_verified || false,
      }
    }));

    // Return in format expected by App.tsx useMusicReactions
    return json({
      success: true,
      reactions: formattedReactions,
      reactions_count: totalCount,
      counts: countMap,
      my_reaction: myReaction,
      comments_count: commentsCount,
      shares: sharesCount,
      shares_count: sharesCount,
      share_count: sharesCount,
    });

  } catch (err: any) {
    console.error("GET song reactions error:", err);
    return json(
      { success: false, error: err?.message || "Failed to fetch song reactions" },
      500
    );
  }
};
