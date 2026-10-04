// functions/api/group-suggestions.ts-
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  DB: D1Database;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const userId = toInt(url.searchParams.get("user_id"));
    const limit = Math.max(1, Math.min(12, toInt(url.searchParams.get("limit"), 6)));

    if (!userId) {
      return json({ success: false, error: "user_id is required" }, 400);
    }

    // Groups user already joined
    const memberRes = await env.DB.prepare(`
      SELECT group_id
      FROM group_members
      WHERE user_id = ?
    `).bind(userId).all();

    const joinedGroupIds = Array.isArray(memberRes.results)
      ? memberRes.results.map((r: any) => Number(r.group_id)).filter(Number.isFinite)
      : [];

    const excludedIds = Array.from(new Set(joinedGroupIds));
    const placeholders = excludedIds.map(() => "?").join(",");

    let groupsSql = `
      SELECT
        g.id,
        g.admin_id,
        g.name,
        g.description,
        g.type,
        g.cover_image,
        g.profile_image,
        g.created_at,
        g.category
      FROM groups g
    `;

    if (excludedIds.length > 0) {
      groupsSql += ` WHERE g.id NOT IN (${placeholders}) `;
    }

    groupsSql += ` ORDER BY g.created_at DESC, g.id DESC LIMIT ? `;

    const stmt =
      excludedIds.length > 0
        ? env.DB.prepare(groupsSql).bind(...excludedIds, limit * 3)
        : env.DB.prepare(groupsSql).bind(limit * 3);

    const groupsRes = await stmt.all();
    const rows = Array.isArray(groupsRes.results) ? groupsRes.results : [];

    const suggestions = [];

    for (const g of rows) {
      const groupId = Number((g as any).id);
      if (!groupId) continue;

      const membersRes = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM group_members
        WHERE group_id = ?
      `).bind(groupId).first<any>();

      const mutualRes = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM group_members gm
        WHERE gm.group_id = ?
          AND gm.user_id IN (
            SELECT following_id
            FROM user_follows
            WHERE follower_id = ?
          )
      `).bind(groupId, userId).first<any>();

      const membersCount = Number(membersRes?.count || 0);
      const mutualCount = Number(mutualRes?.count || 0);

      suggestions.push({
        id: groupId,
        admin_id: Number((g as any).admin_id || 0),
        name: String((g as any).name || "Untitled Group"),
        description: String((g as any).description || ""),
        type: String((g as any).type || "public"),
        cover_image: String((g as any).cover_image || ""),
        profile_image: String((g as any).profile_image || ""),
        created_at: String((g as any).created_at || ""),
        category: String((g as any).category || "general"),
        members_count: membersCount,
        mutual_count: mutualCount,
        is_member: false,
        score: mutualCount * 10 + membersCount,
      });
    }

    suggestions.sort((a, b) => b.score - a.score || b.id - a.id);

    return json({
      success: true,
      groups: suggestions.slice(0, limit),
    });
  } catch (error: any) {
    return json(
      { success: false, error: error?.message || "Failed to fetch group suggestions" },
      500
    );
  }
};
