import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  });

const bad = (error: string, status = 400) => json({ success: false, error }, status);
const ok = (data: any, status = 200) => json({ success: true, ...data }, status);
const server = (error = "Server error") => json({ success: false, error }, 500);

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const toInt = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeArray = (v: any): any[] => (Array.isArray(v) ? v : []);

const getGroup = async (env: Env, groupId: number) => {
  return await env.DB.prepare(
    `SELECT id, admin_id, name, description, type, category, cover_image, profile_image, members_count
     FROM groups
     WHERE id = ?
     LIMIT 1`
  )
    .bind(groupId)
    .first();
};

const getMembership = async (env: Env, groupId: number, userId: number) => {
  return await env.DB.prepare(
    `SELECT role
     FROM group_members
     WHERE group_id = ? AND user_id = ?
     LIMIT 1`
  )
    .bind(groupId, userId)
    .first();
};

const isGroupAdminOrOwner = async (env: Env, groupId: number, userId: number) => {
  const group = await getGroup(env, groupId);
  if (!group) return false;
  if (toInt((group as any).admin_id) === userId) return true;

  const member = await getMembership(env, groupId, userId);
  return String((member as any)?.role || "").toLowerCase() === "admin";
};

const isAlreadyMember = async (env: Env, groupId: number, userId: number) => {
  const row = await env.DB.prepare(
    `SELECT 1
     FROM group_members
     WHERE group_id = ? AND user_id = ?
     LIMIT 1`
  )
    .bind(groupId, userId)
    .first();

  return !!row;
};

/**
 * POST /api/group-invites
 * body:
 * {
 *   group_id: number,
 *   inviter_id: number,
 *   invitee_ids: number[]
 * }
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const group_id = toInt(body.group_id, 0);
    const inviter_id = toInt(body.inviter_id, 0);
    const invitee_ids = safeArray(body.invitee_ids)
      .map((x) => toInt(x, 0))
      .filter((x) => x > 0);

    if (!group_id) return bad("group_id is required");
    if (!inviter_id) return bad("inviter_id is required");
    if (!invitee_ids.length) return bad("invitee_ids is required");

    const group = await getGroup(env, group_id);
    if (!group) return bad("Group not found", 404);

    const isAdmin = await isGroupAdminOrOwner(env, group_id, inviter_id);
    const isMember = await isAlreadyMember(env, group_id, inviter_id);
    const canInvite = isAdmin || isMember;
    if (!canInvite) return bad("Only group admins or members can send invites", 403);

    const results: any[] = [];

    for (const invitee_id of invitee_ids) {
      if (invitee_id === inviter_id) {
        results.push({
          invitee_id,
          success: false,
          error: "You cannot invite yourself",
        });
        continue;
      }

      const memberAlready = await isAlreadyMember(env, group_id, invitee_id);
      if (memberAlready) {
        results.push({
          invitee_id,
          success: false,
          error: "User is already a member",
        });
        continue;
      }

      const existing = await env.DB.prepare(
        `SELECT id, status
         FROM group_invites
         WHERE group_id = ? AND invitee_id = ?
         LIMIT 1`
      )
        .bind(group_id, invitee_id)
        .first();

      if (existing) {
        const existingStatus = String((existing as any).status || "pending");

        if (existingStatus === "pending") {
          results.push({
            invitee_id,
            success: false,
            error: "Invite already pending",
          });
          continue;
        }

        const existingInviteId = toInt((existing as any).id);
        await env.DB.prepare(
          `UPDATE group_invites
           SET inviter_id = ?, status = 'pending', created_at = CURRENT_TIMESTAMP, responded_at = NULL
           WHERE id = ?`
        )
          .bind(inviter_id, existingInviteId)
          .run();

        // Trigger notification to invitee
        try {
          await createNotification(
            env,
            invitee_id,
            inviter_id,
            "group_invite",
            "group",
            group_id,
            `group:${group_id}:invite:${invitee_id}`,
            `invited you to join ${(group as any)?.name || "a group"}`
          );
          // Set parent_id on notification to existingInviteId
          await env.DB.prepare(
            `UPDATE notifications SET parent_id = ? WHERE recipient_id = ? AND group_key = ?`
          ).bind(String(existingInviteId), invitee_id, `group:${group_id}:invite:${invitee_id}`).run();
        } catch (_) {}

        results.push({
          invitee_id,
          success: true,
          reused: true,
        });
        continue;
      }

      const insertRes = await env.DB.prepare(
        `INSERT INTO group_invites (group_id, inviter_id, invitee_id, status)
         VALUES (?, ?, ?, 'pending')`
      )
        .bind(group_id, inviter_id, invitee_id)
        .run();

      const newInviteId = toInt(insertRes?.meta?.last_row_id, 0);

      // Trigger notification to invitee
      try {
        await createNotification(
          env,
          invitee_id,
          inviter_id,
          "group_invite",
          "group",
          group_id,
          `group:${group_id}:invite:${invitee_id}`,
          `invited you to join ${(group as any)?.name || "a group"}`
        );
        if (newInviteId) {
          await env.DB.prepare(
            `UPDATE notifications SET parent_id = ? WHERE recipient_id = ? AND group_key = ?`
          ).bind(String(newInviteId), invitee_id, `group:${group_id}:invite:${invitee_id}`).run();
        }
      } catch (_) {}

      results.push({
        invitee_id,
        success: true,
        reused: false,
      });
    }

    return ok({
      message: "Invites processed",
      results,
    });
  } catch (e: any) {
    return server(e?.message || "Failed to send invites");
  }
};

/**
 * GET /api/group-invites?user_id=123
 * Lists pending invites for a user
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const user_id = toInt(url.searchParams.get("user_id"), 0);

    if (!user_id) return bad("user_id is required");

    const { results } = await env.DB.prepare(
      `SELECT
         gi.id,
         gi.group_id,
         gi.inviter_id,
         gi.invitee_id,
         gi.status,
         gi.created_at,
         gi.responded_at,

         g.name AS group_name,
         g.description AS group_description,
         g.type AS group_type,
         g.category AS group_category,
         g.cover_image AS group_cover_image,
         g.profile_image AS group_profile_image,
         g.members_count AS group_members_count,

         u.name AS inviter_name,
         u.username AS inviter_username,
         u.profile_image_url AS inviter_profile_image_url,
         u.is_verified AS inviter_is_verified

       FROM group_invites gi
       JOIN groups g ON g.id = gi.group_id
       JOIN users u ON u.id = gi.inviter_id
       WHERE gi.invitee_id = ?
         AND gi.status = 'pending'
       ORDER BY gi.created_at DESC`
    )
      .bind(user_id)
      .all();

    const invites = safeArray(results).map((row: any) => ({
      id: toInt(row.id),
      group_id: toInt(row.group_id),
      inviter_id: toInt(row.inviter_id),
      invitee_id: toInt(row.invitee_id),
      status: row.status,
      created_at: row.created_at,
      responded_at: row.responded_at,
      group: {
        id: toInt(row.group_id),
        name: row.group_name || "",
        description: row.group_description || "",
        type: row.group_type || "public",
        category: row.group_category || "general",
        cover_image: row.group_cover_image || "",
        profile_image: row.group_profile_image || "",
        members_count: toInt(row.group_members_count, 0),
      },
      inviter: {
        id: toInt(row.inviter_id),
        name: row.inviter_name || "",
        username: row.inviter_username || "",
        profile_image_url: row.inviter_profile_image_url || "",
        is_verified: !!row.inviter_is_verified,
      },
    }));

    return ok({ invites });
  } catch (e: any) {
    return server(e?.message || "Failed to fetch invites");
  }
};

/**
 * PUT /api/group-invites?id=123
 * body:
 * {
 *   status: "accepted" | "declined",
 *   user_id: number
 * }
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    let inviteId = toInt(url.searchParams.get("id"), 0);
    const body = await request.json().catch(() => ({} as any));

    if (!inviteId) {
      inviteId = toInt(body.id ?? body.invite_id, 0);
    }

    const headerUserId = toInt(request.headers.get("x-user-id"), 0);
    const bodyUserId = toInt(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    let status = String(body.status || "").trim().toLowerCase();
    if (status === "rejected" || status === "reject" || status === "decline") {
      status = "declined";
    }
    if (status === "join" || status === "accept") {
      status = "accepted";
    }

    if (!user_id) return bad("user_id is required");
    if (!["accepted", "declined"].includes(status)) {
      return bad("status must be accepted or declined");
    }

    // Fallback: if inviteId not provided, search pending invite by group_id and user_id
    if (!inviteId) {
      const groupId = toInt(url.searchParams.get("group_id"), 0) || toInt(body.group_id, 0);
      if (groupId) {
        const found = await env.DB.prepare(
          `SELECT id FROM group_invites WHERE group_id = ? AND invitee_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
        ).bind(groupId, user_id).first<{ id: number }>();
        if (found?.id) {
          inviteId = toInt(found.id);
        }
      }
    }

    if (!inviteId) return bad("Invite id is required");

    const invite = await env.DB.prepare(
      `SELECT id, group_id, invitee_id, status
       FROM group_invites
       WHERE id = ?
       LIMIT 1`
    )
      .bind(inviteId)
      .first();

    if (!invite) return bad("Invite not found", 404);

    const invitee_id = toInt((invite as any).invitee_id, 0);
    const group_id = toInt((invite as any).group_id, 0);
    const currentStatus = String((invite as any).status || "pending");

    if (invitee_id !== user_id) return bad("Not allowed", 403);
    if (currentStatus !== "pending") return bad("Invite already handled");

    await env.DB.prepare(
      `UPDATE group_invites
       SET status = ?, responded_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(status, inviteId)
      .run();

    // Mark any corresponding notifications as read
    try {
      await env.DB.prepare(
        `UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND entity_type = 'group' AND entity_id = ?`
      ).bind(user_id, String(group_id)).run();
    } catch (_) {}

    // If accepted, add user to group_members if not already there
    if (status === "accepted") {
      const memberAlready = await isAlreadyMember(env, group_id, user_id);

      if (!memberAlready) {
        await env.DB.prepare(
          `INSERT INTO group_members (group_id, user_id, role)
           VALUES (?, ?, 'member')`
        )
          .bind(group_id, user_id)
          .run();

        await env.DB.prepare(
          `UPDATE groups
           SET members_count = COALESCE(members_count, 0) + 1
           WHERE id = ?`
        )
          .bind(group_id)
          .run();
      }
    }

    return ok({
      message: `Invite ${status}`,
      invite_id: inviteId,
      group_id,
      status,
    });
  } catch (e: any) {
    return server(e?.message || "Failed to update invite");
  }
};

/**
 * DELETE /api/group-invites?id=123&user_id=456
 * Used to decline/delete invite from UI
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const inviteId = toInt(url.searchParams.get("id"), 0);
    const user_id = toInt(url.searchParams.get("user_id"), 0);

    if (!inviteId) return bad("Invite id is required");
    if (!user_id) return bad("user_id is required");

    const invite = await env.DB.prepare(
      `SELECT id, invitee_id
       FROM group_invites
       WHERE id = ?
       LIMIT 1`
    )
      .bind(inviteId)
      .first();

    if (!invite) return bad("Invite not found", 404);

    const invitee_id = toInt((invite as any).invitee_id, 0);
    if (invitee_id !== user_id) return bad("Not allowed", 403);

    await env.DB.prepare(`DELETE FROM group_invites WHERE id = ?`)
      .bind(inviteId)
      .run();

    return ok({
      message: "Invite deleted",
      invite_id: inviteId,
    });
  } catch (e: any) {
    return server(e?.message || "Failed to delete invite");
  }
};
