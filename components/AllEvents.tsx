// AllEvents.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { User } from "../types";
import { PostUploadProgressBanner, PostUploadState } from "./PostUploadProgress";
import { PostMenu } from "./Post/PostMenu";

// ========== API HELPERS ==========
const authHeaders = () => {
  const token = localStorage.getItem("unera_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

const postJSON = async (url: string, body: any) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  const data = await safeJson(res);
  if (!res.ok || (data && data.success === false)) {
    throw new Error(data?.error || data?.message || `Request failed: ${url}`);
  }
  return data;
};

// ========== RSVP HELPER ==========
type RSVPStatus = "going" | "interested" | "not_going";

const rsvpEventDirect = async (args: {
  eventId: number;
  userId: number;
  newStatus: RSVPStatus;
  prevStatus?: "" | "going" | "interested";
}) => {
  const { eventId, userId, newStatus, prevStatus = "" } = args;

  const endpoint =
    newStatus === "going"
      ? "/api/attend"
      : newStatus === "interested"
      ? "/api/interested"
      : prevStatus === "interested"
      ? "/api/interested"
      : "/api/attend";

  const payloadStatus = { event_id: eventId, user_id: userId, status: newStatus };

  try {
    return await postJSON(endpoint, payloadStatus);
  } catch (e1: any) {
    const payloadAction = {
      event_id: eventId,
      user_id: userId,
      action: newStatus === "not_going" ? "remove" : "add",
    };
    try {
      return await postJSON(endpoint, payloadAction);
    } catch (e2: any) {
      throw new Error(e2?.message || e1?.message || "RSVP failed");
    }
  }
};

// ========== AVATAR HELPER ==========
const avatarFrom = (u: any) => {
  if (!u) return `https://ui-avatars.com/api/?name=User&background=1877F2&color=fff&bold=true`;

  const img = String(
    u?.profile_image_url ??
      u?.profileImage ??
      u?.avatar ??
      u?.author_image ??
      u?.authorImage ??
      u?.image ??
      u?.picture ??
      ""
  ).trim();

  if (img && img !== "null" && img !== "undefined") return img;

  const label =
    String(u?.name ?? "").trim() ||
    String(u?.username ?? "").trim() ||
    String(u?.author_name ?? "").trim() ||
    String(u?.author_username ?? "").trim() ||
    "User";

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    label
  )}&background=1877F2&color=fff&bold=true`;
};

// ========== DATE HELPERS ==========
const toDateSafe = (input: any): Date | null => {
  if (!input) return null;
  if (input instanceof Date && Number.isFinite(input.getTime())) return input;

  if (typeof input === "number") {
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof input === "string") {
    const s = input.trim();

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
      const iso = s.replace(" ", "T") + "Z";
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s + "T00:00:00");
      return Number.isFinite(d.getTime()) ? d : null;
    }

    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s + "Z");
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  return null;
};

const formatRelativeTime = (dateInput: any): string => {
  const d = toDateSafe(dateInput);
  if (!d) return "Just now";

  const now = Date.now();
  let diffMs = now - d.getTime();
  if (diffMs < 0) diffMs = 0;

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Just now";

  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 min" : `${min} mins`;

  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs === 1 ? "1 hr" : `${hrs} hrs`;

  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? "1 day" : `${days} days`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return weeks === 1 ? "1 week" : `${weeks} weeks`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 year" : `${years} years`;
};

// ========== LOCATION UTILITIES ==========
const extractCountry = (location: string): string | null => {
  if (!location) return null;

  const tanzanianCities = [
    "dar es salaam",
    "dar",
    "dsm",
    "arusha",
    "mwanza",
    "mbeya",
    "morogoro",
    "tanga",
    "dodoma",
    "zanzibar",
    "kilimanjaro",
    "moshi",
    "iringa",
    "tabora",
    "kigoma",
    "mara",
    "manyara",
    "ruvuma",
    "rukwa",
    "katavi",
    "simiyu",
    "geita",
    "songwe",
    "njombe",
    "lindi",
    "mtwara",
    "pwani",
    "singida",
  ];

  const lowerLocation = location.toLowerCase();

  const isTanzania =
    tanzanianCities.some((city) => lowerLocation.includes(city)) ||
    lowerLocation.includes("tanzania") ||
    lowerLocation.includes("tz");

  if (isTanzania) return "Tanzania";

  const countryMap: { [key: string]: string } = {
    kenya: "Kenya",
    uganda: "Uganda",
    rwanda: "Rwanda",
    burundi: "Burundi",
    "south africa": "South Africa",
    nigeria: "Nigeria",
    ghana: "Ghana",
    egypt: "Egypt",
    morocco: "Morocco",
    usa: "USA",
    "united states": "USA",
    uk: "UK",
    "united kingdom": "UK",
    canada: "Canada",
    australia: "Australia",
    germany: "Germany",
    france: "France",
    italy: "Italy",
    spain: "Spain",
    portugal: "Portugal",
    netherlands: "Netherlands",
    belgium: "Belgium",
    sweden: "Sweden",
    norway: "Norway",
    denmark: "Denmark",
    finland: "Finland",
    switzerland: "Switzerland",
    austria: "Austria",
    japan: "Japan",
    china: "China",
    india: "India",
    brazil: "Brazil",
    argentina: "Argentina",
    mexico: "Mexico",
  };

  for (const [key, country] of Object.entries(countryMap)) {
    if (lowerLocation.includes(key)) return country;
  }

  return null;
};

const getUserCountry = (user: User | null): string | null => {
  if (!user) return null;
  const userLocation = (user as any).location || (user as any).city || (user as any).country || (user as any).region || "";
  if (userLocation) return extractCountry(userLocation);
  return null;
};

const isEventVisibleToUser = (event: EventFromAPI, user: User | null): boolean => {
  if (!user) return true;

  const userCountry = getUserCountry(user);
  const eventLocation = event.location || "";
  const eventCountry = extractCountry(eventLocation);
  const eventVisibility = event.visibility || "worldwide";

  if (eventVisibility === "worldwide") return true;

  if (eventVisibility === "targeted") {
    if (eventCountry && userCountry) {
      return eventCountry === userCountry;
    }

    const isTanzaniaEvent =
      eventLocation.toLowerCase().includes("tanzania") ||
      ["dar es salaam", "arusha", "mwanza", "mbeya"].some((city) =>
        eventLocation.toLowerCase().includes(city.toLowerCase())
      );

    if (isTanzaniaEvent && userCountry === "Tanzania") return true;

    return false;
  }

  return true;
};

// ========== EVENT RANKING HELPERS ==========
const safeArrayAny = (v: any): any[] => (Array.isArray(v) ? v : []);
const safeString = (v: any) => String(v || "").trim();

const getUserFollowingIds = (user: any): number[] => {
  const raw =
    user?.following_ids ??
    user?.followingIds ??
    user?.following ??
    user?.followings ??
    [];

  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => Number(x?.id ?? x))
    .filter((n) => Number.isFinite(n) && n > 0);
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysUntilEvent = (eventDateInput: any): number => {
  const d = toDateSafe(eventDateInput);
  if (!d) return 999999;
  const now = new Date();
  const diff = startOfDay(d).getTime() - startOfDay(now).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
};

const eventAgeHours = (createdAt: any): number => {
  const d = toDateSafe(createdAt);
  if (!d) return 999999;
  return Math.max(0, (Date.now() - d.getTime()) / (1000 * 60 * 60));
};

const isUpcomingEvent = (event: EventFromAPI) => {
  const d = toDateSafe(event.event_date);
  if (!d) return false;
  return d.getTime() >= Date.now() - 60 * 1000;
};

const isNearUserCountry = (event: EventFromAPI, user: User | null): boolean => {
  const eventCountry = extractCountry(event.location || "");
  const userCountry = getUserCountry(user);
  if (!eventCountry || !userCountry) return false;
  return eventCountry === userCountry;
};

const isFromFollowedCreator = (event: EventFromAPI, user: User | null): boolean => {
  if (!user) return false;
  const followingIds = new Set(getUserFollowingIds(user));
  const creatorId = Number(event.creator?.id ?? event.creator_id ?? 0);
  return followingIds.has(creatorId);
};

const seededRandEvent = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
};

const hashEventString = (input: string) => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h;
};

const scoreEventForFeed = (event: EventFromAPI, currentUser: User | null, seed: number) => {
  const untilDays = daysUntilEvent(event.event_date);
  const ageHours = eventAgeHours(event.created_at);
  const going = Number(event.attendees_count || 0);
  const interested = Number(event.interested_count || 0);

  let upcomingScore = 0;
  if (untilDays < 0) upcomingScore = -40;
  else if (untilDays === 0) upcomingScore = 80;
  else if (untilDays === 1) upcomingScore = 65;
  else if (untilDays <= 3) upcomingScore = 52;
  else if (untilDays <= 7) upcomingScore = 40;
  else if (untilDays <= 30) upcomingScore = 24;
  else if (untilDays <= 90) upcomingScore = 12;
  else upcomingScore = 4;

  let freshnessScore = 0;
  if (ageHours <= 12) freshnessScore = 28;
  else if (ageHours <= 24) freshnessScore = 22;
  else if (ageHours <= 72) freshnessScore = 18;
  else if (ageHours <= 24 * 7) freshnessScore = 12;
  else if (ageHours <= 24 * 30) freshnessScore = 6;
  else freshnessScore = 2;

  const followingScore = isFromFollowedCreator(event, currentUser) ? 26 : 0;
  const localScore = isNearUserCountry(event, currentUser) ? 20 : 0;

  const engagementScore = Math.min(20, going * 0.4) + Math.min(14, interested * 0.25);

  let qualityScore = 0;
  if (safeString(event.title).length >= 6) qualityScore += 8;
  if (safeString(event.description).length >= 20) qualityScore += 8;
  if (safeString(event.location).length >= 3) qualityScore += 6;
  if (safeString(event.cover_url).length > 0) qualityScore += 8;

  const rotation = seededRandEvent(seed + hashEventString(`${event.id}:${event.title}`)) * 5;

  return (
    upcomingScore +
    freshnessScore +
    followingScore +
    localScore +
    engagementScore +
    qualityScore +
    rotation
  );
};

const rotateCloseScoreEvents = (items: (EventFromAPI & { __score?: number })[], seed: number) => {
  if (!items.length) return items;

  const buckets: (EventFromAPI & { __score?: number })[][] = [];
  let current: (EventFromAPI & { __score?: number })[] = [];
  let previousScore: number | null = null;

  for (const item of items) {
    const score = Number(item.__score || 0);
    if (previousScore === null) {
      current.push(item);
      previousScore = score;
      continue;
    }

    if (Math.abs(previousScore - score) <= 5) {
      current.push(item);
    } else {
      buckets.push(
        [...current]
          .map((x, i) => ({
            x,
            r: seededRandEvent(seed + i + hashEventString(String(x.id))),
          }))
          .sort((a, b) => a.r - b.r)
          .map((v) => v.x)
      );
      current = [item];
    }

    previousScore = score;
  }

  if (current.length) {
    buckets.push(
      [...current]
        .map((x, i) => ({
          x,
          r: seededRandEvent(seed + i + hashEventString(String(x.id))),
        }))
        .sort((a, b) => a.r - b.r)
        .map((v) => v.x)
    );
  }

  return buckets.flat();
};

const rankEventsForFeed = (items: EventFromAPI[], currentUser: User | null) => {
  const seed = Math.floor(Date.now() / (1000 * 60 * 30));

  const scored = safeArrayAny(items)
    .map((event: EventFromAPI) => ({
      ...event,
      __score: scoreEventForFeed(event, currentUser, seed),
    }))
    .sort((a, b) => Number(b.__score || 0) - Number(a.__score || 0));

  return rotateCloseScoreEvents(scored, seed);
};

// ========== TYPES ==========
type EventFilter = "all" | "upcoming" | "past" | "today" | "this-week" | "this-month";
type EventSort = "date" | "popular" | "trending";
type EventLayout = "vertical" | "horizontal" | "compact";

interface Attendee {
  id: number;
  name: string;
  username?: string;
  profile_image_url?: string | null;
  is_following?: boolean;
}

interface EventFromAPI {
  event_key?: string;
  id: number;
  creator_id: number;
  title: string;
  description?: string;
  event_date: string;
  location?: string;
  cover_url?: string;
  visibility: "worldwide" | "targeted";
  group_id?: number | null;
  created_at: string;
  attendees_count: number;
  interested_count: number;
  user_rsvp_status?: "" | "going" | "interested";

  attendees?: Attendee[];
  following_attendees?: Attendee[];
  friend_attendees?: Attendee[]; // backend compatibility
  interested?: Attendee[];

  creator?: {
    id: number;
    name: string;
    username?: string;
    profile_image_url?: string | null;
  };
}

interface AllEventsProps {
  currentUser: User | null;
  users?: User[];
  onProfileClick: (id: number) => void;
  onCreateEventClick?: () => void;
  onNavigateBack?: () => void;
  uploadState?: PostUploadState | null;
  onDismissUpload?: () => void;
}

// ========== FILTER CHIP ==========
const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
}> = ({ label, active, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200
      flex items-center gap-2 whitespace-nowrap
      ${
        active
          ? "bg-[#1877F2] text-white shadow-lg shadow-[#1877F2]/20"
          : "bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC]"
      }
    `}
  >
    {icon && <i className={`fas fa-${icon} text-sm`}></i>}
    {label}
  </button>
);

// ========== RSVP COUNTS COMPONENT ==========
const RSVPCounts: React.FC<{
  goingCount: number;
  interestedCount: number;
  onGoingClick?: () => void;
  onInterestedClick?: () => void;
  className?: string;
  size?: "sm" | "md";
}> = ({ goingCount, interestedCount, onGoingClick, onInterestedClick, className = "", size = "md" }) => {
  const isSmall = size === "sm";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={onGoingClick}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#45BD62]/10 hover:bg-[#45BD62]/20 transition-colors"
      >
        <div className={`${isSmall ? "w-4 h-4" : "w-5 h-5"} rounded-full bg-[#45BD62] flex items-center justify-center`}>
          <i className={`fas fa-user-friends text-white ${isSmall ? "text-[8px]" : "text-[10px]"}`}></i>
        </div>
        <span className={`text-[#E4E6EB] font-semibold ${isSmall ? "text-xs" : "text-sm"}`}>{goingCount}</span>
        {!isSmall && <span className="text-[#B0B3B8] text-xs">Going</span>}
      </button>

      <button
        onClick={onInterestedClick}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#F7B928]/10 hover:bg-[#F7B928]/20 transition-colors"
      >
        <div className={`${isSmall ? "w-4 h-4" : "w-5 h-5"} rounded-full bg-[#F7B928] flex items-center justify-center`}>
          <i className={`fas fa-user-friends text-black ${isSmall ? "text-[8px]" : "text-[10px]"}`}></i>
        </div>
        <span className={`text-[#E4E6EB] font-semibold ${isSmall ? "text-xs" : "text-sm"}`}>{interestedCount}</span>
        {!isSmall && <span className="text-[#B0B3B8] text-xs">Interested</span>}
      </button>
    </div>
  );
};

// ========== EVENT CARD ==========
const EventCard: React.FC<{
  event: EventFromAPI;
  currentUser: User | null;
  onEventClick: (id: number) => void;
  onProfileClick: (id: number) => void;
  onRSVPUpdate?: (eventId: number, newStatus: "" | "going" | "interested", newAtt: number, newInt: number) => void;
  isPreview?: boolean;
  layout?: EventLayout;
}> = ({ event, currentUser, onEventClick, onProfileClick, onRSVPUpdate, isPreview = false, layout = "vertical" }) => {
  const [rsvpStatus, setRsvpStatus] = useState<"" | "going" | "interested">(event?.user_rsvp_status || "");
  const [attendeesCount, setAttendeesCount] = useState(event?.attendees_count || 0);
  const [interestedCount, setInterestedCount] = useState(event?.interested_count || 0);
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (event) {
      setRsvpStatus(event.user_rsvp_status || "");
      setAttendeesCount(event.attendees_count || 0);
      setInterestedCount(event.interested_count || 0);
    }
  }, [event]);

  if (!event) return null;

  const dateObj = toDateSafe(event.event_date);
  const nowLocal = new Date();

  const isPast = !!dateObj && dateObj < nowLocal;
  const isToday = !!dateObj && dateObj.toDateString() === nowLocal.toDateString();

  const isTomorrow = (() => {
    if (!dateObj) return false;
    const tomorrow = new Date(nowLocal);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateObj.toDateString() === tomorrow.toDateString();
  })();

  const formatEventDate = () => {
    if (!dateObj) return "Date TBD";
    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";
    return dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatEventTime = () => {
    if (!dateObj) return "";
    return dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const creator = event.creator || {
    id: event.creator_id,
    name: "Event Organizer",
    username: "",
    profile_image_url: null,
  };

  const followedCreator = isFromFollowedCreator(event, currentUser);

  const handleRSVPClick = async (status: "going" | "interested") => {
    if (!currentUser) {
      alert("Please login to RSVP");
      return;
    }

    setLoading(true);

    const prevStatus = rsvpStatus;
    const nextStatus: "" | "going" | "interested" = prevStatus === status ? "" : status;

    const prevAtt = attendeesCount;
    const prevInt = interestedCount;

    let nextAtt = prevAtt;
    let nextInt = prevInt;

    if (status === "going") {
      if (prevStatus === "going") nextAtt = Math.max(0, prevAtt - 1);
      else if (prevStatus === "interested") {
        nextAtt = prevAtt + 1;
        nextInt = Math.max(0, prevInt - 1);
      } else nextAtt = prevAtt + 1;
    } else {
      if (prevStatus === "interested") nextInt = Math.max(0, prevInt - 1);
      else if (prevStatus === "going") {
        nextInt = prevInt + 1;
        nextAtt = Math.max(0, prevAtt - 1);
      } else nextInt = prevInt + 1;
    }

    setRsvpStatus(nextStatus);
    setAttendeesCount(nextAtt);
    setInterestedCount(nextInt);

    try {
      await rsvpEventDirect({
        eventId: event.id,
        userId: currentUser.id,
        newStatus: (nextStatus || "not_going") as RSVPStatus,
        prevStatus: prevStatus as any,
      });

      onRSVPUpdate?.(event.id, nextStatus, nextAtt, nextInt);
    } catch (err) {
      setRsvpStatus(prevStatus);
      setAttendeesCount(prevAtt);
      setInterestedCount(prevInt);
      console.error("RSVP failed:", err);
      alert("Failed to RSVP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isPreview) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEventClick(0);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPreview, onEventClick]);

  if (isPreview) {
    return createPortal(
      <div className="fixed inset-0 z-[99999] bg-[#050B18] overflow-y-auto animate-in fade-in duration-150">
        <button
          type="button"
          onClick={() => onEventClick(0)}
          className="fixed top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm flex items-center justify-center text-white transition-colors cursor-pointer border border-white/10"
          aria-label="Close"
        >
          <i className="fas fa-times text-white text-xl"></i>
        </button>

        <div className="relative h-[40vh] min-h-[300px] w-full">
          {event.cover_url && !imageError ? (
            <img
              src={event.cover_url}
              alt={event.title}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1877F2] to-[#45BD62] flex items-center justify-center">
              <i className="fas fa-calendar text-white/30 text-8xl"></i>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 -mt-20 relative z-10">
          <div className="bg-[#0B1120] rounded-xl p-6 border border-[#1E293B]">
            <h1 className="text-[#F8FAFC] text-3xl font-black mb-4">{event.title}</h1>

            {followedCreator && (
              <div className="mb-4 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#1877F2]/15 text-[#8AB4F8] text-xs font-bold">
                <i className="fas fa-user-check"></i>
                <span>Hosted by someone you follow</span>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-[#94A3B8]">
                <div className="w-8 h-8 rounded-full bg-[#1E293B] flex items-center justify-center">
                  <i className={`fas fa-calendar-alt ${isPast ? "text-[#94A3B8]" : "text-[#1877F2]"}`}></i>
                </div>
                <div>
                  <div className="text-[#F8FAFC] font-semibold">{formatEventDate()}</div>
                  <div className="text-sm">{formatEventTime() || "Time TBD"}</div>
                </div>
              </div>

              {event.location && (
                <div className="flex items-center gap-3 text-[#94A3B8]">
                  <div className="w-8 h-8 rounded-full bg-[#1E293B] flex items-center justify-center">
                    <i className="fas fa-map-marker-alt text-[#F02849]"></i>
                  </div>
                  <div>
                    <div className="text-[#F8FAFC] font-semibold">Location</div>
                    <div className="text-sm">{event.location}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-[#94A3B8]">
                <div className="w-8 h-8 rounded-full bg-[#1E293B] flex items-center justify-center">
                  <i className="fas fa-user text-[#1877F2]"></i>
                </div>
                <div>
                  <div className="text-[#F8FAFC] font-semibold">Hosted by</div>
                  <button
                    onClick={() => onProfileClick(creator.id)}
                    className="text-sm hover:underline text-[#1877F2]"
                  >
                    {creator.name}
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-6 pt-4 border-t border-[#1E293B]">
              <RSVPCounts
                goingCount={attendeesCount}
                interestedCount={interestedCount}
                onGoingClick={() => {}}
                onInterestedClick={() => {}}
              />
            </div>

            {!isPast && (
              <div className="flex gap-3 mb-6">
                <button
                  disabled={loading}
                  onClick={() => handleRSVPClick("going")}
                  className={`
                    flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200
                    ${
                      rsvpStatus === "going"
                        ? "bg-[#45BD62] text-white"
                        : "bg-[#1877F2] text-white hover:bg-[#166FE5]"
                    }
                  `}
                >
                  {loading && rsvpStatus === "going" ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : rsvpStatus === "going" ? (
                    "✓ Going"
                  ) : (
                    "Going"
                  )}
                </button>

                <button
                  disabled={loading}
                  onClick={() => handleRSVPClick("interested")}
                  className={`
                    flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200
                    ${
                      rsvpStatus === "interested"
                        ? "bg-[#F7B928] text-black"
                        : "bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]"
                    }
                  `}
                >
                  {loading && rsvpStatus === "interested" ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : rsvpStatus === "interested" ? (
                    "✓ Interested"
                  ) : (
                    "Interested"
                  )}
                </button>
              </div>
            )}

            {event.description && (
              <div className="pt-4 border-t border-[#1E293B]">
                <h3 className="text-[#F8FAFC] font-bold mb-2">About this event</h3>
                <p className="text-[#94A3B8] whitespace-pre-wrap">{event.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (layout === "horizontal") {
    return (
      <div
        className="bg-[#0B1120] rounded-xl overflow-hidden border border-[#1E293B] hover:border-[#1877F2] transition-all duration-300 cursor-pointer group flex h-[200px] w-[500px] flex-shrink-0"
        onClick={() => onEventClick(event.id)}
      >
        <div className="relative w-2/5 h-full overflow-hidden">
          {event.cover_url && !imageError ? (
            <img
              src={event.cover_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1877F2] to-[#45BD62] flex items-center justify-center">
              <i className="fas fa-calendar text-white/30 text-4xl"></i>
            </div>
          )}

          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/20">
            <div className="text-[#F7B928] text-[9px] font-black uppercase">
              {dateObj?.toLocaleDateString("en-US", { month: "short" })}
            </div>
            <div className="text-white text-[18px] font-black leading-tight">{dateObj?.getDate()}</div>
          </div>

          {isPast ? (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 border border-white/20">
              <span className="text-[#94A3B8] text-[10px] font-semibold">Past</span>
            </div>
          ) : (
            <div className="absolute top-2 right-2 bg-[#45BD62]/90 backdrop-blur-sm rounded-full px-2 py-0.5">
              <span className="text-white text-[10px] font-semibold">Upcoming</span>
            </div>
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col">
          <div className="flex items-center justify-between mb-2" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex items-center gap-1.5 cursor-pointer"
              onClick={() => {
                if (creator?.id) onProfileClick(creator.id);
              }}
            >
              <img
                src={avatarFrom(creator)}
                alt=""
                className="w-4 h-4 rounded-full object-cover border border-[#1E293B]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://ui-avatars.com/api/?name=User&background=1877F2&color=fff&bold=true";
                }}
              />
              <span className="text-[#94A3B8] text-[10px] hover:underline truncate max-w-[80px]">
                {creator?.name || "Organizer"}
              </span>
              <span className="text-[#1E293B] text-[8px]">•</span>
              <span className="text-[#94A3B8] text-[10px]">{formatRelativeTime(event.created_at)}</span>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <RSVPCounts goingCount={attendeesCount} interestedCount={interestedCount} size="sm" />
              <PostMenu
                item={{
                  ...event,
                  id: event.id,
                  event_id: event.id,
                  type: 'event',
                  user_id: event.creator_id || event.user_id,
                  creator_id: event.creator_id || event.user_id,
                  title: event.title,
                  description: event.description,
                  event_date: event.event_date,
                  location: event.location,
                  cover_url: event.cover_url,
                  visibility: event.visibility,
                }}
                currentUser={currentUser}
              />
            </div>
          </div>

          {followedCreator && (
            <div className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1877F2]/15 text-[#8AB4F8] text-[9px] font-bold">
              <i className="fas fa-user-check"></i>
              <span>Following</span>
            </div>
          )}

          <h3 className="text-[#F8FAFC] font-black text-sm mb-1 line-clamp-2 group-hover:text-[#1877F2] transition-colors">
            {event.title}
          </h3>

          {event.description && <p className="text-[#94A3B8] text-[10px] mb-2 line-clamp-2">{event.description}</p>}

          <div className="space-y-1 mb-2 flex-1">
            <div className="flex items-center gap-1.5 text-[#94A3B8] text-[10px]">
              <i className={`fas fa-calendar-alt w-3 ${isPast ? "text-[#94A3B8]" : "text-[#1877F2]"}`}></i>
              <span className="truncate">
                {formatEventDate()}
                {formatEventTime() && ` • ${formatEventTime()}`}
              </span>
            </div>

            {event.location && (
              <div className="flex items-center gap-1.5 text-[#94A3B8] text-[10px]">
                <i className="fas fa-map-marker-alt w-3 text-[#F02849]"></i>
                <span className="line-clamp-1">{event.location}</span>
              </div>
            )}
          </div>

          <div className="flex gap-1 mt-auto">
            <button
              disabled={loading || isPast}
              onClick={(e) => {
                e.stopPropagation();
                handleRSVPClick("going");
              }}
              className={`
                flex-1 py-1.5 rounded-lg font-bold text-[10px] transition-all duration-200
                ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                ${
                  rsvpStatus === "going"
                    ? "bg-[#45BD62] text-white"
                    : "bg-[#1877F2] text-white hover:bg-[#166FE5]"
                }
              `}
            >
              {loading && rsvpStatus === "going" ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : rsvpStatus === "going" ? (
                "✓ Going"
              ) : (
                "Going"
              )}
            </button>

            <button
              disabled={loading || isPast}
              onClick={(e) => {
                e.stopPropagation();
                handleRSVPClick("interested");
              }}
              className={`
                flex-1 py-1.5 rounded-lg font-bold text-[10px] transition-all duration-200
                ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                ${
                  rsvpStatus === "interested"
                    ? "bg-[#F7B928] text-black"
                    : "bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]"
                }
              `}
            >
              {loading && rsvpStatus === "interested" ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : rsvpStatus === "interested" ? (
                "✓ Interested"
              ) : (
                "Interested"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "compact") {
    return (
      <div
        className="bg-[#0B1120] rounded-xl overflow-hidden border border-[#1E293B] hover:border-[#1877F2] transition-all duration-300 cursor-pointer group w-[280px] flex-shrink-0"
        onClick={() => onEventClick(event.id)}
      >
        <div className="relative h-24 overflow-hidden">
          {event.cover_url && !imageError ? (
            <img
              src={event.cover_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1877F2] to-[#45BD62] flex items-center justify-center">
              <i className="fas fa-calendar text-white/30 text-2xl"></i>
            </div>
          )}

          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/20">
            <div className="text-[#F7B928] text-[8px] font-black uppercase">
              {dateObj?.toLocaleDateString("en-US", { month: "short" })}
            </div>
            <div className="text-white text-[14px] font-black leading-tight">{dateObj?.getDate()}</div>
          </div>

          {isPast ? (
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 border border-white/20">
              <span className="text-[#94A3B8] text-[8px] font-semibold">Past</span>
            </div>
          ) : (
            <div className="absolute top-2 right-2 bg-[#45BD62]/90 backdrop-blur-sm rounded-full px-2 py-0.5">
              <span className="text-white text-[8px] font-semibold">Upcoming</span>
            </div>
          )}
        </div>

        <div className="p-2">
          <div className="flex items-center gap-1 mb-1">
            <img src={avatarFrom(creator)} alt="" className="w-4 h-4 rounded-full object-cover border border-[#1E293B]" />
            <span className="text-[#94A3B8] text-[9px] truncate">{creator?.name || "Organizer"}</span>
          </div>

          {followedCreator && (
            <div className="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1877F2]/15 text-[#8AB4F8] text-[9px] font-bold">
              <i className="fas fa-user-check"></i>
              <span>Following</span>
            </div>
          )}

          <h3 className="text-[#F8FAFC] font-black text-xs mb-1 line-clamp-1 group-hover:text-[#1877F2] transition-colors">
            {event.title}
          </h3>

          <div className="flex items-center gap-1 text-[#94A3B8] text-[9px] mb-1">
            <i className={`fas fa-calendar-alt w-3 ${isPast ? "text-[#94A3B8]" : "text-[#1877F2]"}`}></i>
            <span className="truncate">{formatEventDate()}</span>
          </div>

          <div className="flex items-center justify-between">
            <RSVPCounts goingCount={attendeesCount} interestedCount={interestedCount} size="sm" />

            <div className="flex gap-1">
              <button
                disabled={loading || isPast}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRSVPClick("going");
                }}
                className={`
                  px-2 py-0.5 rounded-lg font-bold text-[8px] transition-all duration-200
                  ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                  ${
                    rsvpStatus === "going"
                      ? "bg-[#45BD62] text-white"
                      : "bg-[#1877F2] text-white hover:bg-[#166FE5]"
                  }
                `}
              >
                {rsvpStatus === "going" ? "✓" : "Going"}
              </button>

              <button
                disabled={loading || isPast}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRSVPClick("interested");
                }}
                className={`
                  px-2 py-0.5 rounded-lg font-bold text-[8px] transition-all duration-200
                  ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                  ${
                    rsvpStatus === "interested"
                      ? "bg-[#F7B928] text-black"
                      : "bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]"
                  }
                `}
              >
                {rsvpStatus === "interested" ? "✓" : "Int"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-[#0B1120] rounded-xl overflow-hidden border border-[#1E293B] hover:border-[#1877F2] transition-all duration-300 cursor-pointer group"
      onClick={() => onEventClick(event.id)}
    >
      <div className="relative h-40 overflow-hidden">
        {event.cover_url && !imageError ? (
          <img
            src={event.cover_url}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1877F2] to-[#45BD62] flex items-center justify-center">
            <i className="fas fa-calendar text-white/30 text-6xl"></i>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/20">
          <div className="text-[#F7B928] text-[11px] font-black uppercase">
            {dateObj?.toLocaleDateString("en-US", { month: "short" })}
          </div>
          <div className="text-white text-[24px] font-black leading-tight">{dateObj?.getDate()}</div>
        </div>

        {isPast ? (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 border border-white/20">
            <span className="text-[#94A3B8] text-xs font-semibold">Past Event</span>
          </div>
        ) : (
          <div className="absolute top-3 right-3 bg-[#45BD62]/90 backdrop-blur-sm rounded-full px-3 py-1">
            <span className="text-white text-xs font-semibold">Upcoming</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2" onClick={(e) => e.stopPropagation()}>
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              if (creator?.id) onProfileClick(creator.id);
            }}
          >
            <img
              src={avatarFrom(creator)}
              alt=""
              className="w-5 h-5 rounded-full object-cover border border-[#1E293B]"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://ui-avatars.com/api/?name=User&background=1877F2&color=fff&bold=true";
              }}
            />
            <span className="text-[#94A3B8] text-xs hover:underline">{creator?.name || "Event Organizer"}</span>
            <span className="text-[#1E293B] text-xs">•</span>
            <span className="text-[#94A3B8] text-xs">{formatRelativeTime(event.created_at)}</span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <RSVPCounts goingCount={attendeesCount} interestedCount={interestedCount} size="sm" />
            <PostMenu
              item={{
                ...event,
                id: event.id,
                event_id: event.id,
                type: 'event',
                user_id: event.creator_id || event.user_id,
                creator_id: event.creator_id || event.user_id,
                title: event.title,
                description: event.description,
                event_date: event.event_date,
                location: event.location,
                cover_url: event.cover_url,
                visibility: event.visibility,
              }}
              currentUser={currentUser}
            />
          </div>
        </div>

        {followedCreator && (
          <div className="mb-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#1877F2]/15 text-[#8AB4F8] text-[10px] font-bold">
            <i className="fas fa-user-check"></i>
            <span>From someone you follow</span>
          </div>
        )}

        <h3 className="text-[#F8FAFC] font-black text-[16px] mb-1 line-clamp-2 group-hover:text-[#1877F2] transition-colors">
          {event.title}
        </h3>

        {event.description && <p className="text-[#94A3B8] text-xs mb-2 line-clamp-2">{event.description}</p>}

        <div className="space-y-1 mb-3">
          <div className="flex items-center gap-2 text-[#94A3B8] text-xs">
            <i className={`fas fa-calendar-alt w-4 ${isPast ? "text-[#94A3B8]" : "text-[#1877F2]"}`}></i>
            <span>
              {formatEventDate()}
              {formatEventTime() && ` at ${formatEventTime()}`}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-2 text-[#94A3B8] text-xs">
              <i className="fas fa-map-marker-alt w-4 text-[#F02849]"></i>
              <span className="line-clamp-1">{event.location}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            disabled={loading || isPast}
            onClick={(e) => {
              e.stopPropagation();
              handleRSVPClick("going");
            }}
            className={`
              flex-1 py-2 rounded-lg font-bold text-xs transition-all duration-200
              ${isPast ? "opacity-50 cursor-not-allowed" : ""}
              ${
                rsvpStatus === "going"
                  ? "bg-[#45BD62] text-white hover:bg-[#3da855]"
                  : "bg-[#1877F2] text-white hover:bg-[#166FE5] hover:shadow-lg hover:shadow-[#1877F2]/20"
              }
            `}
          >
            {loading && rsvpStatus === "going" ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : rsvpStatus === "going" ? (
              "✓ Going"
            ) : (
              "Going"
            )}
          </button>

          <button
            disabled={loading || isPast}
            onClick={(e) => {
              e.stopPropagation();
              handleRSVPClick("interested");
            }}
            className={`
              flex-1 py-2 rounded-lg font-bold text-xs transition-all duration-200
              ${isPast ? "opacity-50 cursor-not-allowed" : ""}
              ${
                rsvpStatus === "interested"
                  ? "bg-[#F7B928] text-black hover:bg-[#e5aa24]"
                  : "bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]"
              }
            `}
          >
            {loading && rsvpStatus === "interested" ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : rsvpStatus === "interested" ? (
              "✓ Interested"
            ) : (
              "Interested"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== AUTO SCROLLING HORIZONTAL SECTION ==========
const AutoScrollHorizontal: React.FC<{
  title: string;
  events: EventFromAPI[];
  currentUser: User | null;
  onEventClick: (id: number) => void;
  onProfileClick: (id: number) => void;
  onRSVPUpdate?: (eventId: number, newStatus: "" | "going" | "interested", newAtt: number, newInt: number) => void;
  speed?: number;
  direction?: "left" | "right";
}> = ({
  title,
  events,
  currentUser,
  onEventClick,
  onProfileClick,
  onRSVPUpdate,
  speed = 28,
  direction = "left",
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const animationRef = useRef<number>();
  const scrollPositionRef = useRef(0);

  const startScrolling = useCallback(() => {
    if (!scrollRef.current || isPaused) return;

    const scroll = () => {
      if (!scrollRef.current || isPaused) return;

      const container = scrollRef.current;
      const maxScroll = container.scrollWidth - container.clientWidth;

      if (direction === "left") {
        scrollPositionRef.current += speed / 60;
        if (scrollPositionRef.current >= maxScroll) {
          scrollPositionRef.current = 0;
        }
      } else {
        scrollPositionRef.current -= speed / 60;
        if (scrollPositionRef.current <= 0) {
          scrollPositionRef.current = maxScroll;
        }
      }

      container.scrollLeft = scrollPositionRef.current;
      animationRef.current = requestAnimationFrame(scroll);
    };

    animationRef.current = requestAnimationFrame(scroll);
  }, [speed, direction, isPaused]);

  useEffect(() => {
    if (!isPaused) startScrolling();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [startScrolling, isPaused]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  if (events.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#E4E6EB] text-lg font-black">{title}</h2>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-[#45BD62] animate-pulse"></div>
          <span className="text-[#B0B3B8] text-xs">Live discovery</span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide cursor-default"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {events.map((event) => (
          <div key={`${title}-${event.event_key || `event:${event.id}`}`} className="flex-shrink-0">
            <EventCard
              event={event}
              currentUser={currentUser}
              onEventClick={onEventClick}
              onProfileClick={onProfileClick}
              onRSVPUpdate={onRSVPUpdate}
              layout="compact"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ========== MAIN PAGE ==========
export const AllEvents: React.FC<AllEventsProps> = ({
  currentUser,
  onProfileClick,
  onCreateEventClick,
  onNavigateBack,
  uploadState,
  onDismissUpload,
}) => {
  const [events, setEvents] = useState<EventFromAPI[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventFromAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewEventId, setPreviewEventId] = useState<number | null>(null);

  const [filter, setFilter] = useState<EventFilter>("all");
  const [sort, setSort] = useState<EventSort>("date");

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const fetchingMoreRef = useRef(false);
  const loadingRef = useRef(false);
  const reqIdRef = useRef(0);
  const didInitRef = useRef(false);
  const prevUserIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const handleEventDeleted = (e: any) => {
      const id = Number(e?.detail?.id);
      if (id) {
        setEvents((prev) => prev.filter((ev) => Number(ev.id) !== id));
        setFilteredEvents((prev) => prev.filter((ev) => Number(ev.id) !== id));
      }
    };
    const handleEventUpdated = (e: any) => {
      const updated = e?.detail;
      if (updated?.id) {
        setEvents((prev) =>
          prev.map((ev) => (Number(ev.id) === Number(updated.id) ? { ...ev, ...updated } : ev))
        );
        setFilteredEvents((prev) =>
          prev.map((ev) => (Number(ev.id) === Number(updated.id) ? { ...ev, ...updated } : ev))
        );
      }
    };
    window.addEventListener("event-deleted", handleEventDeleted);
    window.addEventListener("event-updated", handleEventUpdated);
    return () => {
      window.removeEventListener("event-deleted", handleEventDeleted);
      window.removeEventListener("event-updated", handleEventUpdated);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (events.length > 0) {
      const visibleEvents = events.filter((event) => isEventVisibleToUser(event, currentUser));
      const ranked = rankEventsForFeed(visibleEvents, currentUser);
      setFilteredEvents(ranked);
    } else {
      setFilteredEvents([]);
    }
  }, [events, currentUser]);

  const fetchEvents = useCallback(
    async (reset = false, nextPage?: number) => {
      const reqId = ++reqIdRef.current;
      const pageToLoad = typeof nextPage === "number" ? nextPage : reset ? 1 : page;

      if (!reset) {
        if (fetchingMoreRef.current) return;
        fetchingMoreRef.current = true;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          limit: "24",
          filter,
          sort,
        });

        if (debouncedQ) params.set("q", debouncedQ);
        if (currentUser?.id) params.set("user_id", String(currentUser.id));

        params.set("include_attendees", "true");
        params.set("include_friends", "true");
        params.set("include_following", "true");

        const res = await fetch(`/api/events_feeds?${params.toString()}`, {
          headers: { ...authHeaders(), "Content-Type": "application/json" },
        });

        if (res.status === 401) {
          setHasMore(false);
          throw new Error("Session expired. Please login again.");
        }

        const data = await safeJson(res);
        if (reqId !== reqIdRef.current) return;

        if (!res.ok || data?.success === false) {
          throw new Error(data?.error || data?.message || "Failed to fetch events");
        }

        const newEvents: EventFromAPI[] = (data?.events || []) as any;

        const sortedEvents = [...newEvents].sort((a, b) => {
          const dateA = toDateSafe(a.event_date);
          const dateB = toDateSafe(b.event_date);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.getTime() - dateA.getTime();
        });

        setEvents((prev) => {
          if (reset) return sortedEvents;
          const existingIds = new Set(prev.map((e) => e.id));
          const uniqueNewEvents = sortedEvents.filter((e) => !existingIds.has(e.id));
          return [...prev, ...uniqueNewEvents];
        });

        setHasMore(!!data?.has_more || newEvents.length === 24);

        if (reset) setPage(1);
      } catch (e: any) {
        if (reqId !== reqIdRef.current) return;
        setError(e?.message || "Failed to load events");
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          if (!reset) {
            setTimeout(() => {
              fetchingMoreRef.current = false;
            }, 100);
          }
        }
      }
    },
    [page, filter, sort, debouncedQ, currentUser?.id]
  );

  const handleRSVPUpdate = useCallback(
    (eventId: number, newStatus: "" | "going" | "interested", newAtt: number, newInt: number) => {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                user_rsvp_status: newStatus,
                attendees_count: newAtt,
                interested_count: newInt,
                attendees:
                  newStatus === "going" && currentUser
                    ? [
                        ...(e.attendees || []),
                        {
                          id: currentUser.id,
                          name: (currentUser as any).name || "You",
                          username: (currentUser as any).username,
                          profile_image_url: (currentUser as any).profile_image_url,
                          is_following: true,
                        },
                      ]
                    : e.attendees?.filter((a) => a.id !== currentUser?.id),
              }
            : e
        )
      );
    },
    [currentUser]
  );

  const handleEventClick = (eventId: number) => {
    if (eventId === 0) setPreviewEventId(null);
    else setPreviewEventId(eventId);
  };

  const scrollHorizontal = (sectionId: string, direction: "left" | "right") => {
    const ref = horizontalScrollRefs.current[sectionId];
    if (ref) {
      const scrollAmount = 520;
      const newScrollLeft = direction === "left" ? ref.scrollLeft - scrollAmount : ref.scrollLeft + scrollAmount;

      ref.scrollTo({
        left: newScrollLeft,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    if (currentUser && !(currentUser as any).id) return;

    const currentUserId = (currentUser as any)?.id;
    if (prevUserIdRef.current === currentUserId && didInitRef.current) return;

    prevUserIdRef.current = currentUserId;

    if (didInitRef.current && prevUserIdRef.current === currentUserId) return;

    didInitRef.current = true;
    setEvents([]);
    setHasMore(true);
    setPage(1);
    fetchEvents(true, 1);
  }, [currentUser?.id, fetchEvents]);

  useEffect(() => {
    if (!didInitRef.current) return;
    setEvents([]);
    setHasMore(true);
    setPage(1);
    fetchEvents(true, 1);
  }, [filter, sort, debouncedQ, fetchEvents]);

  useEffect(() => {
    if (!hasMore) return;

    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;

        if (loadingRef.current) return;
        if (fetchingMoreRef.current) return;
        if (!hasMore) return;

        setPage((p) => p + 1);
      },
      {
        threshold: 0.1,
        rootMargin: "400px 0px 400px 0px",
      }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore]);

  useEffect(() => {
    if (page > 1) {
      fetchEvents(false, page);
    }
  }, [page, fetchEvents]);

  const filterOptions: { value: EventFilter; label: string; icon: string }[] = [
    { value: "all", label: "All Events", icon: "calendar" },
    { value: "upcoming", label: "Upcoming", icon: "arrow-right" },
    { value: "today", label: "Today", icon: "sun" },
    { value: "this-week", label: "This Week", icon: "calendar-week" },
    { value: "this-month", label: "This Month", icon: "calendar-alt" },
    { value: "past", label: "Past Events", icon: "history" },
  ];

  const sortOptions: { value: EventSort; label: string }[] = [
    { value: "date", label: "Date" },
    { value: "popular", label: "Most Popular" },
    { value: "trending", label: "Trending" },
  ];

  const previewEvent = previewEventId ? events.find((e) => e.id === previewEventId) : null;

  const generateSections = () => {
    const sections: React.ReactNode[] = [];

    const happeningSoon = filteredEvents.filter((e) => {
      const d = daysUntilEvent(e.event_date);
      return d >= 0 && d <= 7;
    });

    const fromFollowing = filteredEvents.filter((e) => isFromFollowedCreator(e, currentUser));
    const nearYou = filteredEvents.filter((e) => isNearUserCountry(e, currentUser));
    const moreEvents = filteredEvents.filter(
      (e) =>
        !happeningSoon.some((x) => x.id === e.id) &&
        !fromFollowing.some((x) => x.id === e.id) &&
        !nearYou.some((x) => x.id === e.id)
    );

    if (happeningSoon.length > 0) {
      sections.push(
        <AutoScrollHorizontal
          key="happening-soon"
          title="Happening Soon"
          events={happeningSoon.slice(0, 10)}
          currentUser={currentUser}
          onEventClick={handleEventClick}
          onProfileClick={onProfileClick}
          onRSVPUpdate={handleRSVPUpdate}
          speed={28}
          direction="left"
        />
      );
    }

    if (fromFollowing.length > 0) {
      sections.push(
        <div key="from-following" className="mb-8">
          <h2 className="text-[#E4E6EB] text-lg font-black mb-4">From People You Follow</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fromFollowing.slice(0, 6).map((event) => (
              <div key={`follow-${event.id}`}>
                <EventCard
                  event={event}
                  currentUser={currentUser}
                  onEventClick={handleEventClick}
                  onProfileClick={onProfileClick}
                  onRSVPUpdate={handleRSVPUpdate}
                  layout="vertical"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (nearYou.length > 0) {
      const sectionId = "near-you";
      sections.push(
        <div key="near-you" className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[#E4E6EB] text-lg font-black">Near You</h2>
            <div className="flex items-center gap-2">
              <span className="text-[#B0B3B8] text-xs">Based on your location</span>
              <div className="flex gap-2">
                <button
                  onClick={() => scrollHorizontal(sectionId, "left")}
                  className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-chevron-left text-[#F8FAFC] text-sm"></i>
                </button>
                <button
                  onClick={() => scrollHorizontal(sectionId, "right")}
                  className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-chevron-right text-[#F8FAFC] text-sm"></i>
                </button>
              </div>
            </div>
          </div>
          <div
            ref={(el) => (horizontalScrollRefs.current[sectionId] = el)}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {nearYou.slice(0, 10).map((event) => (
              <EventCard
                key={`near-${event.id}`}
                event={event}
                currentUser={currentUser}
                onEventClick={handleEventClick}
                onProfileClick={onProfileClick}
                onRSVPUpdate={handleRSVPUpdate}
                layout="horizontal"
              />
            ))}
          </div>
        </div>
      );
    }

    if (moreEvents.length > 0) {
      sections.push(
        <div key="more-events" className="mb-8">
          <h2 className="text-[#F8FAFC] text-lg font-black mb-4">More Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {moreEvents.map((event) => (
              <div key={`more-${event.id}`}>
                <EventCard
                  event={event}
                  currentUser={currentUser}
                  onEventClick={handleEventClick}
                  onProfileClick={onProfileClick}
                  onRSVPUpdate={handleRSVPUpdate}
                  layout="vertical"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return sections;
  };

  return (
    <div className="min-h-screen bg-[#050B18] font-sans">
      <div className="sticky top-0 z-50 bg-[#0B1120] border-b border-[#1E293B] backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onNavigateBack}
                className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center transition-colors"
              >
                <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
              </button>
              <h1 className="text-[#F8FAFC] text-[28px] font-black">Events</h1>
            </div>

            {currentUser && (
              <button
                onClick={onCreateEventClick}
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-[#1877F2]/20"
              >
                <i className="fas fa-plus"></i>
                <span>Create Event</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {uploadState && (
          <div className="mb-6 animate-fade-in">
            <PostUploadProgressBanner
              uploadState={uploadState}
              onDismiss={onDismissUpload}
            />
          </div>
        )}
        <div className="bg-[#0B1120] rounded-2xl p-4 border border-[#1E293B] mb-6 shadow-sm">
          <div className="relative mb-4">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] text-sm"></i>
            <input
              type="text"
              placeholder="Search events by title, location, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#050B18] text-[#F8FAFC] placeholder-[#94A3B8] rounded-full py-3 pl-12 pr-4 outline-none border border-[#1E293B] focus:ring-2 focus:ring-[#1877F2] focus:border-[#1877F2] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {filterOptions.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                icon={o.icon}
                active={filter === o.value}
                onClick={() => setFilter(o.value)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1E293B]">
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8] text-sm">Sort by:</span>
              <div className="flex gap-1">
                {sortOptions.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setSort(o.value)}
                    className={`
                      px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors
                      ${
                        sort === o.value
                          ? "bg-[#1877F2] text-white"
                          : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"
                      }
                    `}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="bg-[#0B1120] rounded-xl p-8 text-center border border-[#1E293B]">
            <i className="fas fa-exclamation-triangle text-[#F02849] text-4xl mb-3"></i>
            <p className="text-[#F8FAFC] font-bold mb-2">Failed to load events</p>
            <p className="text-[#94A3B8] text-sm mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchEvents(true, 1);
              }}
              className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredEvents.length === 0 && !loading ? (
          <div className="bg-[#0B1120] rounded-xl p-12 text-center border border-[#1E293B]">
            <div className="w-20 h-20 bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-calendar text-[#1877F2] text-3xl"></i>
            </div>
            <h3 className="text-[#F8FAFC] text-xl font-black mb-2">No events found</h3>
            <p className="text-[#94A3B8] mb-6">
              {searchQuery
                ? `No events matching "${searchQuery}"`
                : "No events yet. Follow more creators or create an event to get started."}
            </p>
            {currentUser && (
              <button
                onClick={onCreateEventClick}
                className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                Create Your First Event
              </button>
            )}
          </div>
        ) : (
          <>
            {generateSections()}

            <div ref={sentinelRef} className="h-1" />

            {loading && (
              <div className="flex justify-center py-8">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-[#1E293B] border-t-[#1877F2] animate-spin-slow"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#1877F2] rounded-full opacity-0"></div>
                  </div>
                </div>
              </div>
            )}

            {!hasMore && filteredEvents.length > 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2 bg-[#0B1120] px-4 py-2 rounded-full border border-[#1E293B]">
                  <i className="fas fa-check-circle text-[#45BD62]"></i>
                  <span className="text-[#94A3B8] text-sm">You've seen all events</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {previewEvent && (
        <EventCard
          event={previewEvent}
          currentUser={currentUser}
          onEventClick={handleEventClick}
          onProfileClick={onProfileClick}
          onRSVPUpdate={handleRSVPUpdate}
          isPreview={true}
        />
      )}

      {currentUser && (
        <button
          onClick={onCreateEventClick}
          className="fixed bottom-6 right-6 md:hidden w-14 h-14 bg-[#1877F2] rounded-full shadow-lg shadow-[#1877F2]/30 flex items-center justify-center hover:bg-[#166FE5] transition-all hover:scale-110 z-50"
        >
          <i className="fas fa-plus text-white text-xl"></i>
        </button>
      )}

      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 1.5s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export { EventCard, FilterChip, RSVPCounts };
