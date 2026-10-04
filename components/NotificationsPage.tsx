import React, { useEffect, useMemo, useRef, useState } from "react";
import { Notification, User } from "../types";

interface Props {
  notifications: Notification[];
  users: User[];
  currentUser?: User | null;
  onBack?: () => void;
  onProfileClick: (id: number) => void;
  onOpenNotification?: (notification: Notification) => void;
  onMarkAllAsRead?: () => Promise<any> | void;
  onDeleteNotification?: (notificationId: number) => Promise<any> | void;
  onLoadMore?: () => Promise<any> | void;
  onAcceptGroupInvite?: (inviteId: number, groupId: number) => Promise<any> | void;
  onDeclineGroupInvite?: (inviteId: number, groupId: number) => Promise<any> | void;
  hasMore?: boolean;
  simulateApi?: boolean;
  stickyHeader?: boolean;
}

const INITIAL_EARLIER_COUNT = 15;
const LOAD_MORE_COUNT = 15;

const safeText = (v: any, fallback = "") => (typeof v === "string" ? v : fallback);

const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getNotificationTime = (n: Notification): number => {
  const updated = n.updated_at ? new Date(n.updated_at).getTime() : NaN;
  if (Number.isFinite(updated)) return updated;
  const created = n.created_at ? new Date(n.created_at).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  return 0;
};

const formatTimestamp = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const now = Date.now();
  const diff = now - d.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const dayNum = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${month} ${dayNum} at ${hour12}:${minutes} ${ampm}`;
};

const toWords = (text: string, limit = 10) => {
  const clean = safeText(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ");
  if (words.length <= limit) return clean;
  return `${words.slice(0, limit).join(" ")}...`;
};

const parseActorsJson = (value: any): number[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((x) => safeNumber(x, 0)).filter((x) => x > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => {
            if (typeof x === "object" && x !== null) return safeNumber((x as any).id, 0);
            return safeNumber(x, 0);
          })
          .filter((x) => x > 0);
      }
    } catch {
      return [];
    }
  }

  return [];
};

const getStackActorIds = (n: Notification): number[] => {
  const ids = parseActorsJson(n.actors_json);
  const latestActorId = safeNumber(n.actor_id, 0);

  const ordered = [latestActorId, ...ids].filter((x) => x > 0);
  const deduped: number[] = [];

  ordered.forEach((id) => {
    if (!deduped.includes(id)) deduped.push(id);
  });

  return deduped.slice(0, 3);
};

const getReactionEmoji = (n: Notification) => {
  const type = safeText(n.type).toLowerCase();
  const reactionType = safeText((n as any).reaction_type).toLowerCase();
  const rawMessage = safeText(n.message).toLowerCase();

  const source = `${reactionType} ${rawMessage} ${type}`;

  if (source.includes("love") || source.includes("heart")) return "❤️";
  if (source.includes("haha") || source.includes("laugh")) return "😂";
  if (source.includes("wow")) return "😮";
  if (source.includes("sad")) return "😢";
  if (source.includes("angry")) return "😡";
  if (source.includes("fire")) return "🔥";
  if (source.includes("party")) return "🎉";
  if (source.includes("clap")) return "👏";
  if (source.includes("like") || source.includes("react") || source.includes("reaction")) return "👍";

  return "";
};

const getReactionEmojiCluster = (n: Notification): string[] => {
  const primary = getReactionEmoji(n);
  if (!primary) return [];

  const lower = `${safeText((n as any).reaction_type).toLowerCase()} ${safeText(n.message).toLowerCase()}`;

  if (lower.includes("love") && lower.includes("fire")) return ["❤️", "🔥", "👍"];
  if (lower.includes("love")) return ["❤️", "👍"];
  if (lower.includes("haha")) return ["😂", "👍"];
  if (lower.includes("fire")) return ["🔥", "👍"];
  if (lower.includes("wow")) return ["😮", "👍"];

  return [primary];
};

// Contextual badge attached to avatar bottom-right (clean Facebook style with UNERA blue theme)
const getNotificationBadge = (n: Notification) => {
  const type = safeText(n.type).toLowerCase();
  const entityType = safeText(n.entity_type || (n as any).target_type || "").toLowerCase();
  const reactionEmoji = getReactionEmoji(n);

  if (reactionEmoji) {
    return { kind: "emoji" as const, value: reactionEmoji, bg: "#1E293B" };
  }

  if (type.includes("discuss") || type.includes("comment") || type.includes("reply")) {
    return { kind: "icon" as const, value: "fas fa-comment", bg: "#10B981" };
  }

  if (type.includes("follow")) {
    return { kind: "icon" as const, value: "fas fa-user-plus", bg: "#1877F2" };
  }

  if (type.includes("share")) {
    return { kind: "icon" as const, value: "fas fa-share", bg: "#1877F2" };
  }

  if (type.includes("birthday")) {
    return { kind: "emoji" as const, value: "🎂", bg: "#1E293B" };
  }

  if (entityType === "song") {
    return { kind: "icon" as const, value: "fas fa-music", bg: "#6366F1" };
  }

  if (entityType === "podcast") {
    return { kind: "icon" as const, value: "fas fa-microphone", bg: "#8B5CF6" };
  }

  if (entityType === "story") {
    return { kind: "icon" as const, value: "fas fa-bolt", bg: "#06B6D4" };
  }

  if (entityType === "event" || type === "event") {
    return { kind: "icon" as const, value: "fas fa-calendar-alt", bg: "#2563EB" };
  }

  if (entityType === "group_post" || entityType === "group" || type.includes("group")) {
    return { kind: "icon" as const, value: "fas fa-users", bg: "#1877F2" };
  }

  if (entityType === "product" || type.includes("product") || type.includes("marketplace")) {
    return { kind: "icon" as const, value: "fas fa-shopping-bag", bg: "#0284C7" };
  }

  if (entityType === "reel" || entityType === "video") {
    return { kind: "icon" as const, value: "fas fa-video", bg: "#E11D48" };
  }

  return { kind: "icon" as const, value: "fas fa-bell", bg: "#1877F2" };
};

const buildNotificationMessageParts = (n: Notification) => {
  const type = safeText(n.type).toLowerCase();
  const entityType = safeText(n.entity_type || (n as any).target_type || "").toLowerCase();
  const rawMessage = safeText(n.message || "").trim();
  const actorsCount = Math.max(1, safeNumber((n as any).actors_count, 1));
  const othersCount = Math.max(0, actorsCount - 1);
  const reactionType = safeText((n as any).reaction_type).toLowerCase();
  const othersText = othersCount > 0 ? ` and ${othersCount} others` : "";

  const targetLabel =
    entityType === "post" ? "your post" :
    entityType === "reel" ? "your reel" :
    entityType === "story" ? "your story" :
    entityType === "song" ? "your song" :
    entityType === "podcast" ? "your podcast" :
    entityType === "product" ? "your product" :
    entityType === "group_post" ? "your group post" :
    entityType === "event" ? "your event" :
    entityType === "comment" ? "your comment" :
    entityType === "group" ? "your group" :
    entityType === "profile" ? "you" :
    "your content";

  const reactionVerb = (() => {
    const source = `${reactionType} ${rawMessage}`.toLowerCase();
    if (source.includes("love")) return "loved";
    if (source.includes("haha") || source.includes("laugh")) return "laughed at";
    if (source.includes("wow")) return "were amazed by";
    if (source.includes("sad")) return "felt sad about";
    if (source.includes("angry")) return "felt angry about";
    if (source.includes("fire")) return "fired up";
    if (source.includes("party")) return "celebrated";
    if (source.includes("clap")) return "applauded";
    if (source.includes("star")) return "starred";
    if (source.includes("heart-eyes") || source.includes("heart_eyes")) return "reacted heart-eyes to";
    if (source.includes("rocket")) return "rocketed";
    if (source.includes("trophy")) return "awarded";
    if (source.includes("crown")) return "crowned";
    return "reacted to";
  })();

  if (type === "react" || type === "reaction" || type === "like") {
    return {
      middle: `${othersText} ${reactionVerb} ${targetLabel}.`.trim(),
      cta: "",
    };
  }

  if (type.includes("discuss") || type.includes("comment") || type.includes("reply")) {
    const isReply = type.includes("reply") || rawMessage.includes("replied");
    return {
      middle: `${othersText} ${isReply ? "replied to your comment" : "commented on " + targetLabel}.`.trim(),
      cta: "",
    };
  }

  if (type.includes("follow")) {
    return {
      middle: `${othersText} started following you.`.trim(),
      cta: "",
    };
  }

  if (type.includes("share")) {
    return {
      middle: `${othersText} shared ${targetLabel}.`.trim(),
      cta: "",
    };
  }

  if (type.includes("tag") || type.includes("mention")) {
    return {
      middle: `${othersText} mentioned you in a comment.`.trim(),
      cta: "",
    };
  }

  if (type.includes("invite")) {
    return {
      middle: `${othersText} invited you to join ${targetLabel === "your content" ? "a group" : targetLabel}.`.trim(),
      cta: "",
    };
  }

  if (rawMessage) {
    return {
      middle: rawMessage,
      cta: "",
    };
  }

  return {
    middle: `interacted with ${targetLabel}.`,
    cta: "",
  };
};

const NotificationStackedAvatars: React.FC<{
  notification: Notification;
  users: User[];
  onProfileClick: (id: number) => void;
}> = ({ notification, users, onProfileClick }) => {
  const actorIds = getStackActorIds(notification);
  if (actorIds.length <= 1) return null;

  return (
    <div className="flex items-center -space-x-2 mt-2 select-none">
      {actorIds.map((id) => {
        const u = users.find((x) => x.id === id);
        if (!u) return null;
        return (
          <img
            key={id}
            src={u.profile_image_url || "https://via.placeholder.com/100?text=User"}
            alt={u.name}
            onClick={(e) => {
              e.stopPropagation();
              onProfileClick(id);
            }}
            className="w-7 h-7 rounded-full object-cover border-2 border-[#0B1120] cursor-pointer hover:scale-110 transition-transform shadow-sm"
          />
        );
      })}
    </div>
  );
};

const NotificationReactionCluster: React.FC<{ notification: Notification }> = ({ notification }) => {
  const emojis = getReactionEmojiCluster(notification);
  if (!emojis.length) return null;

  return (
    <div className="inline-flex items-center gap-0.5 bg-[#1E293B] border border-[#334155]/60 rounded-full px-2 py-0.5 select-none">
      {emojis.map((emoji, i) => (
        <span key={`${emoji}-${i}`} className="text-xs leading-none">
          {emoji}
        </span>
      ))}
    </div>
  );
};

export const NotificationsPage: React.FC<Props> = ({
  notifications,
  users,
  currentUser,
  onBack,
  onProfileClick,
  onOpenNotification,
  onMarkAllAsRead,
  onDeleteNotification,
  onLoadMore,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  hasMore = false,
  simulateApi = false,
  stickyHeader = false,
}) => {
  const getUser = (id?: number) => users.find((u) => u.id === id);

  const [localNotifications, setLocalNotifications] = useState<Notification[]>(notifications || []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [earlierVisibleCount, setEarlierVisibleCount] = useState(INITIAL_EARLIER_COUNT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteStatus, setInviteStatus] = useState<Record<number, "joined" | "rejected">>({});
  const [inviteLoading, setInviteLoading] = useState<Record<number, boolean>>({});

  const menuRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    setLocalNotifications(Array.isArray(notifications) ? notifications : []);
  }, [notifications]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuOpenId == null) return;
      const el = menuRefs.current[menuOpenId];
      if (el && !el.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpenId]);

  const unreadCount = useMemo(
    () => localNotifications.filter((n) => !safeNumber(n.is_read, 0)).length,
    [localNotifications]
  );

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return localNotifications;
    const q = searchQuery.toLowerCase().trim();
    return localNotifications.filter((n) => {
      const actor = getUser(n.actor_id);
      const name = safeText(actor?.name).toLowerCase();
      const message = safeText(n.message).toLowerCase();
      const type = safeText(n.type).toLowerCase();
      return name.includes(q) || message.includes(q) || type.includes(q);
    });
  }, [localNotifications, searchQuery, users]);

  const sortedNotifications = useMemo(() => {
    return [...filteredNotifications].sort((a, b) => {
      const ta = getNotificationTime(a);
      const tb = getNotificationTime(b);
      if (tb !== ta) return tb - ta;
      return safeNumber(b.id, 0) - safeNumber(a.id, 0);
    });
  }, [filteredNotifications]);

  // Facebook Sections: NEW, TODAY, EARLIER
  const { newNotifications, todayNotifications, earlierNotifications } = useMemo(() => {
    const newN: Notification[] = [];
    const todayN: Notification[] = [];
    const earlierN: Notification[] = [];

    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTime = startOfToday.getTime();

    sortedNotifications.forEach((n) => {
      const isUnread = !safeNumber(n.is_read, 0);
      const time = getNotificationTime(n);

      if (isUnread || time >= twoHoursAgo) {
        newN.push(n);
      } else if (time >= startOfTodayTime) {
        todayN.push(n);
      } else {
        earlierN.push(n);
      }
    });

    return {
      newNotifications: newN,
      todayNotifications: todayN,
      earlierNotifications: earlierN,
    };
  }, [sortedNotifications]);

  const visibleEarlierNotifications = useMemo(
    () => earlierNotifications.slice(0, earlierVisibleCount),
    [earlierNotifications, earlierVisibleCount]
  );

  const hasMoreEarlier =
    visibleEarlierNotifications.length < earlierNotifications.length ||
    Boolean(hasMore && onLoadMore);

  const showToast = (type: "error" | "success", text: string, ms = 3000) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), ms);
  };

  const handleMarkAllAsRead = async () => {
    if (isProcessing || unreadCount === 0) return;

    const snapshot = localNotifications.map((n) => ({ ...n }));
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setIsProcessing(true);

    try {
      if (onMarkAllAsRead) {
        const result = onMarkAllAsRead();
        if (result && typeof (result as Promise<any>).then === "function") {
          await result;
        }
      } else if (simulateApi) {
        await new Promise((res) => setTimeout(res, 500));
      }

      showToast("success", "All notifications marked as read");
    } catch (err) {
      setLocalNotifications(snapshot);
      console.error("Mark all as read failed:", err);
      showToast("error", "Failed to mark all as read");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleReadStatus = (notificationId: number, currentRead: boolean) => {
    setMenuOpenId(null);
    setLocalNotifications((prev) =>
      prev.map((n) =>
        safeNumber(n.id, 0) === notificationId
          ? { ...n, is_read: currentRead ? 0 : 1 }
          : n
      )
    );
  };

  const handleLoadMoreEarlier = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    setEarlierVisibleCount((prev) => prev + LOAD_MORE_COUNT);

    if (onLoadMore) {
      try {
        const result = onLoadMore();
        if (result && typeof (result as Promise<any>).then === "function") {
          await result;
        }
      } catch (err) {
        console.error("Failed to load more notifications:", err);
      }
    }

    setIsLoadingMore(false);
  };

  const handleDeleteNotification = async (notificationId: number) => {
    if (!notificationId || deletingId === notificationId) return;

    const snapshot = localNotifications;
    setDeletingId(notificationId);
    setMenuOpenId(null);
    setLocalNotifications((prev) => prev.filter((n) => safeNumber(n.id, 0) !== notificationId));

    try {
      if (onDeleteNotification) {
        const result = onDeleteNotification(notificationId);
        if (result && typeof (result as Promise<any>).then === "function") {
          await result;
        }
      } else if (simulateApi) {
        await new Promise((res) => setTimeout(res, 500));
      }

      showToast("success", "Notification removed");
    } catch (err) {
      console.error("Delete notification failed:", err);
      setLocalNotifications(snapshot);
      showToast("error", "Failed to remove notification");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenNotification = (n: Notification) => {
    // Mark as read locally when opened
    if (!safeNumber(n.is_read, 0)) {
      setLocalNotifications((prev) =>
        prev.map((item) =>
          safeNumber(item.id, 0) === safeNumber(n.id, 0)
            ? { ...item, is_read: 1 }
            : item
        )
      );
    }

    if (onOpenNotification) {
      onOpenNotification(n);
      return;
    }

    const actorId = safeNumber(n.actor_id, 0);
    if (actorId) onProfileClick(actorId);
  };

  const handleJoinInvite = async (n: Notification) => {
    const notifId = safeNumber(n.id, 0);
    const groupId = safeNumber(n.entity_id || (n as any).group_id || 0, 0);
    const inviteId = safeNumber((n as any).invite_id || (n as any).parent_id || 0, 0);

    setInviteLoading((prev) => ({ ...prev, [notifId]: true }));
    try {
      if (onAcceptGroupInvite) {
        await onAcceptGroupInvite(inviteId, groupId);
      } else if (groupId) {
        await fetch(`/api/groups/${groupId}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": String(currentUser?.id || ""),
          },
          body: JSON.stringify({ user_id: currentUser?.id, group_id: groupId }),
        });
      }
      setInviteStatus((prev) => ({ ...prev, [notifId]: "joined" }));
      setLocalNotifications((prev) =>
        prev.map((item) =>
          safeNumber(item.id, 0) === notifId ? { ...item, is_read: 1 } : item
        )
      );
      showToast("success", "Joined group!");
    } catch (err: any) {
      showToast("error", err?.message || "Could not join group");
    } finally {
      setInviteLoading((prev) => ({ ...prev, [notifId]: false }));
    }
  };

  const handleRejectInvite = async (n: Notification) => {
    const notifId = safeNumber(n.id, 0);
    const groupId = safeNumber(n.entity_id || (n as any).group_id || 0, 0);
    const inviteId = safeNumber((n as any).invite_id || (n as any).parent_id || 0, 0);

    setInviteLoading((prev) => ({ ...prev, [notifId]: true }));
    try {
      if (onDeclineGroupInvite) {
        await onDeclineGroupInvite(inviteId, groupId);
      } else if (inviteId) {
        await fetch(`/api/group-invites`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": String(currentUser?.id || ""),
          },
          body: JSON.stringify({ id: inviteId, status: "rejected" }),
        });
      }
      setInviteStatus((prev) => ({ ...prev, [notifId]: "rejected" }));
      setLocalNotifications((prev) =>
        prev.map((item) =>
          safeNumber(item.id, 0) === notifId ? { ...item, is_read: 1 } : item
        )
      );
      showToast("success", "Invitation declined");
    } catch (err: any) {
      showToast("error", err?.message || "Could not decline invite");
    } finally {
      setInviteLoading((prev) => ({ ...prev, [notifId]: false }));
    }
  };

  // FLAT, CONTINUOUS ROW (Facebook-style)
  const renderRow = (n: Notification) => {
    const actor = getUser(n.actor_id) || (n as any).actor || (n as any).sender || (n as any).inviter;
    const actorName = safeText(actor?.name || (n as any).actor_name || (n as any).sender_name, "Someone");
    const avatar = safeText(
      actor?.profile_image_url || (n as any).actor_image || (n as any).sender_avatar,
      `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=1877F2&color=fff`
    );
    const isUnread = !safeNumber(n.is_read, 0);
    const notificationId = safeNumber(n.id, 0);
    const badge = getNotificationBadge(n);
    const displayTime = safeText(n.updated_at) || safeText(n.created_at);
    const previewText = toWords(
      safeText((n as any).preview_text || (n as any).content_preview || (n as any).preview_title || ""),
      12
    );
    const previewImage = safeText((n as any).preview_image || "");
    const messageParts = buildNotificationMessageParts(n);
    const hasStack = getStackActorIds(n).length > 1 || safeNumber(n.actors_count, 1) > 1;

    const isInvite =
      safeText(n.type).toLowerCase() === "group_invite" ||
      safeText(n.type).toLowerCase() === "invite" ||
      safeText(n.message).toLowerCase().includes("invited you") ||
      safeText(n.entity_type).toLowerCase() === "group_invite";

    return (
      <div
        key={notificationId}
        onClick={() => handleOpenNotification(n)}
        className={`group relative flex items-center justify-between gap-3 px-4 py-3 transition-colors cursor-pointer border-b border-[#1E293B]/40 ${
          isUnread
            ? "bg-[#1877F2]/[0.08] hover:bg-[#1877F2]/[0.14]"
            : "hover:bg-[#1E293B]/40"
        }`}
      >
        {/* Left: Avatar + Notification Text Content */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Avatar (52-56px) + Attached Badge */}
          <div
            className="flex-shrink-0 relative cursor-pointer select-none"
            onClick={(e) => {
              e.stopPropagation();
              onProfileClick(actor?.id || 0);
            }}
          >
            <img
              src={avatar}
              alt={actorName}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(actorName)}&background=1877F2&color=fff`;
              }}
              className="w-14 h-14 rounded-full object-cover bg-[#1E293B] border border-[#1E293B]"
            />

            {/* Contextual Badge attached to bottom-right */}
            <div
              className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-[#0B1120] shadow-md"
              style={{ background: badge.bg }}
            >
              {badge.kind === "emoji" ? (
                <span className="text-[11px] leading-none">{badge.value}</span>
              ) : (
                <i className={`${badge.value} text-[10px] text-white leading-none`} />
              )}
            </div>
          </div>

          {/* Text Area */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="text-[16px] md:text-[17px] leading-snug break-words">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick(actor?.id || 0);
                }}
                className={`cursor-pointer hover:underline ${
                  isUnread
                    ? "font-bold text-white"
                    : "font-semibold text-[#F8FAFC]"
                }`}
                style={{ fontSize: "17.5px" }}
              >
                {actorName}
              </span>
              <span
                className={`select-text ml-1.5 ${
                  isUnread
                    ? "font-normal text-[#F1F5F9]"
                    : "font-normal text-[#CBD5E1]"
                }`}
                style={{ fontSize: "16.5px" }}
              >
                {messageParts.middle}
              </span>
            </div>

            {hasStack && (
              <NotificationStackedAvatars
                notification={n}
                users={users}
                onProfileClick={onProfileClick}
              />
            )}

            {/* Optional media/quote preview */}
            {(previewText || previewImage) && (
              <div className="mt-2 flex items-center gap-2.5 max-w-full bg-[#1E293B]/60 border border-[#334155]/40 rounded-xl p-2 text-xs transition-colors">
                {previewImage && (
                  <img
                    src={previewImage}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-[#0B1120]"
                  />
                )}
                {previewText && (
                  <div className="min-w-0 select-text">
                    <span className="text-[#94A3B8] line-clamp-2">“{previewText}”</span>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Group Invite Actions */}
            {isInvite && (
              <div
                className="mt-2.5 flex items-center gap-2 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                {inviteStatus[notificationId] === "joined" ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10B981]/20 text-[#34D399] text-xs font-bold border border-[#10B981]/30">
                    <i className="fas fa-check text-xs"></i>
                    <span>Joined</span>
                  </div>
                ) : inviteStatus[notificationId] === "rejected" ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#64748B]/20 text-[#94A3B8] text-xs font-medium border border-[#64748B]/30">
                    <i className="fas fa-times text-xs"></i>
                    <span>Declined</span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={inviteLoading[notificationId]}
                      onClick={() => handleJoinInvite(n)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {inviteLoading[notificationId] ? (
                        <i className="fas fa-circle-notch fa-spin text-xs"></i>
                      ) : (
                        <i className="fas fa-user-plus text-xs"></i>
                      )}
                      <span>Join</span>
                    </button>
                    <button
                      type="button"
                      disabled={inviteLoading[notificationId]}
                      onClick={() => handleRejectInvite(n)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] hover:text-white text-xs font-semibold transition-all border border-[#334155]/60 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <span>Reject</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Timestamp & Reaction preview */}
            <div className="mt-1 flex items-center gap-2 flex-wrap select-none">
              <span
                className={`text-[14px] ${
                  isUnread ? "text-[#38BDF8] font-medium" : "text-[#64748B] font-normal"
                }`}
              >
                {formatTimestamp(displayTime)}
              </span>

              <NotificationReactionCluster notification={n} />
            </div>
          </div>
        </div>

        {/* Right: Unread Indicator Dot & Three-dot Menu */}
        <div className="flex items-center gap-2 flex-shrink-0 select-none">
          {/* Small BLUE unread indicator (Facebook-style) */}
          {isUnread && (
            <span
              aria-label="Unread notification"
              className="w-3 h-3 rounded-full bg-[#1877F2] shadow-[0_0_8px_rgba(24,119,242,0.6)] shrink-0"
            />
          )}

          {/* Three dots menu */}
          <div
            ref={(el) => {
              menuRefs.current[notificationId] = el;
            }}
            className="relative"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId((prev) => (prev === notificationId ? null : notificationId));
              }}
              aria-label="Notification options"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
            >
              <i className="fas fa-ellipsis-h text-sm" />
            </button>

            {menuOpenId === notificationId && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-9 min-w-[200px] bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  onClick={() => handleToggleReadStatus(notificationId, !isUnread)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#F8FAFC] hover:bg-[#1E293B] text-xs font-semibold transition-colors text-left"
                >
                  <i className={`fas ${isUnread ? "fa-check" : "fa-envelope"} text-xs text-[#1877F2]`} />
                  <span>{isUnread ? "Mark as read" : "Mark as unread"}</span>
                </button>
                <button
                  onClick={() => handleDeleteNotification(notificationId)}
                  disabled={deletingId === notificationId}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors text-left disabled:opacity-50"
                >
                  <i className="fas fa-trash-alt text-xs" />
                  <span>{deletingId === notificationId ? "Removing..." : "Remove this notification"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="w-full max-w-2xl mx-auto pb-16 text-[#F8FAFC]">
      {/* HEADER: ← Notifications   ✓   🔍 */}
      <div
        className={`bg-[#0B1120] border-b border-[#1E293B] px-4 py-3.5 select-none ${
          stickyHeader ? "sticky top-14 z-20" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back"
                className="w-10 h-10 rounded-full hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center transition-colors flex-shrink-0"
              >
                <i className="fas fa-arrow-left text-lg" />
              </button>
            )}
            <h1 className="text-[26px] md:text-[28px] font-bold text-[#F8FAFC] tracking-tight leading-tight">
              Notifications
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Mark all as read (✓) */}
            <button
              onClick={handleMarkAllAsRead}
              disabled={isProcessing || unreadCount === 0}
              aria-label="Mark all as read"
              title="Mark all as read"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isProcessing || unreadCount === 0
                  ? "text-[#475569] cursor-not-allowed"
                  : "hover:bg-[#1E293B] text-[#1877F2] hover:text-[#38BDF8] cursor-pointer"
              }`}
            >
              <i className="fas fa-check-double text-lg" />
            </button>

            {/* Notification Search (🔍) */}
            <button
              onClick={() => setIsSearchOpen((prev) => !prev)}
              aria-label="Search notifications"
              title="Search notifications"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isSearchOpen
                  ? "bg-[#1877F2] text-white"
                  : "hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              <i className="fas fa-search text-base" />
            </button>
          </div>
        </div>

        {/* Expandable Notification Search Input */}
        {isSearchOpen && (
          <div className="mt-3 relative animate-in fade-in duration-150">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              autoFocus
              className="w-full bg-[#0F172A] border border-[#1E293B] focus:border-[#1877F2] rounded-xl py-2 pl-9 pr-8 text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#64748B] hover:text-[#F8FAFC]"
              >
                <i className="fas fa-times-circle" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* FLAT, CONTINUOUS NOTIFICATION FEED */}
      <div className="divide-y divide-[#1E293B]/20">
        {/* SECTION: NEW */}
        {newNotifications.length > 0 && (
          <div className="pt-2">
            <div className="px-4 pt-3 pb-1.5 flex items-center justify-between select-none">
              <h2 className="text-[21px] md:text-[22px] font-bold text-[#F8FAFC] tracking-tight">
                New
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1877F2]/20 text-[#38BDF8] border border-[#1877F2]/30">
                {newNotifications.length}
              </span>
            </div>
            <div>{newNotifications.map(renderRow)}</div>
          </div>
        )}

        {/* SECTION: TODAY */}
        {todayNotifications.length > 0 && (
          <div className="pt-2">
            <div className="px-4 pt-4 pb-1.5 select-none">
              <h2 className="text-[21px] md:text-[22px] font-bold text-[#F8FAFC] tracking-tight">
                Today
              </h2>
            </div>
            <div>{todayNotifications.map(renderRow)}</div>
          </div>
        )}

        {/* SECTION: EARLIER */}
        {visibleEarlierNotifications.length > 0 && (
          <div className="pt-2">
            <div className="px-4 pt-4 pb-1.5 select-none">
              <h2 className="text-[21px] md:text-[22px] font-bold text-[#F8FAFC] tracking-tight">
                Earlier
              </h2>
            </div>
            <div>{visibleEarlierNotifications.map(renderRow)}</div>

            {hasMoreEarlier && (
              <div className="p-4">
                <button
                  onClick={handleLoadMoreEarlier}
                  disabled={isLoadingMore}
                  className="w-full py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] hover:border-[#1877F2]/40 text-[#F8FAFC] text-[15px] font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 select-none shadow-sm"
                >
                  {isLoadingMore ? (
                    <>
                      <i className="fas fa-spinner fa-spin text-sm text-[#1877F2]" />
                      <span>Loading previous notifications...</span>
                    </>
                  ) : (
                    <span>See previous notifications</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* EMPTY STATE */}
        {sortedNotifications.length === 0 && (
          <div className="py-20 px-6 text-center select-none">
            <div className="w-16 h-16 rounded-full bg-[#1E293B]/60 border border-[#334155]/40 flex items-center justify-center mx-auto mb-4 text-[#1877F2] text-2xl shadow-inner">
              <i className="fas fa-bell-slash" />
            </div>
            <p className="text-[19px] font-bold text-[#F8FAFC]">
              {searchQuery ? "No notifications matching search" : "No notifications yet"}
            </p>
            <p className="text-sm text-[#64748B] mt-1.5 max-w-xs mx-auto">
              {searchQuery
                ? "Try searching for a different person or keyword"
                : "When people like, comment, or interact with your content, you'll see them here."}
            </p>
          </div>
        )}
      </div>

      {/* TOAST FEEDBACK */}
      {toast && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border flex items-center gap-2 ${
            toast.type === "error"
              ? "bg-rose-950/90 border-rose-800 text-rose-200"
              : "bg-[#0F172A] border-[#1877F2] text-[#F8FAFC]"
          }`}
        >
          {toast.text}
        </div>
      )}
    </section>
  );
};

export default NotificationsPage;
