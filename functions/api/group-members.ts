// functions/api/group-members.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { cors, ok, bad, server } from "./_cors";
import { createNotification } from "../utils/createNotification";

type Env = { DB: D1Database };

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toStr = (v: any, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/* =========================================================
   JOIN — POST /api/group-members
   body: { group_id, user_id, role? }
   ========================================================= */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const user_id = headerUserId || bodyUserId || 0;

    const group_id = toNum(body.group_id, 0);
    const role = String(body.role || "member").trim().toLowerCase();

    if (!group_id || !user_id) return bad("group_id and user_id are required");
    if (!(role === "admin" || role === "member" || role === "moderator")) {
      return bad("role must be admin, moderator or member");
    }

    const group = await env.DB
      .prepare(`SELECT id, admin_id FROM groups WHERE id = ? LIMIT 1`)
      .bind(group_id)
      .first();

    if (!group) return bad("Group not found", 404);

    const existing = await env.DB
      .prepare(
        `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1`
      )
      .bind(group_id, user_id)
      .first();

    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
         VALUES (?, ?, ?)`
      )
      .bind(group_id, user_id, role)
      .run();

    if (!existing) {
      await env.DB
        .prepare(
          `UPDATE groups
           SET members_count = COALESCE(members_count, 0) + 1
           WHERE id = ?`
        )
        .bind(group_id)
        .run();

      const adminId = toNum((group as any).admin_id, 0);

      if (adminId && adminId !== user_id) {
        await createNotification(
          env,
          adminId,
          user_id,
          "group_request",
          "group",
          group_id,
          `group:${group_id}:member_join:${user_id}`,
          "joined your group"
        );
      }
    }

    return ok({
      success: true,
      message: existing ? "User is already a member" : "User added to group",
      already_member: !!existing,
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("FOREIGN KEY")) return bad("Invalid group_id or user_id", 400);
    return server(msg || "Failed to join group");
  }
};

/* =========================================================
   LIST — GET /api/group-members?group_id=123
   ========================================================= */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const group_id = toNum(url.searchParams.get("group_id"), 0);
    if (!group_id) return bad("group_id is required");

    const { results } = await env.DB
      .prepare(
        `SELECT
           gm.user_id,
           gm.role AS group_role,
           gm.joined_at,
           COALESCE(gm.posting_disabled, 0) AS posting_disabled,
           gm.disabled_by,
           gm.disabled_at,
           gm.disabled_reason,
           u.username,
           u.name,
           u.profile_image_url,
           u.is_verified,
           u.role AS user_role
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
         ORDER BY
           CASE
             WHEN gm.role = 'admin' THEN 0
             WHEN gm.role = 'moderator' THEN 1
             ELSE 2
           END,
           gm.joined_at DESC`
      )
      .bind(group_id)
      .all();

    return ok({ members: results || [] });
  } catch (e: any) {
    return server(e?.message || "Failed to fetch members");
  }
};

/* =========================================================
   UPDATE — PATCH /api/group-members?action=...
   Actions:
     - toggle-posting          → disable / enable one member
     - disable-all-members     → disable every non-admin member
     - enable-all-members      → re-enable every member
     - make-admin              → promote member to group admin
     - remove-admin            → demote admin back to member
     - make-moderator          → promote to moderator (optional)
     - remove-moderator        → demote moderator (optional)
   ========================================================= */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const action = String(url.searchParams.get("action") || "")
      .trim()
      .toLowerCase();
    const body = await request.json().catch(() => ({} as any));

    const group_id = toNum(body.group_id ?? url.searchParams.get("group_id"), 0);
    const user_id = toNum(body.user_id, 0);
    const actor_id =
      toNum(body.actor_id, 0) || toNum(request.headers.get("x-user-id"), 0);

    if (!group_id || !actor_id) {
      return bad("group_id and actor_id are required");
    }

    const group = await env.DB
      .prepare(`SELECT id, admin_id FROM groups WHERE id = ? LIMIT 1`)
      .bind(group_id)
      .first();

    if (!group) return bad("Group not found", 404);

    const ownerId = toNum((group as any).admin_id, 0);

    // ---------- Permission: owner OR group admin ----------
    let canManage = ownerId === actor_id;

    if (!canManage) {
      const actorMember = await env.DB
        .prepare(
          `SELECT role FROM group_members
           WHERE group_id = ? AND user_id = ?
           LIMIT 1`
        )
        .bind(group_id, actor_id)
        .first<{ role: string }>();

      canManage = String(actorMember?.role || "").toLowerCase() === "admin";
    }

    if (!canManage) {
      return bad("Only group admin can manage members", 403);
    }

    // ---------- DISABLE / ENABLE ONE MEMBER ----------
    if (action === "toggle-posting") {
      if (!user_id) return bad("user_id is required");

      const disabled = body.disabled ? 1 : 0;
      const reason = toStr(body.reason) || null;

      if (user_id === ownerId) {
        return bad("Cannot disable the group owner", 403);
      }
      if (user_id === actor_id) {
        return bad("Cannot disable yourself", 400);
      }

      const member = await env.DB
        .prepare(
          `SELECT role FROM group_members
           WHERE group_id = ? AND user_id = ?
           LIMIT 1`
        )
        .bind(group_id, user_id)
        .first<{ role: string }>();

      if (!member) return bad("Member not found", 404);

      // Prevent admins disabling other admins (except owner who can)
      const memberRole = String(member.role || "").toLowerCase();
      if (memberRole === "admin" && actor_id !== ownerId) {
        return bad("Only the group owner can manage admins", 403);
      }

      await env.DB
        .prepare(
          `UPDATE group_members
           SET posting_disabled = ?,
               disabled_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
               disabled_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
               disabled_reason = CASE WHEN ? = 1 THEN ? ELSE NULL END
           WHERE group_id = ? AND user_id = ?`
        )
        .bind(
          disabled,
          disabled,
          actor_id,
          disabled,
          disabled,
          reason,
          group_id,
          user_id
        )
        .run();

      return ok({
        success: true,
        action: "toggle-posting",
        group_id,
        user_id,
        posting_disabled: !!disabled,
      });
    }

    // ---------- DISABLE ALL NON-ADMIN MEMBERS ----------
    if (action === "disable-all-members") {
      const reason = toStr(body.reason) || "Disabled by group admin";

      const result = await env.DB
        .prepare(
          `UPDATE group_members
           SET posting_disabled = 1,
               disabled_by = ?,
               disabled_at = datetime('now'),
               disabled_reason = ?
           WHERE group_id = ?
             AND user_id != ?
             AND role != 'admin'`
        )
        .bind(actor_id, reason, group_id, ownerId)
        .run();

      return ok({
        success: true,
        action: "disable-all-members",
        group_id,
        affected: result.meta?.changes ?? 0,
      });
    }

    // ---------- ENABLE ALL MEMBERS ----------
    if (action === "enable-all-members") {
      const result = await env.DB
        .prepare(
          `UPDATE group_members
           SET posting_disabled = 0,
               disabled_by = NULL,
               disabled_at = NULL,
               disabled_reason = NULL
           WHERE group_id = ?`
        )
        .bind(group_id)
        .run();

      return ok({
        success: true,
        action: "enable-all-members",
        group_id,
        affected: result.meta?.changes ?? 0,
      });
    }

    // ---------- MAKE / REMOVE GROUP ADMIN ----------
    if (action === "make-admin") {
      if (!user_id) return bad("user_id is required");

      const member = await env.DB
        .prepare(
          `SELECT role FROM group_members
           WHERE group_id = ? AND user_id = ?
           LIMIT 1`
        )
        .bind(group_id, user_id)
        .first();

      if (!member) return bad("Member not found", 404);

      if (user_id === ownerId) {
        return bad("User is already the owner", 400);
      }

      await env.DB
        .prepare(
          `UPDATE group_members
           SET role = 'admin',
               posting_disabled = 0,
               disabled_by = NULL,
               disabled_at = NULL,
               disabled_reason = NULL
           WHERE group_id = ? AND user_id = ?`
        )
        .bind(group_id, user_id)
        .run();

      return ok({
        success: true,
        action: "make-admin",
        group_id,
        user_id,
        role: "admin",
      });
    }

    if (action === "remove-admin") {
      if (!user_id) return bad("user_id is required");

      if (user_id === ownerId) {
        return bad("Cannot demote the group owner", 403);
      }
      if (actor_id !== ownerId) {
        return bad("Only the group owner can remove admins", 403);
      }

      await env.DB
        .prepare(
          `UPDATE group_members
           SET role = 'member'
           WHERE group_id = ? AND user_id = ?`
        )
        .bind(group_id, user_id)
        .run();

      return ok({
        success: true,
        action: "remove-admin",
        group_id,
        user_id,
        role: "member",
      });
    }

    // ---------- MODERATOR (kept from before) ----------
    if (action === "make-moderator") {
      if (!user_id) return bad("user_id is required");
      if (user_id === ownerId) return bad("Admin is already highest role", 400);

      await env.DB
        .prepare(
          `UPDATE group_members
           SET role = 'moderator'
           WHERE group_id = ? AND user_id = ?`
        )
        .bind(group_id, user_id)
        .run();

      return ok({
        success: true,
        action: "make-moderator",
        group_id,
        user_id,
        role: "moderator",
      });
    }

    if (action === "remove-moderator") {
      if (!user_id) return bad("user_id is required");
      if (user_id === ownerId) return bad("Cannot change admin role", 400);

      await env.DB
        .prepare(
          `UPDATE group_members
           SET role = 'member'
           WHERE group_id = ? AND user_id = ?`
        )
        .bind(group_id, user_id)
        .run();

      return ok({
        success: true,
        action: "remove-moderator",
        group_id,
        user_id,
        role: "member",
      });
    }

    return bad("Unsupported action", 400);
  } catch (e: any) {
    return server(e?.message || "Failed to update member");
  }
};

/* =========================================================
   REMOVE MEMBER — DELETE /api/group-members
   Query: ?group_id=1&user_id=7
          &actor_id=1 (optional — defaults to x-user-id header)
   ========================================================= */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const group_id = toNum(url.searchParams.get("group_id"), 0);
    const user_id = toNum(url.searchParams.get("user_id"), 0);
    const actor_id =
      toNum(url.searchParams.get("actor_id"), 0) ||
      toNum(request.headers.get("x-user-id"), 0) ||
      user_id;

    if (!group_id || !user_id) return bad("group_id and user_id are required");

    const g = await env.DB
      .prepare(`SELECT admin_id FROM groups WHERE id = ? LIMIT 1`)
      .bind(group_id)
      .first();

    if (!g) return bad("Group not found", 404);

    const ownerId = toNum((g as any).admin_id, 0);

    if (ownerId === user_id) {
      return bad(
        "Group owner cannot leave. Delete the group or transfer ownership.",
        400
      );
    }

    // Permission: self OR group admin OR group owner
    const isSelf = actor_id === user_id;
    let isGroupAdmin = actor_id === ownerId;

    if (!isSelf && !isGroupAdmin) {
      const actorMember = await env.DB
        .prepare(
          `SELECT role FROM group_members
           WHERE group_id = ? AND user_id = ?
           LIMIT 1`
        )
        .bind(group_id, actor_id)
        .first<{ role: string }>();

      isGroupAdmin =
        String(actorMember?.role || "").toLowerCase() === "admin";
    }

    if (!isSelf && !isGroupAdmin) {
      return bad("Only the member or group admin can remove a member", 403);
    }

    const existing = await env.DB
      .prepare(
        `SELECT 1 FROM group_members
         WHERE group_id = ? AND user_id = ?
         LIMIT 1`
      )
      .bind(group_id, user_id)
      .first();

    if (!existing) {
      return ok({
        success: true,
        message: "User was not a member",
        already_removed: true,
      });
    }

    await env.DB
      .prepare(
        `DELETE FROM group_members
         WHERE group_id = ? AND user_id = ?`
      )
      .bind(group_id, user_id)
      .run();

    await env.DB
      .prepare(
        `UPDATE groups
         SET members_count = CASE
           WHEN COALESCE(members_count, 0) > 0 THEN members_count - 1
           ELSE 0
         END
         WHERE id = ?`
      )
      .bind(group_id)
      .run();

    return ok({
      success: true,
      message: "User removed from group",
      already_removed: false,
    });
  } catch (e: any) {
    return server(e?.message || "Failed to leave group");
  }
};
