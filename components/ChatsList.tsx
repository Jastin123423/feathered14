// components/ChatsList.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { User } from "../types";

const safeStr = (v: any) => (typeof v === "string" ? v : "");
const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

/* ============================================================
   ✅ CACHING HELPERS FOR CONVERSATIONS & CONTACTS
   Survives component unmounts and page navigation so messages
   never have to reload or display a loading spinner every time.
============================================================ */
const CONVOS_CACHE_PREFIX = "unera_cached_convos_v2_";
const FOLLOWING_CACHE_PREFIX = "unera_cached_following_v2_";

const inMemConvos: Record<number, ConversationRow[]> = {};
const inMemFollowing: Record<number, User[]> = {};

export const getCachedConversations = (userId: number): ConversationRow[] => {
  if (!userId) return [];
  if (inMemConvos[userId] && inMemConvos[userId].length > 0) {
    return inMemConvos[userId];
  }
  try {
    const raw = localStorage.getItem(`${CONVOS_CACHE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemConvos[userId] = parsed;
        return parsed;
      }
    }
  } catch {}
  return [];
};

export const setCachedConversations = (userId: number, rows: ConversationRow[]) => {
  if (!userId) return;
  inMemConvos[userId] = rows;
  try {
    localStorage.setItem(`${CONVOS_CACHE_PREFIX}${userId}`, JSON.stringify(rows));
  } catch {}
};

export const getCachedFollowing = (userId: number): User[] => {
  if (!userId) return [];
  if (inMemFollowing[userId] && inMemFollowing[userId].length > 0) {
    return inMemFollowing[userId];
  }
  try {
    const raw = localStorage.getItem(`${FOLLOWING_CACHE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemFollowing[userId] = parsed;
        return parsed;
      }
    }
  } catch {}
  return [];
};

export const setCachedFollowing = (userId: number, users: User[]) => {
  if (!userId) return;
  inMemFollowing[userId] = users;
  try {
    localStorage.setItem(`${FOLLOWING_CACHE_PREFIX}${userId}`, JSON.stringify(users));
  } catch {}
};

const apiFetch = async (url: string, options: RequestInit = {}, userId?: number) => {
  const token = localStorage.getItem("unera_token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (userId) headers["x-user-id"] = String(userId);

  const res = await fetch(url, { ...options, headers });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (${res.status}). First 80 chars: ${text.slice(0, 80)}`);
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `API Error (${res.status})`);
  }

  return data;
};

const formatRelative = (v: any) => {
  const s = safeStr(v);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";

  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
};

const Avatar: React.FC<{ src?: string | null; name?: string; size?: number; hasActiveIndicator?: boolean; isOnline?: boolean }> = ({
  src,
  name = "",
  size = 52,
  hasActiveIndicator = false,
  isOnline = false,
}) => {
  const url = safeStr(src);
  const initials =
    (safeStr(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U").slice(0, 2);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img
          src={url}
          alt={name}
          className="rounded-full object-cover border border-[#262626] bg-[#1C1E21]"
          style={{ width: size, height: size }}
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src =
              "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
                  <rect width="100%" height="100%" fill="#242526"/>
                  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.max(
                    14,
                    Math.floor(size * 0.36)
                  )}" font-family="Arial" fill="#E4E6EB">${initials}</text>
                </svg>`
              );
          }}
        />
      ) : (
        <div
          className="rounded-full bg-[#242526] flex items-center justify-center text-[#FFFFFF] font-bold border border-[#2D3035]"
          style={{ width: size, height: size, fontSize: Math.max(14, Math.floor(size * 0.36)) }}
          aria-label={name}
          title={name}
        >
          {initials}
        </div>
      )}

      {hasActiveIndicator && isOnline && (
        <span
          className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#31A24C] rounded-full ring-2 ring-black"
          title="Active now"
        />
      )}
    </div>
  );
};

export type ConversationRow = {
  id: number;
  other_user_id: number;
  other_name: string;
  other_profile_image_url: string | null;
  last_text_preview: string;
  last_message_at: string | null;
  unread_count: number;
  is_online?: boolean;
};

export type ChatsListProps = {
  currentUser: User;
  onOpenChat: (recipient: User) => void;
  onClose?: () => void;
  onOpenRequests?: () => void;
  onNewChat?: () => void;
  onOpenHome?: () => void;
  onOpenMarketplace?: () => void;
  feedNotificationCount?: number;
  messageNotificationCount?: number;
};

// Scrollbar hide styles
const scrollbarHideStyles = `
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;

if (typeof document !== "undefined") {
  const styleId = "chatslist-scrollbar-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = scrollbarHideStyles;
    document.head.appendChild(style);
  }
}

export const ChatsList: React.FC<ChatsListProps> = ({
  currentUser,
  onOpenChat,
  onClose,
  onOpenRequests,
  onNewChat,
}) => {
  const currentUserId = safeNum((currentUser as any)?.id, 0);

  // Initialize immediately from cached conversations to eliminate any blank loading state
  const [rows, setRows] = useState<ConversationRow[]>(() => getCachedConversations(currentUserId));
  const [following, setFollowing] = useState<User[]>(() => getCachedFollowing(currentUserId));
  const [loading, setLoading] = useState<boolean>(() => rows.length === 0);
  const [errorText, setErrorText] = useState<string>("");

  // In-app search for Facebook Messenger chats list
  const [searchQuery, setSearchQuery] = useState("");

  // New message modal state
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMessageQuery, setNewMessageQuery] = useState("");

  const fetchConversations = useCallback(async (isInitial = false) => {
    if (!currentUserId) return;
    try {
      setErrorText("");
      if (isInitial && rows.length === 0) {
        setLoading(true);
      }

      const data = await apiFetch("/api/messages/conversations", {}, currentUserId);

      const arr: ConversationRow[] = Array.isArray(data)
        ? data.map((c: any) => ({
            id: safeNum(c?.id, 0),
            other_user_id: safeNum(c?.other_user_id, 0),
            other_name: safeStr(c?.other_name || "User"),
            other_profile_image_url: safeStr(c?.other_profile_image_url) || null,
            last_text_preview: safeStr(c?.last_text_preview || ""),
            last_message_at: safeStr(c?.last_message_at || null),
            unread_count: safeNum(c?.unread_count, 0),
            is_online: safeNum(c?.is_online, 0) === 1,
          }))
        : [];

      arr.sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });

      setRows(arr);
      setCachedConversations(currentUserId, arr);
    } catch (e: any) {
      console.error("ChatsList fetchConversations error:", e?.message || e);
      if (rows.length === 0) {
        setErrorText(e?.message || "Failed to load conversations");
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, rows.length]);

  const fetchFollowing = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const data = await apiFetch("/api/messages/following", {}, currentUserId);
      const users: User[] = Array.isArray(data)
        ? data.map((u: any) => ({
            id: safeNum(u?.id, 0),
            name: safeStr(u?.name || "User"),
            profile_image_url: safeStr(u?.profile_image_url) || safeStr(u?.profile_image_url_) || null,
            profile_image_url_: safeStr(u?.profile_image_url) || safeStr(u?.profile_image_url_) || null,
            is_online: safeNum(u?.is_online, 0) === 1,
            last_seen: u?.last_seen ? safeStr(u.last_seen) : null,
          }))
        : [];
      setFollowing(users);
      setCachedFollowing(currentUserId, users);
    } catch (e) {
      console.error("Failed to fetch following:", e);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchConversations(true);
    fetchFollowing();

    // Background silent revalidation every 7 seconds
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchConversations(false);
      }
    }, 7000);

    return () => window.clearInterval(t);
  }, [fetchConversations, fetchFollowing]);

  // Filter conversations by search query
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.other_name.toLowerCase().includes(q) ||
      r.last_text_preview.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Filtered following for new message search
  const filteredFollowing = useMemo(() => {
    const q = safeStr(newMessageQuery).trim().toLowerCase();
    if (!q) return following;
    return following.filter((u: any) =>
      safeStr(u?.name).toLowerCase().includes(q)
    );
  }, [following, newMessageQuery]);

  const openRow = (r: ConversationRow) => {
    const recipient = {
      id: r.other_user_id,
      name: r.other_name,
      profile_image_url: r.other_profile_image_url,
      profile_image_url_: r.other_profile_image_url,
    } as any as User;

    onOpenChat(recipient);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-[#000000] text-white font-sans flex flex-col select-none overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      {/* Top Messenger Status & Header Bar */}
      <div className="shrink-0 bg-[#000000] border-b border-[#1A1A1A] px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-2.5 flex items-center justify-between">
        {/* Left: Back Arrow + Chats Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1A1A1A] hover:bg-[#262626] active:scale-95 text-white transition-all shrink-0"
            onClick={() => {
              if (onClose) onClose();
            }}
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-[16px]" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-[26px] font-black tracking-tight text-white leading-none">
              Chats
            </h1>
            {(() => {
              const totalUnread = rows.reduce((sum, r) => sum + (safeNum(r.unread_count, 0) > 0 ? safeNum(r.unread_count, 0) : 0), 0);
              if (totalUnread <= 0) return null;
              return (
                <span className="bg-[#E41E3F] text-white text-[12px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {totalUnread}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Right: Compose Button (Facebook Messenger pen icon) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewMessage(true)}
            className="w-9 h-9 rounded-full bg-[#1C1E21] hover:bg-[#2E3136] active:scale-95 text-white flex items-center justify-center transition-all shadow-sm"
            aria-label="New message"
            title="New message"
          >
            <i className="fas fa-pen-to-square text-[15px]" />
          </button>
        </div>
      </div>

      {/* Facebook Messenger Search Bar */}
      <div className="shrink-0 px-4 py-2.5 bg-[#000000]">
        <div className="relative flex items-center bg-[#1C1E21] hover:bg-[#242526] focus-within:bg-[#242526] border border-transparent focus-within:border-[#383A40] rounded-full px-3.5 py-2 transition-all">
          <i className="fas fa-magnifying-glass text-[#8E8E93] text-[15px] mr-2.5 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[15px] text-white placeholder-[#8E8E93] outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[#8E8E93] hover:text-white ml-2 shrink-0"
              aria-label="Clear search"
            >
              <i className="fas fa-circle-xmark text-[14px]" />
            </button>
          )}
        </div>
      </div>

      {/* Facebook Messenger "Active Now" horizontal tray */}
      {following.length > 0 && !searchQuery && (
        <div className="shrink-0 px-4 py-2 border-b border-[#141414] bg-[#000000]">
          <div className="flex items-center gap-3.5 overflow-x-auto scrollbar-hide py-1">
            {/* User's own card with note prompt */}
            <div className="flex flex-col items-center min-w-[58px] shrink-0 cursor-pointer group">
              <div className="relative">
                <Avatar
                  src={currentUser.profile_image_url}
                  name={currentUser.name}
                  size={52}
                  hasActiveIndicator={true}
                  isOnline={true}
                />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#0084FF] text-white rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-black">
                  +
                </span>
              </div>
              <span className="text-[12px] text-[#A0A0A5] group-hover:text-white mt-1.5 truncate w-[58px] text-center font-medium">
                Your note
              </span>
            </div>

            {/* Active followed users */}
            {following.map((u) => (
              <div
                key={u.id}
                onClick={() => onOpenChat(u)}
                className="flex flex-col items-center min-w-[58px] shrink-0 cursor-pointer group hover:opacity-90 transition-opacity"
              >
                <div className="relative">
                  <Avatar
                    src={u.profile_image_url}
                    name={u.name}
                    size={52}
                    hasActiveIndicator={true}
                    isOnline={(u as any).is_online ?? true}
                  />
                </div>
                <span className="text-[12px] text-[#A0A0A5] group-hover:text-white mt-1.5 truncate w-[58px] text-center font-medium">
                  {safeStr(u.name).split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message Requests Banner (if supported) */}
      {onOpenRequests && (
        <div
          onClick={onOpenRequests}
          className="mx-3 mt-2 px-3.5 py-2.5 bg-[#141414] hover:bg-[#1C1E21] rounded-xl flex items-center justify-between cursor-pointer border border-[#222222] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1C1E21] flex items-center justify-center text-[#0084FF]">
              <i className="fas fa-user-clock text-sm" />
            </div>
            <span className="text-white text-[14px] font-semibold">Message requests</span>
          </div>
          <span className="text-[#0084FF] font-extrabold text-xs px-2 py-0.5 bg-[#0084FF]/10 rounded-full">
            Requests
          </span>
        </div>
      )}

      {/* Scrollable Conversation List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[#000000] px-2 py-1">
        {errorText && rows.length === 0 ? (
          <div className="px-4 py-3 mx-2 my-2 bg-[#2D1616] text-[#FF7B7B] rounded-xl text-sm border border-[#522222]">
            <i className="fas fa-triangle-exclamation mr-2" />
            {errorText}
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#8E8E93]">
            <div className="w-8 h-8 border-2 border-[#0084FF] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading chats…</p>
          </div>
        ) : null}

        {/* Conversation Rows */}
        {filteredRows.map((r) => {
          const unread = safeNum(r.unread_count, 0);
          const name = r.other_name || "User";
          const preview = r.last_text_preview || "No messages yet";
          const time = r.last_message_at ? formatRelative(r.last_message_at) : "";

          return (
            <div
              key={r.id}
              onClick={() => openRow(r)}
              className="w-full px-2.5 py-2.5 my-0.5 rounded-2xl flex items-center gap-3.5 hover:bg-[#141517] active:bg-[#1C1E21] transition-all cursor-pointer group"
            >
              <Avatar
                src={r.other_profile_image_url}
                name={name}
                size={54}
                hasActiveIndicator={true}
                isOnline={r.is_online}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[15px] sm:text-[16px] truncate leading-tight ${
                      unread > 0 ? "font-black text-white" : "font-semibold text-[#F5F5F7]"
                    }`}
                  >
                    {name}
                  </span>
                  <span
                    className={`text-[12px] whitespace-nowrap shrink-0 ${
                      unread > 0 ? "text-[#0084FF] font-bold" : "text-[#737373]"
                    }`}
                  >
                    {time}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1">
                  <p
                    className={`text-[13.5px] sm:text-[14px] truncate leading-snug ${
                      unread > 0 ? "text-white font-semibold" : "text-[#8E8E93] font-normal"
                    }`}
                  >
                    {preview}
                  </p>

                  {unread > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-[#E41E3F] text-white text-[11px] font-bold rounded-full flex items-center justify-center shrink-0 shadow-sm shadow-[#E41E3F]/40">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {!loading && filteredRows.length === 0 && !errorText && (
          <div className="text-center text-[#8E8E93] text-sm py-16 px-4">
            <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222222] flex items-center justify-center mx-auto mb-3 text-[#0084FF]">
              <i className="fas fa-comment-dots text-2xl" />
            </div>
            <p className="text-base font-semibold text-white">
              {searchQuery ? "No results found" : "No messages yet"}
            </p>
            <p className="text-xs text-[#8E8E93] mt-1 max-w-xs mx-auto">
              {searchQuery
                ? `No conversations match "${searchQuery}". Tap below to start a new chat.`
                : "Connect with friends to start chatting on Messenger."}
            </p>
            <button
              type="button"
              onClick={() => setShowNewMessage(true)}
              className="mt-4 px-5 py-2 rounded-full bg-[#0084FF] hover:bg-[#0073E6] active:scale-95 text-white text-sm font-bold transition-all shadow-md"
            >
              Start a chat
            </button>
          </div>
        )}
      </div>

      {/* Floating Messenger Compose Button */}
      <button
        onClick={() => setShowNewMessage(true)}
        className="fixed bottom-6 right-5 z-[160] w-14 h-14 rounded-full bg-[#0084FF] text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all duration-200 hover:bg-[#0073E6]"
        aria-label="New chat"
      >
        <i className="fas fa-plus text-xl" />
      </button>

      {/* Messenger "New Message" Fullscreen / Modal Sheet */}
      {showNewMessage && (
        <div className="fixed inset-0 z-[170] bg-[#000000] text-white flex flex-col font-sans">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-[#000000] border-b border-[#1A1A1A] px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3">
            <div className="flex items-center gap-3 mb-3">
              <button
                type="button"
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#1A1A1A] hover:bg-[#262626] active:scale-95 text-white transition-all shrink-0"
                onClick={() => {
                  setShowNewMessage(false);
                  setNewMessageQuery("");
                }}
                aria-label="Back"
              >
                <i className="fas fa-arrow-left text-[16px]" />
              </button>
              <h2 className="text-[20px] font-black text-white leading-none">
                New message
              </h2>
            </div>

            {/* Search input */}
            <div className="relative flex items-center bg-[#1C1E21] rounded-full px-3.5 py-2 border border-transparent focus-within:border-[#383A40]">
              <span className="text-[#8E8E93] text-sm mr-2 font-medium">To:</span>
              <input
                type="text"
                value={newMessageQuery}
                onChange={(e) => setNewMessageQuery(e.target.value)}
                placeholder="Type a name or friend"
                autoFocus
                className="w-full bg-transparent text-[15px] text-white placeholder-[#8E8E93] outline-none"
              />
              {newMessageQuery && (
                <button
                  type="button"
                  onClick={() => setNewMessageQuery("")}
                  className="text-[#8E8E93] hover:text-white ml-2"
                >
                  <i className="fas fa-circle-xmark text-sm" />
                </button>
              )}
            </div>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <div className="px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8E8E93]">
              Suggested
            </div>

            {filteredFollowing.map((u: any) => (
              <div
                key={u.id}
                onClick={() => {
                  setShowNewMessage(false);
                  setNewMessageQuery("");
                  onOpenChat(u);
                }}
                className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3.5 hover:bg-[#141517] active:bg-[#1C1E21] cursor-pointer transition-colors"
              >
                <Avatar
                  src={u.profile_image_url}
                  name={u.name}
                  size={48}
                  hasActiveIndicator={true}
                  isOnline={(u as any).is_online ?? false}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-white font-semibold text-[15px] truncate">
                    {u.name}
                  </div>
                  <div className="text-[12px] text-[#8E8E93] truncate">
                    {(u as any).is_online ? "Active now" : "Messenger contact"}
                  </div>
                </div>
              </div>
            ))}

            {filteredFollowing.length === 0 && (
              <div className="text-center text-[#8E8E93] text-sm py-16">
                <i className="fas fa-user-xmark text-2xl mb-2 opacity-50" />
                <p>No contacts found matching &ldquo;{newMessageQuery}&rdquo;</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatsList;
