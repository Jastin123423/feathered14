// lib/moderation.ts

export type ModerationAction =
  | "verify"
  | "unverify"
  | "suspend"
  | "unsuspend"
  | "delete"
  | "make_moderator"
  | "remove_moderator";

export interface ModerationExtra {
  duration?: "week" | "month" | "until_unsuspend" | "indefinite" | "forever";
  reason?: string;
}

export interface ModerationResponse {
  success: boolean;
  action?: string;
  user_id?: number;
  is_verified?: number | boolean;
  suspended_until?: string | null;
  reason?: string | null;
  soft_deleted?: boolean;
  role?: string;
  error?: string;
}

/**
 * Executes a moderation action against /api/users/moderate
 * All actions hit the same endpoint: POST /api/users/moderate
 * Headers: Content-Type: application/json, x-user-id: <admin_user_id>
 */
export async function moderateUser(
  adminId: number,
  targetUserId: number,
  action: ModerationAction,
  extra?: ModerationExtra
): Promise<ModerationResponse> {
  try {
    const res = await fetch("/api/users/moderate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(adminId),
      },
      body: JSON.stringify({
        user_id: Number(targetUserId),
        action,
        ...extra,
      }),
    });

    const data: ModerationResponse = await res.json().catch(() => ({
      success: false,
      error: "Failed to parse server response",
    }));

    if (!res.ok && !data.error) {
      if (res.status === 403) {
        data.error = "You don't have permission";
      } else if (res.status === 401) {
        data.error = "Login required";
      } else {
        data.error = `Server error (${res.status})`;
      }
    }

    return data;
  } catch (err: any) {
    console.error("moderateUser network error:", err);
    return {
      success: false,
      error: err?.message || "Network error. Please try again.",
    };
  }
}
