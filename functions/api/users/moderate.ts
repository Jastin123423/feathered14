// functions/api/users/moderate.ts
import type { PagesFunction } from "@cloudflare/workers-types";

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

const ADMIN_ROLES = new Set(["admin", "superadmin", "moderator"]);
const SUPER_ADMIN_ROLES = new Set(["admin", "superadmin"]);

const DURATIONS: Record<string, number> = {
  week: 7,
  month: 30,
  indefinite: 36500,
  forever: 36500,
  until_unsuspend: 36500,
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

/**
 * POST /api/users/moderate
 * body: {
 *   user_id: number,
 *   action: "verify" | "unverify" | "suspend" | "unsuspend" | "delete",
 *   duration?: "week" | "month",
 *   reason?: string
 * }
 *
 * "delete" behaves exactly like "suspend" — soft delete only.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any = {};
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const requesterId = toNum(request.headers.get("x-user-id"), 0);
    if (!requesterId) return json({ success: false, error: "Login required" }, 401);

    body = await request.json().catch(() => ({}));
    const targetId = toNum(body.user_id, 0);
    const action = String(body.action || "").trim().toLowerCase();
    const duration = String(body.duration || "").trim().toLowerCase();
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : null;

    if (!targetId) return json({ success: false, error: "user_id is required" }, 400);
    if (!action) return json({ success: false, error: "action is required" }, 400);

    // ---------- Load requester ----------
    const requester = await env.DB
      .prepare(`SELECT id, role FROM users WHERE id = ? LIMIT 1`)
      .bind(requesterId)
      .first<any>();

    if (!requester) return json({ success: false, error: "Requester not found" }, 404);

    const role = String(requester.role || "").toLowerCase();
    const isAdmin = ADMIN_ROLES.has(role);
    const isSuperAdmin = SUPER_ADMIN_ROLES.has(role);

    if (!isAdmin) return json({ success: false, error: "Not allowed" }, 403);
    if (targetId === requesterId) {
      return json({ success: false, error: "Cannot moderate yourself" }, 400);
    }

    // ---------- Load target ----------
    const target = await env.DB
      .prepare(
        `SELECT id, role, username, is_verified, suspended_until, posting_disabled
         FROM users WHERE id = ? LIMIT 1`
      )
      .bind(targetId)
      .first<any>();

    if (!target) return json({ success: false, error: "User not found" }, 404);

    const targetRole = String(target.role || "").toLowerCase();
    const STAFF = new Set(["admin", "superadmin", "moderator"]);

    if (!isSuperAdmin && STAFF.has(targetRole)) {
      return json(
        { success: false, error: "Only admins can moderate other staff" },
        403
      );
    }

    // =========================================================
    // VERIFY
    // =========================================================
    if (action === "verify") {
      await env.DB
        .prepare(`UPDATE users SET is_verified = 1 WHERE id = ?`)
        .bind(targetId)
        .run();

      return json({
        success: true,
        action: "verify",
        user_id: targetId,
        is_verified: 1,
      });
    }

    // =========================================================
    // UNVERIFY
    // =========================================================
    if (action === "unverify") {
      if (!isSuperAdmin) {
        return json({ success: false, error: "Only admins can unverify" }, 403);
      }

      await env.DB
        .prepare(`UPDATE users SET is_verified = 0 WHERE id = ?`)
        .bind(targetId)
        .run();

      return json({
        success: true,
        action: "unverify",
        user_id: targetId,
        is_verified: 0,
      });
    }

    // =========================================================
    // SUSPEND / DELETE  →  soft-delete, same behavior
    // =========================================================
    if (action === "suspend" || action === "delete") {
      // Compute expiry in JS (avoids SQL concat quirks)
      let expiresAt: string | null = null;

      if (action === "suspend") {
        const days = DURATIONS[duration];
        if (!days) {
          return json(
            { success: false, error: "duration must be 'week' or 'month'" },
            400
          );
        }
        const ms = days * 24 * 60 * 60 * 1000;
        expiresAt = new Date(Date.now() + ms)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
      } else {
        // delete → permanent (far-future)
        expiresAt = "9999-12-31 23:59:59";
      }

      const finalReason =
        reason || (action === "delete" ? "Account deleted" : "Suspended");

      await env.DB
        .prepare(
          `UPDATE users
           SET suspended_until = ?,
               suspended_by = ?,
               suspension_reason = ?,
               suspended_at = datetime('now'),
               posting_disabled = 1
           WHERE id = ?`
        )
        .bind(expiresAt, requesterId, finalReason, targetId)
        .run();

      return json({
        success: true,
        action,
        user_id: targetId,
        suspended_until: expiresAt,
        reason: finalReason,
        soft_deleted: true,
      });
    }

    // =========================================================
    // MAKE MODERATOR / REMOVE MODERATOR
    // =========================================================
    if (action === "make_moderator" || action === "moderator") {
      if (!isSuperAdmin) {
        return json({ success: false, error: "Only admins can assign moderators" }, 403);
      }

      await env.DB
        .prepare(`UPDATE users SET role = 'moderator' WHERE id = ?`)
        .bind(targetId)
        .run();

      return json({
        success: true,
        action: "make_moderator",
        user_id: targetId,
        role: "moderator",
      });
    }

    if (action === "remove_moderator") {
      if (!isSuperAdmin) {
        return json({ success: false, error: "Only admins can remove moderators" }, 403);
      }

      await env.DB
        .prepare(`UPDATE users SET role = 'user' WHERE id = ?`)
        .bind(targetId)
        .run();

      return json({
        success: true,
        action: "remove_moderator",
        user_id: targetId,
        role: "user",
      });
    }

    // =========================================================
    // UNSUSPEND
    // =========================================================
    if (action === "unsuspend") {
      await env.DB
        .prepare(
          `UPDATE users
           SET suspended_until = NULL,
               suspended_by = NULL,
               suspension_reason = NULL,
               suspended_at = NULL,
               posting_disabled = 0
           WHERE id = ?`
        )
        .bind(targetId)
        .run();

      return json({
        success: true,
        action: "unsuspend",
        user_id: targetId,
      });
    }

    return json({ success: false, error: "Invalid action" }, 400);
  } catch (err: any) {
    console.error("moderate error:", err);
    return json(
      {
        success: false,
        error: err?.message || "Server error",
        action: body?.action,
        user_id: body?.user_id,
      },
      500
    );
  }
};
