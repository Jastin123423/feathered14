
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useContext,
  memo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Post as PostType,
  ReactionType,
  Product,
  LinkPreview,
  AudioTrack,
  Group,
  Brand,
  Story,
  Event,
} from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { LOCATIONS_DATA, MARKETPLACE_COUNTRIES } from '../constants';
import { MarketplaceContext } from '../App';
import { CreateEventModal } from './Events';
import { EventCard } from './AllEvents';
import { performPostAction } from '../postActionRegistry';
import { PostMenu } from './Post/PostMenu';
import { buildImageUploadBundle } from '../utils/imageCompression';
import { generateVideoThumbnail } from '../utils/videoThumbnail';
import { compressVideoDual, CompressedVideoResult } from '../utils/videoCompressor';
import { resolveApiUrl } from '../utils/api';
import { VerifiedBadge } from './VerifiedBadge';
import {
  getCachedComments,
  setCachedComments,
  addCachedComment,
  updateCachedComment,
  removeCachedComment,
} from '../utils/dataCache';
import { CommentActionModal, useCommentLongPress } from './CommentActionModal';
import { InstagramVideoCard } from './InstagramVideoCard';
import { InstagramVideoShareCard } from './InstagramVideoShareCard';
import { SavePostButton } from './SavePostButton';
import { imageCache, observeForThumbnail, observeForFeed } from '../utils/imageCache';
import { ShareScreen } from './ShareScreen';
export { ShareScreen };
//====================TYPE DEFINITION =============
export type FeedItem =
  | { kind: 'post'; data: any; created_at?: string }
  | { kind: 'story'; data: Story; created_at?: string }
  | { kind: 'reel'; data: ReelFeedData; created_at?: string };  // ✅ ADD THIS

// ==================== ICON COMPONENTS ====================
const Film: React.FC<{ size?: number; color?: string }> = ({
  size = 22,
  color = '#1877F2',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
  </svg>
);

const MoreHorizontal: React.FC<{ size?: number; color?: string }> = ({
  size = 26,
  color = '#b0b3b8',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="19" cy="12" r="1"></circle>
    <circle cx="5" cy="12" r="1"></circle>
  </svg>
);

const Play: React.FC<{
  size?: number;
  color?: string;
  fill?: string;
  style?: React.CSSProperties;
}> = ({ size = 36, color = '#fff', fill = '#fff', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
);

const Eye: React.FC<{ size?: number; color?: string }> = ({
  size = 20,
  color = '#fff',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const SparkReactIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="uneraSparkGrad" x1="12" y1="52" x2="52" y2="12">
        <stop offset="0%" stopColor="#FF7A45" />
        <stop offset="55%" stopColor="#FF5A6A" />
        <stop offset="100%" stopColor="#FF8A3D" />
      </linearGradient>
      <filter
        id="uneraSparkGlow"
        x="-40%"
        y="-40%"
        width="180%"
        height="180%"
      >
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle
      cx="32"
      cy="32"
      r="18"
      fill="url(#uneraSparkGrad)"
      opacity="0.14"
    />
    <g
      stroke="url(#uneraSparkGrad)"
      strokeWidth="5.2"
      strokeLinecap="round"
      filter="url(#uneraSparkGlow)"
    >
      <line x1="32" y1="10" x2="32" y2="18" />
      <line x1="32" y1="46" x2="32" y2="54" />
      <line x1="10" y1="32" x2="18" y2="32" />
      <line x1="46" y1="32" x2="54" y2="32" />
      <line x1="17" y1="17" x2="22.8" y2="22.8" />
      <line x1="41.2" y1="41.2" x2="47" y2="47" />
      <line x1="47" y1="17" x2="41.2" y2="22.8" />
      <line x1="22.8" y1="41.2" x2="17" y2="47" />
    </g>
    <circle cx="32" cy="32" r="6.2" fill="url(#uneraSparkGrad)" />
  </svg>
);

const DiscussSignalIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = '#1877F2',
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <g
      fill="none"
      stroke={color}
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 20c0-5 4-9 9-9h18c7 0 13 6 13 13v6c0 7-6 13-13 13H30l-9 7v-7h-1c-6 0-10-4-10-10V20z" />
      <circle cx="27" cy="30" r="2.2" />
      <circle cx="33" cy="30" r="2.2" />
      <circle cx="39" cy="30" r="2.2" />
      <path d="M48 18c3 2 5 5 6 9" />
      <path d="M44 22c2 1 3 3 4 6" />
    </g>
  </svg>
);

// ==================== HELPER FUNCTIONS ====================
const formatViewCount = (n?: number): string => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000)
    return `${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (v >= 1_000_000)
    return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
};

const isStoryVideo = (story: any) => {
  if (story?.type === 'video') return true;

  const safeParseArray = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const mediaMeta = safeParseArray(story?.media_meta);
  if (mediaMeta.length > 0) {
    const first = mediaMeta[0];
    const item = typeof first === 'string' ? (() => {
      try {
        return JSON.parse(first);
      } catch {
        return null;
      }
    })() : first;

    if (item?.type === 'video') return true;

    const metaUrl = String(item?.feed || item?.full || item?.thumb || '').toLowerCase();
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(metaUrl)) return true;
  }

  const mediaUrls = safeParseArray(story?.media_urls);
  const firstUrl = String(
    story?.media_url || mediaUrls[0] || ''
  ).toLowerCase();

  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(firstUrl);
};

const getStoryAuthorName = (story: any, users?: any[]) => {
  const userId = Number(story?.user_id || story?.user?.id || 0);
  const matchedUser = userId && users ? users.find((u: any) => Number(u.id) === userId) : null;
  const isValidName = (val: any) => {
    if (!val || typeof val !== 'string') return false;
    const s = val.trim();
    return s.length > 0 && s.toLowerCase() !== 'user' && s.toLowerCase() !== 'un';
  };
  return (
    (isValidName(matchedUser?.name) ? matchedUser!.name : null) ||
    (isValidName(story?.author_full_name) ? story.author_full_name : null) ||
    (isValidName(story?.user?.name) ? story.user.name : null) ||
    (isValidName(story?.author_name) ? story.author_name : null) ||
    matchedUser?.username ||
    story?.author_username ||
    story?.username ||
    'User'
  );
};

const getStoryAuthorImage = (story: any, users?: any[]) => {
  const userId = Number(story?.user_id || story?.user?.id || 0);
  const matchedUser = userId && users ? users.find((u: any) => Number(u.id) === userId) : null;
  const name = getStoryAuthorName(story, users);
  return (
    matchedUser?.profile_image_url ||
    matchedUser?.avatar_url ||
    story?.author_image ||
    story?.user?.profile_image_url ||
    story?.user?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1877F2&color=fff&size=128`
  );
};

type RSVPStatus = 'going' | 'interested' | 'not_going';

const rsvpEventDirect = async (args: {
  eventId: number;
  userId: number;
  newStatus: RSVPStatus;
  prevStatus?: '' | 'going' | 'interested';
  isGroupEvent?: boolean;
}) => {
  const { eventId, userId, newStatus, prevStatus = '', isGroupEvent = false } = args;
  const base = isGroupEvent ? `/api/group-events/${eventId}` : `/api/events/${eventId}`;

  try {
    if (newStatus === 'going') {
      const res = await postJSON(`${base}/attend`, {
        event_id: eventId,
        user_id: userId,
        action: 'attend',
      });
      await postJSON(`${base}/interested`, {
        event_id: eventId,
        user_id: userId,
        action: 'remove',
      }).catch(() => {});
      return res;
    } else if (newStatus === 'interested') {
      const res = await postJSON(`${base}/interested`, {
        event_id: eventId,
        user_id: userId,
        action: 'interested',
      });
      await postJSON(`${base}/attend`, {
        event_id: eventId,
        user_id: userId,
        action: 'remove',
      }).catch(() => {});
      return res;
    } else {
      // not_going: remove from whichever was active
      if (prevStatus === 'interested') {
        return await postJSON(`${base}/interested`, {
          event_id: eventId,
          user_id: userId,
          action: 'remove',
        });
      } else {
        return await postJSON(`${base}/attend`, {
          event_id: eventId,
          user_id: userId,
          action: 'remove',
        });
      }
    }
  } catch (e: any) {
    throw new Error(e?.message || 'RSVP failed');
  }
};

export const avatarFrom = (u: any) => {
  const img = String(
    u?.profile_image_url ??
      u?.avatar_url ??
      u?.avatarUrl ??
      u?.profileImage ??
      u?.profile_image ??
      u?.avatar ??
      u?.photoURL ??
      u?.photo_url ??
      u?.photoUrl ??
      u?.author_image ??
      u?.authorImage ??
      u?.image ??
      u?.image_url ??
      u?.imageUrl ??
      u?.picture ??
      ''
  ).trim();
  if (img && img !== 'null' && img !== 'undefined') return img;
  const label =
    String(u?.name ?? '').trim() ||
    String(u?.username ?? '').trim() ||
    String(u?.author_name ?? '').trim() ||
    String(u?.author_username ?? '').trim() ||
    'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    label
  )}&background=1877F2&color=fff&bold=true`;
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('unera_token');
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

//====NATIVE HELPERS =====
  
  // Native detection helper (add inside CreatePostModal or import from parent)
const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative || 
    (window as any).UNERA_IS_NATIVE_APP
  );
};

// ====== FEEDS ARRANGEMENTS HELPERS =====
const safeArray = <T,>(v: any): T[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const seededRand01 = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1000000) / 1000000;
};

const toTime = (d: any) => {
  const t = new Date(String(d ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
};

const getRotatedReels = (reelsList: any[], currentUser: any, seed: number) => {
  const arr = safeArray<any>(reelsList).slice();

  if (!arr.length) return [];

  const meId = safeNumber(currentUser?.id, 0);
  const following = new Set<number>(safeArray<number>(currentUser?.following));

  const scored = arr.map((reel, idx) => {
    const uid = safeNumber(reel?.user_id ?? reel?.user?.id, 0);
    const isMine = !!meId && uid === meId;
    const isFollowingAuthor = !!uid && following.has(uid);
    const created = toTime(reel?.created_at);

    let score = 0;

    // do not force my reels to top
    if (!isMine) score += 4;
    if (isFollowingAuthor) score += 2;

    // freshness
    score += created / 1_000_000_000_000;

    // small stable jitter per refresh
    score += seededRand01(seed + safeNumber(reel?.id, idx + 1) * 137) * 0.8;

    return { reel, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // avoid same author repeating
  const out: any[] = [];
  const authorCounts = new Map<number, number>();

  for (const item of scored) {
    const uid = safeNumber(item.reel?.user_id ?? item.reel?.user?.id, 0);
    const lastUid = out.length
      ? safeNumber(out[out.length - 1]?.user_id ?? out[out.length - 1]?.user?.id, 0)
      : 0;

    if (uid && uid === lastUid) continue;
    if ((authorCounts.get(uid) || 0) >= 1) continue;

    out.push(item.reel);
    authorCounts.set(uid, (authorCounts.get(uid) || 0) + 1);
  }

  // add leftovers if needed
  for (const item of scored) {
    if (!out.includes(item.reel)) out.push(item.reel);
  }

  // keep only a reasonable amount for mixed feed
  return out.slice(0, 8);
};

const interleaveFeedItems = (
  postItems: Array<{ kind: 'post'; data: any; created_at: string }>,
  storyItems: Array<{ kind: 'story'; data: any; created_at: string }>,
  reelItems: Array<{ kind: 'reel'; data: any; created_at: string }>
) => {
  const result: Array<{ kind: 'post' | 'story' | 'reel'; data: any; created_at: string }> = [];

  let postIndex = 0;
  let storyIndex = 0;
  let reelIndex = 0;

  const totalPosts = postItems.length;
  const totalStories = storyItems.length;
  const totalReels = reelItems.length;

  // spread stories and reels instead of pushing them down
  const storyStep = totalStories > 0 ? Math.max(4, Math.floor(totalPosts / (totalStories + 1))) : 999999;
  const reelStep = totalReels > 0 ? Math.max(5, Math.floor(totalPosts / (totalReels + 1))) : 999999;

  let insertedSinceLastSpecial = 0;
  let lastSpecialKind: 'story' | 'reel' | null = null;

  while (
    postIndex < totalPosts ||
    storyIndex < totalStories ||
    reelIndex < totalReels
  ) {
    const canInsertStory =
      storyIndex < totalStories &&
      insertedSinceLastSpecial >= storyStep &&
      lastSpecialKind !== 'story';

    const canInsertReel =
      reelIndex < totalReels &&
      insertedSinceLastSpecial >= reelStep &&
      lastSpecialKind !== 'reel';

    if (canInsertStory) {
      result.push(storyItems[storyIndex++]);
      insertedSinceLastSpecial = 0;
      lastSpecialKind = 'story';
      continue;
    }

    if (canInsertReel) {
      result.push(reelItems[reelIndex++]);
      insertedSinceLastSpecial = 0;
      lastSpecialKind = 'reel';
      continue;
    }

    if (postIndex < totalPosts) {
      result.push(postItems[postIndex++]);
      insertedSinceLastSpecial += 1;
      continue;
    }

    // fallback when posts finish
    if (storyIndex < totalStories && lastSpecialKind !== 'story') {
      result.push(storyItems[storyIndex++]);
      lastSpecialKind = 'story';
      insertedSinceLastSpecial = 0;
      continue;
    }

    if (reelIndex < totalReels && lastSpecialKind !== 'reel') {
      result.push(reelItems[reelIndex++]);
      lastSpecialKind = 'reel';
      insertedSinceLastSpecial = 0;
      continue;
    }

    // if only same type remains, allow it to finish
    if (storyIndex < totalStories) {
      result.push(storyItems[storyIndex++]);
      lastSpecialKind = 'story';
      insertedSinceLastSpecial = 0;
      continue;
    }

    if (reelIndex < totalReels) {
      result.push(reelItems[reelIndex++]);
      lastSpecialKind = 'reel';
      insertedSinceLastSpecial = 0;
      continue;
    }
  }

  return result;
};
  
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData)
    headers['Content-Type'] =
      (headers['Content-Type'] as string) || 'application/json';
  

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const targetUrl = resolveApiUrl(url);
    const res = await fetch(targetUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    try {
      if (contentType.includes('application/json')) data = await res.json();
      else {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text };
        }
      }
    } catch (e: any) {
      data = { error: e?.message || 'Failed to parse response' };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

const authHeaders = () => {
  const token = localStorage.getItem('unera_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

const postJSON = async (url: string, body: any) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });

  const data = await safeJson(res);

  if (!res.ok || (data && data.success === false)) {
    throw new Error(data?.error || data?.message || `Request failed: ${url}`);
  }

  return data;
};

const normalizeFeedResponse = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.feed)) return data.feed;
  if (Array.isArray(data.posts)) return data.posts;
  if (data.data && Array.isArray(data.data.feed)) return data.data.feed;
  if (data.data && Array.isArray(data.data.posts)) return data.data.posts;
  if (Array.isArray(data.data)) return data.data;
  return [];
};

const unwrapFeedItem = (item: any): any => {
  if (!item) return null;
  if (item.type === 'post' && item.post) return item.post;
  if (item.type === 'event' && item.event) return item.event;
  if (item.type === 'product' && item.product) return item.product;
  if (item.type === 'marketplace' && item.marketplace) return item.marketplace;
  if (item.type === 'music' && item.music) return item.music;
  if (item.type === 'podcast' && item.podcast) return item.podcast;
  if (item.type === 'reel' && item.reel) return item.reel;
  if (item.data) return item.data;
  return item;
};

const safeArray = <T,>(v: any): T[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const safeString = (v: any, fallback = '') =>
  typeof v === 'string' ? v : fallback;
const safeStr = (v: any) => String(v ?? '').trim();
const safeUserId = (u: any) => safeNumber(u?.id ?? u?.user_id ?? u?.userId, 0);
const safePostId = (p: any) => safeNumber(p?.id ?? p?.post_id ?? p?.postId, 0);

const getPostTextPreview = (p: any, max = 140) => {
  const t = String(p?.content ?? p?.text ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max).trim() + '…' : t;
};

const safeJsonArray = (v: any): string[] => {
  if (!v) return [];
  const extractUrl = (item: any): string => {
    if (!item) return '';
    if (typeof item === 'object') {
      return String(item.url || item.feed || item.full || item.thumb || '');
    }
    return String(item ?? '');
  };

  if (Array.isArray(v)) {
    return v.map(extractUrl).filter((s) => s.length > 0 && s !== '[object Object]');
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === 'null' || s === 'undefined') return [];
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.map(extractUrl).filter((url) => url.length > 0 && url !== '[object Object]');
        }
        if (parsed && typeof parsed === 'object') {
          const u = extractUrl(parsed);
          return u && u !== '[object Object]' ? [u] : [];
        }
        return [];
      } catch {
        return [];
      }
    }
    return [s];
  }
  return [];
};

const getMarketplaceProductId = (p: any) => {
  const meta = p?.meta;
  const v =
    p?.product_id ??
    p?.productId ??
    meta?.product_id ??
    meta?.productId ??
    meta?.marketplace?.id ??
    meta?.marketplace?.product_id ??
    meta?.product?.id ??
    (String(p?.feed_key || '').startsWith('product:') ? p.feed_key.replace('product:', '') : null) ??
    (p?.item_type === 'product' || p?.source === 'product' || p?.type === 'marketplace' ? p?.id : null);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const getMarketplaceImages = (p: any, productData?: any): string[] => {
  const parseVariants = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // ✅ image_variants first
  const directVariants = parseVariants((p as any)?.image_variants);
  if (directVariants.length > 0) {
    return directVariants.map((v: any) => v?.feed || v?.thumb || v?.full).filter(Boolean);
  }

  const productVariants = parseVariants(productData?.image_variants);
  if (productVariants.length > 0) {
    return productVariants.map((v: any) => v?.feed || v?.thumb || v?.full).filter(Boolean);
  }

  // fallback old fields
  const pdImgs = safeJsonArray(productData?.images);
  if (pdImgs.length) return pdImgs;
  
  const mediaUrls = safeJsonArray(p?.media_urls);
  if (mediaUrls.length) return mediaUrls;
  
  const imgs = safeJsonArray(p?.images);
  if (imgs.length) return imgs;
  
  const single = typeof p?.media_url === 'string' && p.media_url ? [p.media_url] : [];
  return single;
};

const getMarketplaceImageVariants = (
  p: any,
  productData?: any
): Array<{ thumb: string; feed: string; full: string; type: string }> => {
  const parseVariants = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const normalize = (arr: any[]) =>
    arr
      .map((v: any) => ({
        thumb: v?.thumb || v?.feed || v?.full || '',
        feed: v?.feed || v?.full || v?.thumb || '',
        full: v?.feed || v?.full || v?.thumb || '',
        type: v?.type || 'image',
      }))
      .filter((v) => v.feed);

  const direct = normalize(parseVariants((p as any)?.image_variants));
  if (direct.length > 0) return direct;

  const fromProduct = normalize(parseVariants(productData?.image_variants));
  if (fromProduct.length > 0) return fromProduct;

  const fromMeta = normalize(parseVariants(p?.meta?.marketplace?.image_variants));
  if (fromMeta.length > 0) return fromMeta;

  return [];
};                     

  
const getMarketplacePriceLine = (productData?: any, p?: any) => {
  const meta = p?.meta;
  const priceRaw =
    productData?.price ??
    productData?.main_price ??
    productData?.discount_price ??
    meta?.marketplace?.price ??
    meta?.marketplace?.discount_price ??
    meta?.marketplace?.main_price ??
    meta?.price ??
    meta?.discount_price ??
    meta?.main_price ??
    p?.price ??
    p?.main_price ??
    p?.discount_price ??
    null;
  const currency =
    productData?.currency ||
    meta?.marketplace?.currency ||
    meta?.currency ||
    p?.currency ||
    'TZS';
  const loc =
    (typeof productData?.location === 'string' &&
      productData.location.split(',')[0]) ||
    (typeof productData?.address === 'string' &&
      productData.address.split(',')[0]) ||
    (typeof meta?.marketplace?.location === 'string' &&
      meta.marketplace.location.split(',')[0]) ||
    (typeof meta?.marketplace?.address === 'string' &&
      meta.marketplace.address.split(',')[0]) ||
    (typeof meta?.location === 'string' &&
      meta.location.split(',')[0]) ||
    (typeof meta?.address === 'string' &&
      meta.address.split(',')[0]) ||
    (typeof p?.location === 'string' &&
      p.location.split(',')[0]) ||
    (typeof p?.address === 'string' &&
      p.address.split(',')[0]) ||
    'MarketPoint';
  const priceNum = priceRaw != null ? Number(priceRaw) : NaN;
  const price = Number.isFinite(priceNum) ? priceNum.toFixed(0) : null;
  return { price, currency, loc };
};

const toDateSafe = (input: any): Date | null => {
  if (!input) return null;
  if (input instanceof Date && Number.isFinite(input.getTime())) return input;
  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
      const iso = s.replace(' ', 'T') + 'Z';
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) {
      const d = new Date(s + 'Z');
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
};

export const formatRelativeTime = (dateInput: any): string => {
  const d = toDateSafe(dateInput);
  if (!d) return 'Just now';
  const now = Date.now();
  let diffMs = now - d.getTime();
  if (diffMs < 0) diffMs = 0;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? '1 min' : `${min} mins`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs === 1 ? '1 hr' : `${hrs} hrs`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? '1 day' : `${days} days`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return weeks === 1 ? '1 week' : `${weeks} weeks`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month' : `${months} months`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year' : `${years} years`;
};

const reactionEmoji = (t: string) => {
  switch (t) {
    case 'like':
      return '👍';
    case 'love':
      return '❤️';
    case 'haha':
      return '😂';
    case 'wow':
      return '😮';
    case 'sad':
      return '😢';
    case 'angry':
      return '😡';
    case 'fire':
      return '🔥';
    case 'party':
      return '🎉';
    case 'clap':
      return '👏';
    case 'star':
      return '⭐';
    case 'thinking':
      return '🤔';
    case 'crying':
      return '😭';
    case 'heart_eyes':
      return '🥰';
    case 'kiss':
      return '😘';
    case 'sunglasses':
      return '😎';
    case 'rocket':
      return '🚀';
    case 'trophy':
      return '🏆';
    case 'crown':
      return '👑';
    case 'unicorn':
      return '🦄';
    case 'rainbow':
      return '🌈';
    case 'money':
      return '💰';
    case 'muscle':
      return '💪';
    case 'brain':
      return '🧠';
    case 'lightning':
      return '⚡';
    case 'gem':
      return '💎';
    default:
      return '👍';
  }
};

const topReactionEmojis = (reactionsArr: any[], max = 2) => {
  const counts = new Map<string, number>();
  for (const r of reactionsArr || []) {
    const type = String(r?.type || '').trim();
    if (!type) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([type]) => reactionEmoji(type));
};

const fmtCount = (n: number) => {
  const num = Number(n || 0);
  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (num >= 1_000)
    return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + 'K';
  return String(num);
};

const formatReactionText = (totalCount: number, reactorName: string): string => {
  if (totalCount === 0) return '';
  const formattedTotal = fmtCount(totalCount);
  const cleanName = String(reactorName || '').trim();
  if (!cleanName) {
    return totalCount === 1 ? '1 Reaction' : `${formattedTotal} Reactions`;
  }
  if (totalCount === 1) {
    return `${formattedTotal} · ${cleanName}`;
  }
  const othersCount = totalCount - 1;
  const formattedOthers = fmtCount(othersCount);
  return `${formattedTotal} · ${cleanName} and ${formattedOthers} other${
    othersCount !== 1 ? 's' : ''
  }`;
};

const stableHash = (input: any) => {
  const s = String(input ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
};

const resolveUserName = (reaction: any, users?: any[]) => {
  const uid = Number(
    reaction?.user_id ??
      reaction?.userId ??
      reaction?.user?.id ??
      reaction?.user?.user_id ??
      0
  );
  const user =
    (users || []).find((u) => Number(u?.id) === uid) || reaction?.user || null;
  const name = String(
    reaction?.name ??
      reaction?.user?.name ??
      user?.name ??
      user?.username ??
      reaction?.username ??
      ''
  ).trim();
  return name;
};

const pickStableReactorName = (
  postId: number | string,
  reactions: any[],
  users?: any[]
) => {
  if (!Array.isArray(reactions) || reactions.length === 0) return '';
  const idx = stableHash(postId) % reactions.length;
  const r = reactions[idx] || reactions[0];
  const name = resolveUserName(r, users);
  return String(name || '').trim();
};

const getLinkPreview = async (text: string): Promise<LinkPreview | null> => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  if (!match?.[0]) return null;
  const url = match[0];
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    return null;
  }

  // Handle YouTube links with real video thumbnail and oEmbed title
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    let videoId = '';
    try {
      const parsedUrl = new URL(url);
      if (domain.includes('youtu.be')) {
        videoId = parsedUrl.pathname.slice(1).split('/')[0];
      } else if (parsedUrl.searchParams.has('v')) {
        videoId = parsedUrl.searchParams.get('v') || '';
      } else if (parsedUrl.pathname.includes('/shorts/')) {
        videoId = parsedUrl.pathname.split('/shorts/')[1]?.split('/')[0] || '';
      }
    } catch {}

    if (videoId) {
      let ytTitle = 'YouTube Video';
      let ytAuthor = 'YouTube';
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembed.ok) {
          const ytData: any = await oembed.json();
          ytTitle = ytData.title || ytTitle;
          ytAuthor = ytData.author_name || ytAuthor;
        }
      } catch {}

      return {
        url,
        title: ytTitle,
        description: `Watch on YouTube • by ${ytAuthor}`,
        image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        domain: 'youtube.com',
      };
    }
  }

  // Fetch real OpenGraph metadata from backend API
  try {
    const response = await fetch(
      `/api/link-preview?url=${encodeURIComponent(url)}`
    );
    const data = await response.json();
    if (data.success && data.data) {
      return {
        url,
        title: data.data.title || domain,
        description:
          data.data.description ||
          `Visit ${domain} for more information.`,
        image: data.data.image || null,
        domain: domain,
      };
    }
  } catch (error) {
    console.debug('Link preview fetch error:', error);
  }

  // If GitHub, use real dynamic OG preview
  if (domain.includes('github.com')) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return {
          url,
          title: `${parts[0]}/${parts[1]}`,
          description: 'GitHub open source project repository',
          image: `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`,
          domain: 'github.com',
        };
      }
    } catch {}
  }

  return {
    url,
    title: domain,
    description: `Visit ${domain} for more information.`,
    image: null,
    domain,
  };
};

const BACKGROUNDS = [
  { id: 'none', value: '' },
  { id: 'red', value: 'linear-gradient(45deg, #FF0057, #E64C4C)' },
  { id: 'blue', value: 'linear-gradient(45deg, #00C6FF, #0072FF)' },
  { id: 'green', value: 'linear-gradient(45deg, #a8ff78, #78ffd6)' },
  { id: 'purple', value: 'linear-gradient(45deg, #e65c00, #F9D423)' },
  {
    id: 'heart',
    value:
      'url("https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=500&q=60")',
  },
  { id: 'dark', value: 'linear-gradient(to right, #434343 0%, black 100%)' },
  { id: 'fire', value: 'linear-gradient(120deg, #f6d365 0%, #fda085 100%)' },
];

const FEELINGS = [
  'Happy',
  'Blessed',
  'Loved',
  'Sad',
  'Excited',
  'Thankful',
  'Crazy',
  'Tired',
  'Cool',
  'Relaxed',
];

const QUICK_EMOJIS = [
  '😀', '😂', '😍', '🥰', '😘', '😊', '😉', '😇', '🥳', '😎',
  '🤩', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
  '😐', '😑', '😶', '🙄', '😏', '😒', '😞', '😔', '😟', '😕',
  '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤',
  '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
  '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑',
  '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤',
  '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕',
  '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀',
  '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼',
  '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌',
  '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕',
  '👇', '☝️', '👍', '👊', '✊', '👊', '🤛', '🤜', '👏', '🙌',
  '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵',
  '🦿', '🦶', '👣', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀',
  '👁️', '👅', '👄', '💋', '🩸', '💘', '💝', '💖', '💗', '💓',
  '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙',
  '💜', '🖤', '🤍', '🤎', '💯', '💢', '💥', '💫', '💦', '💨',
  '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤',
];

const reactionStyles = `
  @keyframes popFloat {
    0% { transform: translateY(6px) scale(0.9); opacity: 0; }
    60% { transform: translateY(-6px) scale(1.15); opacity: 1; }
    100% { transform: translateY(0px) scale(1); }
  }
  
  @keyframes wiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-2deg); }
    75% { transform: rotate(2deg); }
  }
  
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  
  .react-pop { animation: popFloat 220ms ease-out; }
  .react-hover { transition: transform 120ms ease; }
  .react-hover:hover { 
    transform: translateY(-10px) scale(1.25); 
    animation: wiggle 300ms ease-in-out; 
  }
  
  .reaction-preview {
    animation: bounce 0.5s infinite alternate;
  }
`;

let reactionStyleMounted = false;

const ensureReactionStyles = () => {
  if (reactionStyleMounted) return;
  reactionStyleMounted = true;
  const styleTag = document.createElement('style');
  styleTag.textContent = reactionStyles;
  styleTag.setAttribute('data-reaction-styles', '1');
  document.head.appendChild(styleTag);
};

// ==================== HYBRID FEED HELPERS ====================
const getFeedItemType = (item: any): string => {
  if (!item || typeof item !== 'object') return 'post';
  const meta = item?.meta || {};
  
  if (
    item?.kind === 'story_share' ||
    item?.source === 'story_share' ||
    item?.item_type === 'story_share' ||
    item?.type === 'story_share' ||
    item?.post_type === 'story_share' ||
    meta?.kind === 'story_share' ||
    meta?.type === 'story_share'
  ) return 'story_share';

  if (
    item?.source === 'story' ||
    item?.item_type === 'story' ||
    item?.type === 'story' ||
    item?.post_type === 'story' ||
    meta?.kind === 'story' ||
    meta?.type === 'story' ||
    (!!item?.story_id && !item?.shared_post_id)
  ) return 'story';

  if (
    item?.source === 'sponsored' ||
    item?.item_type === 'sponsored' ||
    item?.type === 'sponsored' ||
    meta?.kind === 'ad'
  ) return 'sponsored';
  
  if (
    item?.source === 'product' ||
    item?.item_type === 'product' ||
    item?.type === 'marketplace' ||
    item?.type === 'product' ||
    item?.post_type === 'product' ||
    meta?.type === 'product' ||
    meta?.kind === 'product' ||
    !!item?.product_id ||
    !!meta?.marketplace?.id
  ) return 'product';
  
  if (
    item?.source === 'event' ||
    item?.item_type === 'event' ||
    item?.type === 'event' ||
    item?.post_type === 'event' ||
    meta?.type === 'event' ||
    meta?.kind === 'event' ||
    !!item?.event_id ||
    !!meta?.event
  ) return 'event';
  
  if (
    item?.source === 'group_post' ||
    item?.item_type === 'group_post' ||
    !!item?.group_id ||
    !!item?.group
  ) return 'group_post';
  
  if (
    (item?.source === 'reel' ||
     item?.item_type === 'reel' ||
     !!item?.reel_id) &&
    !item?.shared_post_id &&
    item?.source !== 'share'
  ) return 'reel';
  
  if (
    item?.source === 'song' ||
    item?.source === 'music' ||
    item?.item_type === 'song' ||
    item?.item_type === 'music' ||
    item?.type === 'music' ||
    item?.type === 'song' ||
    item?.post_type === 'music' ||
    item?.post_type === 'song' ||
    item?.kind === 'music' ||
    meta?.kind === 'music' ||
    meta?.type === 'music' ||
    Boolean(item?.song_id2 || item?.song_title || (item?.audio_url && !item?.podcast_id && meta?.kind !== 'podcast' && meta?.type !== 'podcast' && item?.item_type !== 'podcast' && item?.type !== 'podcast'))
  ) {
    return 'music';
  }
  
  if (
    item?.source === 'podcast' ||
    item?.item_type === 'podcast' ||
    meta?.kind === 'podcast' ||
    meta?.type === 'podcast'
  ) {
    return 'podcast';
  }
  
  return 'post';
};

const getFeedItemId = (item: any): number => {
  if (!item || typeof item !== 'object') return 0;
  const type = getFeedItemType(item);
  
  switch (type) {
    case 'product':
      return Number(item?.product_id ?? item?.meta?.marketplace?.id ?? item?.id ?? 0);
    case 'event':
      return Number(item?.event_id ?? item?.id ?? 0);
    case 'group_post':
      return Number(item?.post_id ?? item?.id ?? 0);
    case 'reel':
      return Number(item?.reel_id ?? item?.id ?? 0);
    case 'music':
      return Number(item?.song_id2 ?? item?.song_id ?? (item?.meta as any)?.song?.id ?? (item?.meta as any)?.original_song_id ?? (item?.shared_song as any)?.id ?? item?.id ?? 0);
    case 'podcast':
      return Number(item?.podcast_id ?? item?.id ?? 0);
    case 'sponsored': {
      const pid = item?.post_id ?? item?.id ?? item?.ad_id;
      if (typeof pid === 'number' && Number.isFinite(pid)) return pid;
      if (typeof pid === 'string') {
        const parsed = parseInt(pid.replace(/\D/g, ''), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return 0;
    }
    default: {
      const raw = item?.post_id ?? item?.id;
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string') {
        const parsed = parseInt(raw.replace(/\D/g, ''), 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return 0;
    }
  }
};

const resolveCommentAuthor = (
  c: any,
  users: User[] = [],
  getCommentAuthor?: (id: number) => any
) => {
  const uid = Number(
    c?.user_id ?? c?.userId ?? c?.author_id ?? c?.authorId ?? 0
  );

  const u =
    (Number.isFinite(uid) ? users.find((x: any) => Number(x?.id) === uid) : null) ||
    (getCommentAuthor ? getCommentAuthor(uid) : null) ||
    null;

  const name =
    String(c?.author_name ?? c?.authorName ?? '').trim() ||
    String(u?.name ?? '').trim() ||
    String(u?.username ?? '').trim() ||
    'User';

  const image = avatarFrom({
    profile_image_url: c?.author_image ?? c?.authorImage ?? u?.profile_image_url,
    name,
    username: u?.username ?? c?.author_username ?? c?.username,
  });

  return { uid, name, image, user: u };
};

const getFeedCommentFetchEndpoint = (itemType: string, p: any, viewerId: number): string => {
  switch (itemType) {
    case 'event': {
      const eventId = p?.event_id || p?.id;
      return `/api/events/${eventId}/comments?viewerId=${viewerId}`;
    }
    case 'group_post': {
      const groupPostId = p?.id;
      return `/api/group-post-comments?post_id=${groupPostId}&viewerId=${viewerId}`;
    }
    case 'product': {
      const productId = p?.product_id || p?.id;
      return `/api/products/${productId}/reviews?viewerId=${viewerId}`;
    }
    case 'reel': {
      const reelId = p?.reel_id || p?.id;
      return `/api/reels/${reelId}/comments?viewerId=${viewerId}`;
    }
    case 'song':
    case 'music': {
      const songId = p?.song_id2 || p?.song_id || (p?.meta as any)?.song?.id || (p?.meta as any)?.original_song_id || (p?.shared_song as any)?.id || p?.id;
      return `/api/songs/${songId}/comments?viewerId=${viewerId}`;
    }
    case 'podcast': {
      const podcastId = p?.podcast_id || p?.id;
      return `/api/podcasts/${podcastId}/comments?viewerId=${viewerId}`;
    }
    case 'sponsored': {
      const id = p?.post_id || getFeedItemId(p) || p?.id;
      return `/api/posts/${id}/comments?viewerId=${viewerId}`;
    }
    default:
      return `/api/posts/${p?.id}/comments?viewerId=${viewerId}`;
  }
};

const getCommentLikeEndpoint = (itemType: string, commentId: number): string => {
  switch (itemType) {
    case 'event':
      return `/api/event-comments/${commentId}/like`;
    case 'group_post':
      return `/api/group-post-comment-likes`;
    case 'product':
      return `/api/product-reviews/${commentId}/like`;
    case 'song':
    case 'music':
      return `/api/song-comments/${commentId}/like`;
    case 'reel':
    case 'video':
    case 'sponsored':
    case 'post':
    default:
      return `/api/post-comments/${commentId}/like`;
  }
};

const getFeedKey = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (item?.feed_key) return String(item.feed_key);
  const type = getFeedItemType(item);
  const id = getFeedItemId(item);
  return `${type}:${id}`;
};

const isSameFeedItem = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  const aKey = getFeedKey(a);
  const bKey = getFeedKey(b);
  if (aKey && bKey) return aKey === bKey;
  const aType = getFeedItemType(a);
  const bType = getFeedItemType(b);
  const aId = getFeedItemId(a);
  const bId = getFeedItemId(b);
  return aType === bType && aId > 0 && bId > 0 && aId === bId;
};

    
// ==================== CUSTOM COMPARISON FUNCTIONS ====================


const postPropsEqual = () => false;

const eventPostPropsEqual = () => false;




// ==================== EXPORTED COMPONENTS (Memoized) ====================

/**
 * =========================
 * ✅ REACTIONS SHEET
 * =========================
 */
export const ReactionsSheet = memo(
  ({
    isOpen,
    onClose,
    post,
    onProfileClick,
    onOpenComments,
    currentUser,
  }: {
    isOpen: boolean;
    onClose: () => void;
    post: PostType;
    onProfileClick: (id: number) => void;
    onOpenComments?: (post: PostType) => void;
    currentUser?: User | null;
  }) => {
    const postId = getFeedItemId(post);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState<string>('all');
    const [items, setItems] = useState<any[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
      if (!isOpen) return;
      setLoading(true);
      setItems([]);
      setCounts({});
      setActive('all');
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      (async () => {
        try {
          const it = getFeedItemType(post);
          let reactionsEndpoint = `/api/posts/${postId}/reactions?limit=500&offset=0`;
          if (it === 'story') {
            const viewerId = (currentUser as any)?.id || (post as any)?.viewer_id;
            const viewerParam = viewerId ? `?viewerId=${viewerId}` : '';
            reactionsEndpoint = `/api/stories/${postId}/reactions${viewerParam}`;
          } else if (it === 'music' || it === 'song') {
            reactionsEndpoint = `/api/songs/${postId}/reactions`;
          } else if (it === 'product') {
            reactionsEndpoint = `/api/products/${postId}/reactions`;
          } else if (it === 'event') {
            reactionsEndpoint = `/api/events/${postId}/reactions`;
          }
          const data = await apiFetch(reactionsEndpoint, {
            signal: abortRef.current?.signal as any,
            headers: (currentUser as any)?.id ? { 'x-user-id': String((currentUser as any).id) } : undefined,
          } as any);
          const arr = Array.isArray(data?.reactions) ? data.reactions : [];
          setItems(arr);
          const map: Record<string, number> = {};
          for (const r of arr) {
            const t = String(r?.type || 'like').toLowerCase();
            map[t] = (map[t] || 0) + 1;
          }
          setCounts(map);
        } catch (e) {
          // ignore abort
        } finally {
          setLoading(false);
        }
      })();
      return () => abortRef.current?.abort();
    }, [isOpen, postId]);

    if (!isOpen) return null;

    const typesSorted = Object.entries(counts)
      .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
      .map(([t]) => t);

    const filtered =
      active === 'all'
        ? items
        : items.filter((x) => String(x?.type).toLowerCase() === active);

    const Tab = ({
      t,
      label,
      count,
    }: {
      key?: any;
      t: string;
      label: React.ReactNode;
      count: number;
    }) => (
      <button
        onClick={() => setActive(t)}
        className={`px-3 py-2 text-[17px] font-bold border-b-2 whitespace-nowrap ${
          active === t
            ? 'text-[#1877F2] border-[#1877F2]'
            : 'text-[#94A3B8] border-transparent'
        }`}
      >
        {label} {count ? <span className="ml-1">{count}</span> : null}
      </button>
    );

    return (
      <div className="fixed inset-0 z-[9999] bg-[#050B18] flex flex-col">
        <div className="p-4 border-b border-[#1E293B] flex items-center gap-3 bg-[#0B1120]">
          <button
            className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center"
            onClick={onClose}
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
          </button>
          <div className="text-[#F8FAFC] font-bold text-[20px]">
            People who reacted
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#1E293B] bg-[#0B1120] scrollbar-hide">
          <Tab t="all" label="All" count={items.length} />
          {typesSorted.map((t) => (
            <Tab
              key={t}
              t={t}
              label={<span className="text-[20px]">{reactionEmoji(t)}</span>}
              count={counts[t] || 0}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-[#94A3B8] text-center text-[17px]">
              Loading reactions...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-[#94A3B8] text-center text-[17px]">
              No reactions yet.
            </div>
          ) : (
            <div className="p-2">
              {filtered.map((r, idx) => {
                const u = r?.user || {};
                const uid = Number(u?.id || r?.user_id || 0);
                const name = String(u?.name || u?.username || 'User');
                const img = avatarFrom(u);
                return (
                  <button
                    key={String(uid) + '-' + idx}
                    className="w-full flex items-center gap-3 p-3 hover:bg-[#1E293B] rounded-xl text-left"
                    onClick={() => uid && onProfileClick(uid)}
                  >
                    <div className="relative">
                      <img
                        src={img}
                        className="w-12 h-12 rounded-full object-cover"
                        alt=""
                      />
                      <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-[#0B1120] border border-[#1E293B] flex items-center justify-center text-[16px]">
                        {reactionEmoji(String(r?.type))}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#F8FAFC] font-bold text-[17px] truncate">
                        {name}
                      </div>
                      {u?.username ? (
                        <div className="text-[#94A3B8] text-[14px] truncate">
                          @{u.username}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {onOpenComments && (
          <div className="p-4 border-t border-[#1E293B] bg-[#0B1120]">
            <button
              onClick={() => {
                onClose();
                onOpenComments(post);
              }}
              className="w-full py-3 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] font-bold rounded-lg transition-colors text-[17px]"
            >
              View Discussions
            </button>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return prev.isOpen === next.isOpen && isSameFeedItem(prev.post, next.post);
  }
);

/**
 * =========================
 * ✅ GALLERY VIEWER
 * =========================
 */
export const GalleryViewer = memo(
  ({
    isOpen,
    urls,
    startIndex,
    onClose,
    post,
    currentUser,
    reactionCount,
    commentCount,
    shareCount,
    myReaction,
    onReact,
    onOpenComments,
    onShare,
    onOpenReactions,
  }: {
    isOpen: boolean;
    urls: string[];
    startIndex: number;
    onClose: () => void;
    post: PostType;
    currentUser: User | null;
    reactionCount: number;
    commentCount: number;
    shareCount: number;
    myReaction?: ReactionType;
    onReact: (post: PostType, type: ReactionType) => void;
    onOpenComments: () => void;
    onShare: () => void;
    onOpenReactions?: () => void;
  }) => {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const hasInitialScrolledRef = useRef(false);

    useEffect(() => {
      if (!isOpen) {
        hasInitialScrolledRef.current = false;
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setCurrentIndex(startIndex);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);

      // Perform initial scroll to clicked startIndex once
      const timer = setTimeout(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const w = el.clientWidth || window.innerWidth;
        el.scrollTo({ left: startIndex * w, behavior: 'instant' as any });
        hasInitialScrolledRef.current = true;
      }, 30);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen, startIndex, onClose]);

    const handleScroll = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const scrollLeft = el.scrollLeft;
      const width = el.clientWidth || window.innerWidth;
      if (width > 0) {
        const newIndex = Math.round(scrollLeft / width);
        if (newIndex !== currentIndex && newIndex >= 0 && newIndex < urls.length) {
          setCurrentIndex(newIndex);
        }
      }
    };

    const formatCount = (count: number): string => {
      if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
      return count.toString();
    };

    if (!isOpen) return null;

    const normalizedPost = {
      ...post,
      id: post?.id || (post as any)?.post_id || (post as any)?.product_id,
    };

    return createPortal(
      <div
        id="full-post-gallery-viewer"
        className="fixed inset-0 z-[99999] bg-[#050B18] flex flex-col animate-in fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar - Solid Opaque */}
        <header
          className="h-14 px-4 sm:px-6 bg-[#0B1120] border-b border-[#1E293B] flex items-center justify-between shrink-0 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[#F8FAFC] text-base sm:text-[17px] font-semibold tracking-wide">
            {urls.length > 0 ? `${currentIndex + 1}/${urls.length}` : '1/1'}
          </div>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center text-[#CBD5E1] hover:text-white transition-colors cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fas fa-times text-base"></i>
          </button>
        </header>

        {/* Scrollable Images Container - Full width, 0px left/right gap, no prev/next buttons */}
        <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-[#050B18] p-0 m-0">
          <div
            ref={scrollerRef}
            className="w-full h-full overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory scroll-smooth p-0 m-0"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
            onScroll={handleScroll}
          >
            {urls.map((url, i) => (
              <div
                key={url + i}
                className="min-w-full w-full h-full snap-center shrink-0 flex items-center justify-center bg-[#050B18] p-0 m-0 overflow-y-auto overflow-x-hidden"
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-auto select-none block p-0 m-0"
                  draggable={false}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar - React, Discuss, Share, Save - Solid Opaque */}
        <footer
          className="bg-[#0B1120] border-t border-[#1E293B] px-4 sm:px-6 py-3 shrink-0 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[#94A3B8] text-[15px] mb-2 px-1">
            <div className="flex items-center gap-2 min-h-[24px]">
              {reactionCount > 0 && (
                <div
                  className="text-[#F8FAFC] font-bold cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2 text-[15px] md:text-[16px]"
                  onClick={onOpenReactions}
                >
                  <div className="flex -space-x-2">
                    {Array.from(new Set([myReaction, 'like', 'love']))
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((t, i) => (
                        <span
                          key={i}
                          className="w-[24px] h-[24px] rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[16px]"
                          style={{ zIndex: 10 - i }}
                        >
                          {reactionEmoji(t as string)}
                        </span>
                      ))}
                  </div>
                  <span>
                    {reactionCount === 1 ? '1 Reaction' : `${fmtCount(reactionCount)} Reactions`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span
                className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
                onClick={onOpenComments}
              >
                {formatCount(commentCount)} {commentCount === 1 ? 'Discussion' : 'Discussions'}
              </span>
              {shareCount > 0 && (
                <span
                  className="hover:underline cursor-pointer text-[15px] md:text-[16px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors"
                  onClick={onShare}
                >
                  {formatCount(shareCount)} {shareCount === 1 ? 'Share' : 'Shares'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <ReactionButton
                currentUserReactions={myReaction}
                reactionCount={reactionCount}
                onReact={(type) => onReact(post, type)}
                isGuest={!currentUser}
              />
              <button
                type="button"
                className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
                onClick={() => (currentUser ? onOpenComments() : alert('Login first'))}
                aria-label="Discuss & Comments"
                title="Discuss"
              >
                <i className="far fa-comment text-[22px]"></i>
                {commentCount > 0 && (
                  <span className="text-[14px] font-semibold text-[#F8FAFC]">
                    {formatCount(commentCount)}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
                onClick={() =>
                  currentUser ? onShare() : alert('Please login to share posts.')
                }
                aria-label="Share post"
                title="Share"
              >
                <i className="far fa-paper-plane text-[21px]"></i>
                {shareCount > 0 && (
                  <span className="text-[14px] font-semibold text-[#F8FAFC]">
                    {formatCount(shareCount)}
                  </span>
                )}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <SavePostButton post={normalizedPost} />
            </div>
          </div>
        </footer>
      </div>,
      document.body
    );
  },
  (prev, next) => {
    return (
      prev.isOpen === next.isOpen &&
      prev.urls === next.urls &&
      prev.startIndex === next.startIndex &&
      prev.reactionCount === next.reactionCount &&
      prev.commentCount === next.commentCount &&
      prev.shareCount === next.shareCount &&
      prev.myReaction === next.myReaction &&
      prev.post === next.post
    );
  }
);

/**
 * =========================
 * ✅ SHARE BOTTOM SHEET
 * =========================
 */
export const ShareBottomSheet = memo(
  ({
    isOpen,
    onClose,
    post,
    currentUser,
    users = [],
    groups = [],
    brands = [],
    chats = [],
    onShareComplete,
  }: {
    isOpen: boolean;
    onClose: () => void;
    post: any;
    currentUser: User | null;
    users?: User[];
    groups?: Group[];
    brands?: Brand[];
    chats?: any[];
    onShareComplete?: (destination: string, data?: any) => void;
  }) => {
    const [activeFlow, setActiveFlow] = useState<'sheet' | 'feed' | 'groups' | 'messages'>(
      'sheet'
    );
    const [isAnimating, setIsAnimating] = useState(false);
    const [shareMessage, setShareMessage] = useState('');
    const [copiedLink, setCopiedLink] = useState(false);
    const [audience, setAudience] = useState<'Public' | 'Friends' | 'Only Me'>('Public');
    const [showAudienceMenu, setShowAudienceMenu] = useState(false);
    const [feeling, setFeeling] = useState('');
    const [location, setLocation] = useState('');
    const [taggedFriends, setTaggedFriends] = useState<number[]>([]);
    const [subModal, setSubModal] = useState<'none' | 'tag' | 'location' | 'feeling'>('none');
    const [searchFriendQuery, setSearchFriendQuery] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    const canonicalPostUrl = `https://featheredsocial.site/post/${getFeedItemId(post)}`;

    const isVideo = Boolean(
      post?.video_url ||
      post?.videoUrl ||
      post?.video ||
      post?.media_type === 'video' ||
      post?.type === 'video' ||
      (typeof post?.media_url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.media_url)) ||
      (Array.isArray(post?.media_urls) && post.media_urls.some((u: string) => typeof u === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)))
    );

    const getShareEndpoint = () => {
      const itemId = Number(post?.id ?? post?.post_id ?? getFeedItemId(post) ?? 0);
      if (isVideo) {
        return `/api/posts/${itemId}/share`;
      }
      const itemType = getFeedItemType(post);
      switch (itemType) {
        case 'story':
          return `/api/stories/${itemId}/share`;
        case 'event':
          return post?.event_id ? `/api/events/${post.event_id}/share` : `/api/events/${itemId}/share`;
        case 'group_post':
          return '/api/groups/posts/share';
        case 'product':
          return post?.product_id ? `/api/products/${post.product_id}/share` : `/api/products/${itemId}/share`;
        case 'reel':
          return `/api/posts/${itemId}/share`;
        case 'music':
          return `/api/songs/${itemId}/share`;
        case 'podcast':
          return `/api/podcasts/${itemId}/share`;
        default:
          return `/api/posts/${itemId}/share`;
      }
    };

    const getSharePayload = (destination: string) => {
      const itemId = Number(post?.id ?? post?.post_id ?? getFeedItemId(post) ?? 0);
      const itemType = isVideo ? 'post' : getFeedItemType(post);
      const base = {
        user_id: currentUser?.id,
        destination: destination,
        shared_at: new Date().toISOString(),
        item_type: isVideo ? 'post' : itemType,
        post_id: itemId,
        message: shareMessage,
      };

      if (isVideo) {
        return { ...base, post_id: itemId };
      }
      
      switch (itemType) {
        case 'story':
          return {
            user_id: currentUser?.id,
            destination: destination,
            message: shareMessage || undefined,
          };
        case 'event':
          return { ...base, event_id: itemId };
        case 'group_post':
          return { ...base, post_id: itemId, group_id: post.group_id };
        case 'product':
          return { ...base, product_id: itemId };
        case 'reel':
          return { ...base, post_id: itemId, reel_id: itemId };
        case 'music':
          return { ...base, song_id: itemId };
        case 'podcast':
          return { ...base, podcast_id: itemId };
        default:
          return { ...base, post_id: itemId };
      }
    };

    useEffect(() => {
      const handleBackdropClick = (e: MouseEvent) => {
        if (backdropRef.current && e.target === backdropRef.current) closeSheet();
      };
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) closeSheet();
      };
      if (isOpen) {
        setActiveFlow('sheet');
        setSubModal('none');
        setShowAudienceMenu(false);
        setIsPosting(false);
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);
        document.body.style.overflow = 'hidden';
        document.addEventListener('click', handleBackdropClick);
        document.addEventListener('keydown', handleEscape);
      }
      return () => {
        document.body.style.overflow = '';
        document.removeEventListener('click', handleBackdropClick);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isOpen]);

    const closeSheet = () => {
      setIsAnimating(true);
      setTimeout(() => {
        onClose();
        setActiveFlow('sheet');
        setSubModal('none');
        setShowAudienceMenu(false);
        setIsAnimating(false);
      }, 200);
    };

    const handleShareAction = async (destination: string, customMessage?: string) => {
      if (!currentUser) {
        alert('Please login to share.');
        return;
      }
      setIsPosting(true);
      try {
        const endpoint = getShareEndpoint();
        const msg = customMessage !== undefined ? customMessage : shareMessage;
        const itemType = getFeedItemType(post);
        const payload = itemType === 'story'
          ? {
              user_id: currentUser.id,
              destination: destination || 'feed',
              message: msg || undefined,
            }
          : {
              ...getSharePayload(destination),
              post: post,
              shared_post: post,
              message: msg,
              feeling: feeling || undefined,
              location: location || undefined,
              taggedUsers: taggedFriends.length > 0 ? taggedFriends : undefined,
              audience: audience,
            };
        const response = await apiFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': String(currentUser.id),
          },
          body: JSON.stringify(payload),
        });
        if (onShareComplete) {
          const nextShares = safeNumber(
            response?.shares ?? response?.shares_count ?? response?.share_count,
            safeNumber(post.shares ?? post.shares_count ?? 0, 0) + 1
          );
          onShareComplete(destination, {
            success: true,
            data: response,
            shares: nextShares,
            message: msg,
            feeling: feeling || undefined,
            location: location || undefined,
            taggedUsers: taggedFriends.length > 0 ? taggedFriends : undefined,
            audience: audience,
            post: response?.post || response?.shared_post || {
              id: response?.id || Date.now(),
              post_id: response?.id || Date.now(),
              user_id: currentUser?.id,
              author: currentUser,
              content: msg || '',
              feeling: feeling || undefined,
              location: location || undefined,
              taggedUsers: taggedFriends.length > 0 ? taggedFriends : undefined,
              shared_post_id: post.id || post.post_id || post.reel_id || getFeedItemId(post),
              shared_post: post,
              created_at: new Date().toISOString(),
              shares: 0,
              shares_count: 0,
              likes_count: 0,
              reactions_count: 0,
              reactions: [],
              comments: [],
            },
          });
        }
        setIsPosting(false);
        closeSheet();
      } catch (error: any) {
        console.error('Share failed:', error);
        setIsPosting(false);
        if (onShareComplete)
          onShareComplete(destination, { success: false, error: error.message });
      }
    };

    const textPreview = getPostTextPreview(post, 120);
    const previewUrl = useMemo(() => {
      return (
        (Array.isArray(post?.media_urls) && post.media_urls[0]) ||
        (Array.isArray(post?.images) && post.images[0]) ||
        post?.media_url ||
        ''
      );
    }, [post]);

    if (!isOpen) return null;

    if (activeFlow === 'feed' && currentUser) {
      return (
        <ShareScreen
          isOpen={true}
          onClose={() => setActiveFlow('sheet')}
          post={post}
          currentUser={currentUser}
          users={users}
          groups={groups}
          brands={brands}
          onShareComplete={(destination, data) => {
            onShareComplete?.(destination, data);
            closeSheet();
          }}
        />
      );
    }

    if (activeFlow === 'groups' && currentUser) {
      return (
        <div className="fixed inset-0 z-[500] bg-[#050B18] flex flex-col animate-slide-up">
          <div className="flex items-center justify-between p-4 border-b border-[#1E293B]">
            <div className="flex items-center gap-4">
              <i
                className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
                onClick={() => setActiveFlow('sheet')}
              ></i>
              <h3 className="text-[#F8FAFC] text-[22px] font-medium">
                Share to Groups & Brands
              </h3>
            </div>
            <button
              onClick={() => handleShareAction('group')}
              className="text-[#1877F2] font-bold text-[19px]"
            >
              SHARE
            </button>
          </div>
          <div className="p-4 border-b border-[#1E293B]">
            <div className="text-[#94A3B8] text-[15px] mb-2">
              Share with up to 10 groups you're in
            </div>
            <input
              type="text"
              placeholder="Search groups..."
              className="w-full bg-[#1E293B] text-[#F8FAFC] px-4 py-2 rounded-lg text-[15px] outline-none border border-[#1E293B]"
            />
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="text-center py-10">
                <i className="fas fa-users text-4xl text-[#1E293B] mb-3"></i>
                <div className="text-[#F8FAFC] text-[17px]">No groups available</div>
              </div>
            ) : (
              groups.slice(0, 5).map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 hover:bg-[#1E293B] rounded-lg mb-2"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={group.image || avatarFrom(group)}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="text-[#F8FAFC] font-medium text-[15px]">
                        {group.name}
                      </div>
                      <div className="text-[#94A3B8] text-[13px]">
                        {group.members_count} members
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleShareAction('group')}
                    className="px-4 py-1 bg-[#1877F2] text-white rounded-lg text-[15px]"
                  >
                    Share
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (activeFlow === 'messages' && currentUser) {
      return (
        <div className="fixed inset-0 z-[500] bg-[#050B18] flex flex-col animate-slide-up">
          <div className="flex items-center justify-between p-4 border-b border-[#1E293B]">
            <div className="flex items-center gap-4">
              <i
                className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
                onClick={() => setActiveFlow('sheet')}
              ></i>
              <h3 className="text-[#F8FAFC] text-[22px] font-medium">
                Share to Messages
              </h3>
            </div>
          </div>
          <div className="p-4 border-b border-[#1E293B]">
            <textarea
              className="w-full bg-[#1E293B] text-[#F8FAFC] rounded-xl p-3 min-h-[80px] text-[15px] outline-none"
              placeholder="Write a message..."
            />
          </div>
          <div className="p-4 border-b border-[#1E293B]">
            <input
              type="text"
              placeholder="Search friends..."
              className="w-full bg-[#1E293B] text-[#F8FAFC] px-4 py-2 rounded-lg text-[15px] outline-none"
            />
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {users
              .filter((u) => u.id !== currentUser.id)
              .slice(0, 10)
              .map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 hover:bg-[#1E293B] rounded-lg mb-2"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={avatarFrom(user)}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="text-[#F8FAFC] font-medium text-[15px]">
                        {user.name}
                      </div>
                      <div className="text-[#94A3B8] text-[13px]">@{user.username}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleShareAction('message')}
                    className="px-4 py-1 bg-[#1877F2] text-white rounded-lg text-[15px]"
                  >
                    Send
                  </button>
                </div>
              ))}
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          ref={backdropRef}
          className={`fixed inset-0 bg-black/60 z-[300] transition-opacity duration-300 ${
            isAnimating ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <div
          ref={sheetRef}
          className={`fixed bottom-0 left-0 right-0 z-[301] bg-[#0B1120] rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col border-t border-[#1E293B] transition-transform duration-300 ease-out ${
            isAnimating ? 'translate-y-full' : 'translate-y-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 pb-2">
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 bg-[#1E293B] rounded-full"></div>
            </div>
            {post && (
              <div className="flex items-start gap-3 mb-4 p-3 bg-[#1E293B] rounded-xl border border-[#1E293B]">
                {previewUrl ? (
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={previewUrl}
                      alt="Post"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : textPreview ? (
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-[#1877F2]/10 flex items-center justify-center">
                    <i className="fas fa-file-alt text-[#1877F2] text-xl"></i>
                  </div>
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#F8FAFC] font-semibold text-[15px]">
                      {post.author?.name || 'Original Author'}
                    </span>
                    <span className="text-[#94A3B8] text-[13px]">•</span>
                    <span className="text-[#94A3B8] text-[13px]">
                      {formatRelativeTime(post.created_at)}
                    </span>
                  </div>
                  <p className="text-[#94A3B8] text-[15px] line-clamp-2">
                    {textPreview || 'Shared post'}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-1">
              <button
                onClick={() => {
                  if (!currentUser) alert('Please login to share to feed');
                  else setActiveFlow('feed');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fas fa-newspaper text-[#1877F2] text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Share to Feed / Profile
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Share to your profile & public feed
                  </div>
                </div>
                <i className="fas fa-chevron-right text-[#94A3B8] text-[15px]"></i>
              </button>

              <button
                onClick={() => {
                  if (!currentUser) alert('Please login to share to groups/brands');
                  else setActiveFlow('groups');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#45BD6215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fas fa-users text-[#45BD62] text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Share to Groups & Brands
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Share with up to 10 groups/brands
                  </div>
                </div>
                <i className="fas fa-chevron-right text-[#94A3B8] text-[15px]"></i>
              </button>

              <button
                onClick={() => {
                  if (!currentUser) alert('Please login to send messages');
                  else setActiveFlow('messages');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fas fa-comment-alt text-[#1877F2] text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Send as a Message
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Share via direct message
                  </div>
                </div>
                <i className="fas fa-chevron-right text-[#94A3B8] text-[15px]"></i>
              </button>

              <button
                onClick={() => {
                  const text = `Check out this post: ${canonicalPostUrl}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  handleShareAction('whatsapp');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#25D36615] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fab fa-whatsapp text-[#25D366] text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Send via WhatsApp
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Share to WhatsApp
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalPostUrl)}`, '_blank');
                  handleShareAction('facebook');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fab fa-facebook-f text-[#1877F2] text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Share to Facebook
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Post to Facebook
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(canonicalPostUrl)}&text=${encodeURIComponent(textPreview || 'Check out this post')}`, '_blank');
                  handleShareAction('twitter');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <i className="fab fa-x-twitter text-white text-lg"></i>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    Share to X (Twitter)
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5">
                    Tweet link
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(canonicalPostUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                  handleShareAction('link');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#334155] transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  {copiedLink ? (
                    <i className="fas fa-check text-green-400 text-lg"></i>
                  ) : (
                    <i className="fas fa-link text-[#1877F2] text-lg"></i>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[#F8FAFC] font-medium text-[17px]">
                    {copiedLink ? 'Link Copied!' : 'Copy Post Link'}
                  </div>
                  <div className="text-[#94A3B8] text-[13px] mt-0.5 truncate max-w-[280px]">
                    {canonicalPostUrl}
                  </div>
                </div>
              </button>
            </div>

            {currentUser && users.length > 0 && (
              <div className="mt-6">
                <div className="text-[#94A3B8] text-[13px] font-semibold uppercase tracking-wider mb-3 px-1">
                  Share with recent contacts
                </div>
                <div className="flex gap-3">
                  {users
                    .filter((u) => u.id !== currentUser.id)
                    .slice(0, 3)
                    .map((user) => (
                      <button
                        key={user.id}
                        onClick={() => setActiveFlow('messages')}
                        className="flex flex-col items-center gap-2"
                      >
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#1877F2] p-0.5">
                          <img
                            src={avatarFrom(user)}
                            alt={user.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        </div>
                        <span className="text-[#F8FAFC] text-[13px] font-medium max-w-[60px] truncate">
                          {user.name.split(' ')[0]}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-4 pt-3 border-t border-[#1E293B]">
            <button
              onClick={closeSheet}
              className="w-full py-3 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] font-semibold rounded-xl transition-colors text-[17px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  },
  (prev, next) => {
    return (
      prev.isOpen === next.isOpen &&
      isSameFeedItem(prev.post, next.post) &&
      prev.currentUser?.id === next.currentUser?.id
    );
  }
);

/**
 * =========================
 * ✅ PEOPLE YOU MAY KNOW
 * =========================
 */
interface PeopleSuggestion {
  id: number;
  username: string;
  name: string;
  profile_image_url: string | null;
  is_verified: boolean;
  role: string;
  mutual_count: number;
  is_following: boolean;
  score: number;
}

export const PeopleYouMayKnowGrid = memo(
  ({
    users = [],
    onFollow,
    currentUser,
    isLoading = false,
    onLoginClick,
    onProfileClick,
    title = 'People You May Know',
    maxDisplay = 8,
  }: {
    users: PeopleSuggestion[];
    onFollow: (userId: number) => void;
    currentUser: User | null;
    isLoading?: boolean;
    onLoginClick?: () => void;
    onProfileClick?: (userId: number) => void;
    title?: string;
    maxDisplay?: number;
  }) => {
    const [followLoading, setFollowLoading] = useState<{ [key: number]: boolean }>(
      {}
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const displayUsers = users.slice(0, maxDisplay);

    const checkScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }, []);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }, [checkScroll, displayUsers.length]);

    const scroll = (direction: 'left' | 'right') => {
      const el = scrollRef.current;
      if (!el) return;
      const scrollAmount = 350;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    };

    const handleFollow = async (userId: number) => {
      setFollowLoading((prev) => ({ ...prev, [userId]: true }));
      try {
        await onFollow(userId);
      } finally {
        setFollowLoading((prev) => ({ ...prev, [userId]: false }));
      }
    };

    const handleProfileClick = (userId: number) => {
      if (onProfileClick) onProfileClick(userId);
    };

    if (isLoading) {
      return (
        <div className="w-full">
          <div className="bg-[#0B1120] w-full p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[#F8FAFC] font-bold text-[18px] sm:text-[20px] tracking-tight">{title}</h3>
            </div>
            <div className="flex gap-3 overflow-x-hidden py-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-[168px] sm:w-[185px] bg-[#1E293B] rounded-2xl overflow-hidden animate-pulse border border-[#334155]/30 flex flex-col"
                >
                  <div className="aspect-square w-full bg-[#334155]/60" />
                  <div className="p-3 flex flex-col flex-1 justify-between">
                    <div>
                      <div className="h-4 bg-[#334155]/70 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-[#334155]/40 rounded w-1/2 mb-3" />
                    </div>
                    <div className="h-9 bg-[#334155]/60 rounded-lg w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
        </div>
      );
    }

    if (displayUsers.length === 0) return null;

    return (
      <div className="w-full">
        <div className="bg-[#0B1120] w-full p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[#F8FAFC] font-bold text-[18px] sm:text-[20px] tracking-tight">{title}</h3>
            <div className="flex items-center gap-1.5">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scroll('left')}
                  aria-label="Scroll left"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] border border-[#334155]/50 flex items-center justify-center transition-colors active:scale-95"
                >
                  <i className="fas fa-chevron-left text-[#F8FAFC] text-sm"></i>
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scroll('right')}
                  aria-label="Scroll right"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] border border-[#334155]/50 flex items-center justify-center transition-colors active:scale-95"
                >
                  <i className="fas fa-chevron-right text-[#F8FAFC] text-sm"></i>
                </button>
              )}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayUsers.map((user) => (
              <div
                key={user.id}
                className="flex-shrink-0 w-[168px] sm:w-[185px] bg-[#1E293B] rounded-2xl overflow-hidden border border-[#334155]/40 hover:border-[#1877F2]/50 transition-all duration-200 shadow-lg flex flex-col group"
              >
                {/* 1. Large Square Profile Photo */}
                <div
                  className="aspect-square w-full relative bg-[#0F172A] overflow-hidden cursor-pointer shrink-0"
                  onClick={() => handleProfileClick(user.id)}
                >
                  <img
                    src={
                      user.profile_image_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user.name
                      )}&background=1877F2&color=fff&bold=true&size=320`
                    }
                    alt={user.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        user.name
                      )}&background=1877F2&color=fff&bold=true&size=320`;
                    }}
                  />
                </div>

                {/* Card Information Section */}
                <div className="p-3 flex flex-col flex-1 justify-between bg-[#1E293B]">
                  <div>
                    {/* 2. Person's Name & Extended Verification Badge */}
                    <div className="flex items-center min-w-0 mb-1">
                      <button
                        type="button"
                        onClick={() => handleProfileClick(user.id)}
                        className="text-[#F8FAFC] font-bold text-[15px] sm:text-[16px] leading-snug truncate text-left hover:underline inline-flex items-center gap-1.5 max-w-full"
                        title={user.name}
                      >
                        <span className="truncate">{user.name}</span>
                        {Boolean(user.is_verified) && (
                          <VerifiedBadge size={14} className="shrink-0" />
                        )}
                      </button>
                    </div>

                    {/* 3. Mutual Friends */}
                    <div className="flex items-center gap-1.5 text-[#94A3B8] text-[12px] sm:text-[13px] mb-3 min-h-[18px]">
                      {user.mutual_count > 0 ? (
                        <>
                          <i className="fas fa-user-group text-[11px] opacity-75 shrink-0" />
                          <span className="truncate">
                            {user.mutual_count} mutual friend{user.mutual_count !== 1 ? 's' : ''}
                          </span>
                        </>
                      ) : (
                        <span className="truncate opacity-75">
                          {user.role || 'Suggested for you'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. Follow Button */}
                  {!currentUser ? (
                    <button
                      type="button"
                      onClick={onLoginClick}
                      className="w-full py-2 sm:py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-[13px] sm:text-[14px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-[#1877F2]/20 active:scale-[0.98]"
                    >
                      <i className="fas fa-user-plus text-[12px] sm:text-[13px]"></i>
                      <span>Follow</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleFollow(user.id)}
                      disabled={followLoading[user.id]}
                      className={`w-full py-2 sm:py-2.5 text-[13px] sm:text-[14px] font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                        user.is_following
                          ? 'bg-[#334155] text-[#F8FAFC] hover:bg-[#475569]'
                          : 'bg-[#1877F2] text-white hover:bg-[#166FE5] shadow-sm shadow-[#1877F2]/20'
                      } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                      {followLoading[user.id] ? (
                        <i className="fas fa-spinner fa-spin text-[13px]"></i>
                      ) : (
                        <>
                          <i
                            className={`fas ${
                              user.is_following ? 'fa-check' : 'fa-user-plus'
                            } text-[12px] sm:text-[13px]`}
                          ></i>
                          <span>{user.is_following ? 'Following' : 'Follow'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.users === next.users &&
      prev.currentUser?.id === next.currentUser?.id &&
      prev.isLoading === next.isLoading
    );
  }
);

/**
 * =========================
 * ✅ REEL PREVIEW CARD
 * =========================
 */
export type ReelFeedData = {
  id: number | string;
  user_id: number | string;
  author: string;
  avatar?: string;
  verified?: boolean;
  video: string;
  thumbnail?: string;
  caption?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  created_at?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  songName?: string;
  songId?: string | number;
  soundKey?: string;
};

const formatReelCount = (n?: number): string => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000)
    return (v / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (v >= 1_000_000)
    return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
};

const getReelAuthorName = (reel: any): string => {
  return (
    reel?.author_name ||
    reel?.full_name ||
    reel?.username ||
    reel?.user_name ||
    reel?.name ||
    (reel?.user &&
      (reel.user.full_name || reel.user.username || reel.user.name)) ||
    (reel?.author &&
      (typeof reel.author === 'string'
        ? reel.author
        : reel.author.full_name || reel.author.username || reel.author.name)) ||
    'User'
  );
};

export const normalizeReelFromFeed = (item: any): ReelFeedData => {
  const reelData = item?.reel || item;
  return {
    id: reelData?.id || item?.id || 0,
    user_id: reelData?.user_id ?? reelData?.userId ?? item?.user_id ?? 0,
    author: getReelAuthorName(reelData) || getReelAuthorName(item),
    avatar:
      reelData?.avatar ||
      reelData?.profile_image_url ||
      reelData?.user?.profile_image_url ||
      item?.avatar ||
      '',
    verified: Boolean(reelData?.verified || reelData?.is_verified || false),
    views: Number(
      reelData?.views_count ??
        reelData?.view_count ??
        reelData?.views ??
        reelData?.total_views ??
        item?.views_count ??
        item?.views ??
        0
    ),
    likes: Number(
      reelData?.likes_count ?? reelData?.likes ?? reelData?.reactions_count ?? 0
    ),
    comments: Number(reelData?.comments_count ?? reelData?.comments ?? 0),
    shares: Number(reelData?.shares_count ?? reelData?.shares ?? 0),
    video:
      reelData?.video_url || reelData?.video || reelData?.media_url || item?.video_url || '',
    thumbnail: reelData?.thumbnail_url || reelData?.thumbnail || reelData?.cover_url || '',
    caption: reelData?.caption || reelData?.description || '',
    created_at: reelData?.created_at || reelData?.createdAt || item?.created_at || '',
    audioUrl: reelData?.audio_url || reelData?.audioUrl || reelData?.song?.audio_url,
    audioStart: Number(reelData?.audio_start || reelData?.audioStart || 0),
    audioEnd: Number(reelData?.audio_end || reelData?.audioEnd || 0),
    songName: reelData?.song_name || reelData?.songName || reelData?.song?.title,
    songId: reelData?.song_id || reelData?.songId || reelData?.song?.id,
    soundKey: reelData?.sound_key || reelData?.soundKey || `reel:${reelData?.id || 0}`,
  };
};

export const isReelPost = (item: any): boolean => {
  return (
    item?.type === 'reel' ||
    item?.post_type === 'reel' ||
    item?.kind === 'reel' ||
    item?.feed_type === 'reel' ||
    item?.item_type === 'reel' ||
    item?.is_reel === true ||
    item?.format === 'reel' ||
    (item?.video && (item?.audio_url || item?.song_name))
  );
};

//============ STORY CARD COMPONENTS =======

interface FeedStoryCardProps {
  story: any;
  onOpen?: (story: any) => void;
  currentUser?: User | null;
  users?: User[];
  groups?: Group[];
  brands?: Brand[];
  chats?: any[];
  onReact?: (storyId: number, type: ReactionType) => void;
  onOpenComments?: (story: any) => void;
  onShare?: (story: any, destination?: string, data?: any) => void;
  onProfileClick?: (userId: number) => void;
}

const FeedStoryCard: React.FC<FeedStoryCardProps> = ({
  story,
  onOpen,
  currentUser,
  users = [],
  groups = [],
  brands = [],
  chats = [],
  onReact,
  onOpenComments,
  onShare,
  onProfileClick,
}) => {
  const storyId = Number(story?.id || story?.story_id || 0);
  const authorId = Number(story?.user_id || story?.user?.id || 0);
  const authorUser = useMemo(() => {
    return (
      (authorId ? users?.find((u) => Number(u.id) === authorId) : null) ||
      (currentUser && Number(currentUser.id) === authorId ? currentUser : null) ||
      (story?.user && typeof story.user === 'object' ? story.user : null)
    );
  }, [authorId, users, currentUser, story?.user]);

  const isValidName = (val: any) => {
    if (!val || typeof val !== 'string') return false;
    const s = val.trim();
    return s.length > 0 && s.toLowerCase() !== 'user' && s.toLowerCase() !== 'un';
  };

  const authorName =
    (isValidName(authorUser?.name) ? authorUser!.name : null) ||
    (isValidName(story?.author_full_name) ? story.author_full_name : null) ||
    (isValidName(story?.author_name) ? story.author_name : null) ||
    (isValidName(story?.user?.name) ? story.user.name : null) ||
    authorUser?.username ||
    story?.author_username ||
    story?.username ||
    getStoryAuthorName(story, users);

  const authorImage =
    authorUser?.profile_image_url ||
    authorUser?.avatar_url ||
    story?.author_image ||
    story?.user?.profile_image_url ||
    story?.user?.avatar_url ||
    getStoryAuthorImage(story, users);

  const storyMedia = getStoryMediaList(story);
  const primaryMedia = storyMedia[0];

  const isText = story?.type === 'text';
  const isVideo = story?.type === 'video' || primaryMedia?.kind === 'video';
  const isImage = !isText && !isVideo;

  const storyLabel = isText ? 'Text story' : isVideo ? 'Video story' : 'Photo story';

  const displayMediaUrl =
    primaryMedia?.feed ||
    primaryMedia?.full ||
    primaryMedia?.url ||
    String(story?.media_url || '').trim();

  const thumbnailUrl =
    primaryMedia?.thumb ||
    primaryMedia?.feed ||
    primaryMedia?.full ||
    displayMediaUrl;

  const viewsCount = Number(story?.views_count || 0);

  const [currentReaction, setCurrentReaction] = useState<ReactionType | undefined>(
    story?.my_reaction || (story?.liked_by_me ? 'like' : undefined)
  );
  const [reactionCount, setReactionCount] = useState<number>(
    Number(story?.reactions_count || story?.reactions?.length || 0)
  );
  const [commentsCount, setCommentsCount] = useState<number>(
    Number(story?.comments_count ?? story?.comments?.length ?? story?.discussions_count ?? 0)
  );
  const [sharesCount, setSharesCount] = useState<number>(
    Number(story?.shares_count ?? story?.shares ?? 0)
  );

  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showReactionsSheet, setShowReactionsSheet] = useState(false);

  useEffect(() => {
    if (story?.my_reaction !== undefined) {
      setCurrentReaction(story.my_reaction || (story.liked_by_me ? 'like' : undefined));
    }
    if (story?.reactions_count !== undefined) {
      setReactionCount(Number(story.reactions_count));
    }
    if (story?.comments_count !== undefined) {
      setCommentsCount(Number(story.comments_count));
    }
    if (story?.shares_count !== undefined) {
      setSharesCount(Number(story.shares_count));
    }

    if (!storyId) return;
    const viewerParam = currentUser?.id ? `?viewerId=${currentUser.id}` : '';
    fetch(`/api/stories/${storyId}/comments${viewerParam}`, {
      headers: currentUser?.id ? { 'x-user-id': String(currentUser.id) } : undefined,
    })
      .then((res) => res.json())
      .then((data: any) => {
        const list = Array.isArray(data?.comments) ? data.comments : (Array.isArray(data) ? data : []);
        const count = typeof data?.count === 'number' ? data.count : list.length;
        setCommentsCount(count);
      })
      .catch(() => {});
  }, [storyId, story?.my_reaction, story?.liked_by_me, story?.reactions_count, story?.comments_count, story?.shares_count, currentUser?.id]);

  const normalizedStoryPost = useMemo(() => {
    const isVerified = Boolean(authorUser?.is_verified || story?.is_verified || story?.author_verified);
    const authorObj = {
      id: authorId,
      name: authorName,
      username: authorUser?.username || story?.author_username || story?.username || 'user',
      user_name: authorUser?.username || story?.author_username || story?.username || 'user',
      profile_image_url: authorImage,
      avatar_url: authorImage,
      is_verified: isVerified,
      verified: isVerified,
    };
    return {
      ...story,
      id: storyId,
      story_id: storyId,
      item_type: 'story',
      type: 'story',
      post_type: 'story',
      kind: 'story',
      shares: sharesCount,
      shares_count: sharesCount,
      author: authorObj,
      user: authorObj,
      author_name: authorName,
      author_full_name: authorName,
      author_username: authorObj.username,
      author_image: authorImage,
    };
  }, [story, storyId, authorId, authorUser, authorName, authorImage, sharesCount]);

  const handleReact = async (type: ReactionType) => {
    if (!currentUser) {
      alert('Please login to react.');
      return;
    }

    const isSameReaction = currentReaction === type;
    const nextReaction = isSameReaction ? undefined : type;
    const nextCount = isSameReaction
      ? Math.max(0, reactionCount - 1)
      : currentReaction
      ? reactionCount
      : reactionCount + 1;

    setCurrentReaction(nextReaction);
    setReactionCount(nextCount);

    if (onReact) {
      onReact(storyId, type);
    }

    try {
      await fetch(`/api/stories/${storyId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          type: type,
        }),
      });
    } catch (err) {
      console.error('Failed to react to story:', err);
    }
  };

  const handleShareClick = () => {
    if (!currentUser) {
      alert('Please login to share.');
      return;
    }
    setShowShareSheet(true);
  };

  const handleShareComplete = (destination: string, data?: any) => {
    const nextShares = safeNumber(data?.shares ?? data?.share_count, NaN);
    const finalShares = Number.isFinite(nextShares) ? nextShares : sharesCount + 1;
    setSharesCount(finalShares);
    onShare?.(normalizedStoryPost, destination, data);
    setShowShareSheet(false);
  };

  return (
    <div className="w-full bg-[#0F172A] border-b-[8px] border-[#050B18] overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => authorId && onProfileClick?.(authorId)}
            className="flex-shrink-0 cursor-pointer"
          >
            <img
              src={authorImage}
              alt={authorName}
              className="w-10 h-10 rounded-full object-cover border border-[#1E293B]"
            />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => authorId && onProfileClick?.(authorId)}
                className="text-[#F8FAFC] font-bold text-[21px] truncate hover:text-[#38BDF8] text-left cursor-pointer"
              >
                {authorName}
              </button>
              <span className="text-[#1877F2] text-[12px] font-bold">Story</span>
            </div>
            <p className="text-[#94A3B8] text-[12px]">
              {storyLabel}
              {viewsCount > 0 ? ` · ${viewsCount} views` : ''}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpen?.(story)}
        className="block w-full text-left cursor-pointer"
      >
        {isText ? (
          <div
            className="h-[420px] flex items-center justify-center text-center px-6"
            style={{
              background:
                story?.background_style ||
                'linear-gradient(45deg, #1877F2, #0055FF)',
            }}
          >
            <div className="max-w-[85%]">
              <p className="text-white font-bold text-2xl whitespace-pre-wrap break-words">
                {story?.text_content || 'Story'}
              </p>
            </div>
          </div>
        ) : isVideo ? (
          <div className="relative h-[420px] bg-[#0B1120]">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="Video story"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : displayMediaUrl ? (
              <video
                src={displayMediaUrl}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="w-full h-full bg-[#0B1120]" />
            )}

            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/45 border border-white/30 flex items-center justify-center">
                <i className="fas fa-play text-white text-2xl ml-1"></i>
              </div>
            </div>
          </div>
        ) : isImage ? (
          <div className="relative h-[420px] bg-[#0B1120]">
            {primaryMedia ? (
              <ProgressiveTileImage
                item={{
                  url: displayMediaUrl,
                  thumb: primaryMedia.thumb || displayMediaUrl,
                  feed: primaryMedia.feed || displayMediaUrl,
                  full: primaryMedia.full || primaryMedia.feed || displayMediaUrl,
                }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : displayMediaUrl ? (
              <img
                src={displayMediaUrl}
                alt="Story"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-[#0B1120]" />
            )}
          </div>
        ) : null}
      </button>

      {/* Social Feedback Bar (Reactions & Discussions Counts) */}
      <div className="px-4 py-2 border-t border-[#1E293B] flex items-center justify-between text-[#94A3B8] text-sm">
        <button
          type="button"
          onClick={() => setShowReactionsSheet(true)}
          className="flex items-center gap-1.5 hover:text-[#F8FAFC] cursor-pointer"
        >
          <span className="flex items-center gap-1">
            <i className="fas fa-heart text-[#EF4444] text-[13px]"></i>
            <span className="font-semibold text-[#F8FAFC]">{reactionCount}</span>
          </span>
          {viewsCount > 0 && (
            <span className="flex items-center gap-1 ml-2 text-xs text-[#94A3B8]">
              <i className="fas fa-eye text-[12px]"></i>
              {viewsCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenComments?.(normalizedStoryPost)}
            className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-sm font-semibold"
          >
            {commentsCount} {commentsCount === 1 ? 'Discussion' : 'Discussions'}
          </button>
          {sharesCount > 0 && (
            <span className="text-xs text-[#94A3B8]">
              · {sharesCount} {sharesCount === 1 ? 'Share' : 'Shares'}
            </span>
          )}
        </div>
      </div>

      {/* Main Action Buttons */}
      <div className="px-3.5 py-2 border-t border-[#1E293B] flex items-center justify-between bg-[#0B1120]/60">
        <div className="flex items-center gap-3">
          <ReactionButton
            currentUserReactions={currentReaction}
            reactionCount={reactionCount}
            onReact={handleReact}
            isGuest={!currentUser}
          />

          <button
            type="button"
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
            onClick={() => onOpenComments?.(normalizedStoryPost)}
            aria-label="Discuss story"
            title="Discuss"
          >
            <i className="far fa-comment text-[22px]"></i>
            {commentsCount > 0 && (
              <span className="text-[14px] font-semibold text-[#F8FAFC]">
                {commentsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
            onClick={handleShareClick}
            aria-label="Share story"
            title="Share"
          >
            <i className="far fa-paper-plane text-[21px]"></i>
            {sharesCount > 0 && (
              <span className="text-[14px] font-semibold text-[#F8FAFC]">
                {sharesCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpen?.(story)}
          className="px-3.5 py-1.5 rounded-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <i className="fas fa-play text-[10px]"></i>
          <span>View story</span>
        </button>
      </div>

      {/* Share Bottom Sheet for Story (Opens exactly as other posts in Feeds.tsx) */}
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        post={normalizedStoryPost}
        currentUser={currentUser || null}
        users={users}
        groups={groups}
        brands={brands}
        chats={chats}
        onShareComplete={handleShareComplete}
      />

      {/* Reactions Sheet for Story */}
      <ReactionsSheet
        isOpen={showReactionsSheet}
        onClose={() => setShowReactionsSheet(false)}
        post={normalizedStoryPost}
        onProfileClick={onProfileClick || (() => {})}
        onOpenComments={() => onOpenComments?.(normalizedStoryPost)}
        currentUser={currentUser}
      />
    </div>
  );
};



/**
 * =========================
 * ✅ GROUPS YOU MAY JOIN
 * =========================
 */
interface GroupSuggestion {
  id: number;
  admin_id: number;
  name: string;
  description: string;
  type: 'public' | 'private';
  cover_image?: string;
  profile_image?: string;
  created_at?: string;
  category: string;
  members_count: number;
  mutual_count: number;
  is_member: boolean;
  score: number;
}

export const GroupsYouMayJoinCard = memo(
  ({
    groups = [],
    onJoin,
    currentUser,
    isLoading = false,
    onLoginClick,
    onOpenGroup,
    onProfileClick,
    title = 'Groups You May Join',
    maxDisplay = 8,
  }: {
    groups: GroupSuggestion[];
    onJoin: (groupId: number) => void;
    currentUser: User | null;
    isLoading?: boolean;
    onLoginClick?: () => void;
    onOpenGroup?: (groupId: number) => void;
    onProfileClick?: (userId: number) => void;
    title?: string;
    maxDisplay?: number;
  }) => {
    const [joinLoading, setJoinLoading] = useState<{ [key: number]: boolean }>({});
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const displayGroups = groups.slice(0, maxDisplay);

    const checkScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }, []);

    useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }, [checkScroll, displayGroups.length]);

    const scroll = (direction: 'left' | 'right') => {
      const el = scrollRef.current;
      if (!el) return;
      const scrollAmount = 400;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    };

    const handleJoin = async (groupId: number) => {
      setJoinLoading((prev) => ({ ...prev, [groupId]: true }));
      try {
        await onJoin(groupId);
      } finally {
        setJoinLoading((prev) => ({ ...prev, [groupId]: false }));
      }
    };

    const handleGroupClick = (groupId: number) => {
      if (onOpenGroup) onOpenGroup(groupId);
    };
    const handleAdminClick = (adminId: number) => {
      if (onProfileClick) onProfileClick(adminId);
    };

    if (isLoading) {
      return (
        <div className="w-full">
          <div className="bg-[#0B1120] border border-[#1E293B] rounded-2xl w-full p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[#F8FAFC] font-bold text-[20px]">{title}</h3>
            </div>
            <div className="flex gap-4 overflow-x-hidden py-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex-shrink-0 w-[240px] animate-pulse">
                  <div className="h-32 bg-[#1E293B] rounded-t-lg"></div>
                  <div className="p-4 bg-[#1E293B]">
                    <div className="h-5 bg-[#334155] rounded w-32 mb-3"></div>
                    <div className="h-4 bg-[#334155] rounded w-20 mb-4"></div>
                    <div className="h-10 bg-[#334155] rounded-lg w-full"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
        </div>
      );
    }

    if (displayGroups.length === 0) return null;

    return (
      <div className="w-full">
        <div className="bg-[#0F172A] w-full p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[#F8FAFC] font-bold text-[20px]">{title}</h3>
            <div className="flex items-center gap-2">
              {canScrollLeft && (
                <button
                  onClick={() => scroll('left')}
                  className="w-9 h-9 rounded-xl bg-[#1E293B] hover:bg-[#141E33] border border-[#1E293B] flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-chevron-left text-[#F8FAFC] text-base"></i>
                </button>
              )}
              {canScrollRight && (
                <button
                  onClick={() => scroll('right')}
                  className="w-9 h-9 rounded-xl bg-[#1E293B] hover:bg-[#141E33] border border-[#1E293B] flex items-center justify-center transition-colors"
                >
                  <i className="fas fa-chevron-right text-[#F8FAFC] text-base"></i>
                </button>
              )}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayGroups.map((group) => (
              <div
                key={group.id}
                className="flex-shrink-0 w-[240px] bg-[#0B1120] border border-[#1E293B] rounded-2xl overflow-hidden hover:border-[#1877F2]/40 transition-all group"
              >
                <div
                  className="h-32 bg-[#1E293B] cursor-pointer relative"
                  onClick={() => handleGroupClick(group.id)}
                >
                  {group.cover_image ? (
                    <img
                      src={group.cover_image}
                      alt={group.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1877F2] to-[#166FE5]">
                      <i className="fas fa-users text-white text-3xl opacity-50"></i>
                    </div>
                  )}

                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full text-white text-[13px] font-semibold">
                    {group.type === 'public' ? '🌍 Public' : '🔒 Private'}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-full overflow-hidden bg-[#1E293B] flex-shrink-0 cursor-pointer border-2 border-[#1877F2] group-hover:border-[#166FE5] transition-colors"
                      onClick={() => handleGroupClick(group.id)}
                    >
                      {group.profile_image ? (
                        <img
                          src={group.profile_image}
                          alt={group.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#1E293B]">
                          <i className="fas fa-users text-[#94A3B8] text-base"></i>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleGroupClick(group.id)}
                        className="text-[#F8FAFC] font-bold text-[17px] truncate w-full text-left hover:underline"
                      >
                        {group.name}
                      </button>
                      <div className="text-[#94A3B8] text-[13px] truncate">
                        {group.category}
                      </div>
                    </div>
                  </div>

                  <div className="text-[#94A3B8] text-[13px] mb-3">
                    <i className="fas fa-users mr-1"></i>
                    {group.members_count.toLocaleString()} members
                    {group.mutual_count > 0 && (
                      <span className="ml-1">· {group.mutual_count} mutual</span>
                    )}
                  </div>

                  {onProfileClick && (
                    <div className="text-[#94A3B8] text-[13px] mb-3">
                      Admin:{' '}
                      <button
                        type="button"
                        onClick={() => handleAdminClick(group.admin_id)}
                        className="text-[#F8FAFC] hover:underline font-medium text-[13px]"
                      >
                        View Admin
                      </button>
                    </div>
                  )}

                  {group.description && (
                    <div className="text-[#94A3B8] text-[13px] mb-3 line-clamp-2">
                      {group.description}
                    </div>
                  )}

                  {!currentUser ? (
                    <button
                      onClick={onLoginClick}
                      className="w-full py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-[15px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                    >
                      <i className="fas fa-sign-in-alt text-[13px]"></i>
                      <span>Sign in</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(group.id)}
                      disabled={joinLoading[group.id] || group.is_member}
                      className={`w-full py-2.5 text-[15px] font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1 ${
                        group.is_member
                          ? 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#141E33] border border-[#1E293B]'
                          : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                      } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                      {joinLoading[group.id] ? (
                        <i className="fas fa-spinner fa-spin text-[13px]"></i>
                      ) : (
                        <>
                          <i
                            className={`fas ${
                              group.is_member ? 'fa-check' : 'fa-user-plus'
                            } text-[13px]`}
                          ></i>
                          <span>{group.is_member ? 'Joined' : 'Join Group'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.groups === next.groups &&
      prev.currentUser?.id === next.currentUser?.id &&
      prev.isLoading === next.isLoading
    );
  }
);

// Add CSS for hiding scrollbar
const scrollbarHideStyles = `
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

if (typeof document !== 'undefined') {
  const styleId = 'people-you-may-know-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = scrollbarHideStyles;
    document.head.appendChild(style);
  }
}

// ==================== EVENT HELPERS ====================
const safeParseJsonArray = (v: any): string[] => {
  if (!v) return [];
  const extractUrl = (item: any): string => {
    if (!item) return '';
    if (typeof item === 'object') {
      return String(item.url || item.feed || item.full || item.thumb || '');
    }
    return String(item ?? '');
  };

  if (Array.isArray(v)) {
    return v.map(extractUrl).filter((s) => s.length > 0 && s !== '[object Object]');
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === 'null' || s === 'undefined') return [];
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(extractUrl).filter((s) => s.length > 0 && s !== '[object Object]');
      }
      if (arr && typeof arr === 'object') {
        const u = extractUrl(arr);
        return u && u !== '[object Object]' ? [u] : [];
      }
    } catch {}
  }
  return [];
};

const getEventCover = (item: any, meta?: any) => {
  const urls = safeParseJsonArray(item?.media_urls);
  if (urls.length > 0) return urls[0];
  if (item?.media_url) return item.media_url;
  if (meta?.cover_url) return meta.cover_url;
  if (meta?.image) return meta.image;
  if (meta?.cover) return meta.cover;
  return '';
};

//===NORMALIZE EVENT FROM FEEDS ==


    
const normalizeEventFromFeed = (item: any) => {
  const metaRaw = item?.meta || {};
  let meta: any = metaRaw;

  if (typeof metaRaw === 'string') {
    try {
      meta = JSON.parse(metaRaw);
    } catch {
      meta = {};
    }
  }

  const cover = getEventCover(item, meta);
  const id = Number(item?.event_id ?? item?.id ?? meta?.event_id ?? 0);

  return {
    ...item,
    id,
    event_id: id,
    type: 'event',
    item_type: 'event',
    post_type: 'event',
    kind: 'event',
    feed_key: item?.feed_key || `event:${id}`,

    title: String(
      item?.content ??
      meta?.title ??
      'Event'
    ),

    description: String(
      item?.event_description ??
      meta?.description ??
      ''
    ),

    cover_url: String(cover || ''),

    location: String(
      item?.location ??
      meta?.location ??
      ''
    ),

    event_date: String(
      item?.event_date ??
      meta?.event_date ??
      meta?.start_time ??
      ''
    ),

    created_at: String(
      item?.created_at ??
      meta?.created_at ??
      ''
    ),

    attendees_count: Number(
      item?.attending_count ??
      meta?.attending_count ??
      0
    ),

    interested_count: Number(
      item?.interested_count ??
      meta?.interested_count ??
      0
    ),

    user_rsvp_status: String(
      item?.my_rsvp_status ??
      meta?.my_rsvp_status ??
      ''
    ),

    // ✅ EVENT REACTIONS
    my_reaction:
      item?.my_reaction ??
      item?.myReaction ??
      meta?.my_reaction ??
      null,

    reactions_count: Number(
      item?.reactions_count ??
      item?.reactionsCount ??
      item?.likes_count ??
      item?.likesCount ??
      meta?.reactions_count ??
      0
    ),

    reactions: Array.isArray(item?.reactions)
      ? item.reactions
      : Array.isArray(item?.reactions_preview)
      ? item.reactions_preview
      : [],

    reactor_name: String(item?.reactor_name ?? item?.reactorName ?? meta?.reactor_name ?? ''),
    reactions_preview: Array.isArray(item?.reactions_preview)
      ? item.reactions_preview
      : Array.isArray(item?.reactions)
      ? item.reactions
      : [],
    reactions_by_type: Array.isArray(item?.reactions_by_type) ? item.reactions_by_type : [],

    comments_count: Number(
      item?.comments_count ??
      item?.comment_count ??
      (Array.isArray(item?.comments) ? item.comments.length : 0) ??
      meta?.comments_count ??
      0
    ),

    comments: Array.isArray(item?.comments) ? item.comments : [],

    shares_count: Number(
      item?.shares_count ??
      item?.shares ??
      item?.share_count ??
      meta?.shares_count ??
      0
    ),

    shares: Number(
      item?.shares_count ??
      item?.shares ??
      item?.share_count ??
      meta?.shares_count ??
      0
    ),

    creator_id: Number(
      item?.user_id ??
      meta?.creator_id ??
      0
    ),

    creator: {
      id: Number(
        item?.user_id ??
        meta?.creator_id ??
        0
      ),

      name: String(
        item?.name ??
        meta?.creator_name ??
        'Event Organizer'
      ),

      username: String(
        item?.username ??
        meta?.creator_username ??
        ''
      ),

      profile_image_url: String(
        item?.profile_image_url ??
        meta?.creator_image ??
        ''
      ),
    },
  };
};



// ==================== MEDIA HELPERS ====================
const getMediaTypeInfo = (post: any) => {
  const mediaUrl = String(post?.media_url || '');
  const mediaTypeRaw = String(post?.media_type || '').toLowerCase();
  const typeRaw = String(post?.type || '').toLowerCase();

  const cleanUrl = mediaUrl.split('?')[0].split('#')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';

  const isImage =
    typeRaw === 'image' ||
    mediaTypeRaw === 'image' ||
    mediaTypeRaw.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(
      ext
    );

  const isVideo =
    typeRaw === 'video' ||
    mediaTypeRaw === 'video' ||
    mediaTypeRaw.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'flv', 'wmv', '3gp'].includes(ext);

  const isAudio =
    typeRaw === 'audio' ||
    mediaTypeRaw.startsWith('audio/') ||
    ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext);

  return {
    mediaUrl,
    isImage,
    isVideo,
    isAudio,
    extension: ext,
    mimeType: mediaTypeRaw,
  };
};

type NormalizedMedia = {
  url: string;
  thumb?: string;
  feed?: string;
  full?: string;
  kind: 'image' | 'video' | 'audio';
};
                       
const getPostMediaList = (p: any) => {
  const out: Array<{
    url: string;
    thumb?: string;
    feed?: string;
    full?: string;
    kind: 'image' | 'video' | 'audio';
  }> = [];

  const guessKind = (url: string, explicitType?: string) => {
    const t = String(explicitType || '').toLowerCase();
    const u = String(url || '').toLowerCase();
    if (t.includes('video') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return 'video';
    if (t.includes('audio') || /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(u)) return 'audio';
    return 'image';
  };

  const safeParseArray = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  try {
    // ✅ STEP 1: Check media_meta first
    const metaItems = safeParseArray(p?.media_meta);

    if (metaItems.length > 0) {
      metaItems.forEach((item: any) => {
        let parsedItem = item;
        if (typeof item === 'string') {
          try {
            parsedItem = JSON.parse(item);
          } catch {
            parsedItem = null;
          }
        }

        if (parsedItem && typeof parsedItem === 'object') {
          const thumbUrl = String(parsedItem.thumb || parsedItem.thumbnail_url || parsedItem.thumbnail || '').trim();
          const feedUrl = String(parsedItem.feed || parsedItem.feed_url || '').trim();
          const fullUrl = String(parsedItem.full || parsedItem.full_url || '').trim();
          const urlField = String(parsedItem.url || '').trim();

          const displayUrl = feedUrl || fullUrl || thumbUrl || urlField;
          if (displayUrl) {
            out.push({
              url: displayUrl,                         // feed card
              thumb: thumbUrl || feedUrl || fullUrl || urlField,  // small preview
              feed: feedUrl || fullUrl || thumbUrl || urlField,   // feed image
              full: fullUrl || feedUrl || thumbUrl || urlField,   // ✅ full now prefers feed too
              kind: guessKind(displayUrl, parsedItem.type),
            });
          }
        }
      });

      if (out.length > 0) return out;
    }

    // ✅ STEP 2: Fallback to media_urls
    const rawUrls = safeParseArray(p?.media_urls);
    const rawTypes = safeParseArray(p?.media_types);

    if (rawUrls.length > 0) {
      if (rawUrls.length === 2) {
        const k0 = guessKind(rawUrls[0], rawTypes[0]);
        const k1 = guessKind(rawUrls[1], rawTypes[1]);
        if (k0 === 'video' && (k1 === 'image' || rawTypes[1] === 'image' || !rawUrls[1].match(/\.(mp4|webm|mov|m4v)/i))) {
          out.push({
            url: rawUrls[0],
            thumb: rawUrls[1],
            feed: rawUrls[0],
            full: rawUrls[0],
            kind: 'video',
          });
          return out;
        }
      }

      rawUrls.forEach((url: string, i: number) => {
        const cleanUrl = String(url || '').trim();
        if (cleanUrl) {
          out.push({
            url: cleanUrl,
            thumb: cleanUrl,
            feed: cleanUrl,
            full: cleanUrl,
            kind: guessKind(cleanUrl, rawTypes[i]),
          });
        }
      });
    }

    // ✅ STEP 2.5: Fallback to images array
    if (!out.length) {
      const rawImages = safeParseArray(p?.images);
      if (rawImages.length > 0) {
        rawImages.forEach((img: any) => {
          const u =
            typeof img === 'string'
              ? img.trim()
              : String(img?.feed || img?.full || img?.url || img?.thumb || '').trim();
          if (u && u !== '[object Object]' && u !== 'null' && u !== 'undefined') {
            out.push({
              url: u,
              thumb: u,
              feed: u,
              full: u,
              kind: guessKind(u),
            });
          }
        });
      }
    }

    // ✅ STEP 3: Fallback to media array or video_url/feed_url
    if (!out.length && Array.isArray(p?.media) && p.media.length > 0) {
      p.media.forEach((item: any) => {
        const u = String(item?.feed || item?.full || item?.url || item?.thumb || '').trim();
        if (u) {
          out.push({
            url: u,
            thumb: String(item?.thumb || u),
            feed: String(item?.feed || u),
            full: String(item?.full || u),
            kind: guessKind(u, item?.type || p?.media_type),
          });
        }
      });
    }

    if (!out.length && p?.video_url) {
      const v = String(p.video_url).trim();
      if (v) {
        out.push({
          url: v,
          thumb: p?.thumb_url || v,
          feed: v,
          full: v,
          kind: 'video',
        });
      }
    }

    if (!out.length && p?.feed_url) {
      const f = String(p.feed_url).trim();
      if (f) {
        out.push({
          url: f,
          thumb: p?.thumb_url || f,
          feed: f,
          full: f,
          kind: guessKind(f, p?.media_type),
        });
      }
    }

    // ✅ STEP 4: Fallback to single media_url
    if (!out.length && p?.media_url) {
      const single = String(p.media_url).trim();
      if (single) {
        out.push({
          url: single,
          thumb: single,
          feed: single,
          full: single,
          kind: guessKind(single, p?.media_type),
        });
      }
    }
  } catch (error) {
    console.warn('Failed to parse post media:', error);
    if (p?.media_url) {
      const single = String(p.media_url).trim();
      if (single) {
        out.push({
          url: single,
          thumb: single,
          feed: single,
          full: single,
          kind: guessKind(single, p?.media_type),
        });
      }
    }
  }

  return out;
};

type MediaOrientation = 'portrait' | 'landscape' | 'square';

const getOrientation = (item: {
  width?: number;
  height?: number;
}): MediaOrientation => {
  const w = Number(item?.width || 0);
  const h = Number(item?.height || 0);

  if (!w || !h) return 'square';

  const ratio = w / h;

  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.87) return 'portrait';
  return 'square';
};

const classifyOrientations = (
  media: { width?: number; height?: number }[]
): MediaOrientation[] => media.map(getOrientation);
    
  //===========GET STORY MEDIA LIST======

const getStoryMediaList = (story: any) => {
  const out: Array<{
    url: string;
    thumb?: string;
    feed?: string;
    full?: string;
    kind: 'image' | 'video' | 'audio';
  }> = [];

  const guessKind = (url: string, explicitType?: string) => {
    const t = String(explicitType || '').toLowerCase();
    const u = String(url || '').toLowerCase();

    if (t.includes('video') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return 'video';
    if (t.includes('audio') || /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(u)) return 'audio';
    return 'image';
  };

  const safeParseArray = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  try {
    const metaItems = safeParseArray(story?.media_meta);

    if (metaItems.length > 0) {
      metaItems.forEach((item: any) => {
        let parsedItem = item;

        if (typeof item === 'string') {
          try {
            parsedItem = JSON.parse(item);
          } catch {
            parsedItem = null;
          }
        }

        if (parsedItem && typeof parsedItem === 'object') {
          const thumbUrl = String(parsedItem.thumb || parsedItem.thumbnail_url || '').trim();
          const feedUrl = String(parsedItem.feed || parsedItem.feed_url || '').trim();
          const fullUrl = String(parsedItem.full || parsedItem.full_url || '').trim();

          const displayUrl = feedUrl || fullUrl || thumbUrl;

          if (displayUrl) {
            out.push({
              url: displayUrl,
              thumb: thumbUrl || feedUrl || fullUrl,
              feed: feedUrl || fullUrl || thumbUrl,
              full: fullUrl || feedUrl || thumbUrl,
              kind: guessKind(displayUrl, parsedItem.type || story?.type),
            });
          }
        }
      });

      if (out.length > 0) return out;
    }

    const urls = safeParseArray(story?.media_urls);
    const types = safeParseArray(story?.media_types);

    if (urls.length > 0) {
      urls.forEach((url: string, i: number) => {
        const cleanUrl = String(url || '').trim();
        if (cleanUrl) {
          out.push({
            url: cleanUrl,
            thumb: cleanUrl,
            feed: cleanUrl,
            full: cleanUrl,
            kind: guessKind(cleanUrl, types[i] || story?.type),
          });
        }
      });
    }

    if (!out.length && story?.media_url) {
      const single = String(story.media_url).trim();
      if (single) {
        out.push({
          url: single,
          thumb: single,
          feed: single,
          full: single,
          kind: guessKind(single, story?.type),
        });
      }
    }
  } catch (error) {
    console.warn('Failed to parse story media:', error);

    if (story?.media_url) {
      const single = String(story.media_url).trim();
      if (single) {
        out.push({
          url: single,
          thumb: single,
          feed: single,
          full: single,
          kind: guessKind(single, story?.type),
        });
      }
    }
  }

  return out;
};    

    
// ==================== PROGRESSIVE TILE IMAGE (PROFESSIONAL UNERA DATA SAVING) ====================
// - Outside 3 posts: 0kb downloaded, stable background placeholder (no layout shift/shake)
// - ~3 posts before screen: thumbnail downloaded
// - ~1 post before screen: full feed image downloaded & smoothly applied
// - Cached images: instant load, never redownload once downloaded
const ProgressiveTileImage = memo(
  ({
    item,
    className,
  }: {
    item: { url: string; thumb?: string; feed?: string; full?: string; width?: number; height?: number };
    className: string;
  }) => {
    const thumbSrc = item.thumb || '';
    const feedSrc = item.feed || item.full || item.url || '';
    const fullSrc = item.full || item.feed || item.url || '';
    const fallbackSrc = item.url || '';

    // Check if feed image or thumbnail is already in local/memory cache
    const feedCached = imageCache.isCached(feedSrc) || imageCache.isCached(fullSrc) || imageCache.isCached(fallbackSrc);
    const thumbCached = imageCache.isCached(thumbSrc);

    const [stage, setStage] = useState<'idle' | 'thumb' | 'feed'>(() => {
      if (feedCached) return 'feed';
      if (thumbCached) return 'thumb';
      return 'idle';
    });

    const [activeSrc, setActiveSrc] = useState<string>(() => {
      if (feedCached) return feedSrc || fullSrc || fallbackSrc;
      if (thumbCached) return thumbSrc;
      return '';
    });

    const [isLoaded, setIsLoaded] = useState<boolean>(() => feedCached);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      // If already feed loaded and active, nothing to do
      if (stage === 'feed' && isLoaded && activeSrc) return;

      if (imageCache.isCached(feedSrc) || imageCache.isCached(fullSrc)) {
        const resolved = feedSrc || fullSrc || fallbackSrc;
        setStage('feed');
        setActiveSrc(resolved);
        setIsLoaded(true);
        return;
      }

      const el = containerRef.current;
      if (!el) return;

      // STAGE 2 OBSERVER (~1 post ahead / on screen -> Download feed image)
      const unobserveFeed = observeForFeed(el, () => {
        setStage('feed');
        const targetFeed = feedSrc || fullSrc || fallbackSrc;
        if (targetFeed) {
          const img = new Image();
          img.src = targetFeed;
          img.onload = () => {
            imageCache.markCached(targetFeed);
            setActiveSrc(targetFeed);
            setIsLoaded(true);
          };
          img.onerror = () => {
            setActiveSrc(targetFeed);
            setIsLoaded(true);
          };
        }
      });

      // If already in thumb or feed stage, we only wait for feed observer
      if (stage !== 'idle') {
        return () => {
          unobserveFeed();
        };
      }

      // STAGE 1 OBSERVER (~3 posts ahead -> Download thumbnail)
      const unobserveThumb = observeForThumbnail(el, () => {
        setStage((prev) => (prev === 'idle' ? 'thumb' : prev));
        const targetThumb = thumbSrc || feedSrc || fallbackSrc;
        if (targetThumb) {
          const img = new Image();
          img.src = targetThumb;
          img.onload = () => {
            imageCache.markCached(targetThumb);
            setActiveSrc((current) => current || targetThumb);
          };
          img.onerror = () => {
            setActiveSrc((current) => current || targetThumb);
          };
        }
      });

      return () => {
        unobserveThumb();
        unobserveFeed();
      };
    }, [feedSrc, fullSrc, thumbSrc, fallbackSrc, stage, activeSrc, isLoaded]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-[#162032]"
      >
        {/* Subtle placeholder icon while 0kb idle */}
        {(!activeSrc || !isLoaded) && (
          <div className="absolute inset-0 bg-[#162032] flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-[#1E293B]/50 flex items-center justify-center">
              <i className="fas fa-image text-[#334155] text-xs" />
            </div>
          </div>
        )}

        {/* The Image element: 0kb download when idle, thumbnail at 3 posts, feed at 1 post */}
        {activeSrc && (
          <img
            src={activeSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className={`${className} transition-opacity duration-300 ease-out ${
              isLoaded ? 'opacity-100' : 'opacity-75'
            }`}
            onLoad={() => {
              imageCache.markCached(activeSrc);
              setIsLoaded(true);
            }}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (stage === 'thumb' && feedSrc && target.src !== feedSrc) {
                target.src = feedSrc;
                return;
              }
              if (fallbackSrc && target.src !== fallbackSrc) {
                target.src = fallbackSrc;
                return;
              }
              target.style.opacity = '0';
            }}
          />
        )}
      </div>
    );
  }
);
    
// ==================== MEDIA GRID ====================
const MediaGrid = memo(
  ({
    media,
    onOpen,
  }: {
    media: {
      url: string;
      thumb?: string;
      feed?: string;
      full?: string;
      width?: number;
      height?: number;
    }[];
    onOpen: (url: string, index: number) => void;
  }) => {
    const total = Array.isArray(media) ? media.length : 0;

    const visible =
      total <= 4
        ? media
        : total === 5
        ? media.slice(0, 5)
        : media.slice(0, 6);

    const extra = total <= 5 ? 0 : total === 6 ? 0 : total - 6;

    const orientations = classifyOrientations(visible);

    const Tile = ({
      item,
      index,
      className,
      showOverlay = false,
    }: {
      item: { url: string; thumb?: string; feed?: string; full?: string };
      index: number;
      className: string;
      showOverlay?: boolean;
    }) => (
      <button
        type="button"
        key={`${item.full || item.feed || item.thumb || item.url}-${index}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item.full || item.feed || item.thumb || item.url, index);
        }}
        className={`relative overflow-hidden bg-[#162032] ${className}`}
        style={{ borderRadius: 0 }}
      >
        <ProgressiveTileImage
          item={item}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {showOverlay && extra > 0 && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center pointer-events-none">
            <span className="text-white font-bold text-[34px] leading-none">
              +{extra}
            </span>
          </div>
        )}
      </button>
    );

    if (total === 0) return null;

    // Single image layout - edge-to-edge with natural aspect ratio container to prevent layout shifts
    if (total === 1) {
      const item = visible[0];
      const hasDimensions = Boolean(item.width && item.height && item.width > 0 && item.height > 0);
      const aspectStyle = hasDimensions
        ? { aspectRatio: `${item.width} / ${item.height}` }
        : undefined;

      return (
        <div className="w-full bg-[#050B18] overflow-hidden flex justify-center p-0 m-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(
                item.full || item.feed || item.thumb || item.url,
                0
              );
            }}
            className="w-full block focus:outline-none relative bg-[#162032] p-0 m-0 overflow-hidden"
            style={aspectStyle}
          >
            <ProgressiveTileImage
              item={item}
              className="w-full h-auto object-contain mx-auto block p-0 m-0"
            />
          </button>
        </div>
      );
    }

    // 2 images layout
    if (total === 2) {
      return (
        <div className="w-full grid grid-cols-2 gap-[2px] bg-black">
          <Tile item={visible[0]} index={0} className="h-[320px] w-full" />
          <Tile item={visible[1]} index={1} className="h-[320px] w-full" />
        </div>
      );
    }

    // 3 images layout
    if (total === 3) {
      return (
        <div className="w-full grid grid-cols-2 gap-[2px] bg-black">
          <Tile item={visible[0]} index={0} className="h-[420px] w-full" />
          <div className="grid grid-rows-2 gap-[2px] h-[420px]">
            <Tile item={visible[1]} index={1} className="w-full h-full" />
            <Tile item={visible[2]} index={2} className="w-full h-full" />
          </div>
        </div>
      );
    }

    // 4 images layout
    if (total === 4) {
      return (
        <div className="w-full grid grid-cols-2 gap-[2px] bg-black">
          <Tile item={visible[0]} index={0} className="h-[260px] w-full" />
          <Tile item={visible[1]} index={1} className="h-[260px] w-full" />
          <Tile item={visible[2]} index={2} className="h-[260px] w-full" />
          <Tile item={visible[3]} index={3} className="h-[260px] w-full" />
        </div>
      );
    }

    // 5 images layout
    if (total === 5) {
      return (
        <div className="w-full bg-black">
          <div className="grid grid-cols-2 gap-[2px] mb-[2px]">
            <Tile item={visible[0]} index={0} className="h-[250px] w-full" />
            <Tile item={visible[1]} index={1} className="h-[250px] w-full" />
          </div>

          <div className="grid grid-cols-3 gap-[2px]">
            <Tile item={visible[2]} index={2} className="h-[170px] w-full" />
            <Tile item={visible[3]} index={3} className="h-[170px] w-full" />
            <Tile
              item={visible[4]}
              index={4}
              className="h-[170px] w-full"
              showOverlay={extra > 0}
            />
          </div>
        </div>
      );
    }

    // Smart 6-image layout
    if (total >= 6) {
      const first = orientations[0];
      const second = orientations[1];
      const third = orientations[2];

      const topPortraitPair = first === 'portrait' && second === 'portrait';
      const firstLandscape = first === 'landscape' || second === 'landscape';
      const tallLeft = third === 'portrait';

      // Layout A
      if (tallLeft) {
        return (
          <div className="w-full bg-black">
            <div className="grid grid-cols-2 gap-[2px] mb-[2px]">
              <Tile item={visible[0]} index={0} className="h-[250px] w-full" />
              <Tile item={visible[1]} index={1} className="h-[250px] w-full" />
            </div>

            <div className="grid grid-cols-2 gap-[2px]">
              <Tile item={visible[2]} index={2} className="h-[340px] w-full" />
              <div className="grid grid-rows-3 gap-[2px] h-[340px]">
                <Tile item={visible[3]} index={3} className="w-full h-full" />
                <Tile item={visible[4]} index={4} className="w-full h-full" />
                <Tile
                  item={visible[5]}
                  index={5}
                  className="w-full h-full"
                  showOverlay={extra > 0}
                />
              </div>
            </div>
          </div>
        );
      }

      // Layout B
      if (firstLandscape || !topPortraitPair) {
        return (
          <div className="w-full bg-black">
            <div className="grid grid-cols-2 gap-[2px] mb-[2px]">
              <Tile item={visible[0]} index={0} className="h-[230px] w-full" />
              <Tile item={visible[1]} index={1} className="h-[230px] w-full" />
            </div>

            <div className="grid grid-cols-2 gap-[2px]">
              <Tile item={visible[2]} index={2} className="h-[170px] w-full" />
              <Tile item={visible[3]} index={3} className="h-[170px] w-full" />
              <Tile item={visible[4]} index={4} className="h-[170px] w-full" />
              <Tile
                item={visible[5]}
                index={5}
                className="h-[170px] w-full"
                showOverlay={extra > 0}
              />
            </div>
          </div>
        );
      }

      // Layout C
      return (
        <div className="w-full bg-black">
          <div className="grid grid-cols-2 gap-[2px] mb-[2px]">
            <Tile item={visible[0]} index={0} className="h-[320px] w-full" />
            <div className="grid grid-rows-2 gap-[2px] h-[320px]">
              <Tile item={visible[1]} index={1} className="w-full h-full" />
              <Tile item={visible[2]} index={2} className="w-full h-full" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-[2px]">
            <Tile item={visible[3]} index={3} className="h-[150px] w-full" />
            <Tile item={visible[4]} index={4} className="h-[150px] w-full" />
            <Tile
              item={visible[5]}
              index={5}
              className="h-[150px] w-full"
              showOverlay={extra > 0}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="w-full grid grid-cols-3 gap-[2px] bg-black">
        <Tile item={visible[0]} index={0} className="h-[180px] w-full" />
        <Tile item={visible[1]} index={1} className="h-[180px] w-full" />
        <Tile item={visible[2]} index={2} className="h-[180px] w-full" />
        <Tile item={visible[3]} index={3} className="h-[180px] w-full" />
        <Tile item={visible[4]} index={4} className="h-[180px] w-full" />
        <Tile
          item={visible[5]}
          index={5}
          className="h-[180px] w-full"
          showOverlay={extra > 0}
        />
      </div>
    );
  },
  (prev, next) => prev.media === next.media
);
              
              
// ==================== GROUP POST HEADER (internal) ====================
const GroupPostHeader = memo(
  ({
    post,
    group,
    author,
    groups = [],
    onOpenGroup,
    onOpenProfile,
    onOpenMenu,
  }: {
    post: any;
    group?: any;
    author?: any;
    groups?: any[];
    onOpenGroup?: (groupId: number) => void;
    onOpenProfile?: (userId: number) => void;
    onOpenMenu?: () => void;
  }) => {
    const rawGroupId = Number(
      group?.id ||
      post?.group_id ||
      post?.groupId ||
      post?.meta?.group_id ||
      post?.meta?.groupId ||
      0
    );
    const rawGroupName = safeStr(
      group?.name ||
      post?.group_name ||
      post?.groupName ||
      post?.meta?.group_name ||
      post?.meta?.groupName
    );
    const matchedGroup = group || (rawGroupId ? groups.find((g: any) => g.id === rawGroupId) : (rawGroupName ? groups.find((g: any) => g.name?.toLowerCase() === rawGroupName.toLowerCase()) : undefined));
    const groupId = rawGroupId || matchedGroup?.id || 0;
    const groupName = rawGroupName || matchedGroup?.name || 'Group';
    const isGroupVerified = Boolean(group?.is_verified || matchedGroup?.is_verified || post?.is_group_verified);

    const userName = safeStr(author?.name || post?.name || post?.username);
    const userId = Number(author?.id || post?.user_id || 0);
    const groupImg =
      safeStr(
        group?.profile_image || group?.avatar || group?.image || matchedGroup?.profile_image || matchedGroup?.avatar || post?.group_image
      ) || '';
    const userImg =
      safeStr(author?.profile_image_url || author?.avatar || post?.profile_image_url) ||
      '';
    const timeAgo = formatRelativeTime(post?.created_at);

    return (
      <div className="flex items-start justify-between px-3 pt-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            className="relative shrink-0 cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenGroup) onOpenGroup(groupId || 0);
            }}
            title={groupName}
          >
            <div className="w-10 h-10 rounded-full bg-[#1E293B] overflow-hidden flex items-center justify-center border border-[#334155] group-hover:border-[#1877F2] transition-colors">
              {groupImg ? (
                <img src={groupImg} className="w-full h-full object-cover" />
              ) : (
                <i className="fas fa-users text-[#94A3B8]" />
              )}
            </div>

            <div className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-[#1E293B] overflow-hidden border-2 border-[#0B1120] flex items-center justify-center">
              {userImg ? (
                <img src={userImg} className="w-full h-full object-cover" />
              ) : (
                <i className="fas fa-user text-[10px] text-[#94A3B8]" />
              )}
            </div>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                className="text-left font-extrabold text-[21px] leading-[1.1] text-[#E4E6EB] truncate hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenGroup) onOpenGroup(groupId || 0);
                }}
                title={`Open ${groupName}`}
              >
                {groupName}
              </button>
              {isGroupVerified && (
                <VerifiedBadge size={21} className="shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-2 text-[15px] text-[#B0B3B8] min-w-0 mt-0.5">
              <button
                className="font-semibold text-[17.5px] text-[#CBD5E1] hover:text-white hover:underline truncate cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (userId && onOpenProfile) onOpenProfile(userId);
                }}
              >
                {userName || 'User'}
              </button>

              <span>·</span>
              <span className="truncate">{timeAgo}</span>

              <span>·</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenGroup) onOpenGroup(groupId || 0);
                }}
                className="hover:text-white transition-colors"
                title="Open Group"
              >
                <i className="fas fa-users text-[14px]" />
              </button>
            </div>
          </div>
        </div>

        {/* Right menu - Will be handled by PostMenu component */}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.post?.id === next.post?.id &&
      prev.group?.id === next.group?.id &&
      prev.author?.id === next.author?.id
    );
  }
);

// ==================== EXPANDABLE RICH TEXT (internal) ====================
export const ExpandableRichText = memo(
  ({
    text,
    users,
    onProfileClick,
    onHashtagClick,
    maxWords = 14,
    fontSizePx = 23,
    forceExpanded = false,
  }: {
    text: string;
    users?: User[];
    onProfileClick: (id: number) => void;
    onHashtagClick?: (tag: string) => void;
    maxWords?: number;
    fontSizePx?: number;
    forceExpanded?: boolean;
  }) => {
    const [expanded, setExpanded] = useState(false);

    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    const isLong = words.length > maxWords;

    const showAll = forceExpanded || expanded || !isLong;
    const shownText = showAll
      ? text
      : words.slice(0, maxWords).join(' ') + '…';

    return (
      <div
        style={{ fontSize: `${fontSizePx}px` }}
        className="text-[#E4E6EB] leading-relaxed"
      >
        <RichText
          text={shownText}
          users={users}
          onProfileClick={onProfileClick}
          onHashtagClick={onHashtagClick}
        />

        {isLong && !forceExpanded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="ml-2 font-bold text-[#1877F2] hover:text-[#38BDF8] hover:underline text-[19px] transition-colors inline-flex items-center cursor-pointer"
            style={{ fontSize: '19px' }}
          >
            {expanded ? 'See Less' : 'See More'}
          </button>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.text === next.text &&
      prev.forceExpanded === next.forceExpanded &&
      prev.users === next.users
    );
  }
);

// ==================== RICH TEXT (exported) ====================
export const RichText = ({
  text,
  users,
  onProfileClick,
  onHashtagClick,
}: {
  text: string;
  users?: User[];
  onProfileClick: (id: number) => void;
  onHashtagClick?: (tag: string) => void;
}) => {
  if (!text) return null;
  const parts = text.split(/(#[a-zA-Z0-9_]+|@\w+(?:\s\w+)?)/g);

  return (
    <span className="leading-relaxed text-[#E4E6EB] whitespace-pre-wrap break-words text-[23px]">
      {parts.map((part, index) => {
        if (part.startsWith('@')) {
          const name = part.substring(1).trim().toLowerCase();
          const user = users?.find((u: any) => {
            const un = String(u?.username ?? '').toLowerCase();
            const nm = String(u?.name ?? '').toLowerCase();
            return un === name || nm === name;
          });

          if (user) {
            return (
              <span
                key={index}
                className="text-[#1877F2] font-semibold cursor-pointer hover:underline text-[23px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onProfileClick(safeUserId(user));
                }}
              >
                {part}
              </span>
            );
          }

          return (
            <span
              key={index}
              className="text-[#1877F2] font-semibold text-[23px]"
            >
              {part}
            </span>
          );
        }

        if (part.startsWith('#')) {
          return (
            <span
              key={index}
              className="text-[#1877F2] cursor-pointer hover:underline text-[23px]"
              onClick={(e) => {
                e.stopPropagation();
                onHashtagClick && onHashtagClick(part);
              }}
            >
              {part}
            </span>
          );
        }

        return <span key={index} className="text-[23px]">{part}</span>;
      })}
    </span>
  );
};

/**
 * =========================
 * ✅ EVENT POST
 * =========================
 */
export const EventPost = memo(
  ({
    event,
    author,
    currentUser,
    users = [],
    onProfileClick,
    onRSVP,
    onFollow,
    isFollowing = false,
    followLoading = false,
    onReact,
    onShare,
    onOpenComments,
    groups = [],
    brands = [],
    chats = [],
    onEventClick,
    onDelete,
    onEdit,
  }: {
    event: any;
    author?: any;
    currentUser: User | null;
    users?: User[];
    onProfileClick: (id: number) => void;
    onRSVP?: (eventId: number, status: 'going' | 'interested' | 'not_going') => Promise<any>;
    onFollow?: (id: number) => void;
    isFollowing?: boolean;
    followLoading?: boolean;
    onReact?: (post: PostType, type: ReactionType) => void;
    onShare?: (id: number, newShareCount: number) => void;
    onOpenComments?: (post: PostType) => void;
    groups?: Group[];
    brands?: Brand[];
    chats?: any[];
    onEventClick?: (eventId: number) => void;
    onDelete?: (id: number) => void;
    onEdit?: (id: number, text: string) => void;
  }) => {
    const [rsvpStatus, setRsvpStatus] = useState(event.user_rsvp_status || '');
    const [attendeesCount, setAttendeesCount] = useState(
      event.attendees_count || 0
    );
    const [interestedCount, setInterestedCount] = useState(
      event.interested_count || 0
    );
    const [loading, setLoading] = useState(false);
    const [showShareSheet, setShowShareSheet] = useState(false);
    const [showEventPreviewModal, setShowEventPreviewModal] = useState(false);
    const [showReactionsSheet, setShowReactionsSheet] = useState(false);

    const [reactionCount, setReactionCount] = useState<number>(() =>
      Number(
        event.reactions_count ??
        event.reactionsCount ??
        event.likes_count ??
        (Array.isArray(event.reactions) ? event.reactions.length : 0)
      )
    );
    const [myReaction, setMyReaction] = useState<ReactionType | undefined>(() =>
      (event.my_reaction || event.myReaction || event.user_reaction || undefined) as ReactionType
    );
    const [commentCount, setCommentCount] = useState<number>(() =>
      Number(
        event.comments_count ??
        event.comment_count ??
        (Array.isArray(event.comments) ? event.comments.length : 0)
      )
    );
    const [shareCount, setShareCount] = useState<number>(() =>
      Number(event.shares_count ?? event.shares ?? 0)
    );

    const [reactionsArr, setReactionsArr] = useState<any[]>(() => {
      if (Array.isArray(event.reactions) && event.reactions.length > 0) return event.reactions;
      if (Array.isArray(event.reactions_preview) && event.reactions_preview.length > 0) return event.reactions_preview;
      return [];
    });

    const reactorNameFromApi = String(event.reactor_name ?? event.reactorName ?? '').trim();

    useEffect(() => {
      if (Array.isArray(event.reactions) && event.reactions.length > 0) setReactionsArr(event.reactions);
      else if (Array.isArray(event.reactions_preview) && event.reactions_preview.length > 0) setReactionsArr(event.reactions_preview);
    }, [event.reactions, event.reactions_preview]);

    useEffect(() => {
      const eventId = Number(event.event_id || event.id || 0);
      if (!eventId) return;
      let isMounted = true;
      const vId = safeUserId(currentUser);
      apiFetch(`/api/events/${eventId}/reactions?viewerId=${vId}`)
        .then((data: any) => {
          if (!isMounted) return;
          if (data?.success) {
            if (Array.isArray(data.reactions) && data.reactions.length > 0) {
              setReactionsArr(data.reactions);
            }
            if (typeof data.reactions_count === 'number') {
              setReactionCount(data.reactions_count);
            }
            if (vId > 0 && data.my_reaction !== undefined) {
              setMyReaction((data.my_reaction || undefined) as ReactionType);
            }
            if (typeof data.comments_count === 'number') {
              setCommentCount(data.comments_count);
            }
            if (typeof data.shares_count === 'number') {
              setShareCount(data.shares_count);
            }
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }, [event.id, event.event_id, currentUser?.id]);

    const finalMyReaction: ReactionType | undefined =
      myReaction ||
      (currentUser && reactionsArr.length
        ? (reactionsArr.find(
            (r: any) => Number(r.user_id) === safeUserId(currentUser)
          )?.type as ReactionType)
        : undefined) ||
      ((event.my_reaction || event.myReaction) as ReactionType);

    const finalReactionCount = Math.max(
      reactionCount,
      Number(event.reactions_count ?? event.reactionsCount ?? event.likes_count ?? 0),
      reactionsArr.length
    );

    const emojiList = useMemo(() => {
      const types = Array.from(
        new Set(
          reactionsArr.map((r: any) =>
            String(r.type || r.reaction || '').toLowerCase()
          )
        )
      ).filter(Boolean);
      if (types.length) {
        return types.slice(0, 3).map((t) => reactionEmoji(String(t)));
      }
      return finalReactionCount > 0 ? ['👍'] : [];
    }, [reactionsArr, finalReactionCount]);

    const reactorName = useMemo(() => {
      const eventId = Number(event.event_id || event.id || 0);
      if (!finalReactionCount) return '';
      if (reactionsArr.length) {
        const name = pickStableReactorName(eventId, reactionsArr, users);
        return String(name || '').trim();
      }
      return reactorNameFromApi;
    }, [event.event_id, event.id, finalReactionCount, reactionsArr, users, reactorNameFromApi]);

    const reactionText = useMemo(() => {
      if (!finalReactionCount) return '';
      if (reactorName) {
        return formatReactionText(finalReactionCount, reactorName);
      }
      return `${fmtCount(finalReactionCount)} ${finalReactionCount === 1 ? 'Reaction' : 'Reactions'}`;
    }, [finalReactionCount, reactorName]);

    useEffect(() => {
      const serverReactions = Number(
        event.reactions_count ??
        event.reactionsCount ??
        event.likes_count ??
        0
      );
      if (serverReactions > 0 || event.reactions_count !== undefined) {
        setReactionCount(serverReactions);
      }
      if (event.my_reaction !== undefined && event.my_reaction !== null) {
        setMyReaction((event.my_reaction || undefined) as ReactionType);
      } else if (event.myReaction !== undefined && event.myReaction !== null) {
        setMyReaction((event.myReaction || undefined) as ReactionType);
      }
      if (typeof event.comments_count === 'number') {
        setCommentCount(event.comments_count);
      } else if (typeof event.comment_count === 'number') {
        setCommentCount(event.comment_count);
      } else if (Array.isArray(event.comments)) {
        setCommentCount(event.comments.length);
      }
      if (typeof event.shares_count === 'number') {
        setShareCount(event.shares_count);
      } else if (typeof event.shares === 'number') {
        setShareCount(event.shares);
      }
      if (Array.isArray(event.reactions) && event.reactions.length > 0) {
        setReactionsArr(event.reactions);
      } else if (Array.isArray(event.reactions_preview) && event.reactions_preview.length > 0) {
        setReactionsArr(event.reactions_preview);
      }
    }, [
      event.reactions_count,
      event.reactionsCount,
      event.likes_count,
      event.reactions,
      event.reactions_preview,
      event.my_reaction,
      event.myReaction,
      event.comments_count,
      event.comment_count,
      event.comments,
      event.shares_count,
      event.shares,
    ]);

    const creator =
      author ||
      users?.find((u) => Number(u.id) === Number(event.creator_id)) ||
      event.creator || {
        id: event.creator_id,
        name: 'Event Organizer',
        username: '',
        profile_image_url: null,
      };

    const dateObj = event.event_date ? toDateSafe(event.event_date) : null;
    const nowLocal = new Date();
    const isPast = !!dateObj && dateObj < nowLocal;

    const formatEventDate = () => {
      if (!dateObj) return 'Date TBD';
      if (dateObj.toDateString() === nowLocal.toDateString()) return 'Today';
      const tomorrow = new Date(nowLocal);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (dateObj.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    };

    const formatEventTime = () => {
      if (!dateObj) return '';
      return dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const handleRSVPClick = async (target: 'going' | 'interested') => {
      if (!currentUser) {
        alert('Please login to RSVP');
        return;
      }
      if (!event.id) return;

      setLoading(true);

      const prevStatus = rsvpStatus;
      const nextStatus: '' | 'going' | 'interested' =
        prevStatus === target ? '' : target;

      const prevAtt = attendeesCount;
      const prevInt = interestedCount;

      let nextAtt = prevAtt;
      let nextInt = prevInt;

      if (target === 'going') {
        if (prevStatus === 'going') nextAtt = Math.max(0, prevAtt - 1);
        else if (prevStatus === 'interested') {
          nextAtt = prevAtt + 1;
          nextInt = Math.max(0, prevInt - 1);
        } else nextAtt = prevAtt + 1;
      } else {
        if (prevStatus === 'interested') nextInt = Math.max(0, prevInt - 1);
        else if (prevStatus === 'going') {
          nextInt = prevInt + 1;
          nextAtt = Math.max(0, prevAtt - 1);
        } else nextInt = prevInt + 1;
      }

      setRsvpStatus(nextStatus);
      setAttendeesCount(nextAtt);
      setInterestedCount(nextInt);

      try {
        let res;
        if (onRSVP) {
          await onRSVP(event.id, (nextStatus || 'not_going') as any);
          res = { success: true };
        } else {
          res = await rsvpEventDirect({
            eventId: event.id,
            userId: safeUserId(currentUser),
            newStatus: (nextStatus || 'not_going') as any,
            prevStatus: prevStatus as any,
          });
        }

        if (res?.success) {
          if (res.attending_count !== undefined) {
            setAttendeesCount(Number(res.attending_count));
          }
          if (res.interested_count !== undefined) {
            setInterestedCount(Number(res.interested_count));
          }
          if (res.my_status !== undefined) {
            setRsvpStatus(res.my_status);
          }
        }
      } catch (error) {
        setRsvpStatus(prevStatus);
        setAttendeesCount(prevAtt);
        setInterestedCount(prevInt);
        console.error('RSVP failed:', error);
        alert('Failed to RSVP. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const handleFollowClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (onFollow && creator?.id) onFollow(safeUserId(creator));
    };

    const getReactionEndpoint = () =>
      event.id ? `/api/events/${event.id}/react` : null;

    const handleReact = async (type: ReactionType) => {
      if (!currentUser) {
        alert('Please login to react');
        return;
      }
      const eventId = Number(event.event_id || event.id || 0);
      if (!eventId) return;

      const prevReaction = myReaction;
      const prevCount = reactionCount;
      const isRemoving = prevReaction === type;
      const nextReaction = isRemoving ? undefined : type;
      const nextCount = isRemoving
        ? Math.max(0, prevCount - 1)
        : !prevReaction
        ? prevCount + 1
        : prevCount;

      setMyReaction(nextReaction);
      setReactionCount(nextCount);

      setReactionsArr((prev) => {
        const myUid = safeUserId(currentUser);
        const filtered = prev.filter((r) => Number(r.user_id || r.userId || r.user?.id) !== myUid);
        if (!isRemoving && nextReaction) {
          return [
            {
              user_id: myUid,
              type: nextReaction,
              user: currentUser,
              name: currentUser.name || currentUser.username || 'You',
            },
            ...filtered,
          ];
        }
        return filtered;
      });

      const eventAsPost = {
        ...event,
        id: eventId,
        event_id: eventId,
        source: 'event',
        item_type: 'event',
        type: 'event',
        post_type: 'event',
        kind: 'event',
        reactions_count: nextCount,
        my_reaction: nextReaction,
      };

      if (onReact) {
        onReact(eventAsPost as any, type);
      } else {
        try {
          const res = await apiFetch(`/api/events/${eventId}/react`, {
            method: 'POST',
            body: JSON.stringify({
              type,
              user_id: safeUserId(currentUser),
              event_id: eventId,
            }),
          });
          if (res && typeof res.reactions_count === 'number') {
            setReactionCount(Number(res.reactions_count));
          }
          if (res && res.my_reaction !== undefined) {
            setMyReaction(res.my_reaction || undefined);
          }
        } catch (error) {
          console.error('Failed to react to event:', error);
        }
      }
    };

    const handleShare = () => {
      if (!currentUser) alert('Please login to share');
      else setShowShareSheet(true);
    };

    const handleShareComplete = (destination: string, data?: any) => {
      const newShares =
        data && typeof data.shares === 'number' ? data.shares : shareCount + 1;
      setShareCount(newShares);
      if (onShare && event.id) {
        onShare(event.id, newShares);
      }
      setShowShareSheet(false);
    };

    const handleOpenComments = () => {
      if (onOpenComments) {
        const eventId = Number(event.event_id || event.id || 0);
        const eventAsPost = {
          ...event,
          id: eventId,
          event_id: eventId,
          type: 'event',
          item_type: 'event',
          post_type: 'event',
          kind: 'event',
          source: 'event',
          feed_key: `event:${eventId}`,
          comments_count: commentCount,
          reactions_count: finalReactionCount,
          reactionsCount: finalReactionCount,
          my_reaction: finalMyReaction,
          myReaction: finalMyReaction,
          shares: shareCount,
          shares_count: shareCount,
        };
        onOpenComments(eventAsPost as PostType);
      }
    };

    const handleCardClick = (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setShowEventPreviewModal(true);
    };

    return (
      <>
        <div className="w-full">
          <div
            className="bg-[#0B1120] w-full overflow-hidden cursor-pointer"
            onClick={handleCardClick}
          >
            <div
              className="p-3 md:p-4 flex items-center justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  creator?.id && onProfileClick(Number(creator.id));
                }}
              >
                <img
                  src={avatarFrom(creator)}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-[#1E293B]"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <h4 className="font-bold text-[#F8FAFC] text-[21px] truncate">
                      {creator?.name || creator?.username || 'User'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#94A3B8] text-[15px]">
                    <span>{formatRelativeTime(event.created_at)}</span>
                    <span>•</span>
                    <i className="fas fa-globe-americas text-[14px]"></i>
                    <span>• created an event</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onFollow && currentUser && creator?.id && safeUserId(creator) !== safeUserId(currentUser) && (
                  <button
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    className={`px-3 py-1.5 text-[15px] font-bold rounded-lg transition-all duration-200 ${
                      isFollowing
                        ? 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                        : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                    } ${followLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {followLoading ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : isFollowing ? (
                      'Following'
                    ) : (
                      'Follow'
                    )}
                  </button>
                )}

                <PostMenu
                  item={{
                    ...event,
                    id: event.id || event.event_id,
                    user_id: event.creator_id || event.user_id || safeUserId(creator),
                    creator_id: event.creator_id || event.user_id || safeUserId(creator),
                    type: 'event',
                    title: event.title,
                    description: event.description,
                    event_date: event.event_date,
                    location: event.location,
                    cover_url: event.cover_url,
                  }}
                  currentUser={currentUser}
                  onShare={() => setShowShareSheet(true)}
                  onDeleteSuccess={(deletedId) => {
                    onDelete?.(Number(deletedId));
                  }}
                  onEditSuccess={(updatedItem) => {
                    onEdit?.(Number(event.id || event.event_id), updatedItem.description || updatedItem.title || '');
                  }}
                />
              </div>
            </div>

            <div className="w-full pb-3" onClick={handleCardClick}>
              <div className="w-full border-y border-[#1E293B]/70 hover:border-[#1877F2]/60 overflow-hidden bg-[#050B18] transition-colors cursor-pointer group">
                {event.cover_url ? (
                  <div className="h-48 bg-[#050B18] overflow-hidden relative">
                    <img
                      src={event.cover_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className =
                            'h-48 bg-[#1f2a37] flex items-center justify-center';
                          fallback.innerHTML =
                            '<i class="fas fa-calendar text-white/30 text-5xl"></i>';
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                    {dateObj && (
                      <div className="absolute top-3 left-3 bg-[#0B1120]/90 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#1E293B]">
                        <div className="text-[#94A3B8] text-[13px] font-black">
                          {dateObj
                            .toLocaleDateString('en-US', { month: 'short' })
                            .toUpperCase()}
                        </div>
                        <div className="text-[#F8FAFC] text-[22px] font-black leading-tight">
                          {dateObj.getDate()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-32 bg-[#1f2a37] flex items-center justify-center relative">
                    <i className="fas fa-calendar text-white/30 text-5xl"></i>
                    {dateObj && (
                      <div className="absolute top-3 left-3 bg-[#0B1120]/90 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#1E293B]">
                        <div className="text-[#94A3B8] text-[13px] font-black">
                          {dateObj
                            .toLocaleDateString('en-US', { month: 'short' })
                            .toUpperCase()}
                        </div>
                        <div className="text-[#F8FAFC] text-[22px] font-black leading-tight">
                          {dateObj.getDate()}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4">
                  <div className="text-[#F8FAFC] font-black text-[22px] line-clamp-2">
                    {event.title}
                  </div>

                  {event.description && (
                    <div className="text-[#94A3B8] text-[16px] mt-1 line-clamp-2">
                      {event.description}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {event.event_date && (
                      <div className="flex items-center gap-2 text-[#94A3B8] text-[15px]">
                        <i
                          className={`fas fa-calendar-alt ${
                            isPast ? 'text-[#94A3B8]' : 'text-[#1877F2]'
                          } w-4`}
                        ></i>
                        <span>
                          {formatEventDate()} at {formatEventTime()}
                        </span>
                      </div>
                    )}
                    {event.location && (
                      <div className="flex items-center gap-2 text-[#94A3B8] text-[15px]">
                        <i className="fas fa-map-marker-alt text-[#F02849] w-4"></i>
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[#94A3B8] text-[15px]">
                      <i className="fas fa-users text-[#45BD62] w-4"></i>
                      <span>
                        {attendeesCount} attending • {interestedCount} interested
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={loading || isPast}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRSVPClick('going');
                      }}
                      className={`flex-1 h-11 rounded-lg font-bold transition-colors text-[15px] ${
                        isPast ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        rsvpStatus === 'going'
                          ? 'bg-[#45BD62] text-white'
                          : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                      } disabled:opacity-60`}
                    >
                      {loading && rsvpStatus === 'going' ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : rsvpStatus === 'going' ? (
                        '✓ Going'
                      ) : (
                        'Going'
                      )}
                    </button>

                    <button
                      disabled={loading || isPast}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRSVPClick('interested');
                      }}
                      className={`flex-1 h-11 rounded-lg font-bold transition-colors text-[15px] ${
                        isPast ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        rsvpStatus === 'interested'
                          ? 'bg-[#F7B928] text-black'
                          : 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                      } disabled:opacity-60`}
                    >
                      {loading && rsvpStatus === 'interested' ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : rsvpStatus === 'interested' ? (
                        '✓ Interested'
                      ) : (
                        'Interested'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3 md:px-4 py-2.5 flex items-center justify-between text-[#94A3B8] text-[15px] border-t border-[#1E293B]">
              <div className="flex items-center gap-2 min-h-[24px]">
                {finalReactionCount > 0 && (
                  <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReactionsSheet(true);
                    }}
                  >
                    <div className="flex -space-x-2">
                      {emojiList.slice(0, 2).map((e, i) => (
                        <span
                          key={i}
                          className="w-[24px] h-[24px] rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[16px]"
                          style={{ zIndex: 10 - i }}
                        >
                          {e}
                        </span>
                      ))}
                    </div>

                    {reactionText && (
                      <span className="text-[15px] md:text-[16px] text-[#F8FAFC] font-bold">
                        {reactionText}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <span
                  className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenComments();
                  }}
                >
                  {fmtCount(commentCount)} {commentCount === 1 ? 'Discussion' : 'Discussions'}
                </span>
                {shareCount > 0 && (
                  <span
                    className="hover:underline cursor-pointer text-[15px] md:text-[16px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShare();
                    }}
                  >
                    {fmtCount(shareCount)} {shareCount === 1 ? 'Share' : 'Shares'}
                  </span>
                )}
              </div>
            </div>

            <div
              className="px-3.5 py-2.5 border-t border-[#1E293B] flex items-center justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-4">
                <ReactionButton
                  currentUserReactions={finalMyReaction || undefined}
                  reactionCount={finalReactionCount}
                  onReact={handleReact}
                  isGuest={!currentUser}
                  postId={Number(event.event_id || event.id || 0)}
                />
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                  onClick={handleOpenComments}
                  aria-label="Discuss & Comments"
                  title="Discuss"
                >
                  <i className="far fa-comment text-[22px]"></i>
                  {commentCount > 0 && (
                    <span className="text-[14px] font-semibold text-[#F8FAFC]">
                      {fmtCount(commentCount)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                  onClick={handleShare}
                  aria-label="Share post"
                  title="Share"
                >
                  <i className="far fa-paper-plane text-[21px]"></i>
                  {shareCount > 0 && (
                    <span className="text-[14px] font-semibold text-[#F8FAFC]">
                      {fmtCount(shareCount)}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
        </div>

        {event && (
          <ShareBottomSheet
            isOpen={showShareSheet}
            onClose={() => setShowShareSheet(false)}
            post={{
              id: event.id,
              author: creator,
              content: event.title,
              description: event.description,
              media_url: event.cover_url,
              created_at: event.created_at,
              source: 'event',
              item_type: 'event',
              event_id: event.id,
            }}
            currentUser={currentUser}
            users={users}
            groups={groups}
            brands={brands}
            chats={chats}
            onShareComplete={handleShareComplete}
          />
        )}

        {showEventPreviewModal && (
          <EventCard
            event={{
              id: Number(event.id || event.event_id || 0),
              creator_id: Number(event.creator_id || event.user_id || safeUserId(creator) || 0),
              title: event.title || event.content || 'Event',
              description: event.description || event.event_description || '',
              event_date: event.event_date || event.date || '',
              location: event.location || '',
              cover_url: event.cover_url || event.image || event.media_url || '',
              visibility: (event.visibility as any) || 'worldwide',
              created_at: event.created_at || new Date().toISOString(),
              attendees_count: attendeesCount,
              interested_count: interestedCount,
              user_rsvp_status: (rsvpStatus as any) || '',
              creator: creator ? {
                id: Number(creator.id || 0),
                name: creator.name || creator.username || 'Event Organizer',
                username: creator.username || '',
                profile_image_url: creator.profile_image_url || null,
              } : undefined,
            }}
            currentUser={currentUser}
            onEventClick={() => setShowEventPreviewModal(false)}
            onProfileClick={onProfileClick}
            onRSVPUpdate={(_eventId, newStatus, newAtt, newInt) => {
              setRsvpStatus(newStatus);
              setAttendeesCount(newAtt);
              setInterestedCount(newInt);
              if (onRSVP) {
                onRSVP(Number(event.id || event.event_id), (newStatus || 'not_going') as any);
              }
            }}
            isPreview={true}
          />
        )}

        <ReactionsSheet
          isOpen={showReactionsSheet}
          onClose={() => setShowReactionsSheet(false)}
          post={{
            ...event,
            id: Number(event.event_id || event.id || 0),
            event_id: Number(event.event_id || event.id || 0),
            item_type: 'event',
            type: 'event',
            reactions_count: reactionCount,
            my_reaction: myReaction,
          }}
          onProfileClick={onProfileClick}
          onOpenComments={() => handleOpenComments()}
        />
      </>
    );
  },
  eventPostPropsEqual
);

/**
 * =========================
 * ✅ EVENT FEED CARD
 * =========================
 */
type FeedEventItem = {
  id: number;
  feed_key: string;
  item_type: 'event';
  event_id: number;
  user_id: number;
  name: string;
  username: string;
  profile_image_url: string | null;
  created_at: string;
  content: string;
  event_date?: string;
  event_description?: string;
  location?: string;
  media_url?: string | null;
  image_url?: string | null;
  cover_url?: string | null;
  attending_count?: number;
  interested_count?: number;
  my_rsvp_status?: '' | 'going' | 'interested';
};

export const EventFeedCard = memo(
  ({
    item,
    currentUser,
    onProfileClick,
    onUpdateItem,
    onRSVPEvent,
    onEventClick,
  }: {
    item: FeedEventItem;
    currentUser: { id: number } | null;
    onProfileClick: (id: number) => void;
    onUpdateItem: (patch: Partial<FeedEventItem>) => void;
    onRSVPEvent?: (eventId: number, status: 'going' | 'interested' | 'not_going') => Promise<any>;
    onEventClick?: (eventId: number) => void;
  }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showEventPreviewModal, setShowEventPreviewModal] = useState(false);

    const whenText = useMemo(() => {
      const d = item.event_date ? new Date(item.event_date) : null;
      if (!d || isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }, [item.event_date]);

    const dateObj = item.event_date ? toDateSafe(item.event_date) : null;
    const nowLocal = new Date();
    const isPast = !!dateObj && dateObj < nowLocal;

    const rsvp = async (target: 'going' | 'interested') => {
      if (!currentUser) {
        alert('Please login to RSVP');
        return;
      }
      setLoading(true);
      setError(null);

      const eventId = item.event_id || item.id;
      const prevStatus = (item.my_rsvp_status || '') as '' | 'going' | 'interested';
      const nextStatus: '' | 'going' | 'interested' =
        prevStatus === target ? '' : target;

      const prevAtt = Number(item.attending_count ?? 0);
      const prevInt = Number(item.interested_count ?? 0);

      let nextAtt = prevAtt;
      let nextInt = prevInt;

      if (target === 'going') {
        if (prevStatus === 'going') nextAtt = Math.max(0, prevAtt - 1);
        else if (prevStatus === 'interested') {
          nextAtt = prevAtt + 1;
          nextInt = Math.max(0, prevInt - 1);
        } else nextAtt = prevAtt + 1;
      } else {
        if (prevStatus === 'interested') nextInt = Math.max(0, prevInt - 1);
        else if (prevStatus === 'going') {
          nextInt = prevInt + 1;
          nextAtt = Math.max(0, prevAtt - 1);
        } else nextInt = prevInt + 1;
      }

      onUpdateItem({
        my_rsvp_status: nextStatus as any,
        attending_count: nextAtt,
        interested_count: nextInt,
      });

      try {
        let res;
        if (onRSVPEvent) {
          await onRSVPEvent(eventId, (nextStatus || 'not_going') as any);
          res = { success: true };
        } else {
          res = await rsvpEventDirect({
            eventId,
            userId: currentUser.id,
            newStatus: (nextStatus || 'not_going') as any,
            prevStatus,
          });
        }

        if (res?.success) {
          const patch: Partial<FeedEventItem> = {};
          if (res.my_status !== undefined) patch.my_rsvp_status = res.my_status;
          if (res.attending_count !== undefined)
            patch.attending_count = Number(res.attending_count);
          if (res.interested_count !== undefined)
            patch.interested_count = Number(res.interested_count);
          onUpdateItem(patch);
        }
      } catch (e: any) {
        onUpdateItem({
          my_rsvp_status: prevStatus as any,
          attending_count: prevAtt,
          interested_count: prevInt,
        });
        setError(e?.message || 'Failed to RSVP. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const my = item.my_rsvp_status || '';
    const attending = Number(item.attending_count ?? 0);
    const interested = Number(item.interested_count ?? 0);

    const handleCardClick = (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setShowEventPreviewModal(true);
    };

    return (
      <div className="w-full cursor-pointer" onClick={handleCardClick}>
        <div className="bg-[#0B1120] w-full overflow-hidden border-y border-[#1E293B]">
          <div
            className="flex items-center gap-3 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={item.profile_image_url || 'https://via.placeholder.com/40'}
              className="w-10 h-10 rounded-full object-cover cursor-pointer border border-[#1E293B]"
              alt=""
              onClick={(e) => {
                e.stopPropagation();
                onProfileClick(item.user_id);
              }}
            />
            <div className="min-w-0">
              <div className="text-[#F8FAFC] font-bold text-[21px] truncate">
                {item.name}
              </div>
              <div className="text-[#94A3B8] text-[15px]">
                {formatRelativeTime(item.created_at)} • created an event
              </div>
            </div>
          </div>

          {item.media_url ? (
            <div className="w-full h-56 bg-black overflow-hidden relative">
              <img
                src={item.media_url}
                className="w-full h-full object-cover"
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className =
                      'w-full h-56 bg-[#0B1120] flex items-center justify-center';
                    fallback.innerHTML =
                      '<i class="fas fa-calendar text-[#1877F2] text-4xl opacity-60"></i>';
                    parent.appendChild(fallback);
                  }
                }}
              />
              {dateObj && (
                <div className="absolute top-3 left-3 bg-[#0B1120]/90 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#1E293B]">
                  <div className="text-[#94A3B8] text-[13px] font-black">
                    {dateObj
                      .toLocaleDateString('en-US', { month: 'short' })
                      .toUpperCase()}
                  </div>
                  <div className="text-[#F8FAFC] text-[22px] font-black leading-tight">
                    {dateObj.getDate()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-40 bg-[#0B1120] flex items-center justify-center relative">
              <i className="fas fa-calendar text-[#1877F2] text-4xl opacity-60"></i>
              {dateObj && (
                <div className="absolute top-3 left-3 bg-[#0B1120]/90 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#1E293B]">
                  <div className="text-[#94A3B8] text-[13px] font-black">
                    {dateObj
                      .toLocaleDateString('en-US', { month: 'short' })
                      .toUpperCase()}
                  </div>
                  <div className="text-[#F8FAFC] text-[22px] font-black leading-tight">
                    {dateObj.getDate()}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-4" onClick={handleCardClick}>
            <div className="text-[#F8FAFC] font-black text-[22px] leading-tight">
              {item.content}
            </div>

            {item.event_description ? (
              <div className="text-[#94A3B8] text-[16px] mt-2 line-clamp-2">
                {item.event_description}
              </div>
            ) : null}

            <div className="mt-3 space-y-2 text-[#94A3B8] text-[15px]">
              {whenText ? (
                <div className="flex items-center gap-2">
                  <i
                    className={`fas fa-clock ${
                      isPast ? 'text-[#94A3B8]' : 'text-[#1877F2]'
                    } w-5`}
                  ></i>
                  <span>{whenText}</span>
                </div>
              ) : null}

              {item.location ? (
                <div className="flex items-center gap-2">
                  <i className="fas fa-map-marker-alt text-[#F02849] w-5"></i>
                  <span className="line-clamp-1">{item.location}</span>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <i className="fas fa-users text-[#45BD62] w-5"></i>
                <span>
                  {attending} attending • {interested} interested
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-2 text-[15px] text-red-500 bg-red-500/10 p-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                disabled={loading || isPast}
                onClick={(e) => {
                  e.stopPropagation();
                  rsvp('going');
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-[15px] disabled:opacity-60 transition-colors ${
                  isPast ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  my === 'going'
                    ? 'bg-[#45BD62] text-white hover:bg-[#3da855]'
                    : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                }`}
              >
                {loading && my === 'going' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : my === 'going' ? (
                  '✓ Going'
                ) : (
                  'Going'
                )}
              </button>

              <button
                disabled={loading || isPast}
                onClick={(e) => {
                  e.stopPropagation();
                  rsvp('interested');
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-[15px] disabled:opacity-60 transition-colors ${
                  isPast ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  my === 'interested'
                    ? 'bg-[#F7B928] text-black hover:bg-[#e5aa24]'
                    : 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                }`}
              >
                {loading && my === 'interested' ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : my === 'interested' ? (
                  '✓ Interested'
                ) : (
                  'Interested'
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="h-[10px] bg-[#050B18] border-t border-white/10" />

        {showEventPreviewModal && (
          <EventCard
            event={{
              id: Number(item.event_id || item.id || 0),
              creator_id: Number((item as any).creator_id || item.user_id || 0),
              title: (item as any).title || item.content || 'Event',
              description: (item as any).description || item.event_description || '',
              event_date: item.event_date || '',
              location: item.location || '',
              cover_url: item.image_url || (item as any).cover_url || item.media_url || '',
              visibility: 'worldwide',
              created_at: item.created_at || new Date().toISOString(),
              attendees_count: attending,
              interested_count: interested,
              user_rsvp_status: (my as any) || '',
              creator: {
                id: Number(item.user_id || 0),
                name: item.name || 'Event Organizer',
                username: '',
                profile_image_url: item.profile_image_url || null,
              },
            }}
            currentUser={currentUser as any}
            onEventClick={() => setShowEventPreviewModal(false)}
            onProfileClick={onProfileClick}
            onRSVPUpdate={(_eventId, newStatus, newAtt, newInt) => {
              onUpdateItem({
                my_rsvp_status: (newStatus || '') as any,
                attending_count: newAtt,
                interested_count: newInt,
              });
              rsvp((newStatus || 'not_going') as any);
            }}
            isPreview={true}
          />
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.item.id === next.item.id &&
      prev.item.my_rsvp_status === next.item.my_rsvp_status &&
      prev.item.attending_count === next.item.attending_count &&
      prev.item.interested_count === next.item.interested_count
    );
  }
);

/**
 * =========================
 * ✅ REACTION BUTTON
 * =========================
 */
const formatReactionCount = (count: number): string => {
  if (!count || count <= 0) return '0';
  if (count >= 1000000) {
    const val = String((count / 1000000).toFixed(1) ?? '');
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}M`;
  }
  if (count >= 1000) {
    const val = String((count / 1000).toFixed(1) ?? '');
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}k`;
  }
  return String(count);
};

export const ReactionButton = memo(
  ({
    currentUserReactions,
    reactionCount,
    onReact,
    isGuest,
  }: {
    currentUserReactions: ReactionType | undefined;
    reactionCount: number;
    onReact: (type: ReactionType) => void;
    isGuest?: boolean;
  }) => {
    const [showDock, setShowDock] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewEmoji, setPreviewEmoji] = useState<string>('👍');
    const timerRef = useRef<any>(null);
    const longPressTimerRef = useRef<any>(null);
    const dockRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      ensureReactionStyles();
    }, []);

    const reactionConfig = [
      { type: 'like', icon: '👍', color: '#1877F2', label: 'Like' },
      { type: 'love', icon: '❤️', color: '#F3425F', label: 'Love' },
      { type: 'haha', icon: '😂', color: '#F7B928', label: 'Haha' },
      { type: 'wow', icon: '😮', color: '#F7B928', label: 'Wow' },
      { type: 'sad', icon: '😢', color: '#F7B928', label: 'Sad' },
      { type: 'angry', icon: '😡', color: '#E41E3F', label: 'Angry' },
      { type: 'fire', icon: '🔥', color: '#FF6B35', label: 'Fire' },
      { type: 'party', icon: '🎉', color: '#9C27B0', label: 'Party' },
      { type: 'clap', icon: '👏', color: '#4CAF50', label: 'Clap' },
      { type: 'star', icon: '⭐', color: '#FFD700', label: 'Star' },
      { type: 'thinking', icon: '🤔', color: '#607D8B', label: 'Thinking' },
      { type: 'crying', icon: '😭', color: '#2196F3', label: 'Crying' },
      { type: 'heart_eyes', icon: '🥰', color: '#E91E63', label: 'Heart Eyes' },
      { type: 'kiss', icon: '😘', color: '#FF4081', label: 'Kiss' },
      { type: 'sunglasses', icon: '😎', color: '#00BCD4', label: 'Cool' },
      { type: 'rocket', icon: '🚀', color: '#3F51B5', label: 'Rocket' },
      { type: 'trophy', icon: '🏆', color: '#FF9800', label: 'Trophy' },
      { type: 'crown', icon: '👑', color: '#FFC107', label: 'Crown' },
      { type: 'unicorn', icon: '🦄', color: '#E040FB', label: 'Unicorn' },
      { type: 'rainbow', icon: '🌈', color: '#00E676', label: 'Rainbow' },
      { type: 'money', icon: '💰', color: '#4CAF50', label: 'Money' },
      { type: 'muscle', icon: '💪', color: '#FF5722', label: 'Muscle' },
      { type: 'brain', icon: '🧠', color: '#9C27B0', label: 'Brain' },
      { type: 'lightning', icon: '⚡', color: '#FFEB3B', label: 'Lightning' },
      { type: 'gem', icon: '💎', color: '#00BCD4', label: 'Gem' },
    ] as const;

    const handleMouseEnter = () => {
      if (isGuest) return;
      timerRef.current = setTimeout(() => setShowDock(true), 350);
    };

    const handleMouseLeave = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTimeout(() => setShowDock(false), 250);
      setShowPreview(false);
    };

    const handleTouchStart = () => {
      if (isGuest) return;
      longPressTimerRef.current = setTimeout(() => {
        setShowDock(true);
        setShowPreview(true);
        setPreviewEmoji('👍');
      }, 400);
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      setTimeout(() => setShowPreview(false), 300);
    };

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isGuest) return alert('Please login to react.');
      setIsAnimating(true);
      if (currentUserReactions) {
        onReact(currentUserReactions);
      } else {
        onReact('like');
      }
      setShowDock(false);
      setShowPreview(false);
      setTimeout(() => setIsAnimating(false), 300);
    };

    const handleDockReact = (type: ReactionType) => {
      setIsAnimating(true);
      onReact(type);
      setShowDock(false);
      setShowPreview(false);
      setTimeout(() => setIsAnimating(false), 300);
    };

    const handleEmojiHover = (emoji: string) => {
      if (showPreview) {
        setPreviewEmoji(emoji);
      }
    };

    const activeReaction = currentUserReactions
      ? reactionConfig.find((r) => r.type === currentUserReactions)
      : null;

    return (
      <div
        className="relative group"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {showPreview && (
          <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-[#0B1120] rounded-full shadow-2xl p-3 border border-[#1E293B] z-[260] reaction-preview">
            <div className="text-4xl">{previewEmoji}</div>
          </div>
        )}

        {showDock && (
          <div
            ref={dockRef}
            className="absolute -top-14 left-0 bg-[#0B1120]/95 backdrop-blur-md rounded-full shadow-2xl p-2 border border-[#334155] z-[250] react-pop flex items-center"
          >
            <div className="flex gap-1 overflow-x-auto max-w-[320px] scrollbar-hide px-1 py-1">
              {reactionConfig.map((r) => (
                <div
                  key={r.type}
                  className="text-3xl react-hover cursor-pointer p-1 rounded-full hover:bg-[#1E293B] transition-transform hover:scale-125 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDockReact(r.type as ReactionType);
                  }}
                  onMouseEnter={() => handleEmojiHover(r.icon)}
                  title={r.label}
                >
                  {r.icon}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowDock((prev) => !prev);
          }}
          className={`flex items-center gap-1.5 text-white transition-transform active:scale-125 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 ${
            isAnimating ? 'scale-125' : ''
          }`}
          aria-label={activeReaction || currentUserReactions ? 'Unlike' : 'Like'}
          title="React"
        >
          {activeReaction ? (
            activeReaction.type === 'love' || activeReaction.type === 'like' ? (
              <i className="fas fa-heart text-[22px] text-red-500 transition-transform duration-300"></i>
            ) : (
              <span className="text-[22px] transition-transform duration-300">
                {activeReaction.icon}
              </span>
            )
          ) : currentUserReactions ? (
            <i className="fas fa-heart text-[22px] text-red-500 transition-transform duration-300"></i>
          ) : (
            <i className="far fa-heart text-[22px] text-[#F8FAFC] hover:text-red-400 transition-colors"></i>
          )}
          {reactionCount > 0 && (
            <span className="text-[14px] font-semibold text-[#F8FAFC]">
              {formatReactionCount(reactionCount)}
            </span>
          )}
        </button>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.currentUserReactions === next.currentUserReactions &&
      prev.reactionCount === next.reactionCount &&
      prev.isGuest === next.isGuest
    );
  }
);

/**
 * =========================
 * ✅ MAIN POST COMPONENT (with integrated Facebook-style sponsored support)
 * =========================
 */
export const Post = memo(
  ({
    post,
    author,
    currentUser,
    users = [],
    stories = [],
    onProfileClick,
    onReact,
    onShare,
    onDelete,
    onEdit,
    onViewImage,
    onOpenComments,
    onVideoClick,
    onPlayAudioTrack,
    onHashtagClick,
    onViewProductFromPost,
    onOpenGroup,
    onOpenAudio,
    onRSVP,
    groups = [],
    brands = [],
    chats = [],
    isFollowing = false,
    onFollow,
    followLoading = false,
    onEventClick,
    onOpenReactions,
    onReport,
    onHide,
    pushButton,
    onToggleGroupPostLike,
    hideCommentPreview = false,
    onOpenStory,
    onApplyToJob,
  }: {
    post: PostType;
    author: User | any;
    currentUser: User | null;
    users?: User[];
    stories?: any[];
    onOpenStory?: (story: any) => void;
    onApplyToJob?: (postId: number) => void;

    onProfileClick: (id: number) => void;

    onReact: (post: PostType, type: ReactionType) => void;

    onShare: (id: number, newShareCount: number, data?: any, sourcePost?: any) => void;

    onDelete?: (id: number) => void;

    onEdit?: (id: number, content: string) => void;

    onViewImage: (url: string) => void;

    onOpenComments: (post: PostType) => void;

    onVideoClick: (p: PostType) => void;

    onPlayAudioTrack?: (t: AudioTrack) => void;

    onHashtagClick?: (tag: string) => void;

    onViewProductFromPost?: (productId: number) => void;

    onOpenGroup?: (groupId: number) => void;

    onOpenAudio?: (item: any) => void;

    onRSVP?: (
      eventId: number,
      status: 'going' | 'interested' | 'not_going'
    ) => Promise<void>;

    groups?: Group[];

    brands?: Brand[];

    chats?: any[];

    isFollowing?: boolean;

    onFollow?: (id: number) => void;

    followLoading?: boolean;

    onEventClick?: (eventId: number) => void;

    onOpenReactions?: (post: PostType) => void;

    onReport?: (postId: number, reason?: string) => void;

    onHide?: (postId: number) => void;

    pushButton?: React.ReactNode;

    onToggleGroupPostLike?: (
      postId: number,
      type?: ReactionType
    ) => Promise<{ liked: boolean; likes_count: number } | void>;

    hideCommentPreview?: boolean;
  }) => {

                                                                                                     
    const { onViewProduct, getProductData } = useContext(MarketplaceContext);
    const [localPost, setLocalPost] = useState<any>(post);
    const p: any = localPost as any;
    const a: any = author as any;
    const meta: any = p?.meta || {};

    useEffect(() => {
      setLocalPost(post);
    }, [post]);

    useEffect(() => {
      const handlePostUpdated = (e: any) => {
        const id = Number(p?.id || p?.post_id || 0);
        if (e.detail && (e.detail.id === id || e.detail.post_id === id)) {
          setLocalPost((prev: any) => ({ ...prev, ...e.detail }));
        }
      };
      window.addEventListener('post-updated', handlePostUpdated);
      return () => window.removeEventListener('post-updated', handlePostUpdated);
    }, [p?.id, p?.post_id]);

    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
      const handleDeleting = (e: any) => {
        const id = Number(p?.id || p?.post_id || p?.event_id || p?.product_id || p?.song_id2 || p?.song_id || 0);
        const targetId = Number(e?.detail?.id || 0);
        if (id && targetId && id === targetId) {
          setIsExiting(true);
        }
      };
      window.addEventListener('post-deleting', handleDeleting);
      window.addEventListener('event-deleting', handleDeleting);
      window.addEventListener('product-deleting', handleDeleting);
      window.addEventListener('song-deleting', handleDeleting);
      return () => {
        window.removeEventListener('post-deleting', handleDeleting);
        window.removeEventListener('event-deleting', handleDeleting);
        window.removeEventListener('product-deleting', handleDeleting);
        window.removeEventListener('song-deleting', handleDeleting);
      };
    }, [p?.id, p?.post_id, p?.event_id, p?.product_id, p?.song_id2, p?.song_id]);

    const exitAnimClass = `w-full transition-all duration-400 ease-out origin-top ${
      isExiting
        ? 'opacity-0 scale-95 -translate-y-4 max-h-0 overflow-hidden pointer-events-none py-0 my-0 mb-0 border-0'
        : 'opacity-100 scale-100'
    }`;

    // ==================== SPONSORED DETECTION - ENHANCED ====================
    const isSponsored = 
      !!p?.is_sponsored || 
      !!p?.sponsored || 
      !!p?.is_ad || 
      !!meta?.is_sponsored || 
      !!meta?.sponsored || 
      !!meta?.sponsored_meta || 
      p?.type === 'sponsored' || 
      p?.item_type === 'sponsored' || 
      p?.source === 'sponsored' || 
      !!p?.ad_id;
    const sponsoredMeta = p?.sponsored_meta || meta?.sponsored_meta || null;
    const sponsoredAdId = Number(
      p?.ad_id || 
      sponsoredMeta?.ad_id || 
      p?.adId || 
      (p?.type === 'sponsored' && p?.id ? String(p.id).replace('ad-', '') : 0) || 
      0
    );
    
    const sponsoredHeadline = String(
      sponsoredMeta?.headline || p?.headline || ''
    ).trim();
    
    const sponsoredCtaText = String(
      sponsoredMeta?.cta_text || 
      p?.cta_text || 
      p?.cta_button || 
      sponsoredMeta?.button_text ||
      ((p?.type === 'product' || p?.item_type === 'product' || p?.source === 'product' || p?.post_type === 'product' || p?.product_id) ? 'Shop Now' : 'Learn More')
    ).trim();
    
    const sponsoredCtaUrl = String(
      sponsoredMeta?.cta_url || 
      p?.cta_url || 
      p?.destination_url || 
      ''
    ).trim();
    
    const sponsoredContactType = String(
      sponsoredMeta?.contact_type || 
      p?.contact_type || 
      'link'
    ).trim();
    
    const sponsoredPhone = String(
      sponsoredMeta?.phone_number || 
      p?.phone_number || 
      ''
    ).trim();
    
    const sponsoredEmail = String(
      sponsoredMeta?.email_address || 
      p?.email_address || 
      ''
    ).trim();
    
    const shouldShowSponsoredButton = isSponsored && (
      !!sponsoredCtaUrl ||
      (sponsoredContactType === 'phone' && !!sponsoredPhone) ||
      (sponsoredContactType === 'email' && !!sponsoredEmail) ||
      Boolean(p?.type === 'product' || p?.item_type === 'product' || p?.source === 'product' || p?.post_type === 'product' || p?.product_id)
    );
    
    const shouldHideDateForSponsored = isSponsored;

    // ==================== SPONSORED IMPRESSION & VIEW TRACKING ====================
    const sponsoredImpressionTrackedRef = useRef(false);
    useEffect(() => {
      if (!isSponsored || !sponsoredAdId) return;
      if (sponsoredImpressionTrackedRef.current) return;
      sponsoredImpressionTrackedRef.current = true;

      fetch('/api/ads/impression', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser?.id || 0),
        },
        body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
      }).catch((err) => console.error('Failed to record sponsored impression:', err));
    }, [isSponsored, currentUser?.id, sponsoredAdId]);

    // Track ad view (e.g., when video plays or media inspected)
    const handleSponsoredView = useCallback(() => {
      if (!isSponsored || !sponsoredAdId) return;
      fetch('/api/ads/view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser?.id || 0),
        },
        body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
      }).catch((err) => console.error('Failed to record ad view:', err));
    }, [isSponsored, sponsoredAdId, currentUser?.id]);

    // ==================== SPONSORED CLICK HANDLER ====================
    const handleSponsoredClick = useCallback(() => {
      if (sponsoredAdId) {
        // Capture click for both logged-in and guest users
        fetch('/api/ads/click', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': String(currentUser?.id || 0),
          },
          body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
        }).catch((err) => console.error('Failed to record ad click:', err));
      }
      
      if (sponsoredContactType === 'phone' && sponsoredPhone) {
        window.location.href = `tel:${sponsoredPhone}`;
        return;
      }
      if (sponsoredContactType === 'email' && sponsoredEmail) {
        window.location.href = `mailto:${sponsoredEmail}`;
        return;
      }
      if (sponsoredCtaUrl) {
        const dest = sponsoredCtaUrl.startsWith('http') ? sponsoredCtaUrl : `https://${sponsoredCtaUrl}`;
        window.open(dest, '_blank', 'noopener,noreferrer');
        return;
      }
      const prodId = getMarketplaceProductId(p);
      if (prodId) {
        if (onViewProduct) onViewProduct(prodId);
        else if (onViewProductFromPost) onViewProductFromPost(prodId);
      }
    }, [
      isSponsored, 
      sponsoredAdId, 
      currentUser?.id, 
      sponsoredContactType, 
      sponsoredPhone, 
      sponsoredEmail, 
      sponsoredCtaUrl,
      p,
      onViewProduct,
      onViewProductFromPost
    ]);

    const isMarketplace =
      p?.item_type !== 'product_share' &&
      p?.source !== 'product_share' &&
      p?.post_type !== 'product_share' &&
      p?.type !== 'share' &&
      !p?.shared_product &&
      !p?.shared_post &&
      (
        p?.type === 'marketplace' ||
        p?.post_type === 'product' ||
        p?.type === 'product' ||
        p?.kind === 'product' ||
        p?.item_type === 'product' ||
        p?.source === 'product' ||
        String(p?.feed_key || '').startsWith('product:') ||
        meta?.type === 'product' ||
        meta?.kind === 'product' ||
        !!p?.product_id ||
        !!p?.meta?.marketplace?.id
      );

    const isEventPost =
      p?.item_type === 'event' ||
      String(p?.feed_key || '').startsWith('event:') ||
      p?.source === 'event' ||
      p?.type === 'event' ||
      p?.post_type === 'event' ||
      meta?.type === 'event' ||
      meta?.kind === 'event' ||
      !!p?.event_id ||
      !!meta?.event;

    // If it's an event post, render EventPost component
    if (isEventPost) {
      const isGroupEvent = Boolean(
        p?.group_id ||
        meta?.group_id ||
        p?.is_group_event ||
        p?.source === 'group_event' ||
        p?.item_type === 'group_event'
      );
      if (isGroupEvent) return null;

      const event = normalizeEventFromFeed(p);  
      return (
        <div className={exitAnimClass}>
          <EventPost
            event={event}
            author={a}
            currentUser={currentUser}
            users={users}
            onProfileClick={onProfileClick}
            onRSVP={onRSVP}
            onFollow={onFollow}
            isFollowing={isFollowing}
            followLoading={followLoading}
            onReact={(eventAsPost, type) => onReact(eventAsPost as PostType, type)}
            onShare={onShare}
            onOpenComments={(evPost) => onOpenComments(evPost || post)}
            groups={groups}
            brands={brands}
            chats={chats}
            onEventClick={onEventClick}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        </div>
      );
    }


      

    const productId = isMarketplace ? getMarketplaceProductId(p) : null;
    const productData = productId ? getProductData?.(productId) : null;
  
    const mpImages = useMemo(() => 
      isMarketplace ? getMarketplaceImages(p, productData) : []
    , [isMarketplace, p, productData]);

    const { price, currency, loc } = isMarketplace
      ? getMarketplacePriceLine(productData, p)
      : { price: null, currency: 'TZS', loc: 'Marketplace' };

    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [showReactionsSheet, setShowReactionsSheet] = useState(false);
    const [showShareSheet, setShowShareSheet] = useState(false);

    const isMusic = Boolean(
      meta?.kind === 'music' ||
      meta?.type === 'music' ||
      p?.type === 'music' ||
      p?.type === 'song' ||
      p?.post_type === 'music' ||
      p?.post_type === 'song' ||
      p?.kind === 'music' ||
      p?.item_type === 'music' ||
      p?.item_type === 'song' ||
      p?.source === 'music' ||
      p?.source === 'song' ||
      p?.song_title ||
      p?.song_id2 ||
      p?.song_id ||
      (p?.audio_url && !p?.podcast_id && meta?.kind !== 'podcast' && meta?.type !== 'podcast' && p?.item_type !== 'podcast' && p?.type !== 'podcast')
    );
    const isPodcast = meta?.kind === 'podcast' || meta?.type === 'podcast' || p?.item_type === 'podcast' || p?.type === 'podcast';
    const song = meta?.song;
    const podcast = meta?.podcast;

    const regularSongData = useMemo(() => {
      if (!isMusic) return null;
      const target = song || p?.shared_song || (meta as any)?.song || p;
      const coverUrl =
        target.cover_image_url ||
        target.song_cover_image_url ||
        target.cover_url ||
        target.cover ||
        p.song_cover_image_url ||
        p.cover_image_url ||
        'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
      const audioUrl = target.audio_url || target.url || p.audio_url || '';
      const title = target.title || target.song_title || p.song_title || p.title || 'Untitled Track';
      const artist = target.artist_name || target.song_artist_name || target.artist || (p as any).artist_name || a?.name || 'Artist';
      const duration = target.duration_seconds || target.song_duration_seconds || p.song_duration_seconds || p.duration_seconds;
      const songId = Number(target.id || target.song_id || target.song_id2 || p.song_id2 || p.song_id || p.id || 0);

      return {
        id: songId,
        song_id: songId,
        title,
        artist_name: artist,
        artist,
        url: audioUrl,
        album_name: target.album_name || target.song_album_name || p.song_album_name || p.album_name,
        cover_image_url: coverUrl,
        cover: coverUrl,
        audio_url: audioUrl,
        duration_seconds: duration,
        genre: target.genre || target.song_genre || p.song_genre || p.genre,
        type: 'music' as const,
        uploader_id: target.uploader_id || target.user_id || p.uploader_id || a?.id,
      };
    }, [isMusic, song, meta, p, a]);

    const rawGroupId = Number(
      p?.group_id || p?.groupId || meta?.group_id || meta?.groupId || p?.group?.id || 0
    );
    const rawGroupName =
      p?.group_name || p?.groupName || meta?.group_name || meta?.groupName || p?.group?.name || '';
    const group = p?.group || (rawGroupId ? groups?.find((g) => g.id === rawGroupId) : (rawGroupName ? groups?.find((g) => g.name?.toLowerCase() === rawGroupName.toLowerCase()) : undefined));
    const groupId = rawGroupId || group?.id || 0;
    const groupName = rawGroupName || group?.name || '';
    const isGroupPost = !!(groupId || group || groupName);

    const groupCategory = String(
      p?.group_category ||
      group?.category ||
      meta?.group_category ||
      p?.category ||
      ''
    ).toLowerCase();

    const isCareerGroup =
      groupCategory === 'recruitment' ||
      groupCategory === 'jobs' ||
      groupCategory === 'career' ||
      Boolean(groupName && (
        groupName.toLowerCase().includes('job') ||
        groupName.toLowerCase().includes('career') ||
        groupName.toLowerCase().includes('recruitment') ||
        groupName.toLowerCase().includes('employment')
      ));

    // Job fields for Jobs and Career group posts
    const jobTitle = safeStr(p?.job_title || meta?.job_title || '');
    const company = safeStr(p?.company || meta?.company || '');
    const rawJobLocation = safeStr(p?.location || meta?.location || '');
    const jobLocationParts = [
      p?.street || meta?.street,
      p?.district || meta?.district,
      p?.region || meta?.region,
      p?.country || meta?.country,
    ].filter(Boolean);
    const jobLocation = rawJobLocation || jobLocationParts.join(', ');
    const jobType = safeStr(p?.job_type || meta?.job_type || '');
    const salary = safeStr(p?.salary || meta?.salary || '');
    const applicationType = safeStr(p?.application_type || meta?.application_type || '');
    const applicationValue = safeStr(p?.application_value || meta?.application_value || '');
    const expiryDateVal = p?.expiry_date || meta?.expiry_date || null;
    const expiryDate = expiryDateVal ? new Date(expiryDateVal) : null;
    const isJobExpired = expiryDate ? expiryDate < new Date() : false;

    // Display specialized job card if post has jobTitle and is from a career group or has company/location/apply details
    const isJobPost = Boolean(
      isGroupPost && jobTitle && (isCareerGroup || company || jobLocation || applicationValue || jobType)
    );

    const [appliedJob, setAppliedJob] = useState(false);

    const handleJobApply = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!currentUser) {
        alert('Please login to apply');
        return;
      }
      if (isJobExpired) {
        alert('This job posting has expired');
        return;
      }
      if (applicationType === 'email' || (applicationValue && applicationValue.includes('@'))) {
        window.location.href = `mailto:${applicationValue}?subject=Application for ${encodeURIComponent(jobTitle)} at ${encodeURIComponent(company || '')}`;
      } else if (applicationValue) {
        const url = applicationValue.startsWith('http://') || applicationValue.startsWith('https://')
          ? applicationValue
          : `https://${applicationValue}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        alert(`Application submitted for ${jobTitle}`);
      }
      setAppliedJob(true);
      if (onApplyToJob) {
        try {
          onApplyToJob(Number(p?.id || p?.post_id || 0));
        } catch (err) {
          console.error('Failed to register apply:', err);
        }
      }
    };

    const myReaction = p.myReaction ?? p.my_reaction ?? null;
    const likesCount = Number(p.likesCount ?? p.reactionsCount ?? p.reactions_count ?? p.likes_count ?? p.likes ?? 0);

    const rawReactions = safeArray(p.reactions);
    const rawPreview = safeArray(p.reactions_preview);
    const reactionsArr: any[] = rawReactions.length > 0 ? rawReactions : rawPreview;

    const reactorNameFromApi = String(p.reactor_name ?? p.reactorName ?? '').trim();

    const finalMyReaction: ReactionType | undefined =
      myReaction ||
      (currentUser && reactionsArr.length
        ? (reactionsArr.find(
            (r: any) => Number(r.user_id) === safeUserId(currentUser)
          )?.type as ReactionType)
        : undefined);

    const finalReactionCount = likesCount > 0 ? likesCount : reactionsArr.length;

    const initialCommentCount = safeNumber(
      p.comments_count ??
      p.comment_count ??
      p.commentsCount ??
      p.commentCount ??
      (Array.isArray(p.comments) ? p.comments.length : 0),
      0
    );
    const [commentCount, setCommentCount] = useState(initialCommentCount);

    useEffect(() => {
      const nextCount = safeNumber(
        p.comments_count ??
        p.comment_count ??
        p.commentsCount ??
        p.commentCount ??
        (Array.isArray(p.comments) ? p.comments.length : 0),
        -1
      );
      if (nextCount >= 0) {
        setCommentCount(nextCount);
      }
    }, [p.comments_count, p.comment_count, p.commentsCount, p.commentCount, p.comments]);

    const initialShareCount = safeNumber(p.shares_count ?? p.shares ?? p.share_count ?? 0, 0);
    const [shareCount, setShareCount] = useState(initialShareCount);

    useEffect(() => {
      const nextShares = safeNumber(p.shares_count ?? p.shares ?? p.share_count ?? 0, 0);
      setShareCount(nextShares);
    }, [p.shares_count, p.shares, p.share_count]);

    const createdAtLabel = formatRelativeTime(p.created_at);
    const postId = getFeedItemId(p);

    const isSharedStory = Boolean(
      p.shared_story ||
      p.item_type === 'story_share' ||
      p.source === 'story_share' ||
      p.type === 'story_share' ||
      p.post_type === 'story_share' ||
      (p.shared_post && (
        p.shared_post.item_type === 'story' ||
        p.shared_post.type === 'story' ||
        p.shared_post.source === 'story' ||
        p.shared_post.kind === 'story' ||
        !!p.shared_post.story_id
      ))
    );

    const isSharedSong = Boolean(
      p.shared_song ||
      p.item_type === 'song_share' ||
      p.source === 'song_share' ||
      p.type === 'song_share' ||
      p.post_type === 'song_share' ||
      p.item_type === 'music_share' ||
      p.source === 'music_share' ||
      (p.shared_post && (
        p.shared_post.is_song ||
        p.shared_post.item_type === 'music' ||
        p.shared_post.item_type === 'song' ||
        p.shared_post.source === 'song' ||
        p.shared_post.type === 'music' ||
        p.shared_post.type === 'song' ||
        !!p.shared_post.song_id ||
        !!p.shared_post.song_id2 ||
        (!!p.shared_post.audio_url && (!!p.shared_post.artist_name || !!p.shared_post.song_cover_image_url || !!p.shared_post.cover_image_url))
      ))
    );

    const isSharedPost = Boolean(
      isSharedStory ||
      p.shared_story ||
      p.shared_song ||
      p.shared_product ||
      p.shared_post ||
      (p.shared_post_id && p.item_type !== 'product' && p.source !== 'product') ||
      p.item_type === 'story_share' ||
      p.source === 'story_share' ||
      p.type === 'story_share' ||
      p.post_type === 'story_share' ||
      p.item_type === 'song_share' ||
      p.source === 'song_share' ||
      p.type === 'song_share' ||
      p.post_type === 'song_share' ||
      p.item_type === 'music_share' ||
      p.source === 'music_share' ||
      p.item_type === 'product_share' ||
      p.source === 'product_share' ||
      p.post_type === 'product_share' ||
      p.item_type === 'share' ||
      p.source === 'share' ||
      p.type === 'share' ||
      p.post_type === 'share'
    );
    const parsedSharedPost = useMemo(() => {
      let sp = p.shared_post;
      if (typeof sp === 'string') {
        try { sp = JSON.parse(sp); } catch { sp = null; }
      }
      return sp;
    }, [p.shared_post]);

    const originalPost =
      p.shared_story ||
      p.shared_song ||
      p.shared_product ||
      parsedSharedPost ||
      (p.shared_post_id && (p as any)._originalPost) ||
      (isSharedSong ? {
        id: p.song_id2 || p.song_id || p.id,
        song_id: p.song_id2 || p.song_id || p.id,
        title: p.song_title || p.title || 'Untitled Track',
        artist_name: p.song_artist_name || p.artist_name || 'Artist',
        album_name: p.song_album_name || p.album_name,
        cover_image_url: p.song_cover_image_url || p.cover_image_url || p.cover_url || p.cover,
        audio_url: p.audio_url,
        duration_seconds: p.song_duration_seconds || p.duration_seconds,
        genre: p.song_genre || p.genre,
        uploader_id: p.uploader_id || p.user_id,
        is_song: true,
      } : null);

    const ownerAuthor = useMemo(() => {
      if (!originalPost) return null;
      const rawAuthor = originalPost.author;
      const rawUser = originalPost.user;
      const authorObj = typeof rawAuthor === 'object' && rawAuthor !== null ? rawAuthor : null;
      const userObj = typeof rawUser === 'object' && rawUser !== null ? rawUser : null;
      const authorId = Number(
        authorObj?.id ||
        userObj?.id ||
        originalPost.user_id ||
        originalPost.seller_id ||
        originalPost.uploader_id ||
        0
      );

      const matchedUser = authorId ? users?.find((u) => Number(u.id) === authorId) : null;

      const isValidOwnerName = (val: any) => {
        if (!val || typeof val !== 'string') return false;
        const s = val.trim();
        return s.length > 0 && s.toLowerCase() !== 'user' && s.toLowerCase() !== 'un';
      };

      const name =
        (isValidOwnerName(matchedUser?.name) ? matchedUser!.name : null) ||
        (isValidOwnerName(authorObj?.name) ? authorObj!.name : null) ||
        (isValidOwnerName(userObj?.name) ? userObj!.name : null) ||
        (isValidOwnerName(rawAuthor) ? (rawAuthor as string) : null) ||
        (isValidOwnerName(originalPost.author_full_name) ? originalPost.author_full_name : null) ||
        (isValidOwnerName(originalPost.author_name) ? originalPost.author_name : null) ||
        (isValidOwnerName(originalPost.artist_name) ? originalPost.artist_name : null) ||
        (isValidOwnerName(originalPost.seller_name) ? originalPost.seller_name : null) ||
        matchedUser?.username ||
        authorObj?.username ||
        userObj?.username ||
        originalPost.author_username ||
        originalPost.username ||
        'User';

      const username =
        matchedUser?.username ||
        authorObj?.username ||
        userObj?.username ||
        originalPost.author_username ||
        originalPost.username ||
        'user';

      const avatar =
        matchedUser?.profile_image_url ||
        matchedUser?.avatar_url ||
        authorObj?.profile_image_url ||
        authorObj?.avatar_url ||
        userObj?.profile_image_url ||
        userObj?.avatar_url ||
        originalPost.author_avatar ||
        originalPost.author_image ||
        null;

      const isVerified = Boolean(
        matchedUser?.is_verified ||
        authorObj?.is_verified ||
        userObj?.is_verified ||
        originalPost.author_verified ||
        originalPost.is_verified ||
        originalPost.verified
      );

      return {
        id: authorId,
        name,
        username,
        profile_image_url: avatar,
        avatar_url: avatar,
        is_verified: isVerified,
      };
    }, [originalPost, users]);

    const origMediaInfo = useMemo(() => {
      if (!originalPost || isSharedSong) return null;
      const directVideo =
        originalPost.video_url ||
        originalPost.video_url_medium ||
        originalPost.video_url_hd ||
        originalPost.video_url_low ||
        originalPost.video ||
        null;
      const rawUrls = Array.isArray(originalPost.media_urls)
        ? originalPost.media_urls
        : typeof originalPost.media_urls === 'string'
        ? (() => { try { return JSON.parse(originalPost.media_urls); } catch { return []; } })()
        : Array.isArray(originalPost.images)
        ? originalPost.images
        : typeof originalPost.images === 'string'
        ? (() => { try { return JSON.parse(originalPost.images); } catch { return [originalPost.images]; } })()
        : originalPost.media_url
        ? [originalPost.media_url]
        : [];
      const urls: string[] = rawUrls.filter(Boolean);
      if (directVideo && !urls.includes(directVideo)) {
        urls.unshift(directVideo);
      }
      const isVid = Boolean(
        directVideo ||
        originalPost.media_type === 'video' ||
        originalPost.type === 'video' ||
        originalPost.type === 'reel' ||
        originalPost.post_type === 'reel' ||
        originalPost.item_type === 'reel' ||
        originalPost.kind === 'reel' ||
        (typeof urls[0] === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(urls[0]))
      );
      return {
        urls,
        isVideo: isVid,
        videoUrl: directVideo || (isVid ? urls[0] : null),
      };
    }, [originalPost, isSharedSong]);

    const isSharedProduct = Boolean(
      (originalPost && (
        originalPost.item_type === 'product' ||
        originalPost.source === 'product' ||
        originalPost.type === 'product' ||
        originalPost.post_type === 'product' ||
        originalPost.kind === 'product' ||
        originalPost.is_product ||
        (originalPost.product_id != null && (originalPost.price != null || originalPost.main_price != null || originalPost.source === 'product' || originalPost.item_type === 'product')) ||
        originalPost.price != null ||
        originalPost.main_price != null ||
        originalPost.discount_price != null
      )) ||
      Boolean(p.shared_product) ||
      p.item_type === 'product_share' ||
      p.post_type === 'product_share' ||
      p.source === 'product_share'
    );

    const isSharedVideo = Boolean(
      !isSharedSong &&
      !isSharedProduct &&
      !isSharedStory &&
      (
        origMediaInfo?.isVideo ||
        Boolean(origMediaInfo?.videoUrl) ||
        Boolean(originalPost?.video_url) ||
        Boolean(originalPost?.video_url_medium) ||
        Boolean(originalPost?.video_url_hd) ||
        Boolean(originalPost?.video) ||
        originalPost?.type === 'reel' ||
        originalPost?.post_type === 'reel' ||
        originalPost?.item_type === 'reel' ||
        originalPost?.kind === 'reel' ||
        originalPost?.media_type === 'video' ||
        originalPost?.type === 'video' ||
        Boolean(p?.video_url) ||
        p?.media_type === 'video' ||
        (typeof originalPost?.media_url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(originalPost.media_url)) ||
        (Array.isArray(originalPost?.media_urls) && originalPost.media_urls.some((u: string) => typeof u === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)))
      )
    );

    const sharedSongData = useMemo(() => {
      if (!isSharedSong) return null;
      const target = p.shared_song || originalPost || p;
      const coverUrl =
        target.cover_image_url ||
        target.song_cover_image_url ||
        target.cover_url ||
        target.cover ||
        p.song_cover_image_url ||
        p.cover_image_url ||
        'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
      const audioUrl = target.audio_url || p.audio_url || '';
      const title = target.song_title || target.title || p.song_title || 'Untitled Track';
      const artist = target.song_artist_name || target.artist_name || target.artist || ownerAuthor?.name || 'Artist';
      const duration = target.song_duration_seconds || target.duration_seconds || p.song_duration_seconds;
      const songId = Number(target.song_id || target.song_id2 || target.id || p.song_id2 || p.song_id || p.id || 0);

      return {
        id: songId,
        song_id: songId,
        title,
        artist_name: artist,
        artist,
        url: audioUrl,
        album_name: target.song_album_name || target.album_name || p.song_album_name,
        cover_image_url: coverUrl,
        cover: coverUrl,
        audio_url: audioUrl,
        duration_seconds: duration,
        genre: target.song_genre || target.genre || p.song_genre,
        type: 'music' as const,
        uploader_id: target.uploader_id || target.user_id || ownerAuthor?.id,
      };
    }, [isSharedSong, p, originalPost, ownerAuthor]);

    const isSongPost = Boolean(isSharedSong || isMusic);
    const songData = isSharedSong ? sharedSongData : regularSongData;

    const origPriceRaw = originalPost?.price ?? originalPost?.discount_price ?? originalPost?.main_price ?? null;
    const origPrice = origPriceRaw != null
      ? (typeof origPriceRaw === 'number' ? origPriceRaw.toLocaleString() : String(origPriceRaw))
      : null;
    const origCurrency = originalPost?.currency || 'TZS';
    const origLoc = originalPost?.location || originalPost?.address || 'Marketplace';
    const targetSharedProductId = Number(
      originalPost?.product_id || originalPost?.id || p?.product_id || p?.shared_post_id || 0
    );

    const mediaInfo = getMediaTypeInfo(p);
    const mediaList = useMemo(() => getPostMediaList(p), [p]);
    const imageMedia = mediaList.filter((m) => m.kind === 'image');
    const videoMedia = mediaList.filter((m) => m.kind === 'video');

    const formatCount = (count: number): string => {
      if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
      if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
      return count.toString();
    };

    const itemType = getFeedItemType(p);
    const [previewComment, setPreviewComment] = useState<any>(() => {
      if (hideCommentPreview) return null;
      if (Array.isArray(p?.comments) && p.comments.length > 0) {
        return p.comments[0];
      }
      const cached = getCachedComments(itemType, postId);
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        return cached.data[0];
      }
      return null;
    });

    useEffect(() => {
      if (hideCommentPreview) return;
      let isMounted = true;
      if (commentCount > 0 && !previewComment) {
        const cached = getCachedComments(itemType, postId);
        if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
          setPreviewComment(cached.data[0]);
          return;
        }

        const endpoint = getFeedCommentFetchEndpoint(itemType, p, safeUserId(currentUser));
        apiFetch(endpoint)
          .then((data) => {
            if (!isMounted) return;
            const arr = Array.isArray(data) ? data : data?.comments || [];
            if (arr.length > 0) {
              setPreviewComment(arr[0]);
              setCachedComments(itemType, postId, arr);
            }
          })
          .catch(() => {});
      }
      return () => {
        isMounted = false;
      };
    }, [hideCommentPreview, commentCount, previewComment, itemType, postId, p, currentUser]);

    const handleLikePreviewComment = async (c: any) => {
      if (!currentUser) {
        alert('Please login to react to comments.');
        return;
      }
      const optimisticLiked = !c.liked_by_me;
      const optimisticCount = c.liked_by_me
        ? Math.max(0, (c.likes_count || 0) - 1)
        : (c.likes_count || 0) + 1;

      setPreviewComment((prev: any) =>
        prev && prev.id === c.id
          ? { ...prev, liked_by_me: optimisticLiked, likes_count: optimisticCount }
          : prev
      );

      updateCachedComment(itemType, postId, c.id, (old: any) => ({
        ...old,
        liked_by_me: optimisticLiked,
        likes_count: optimisticCount,
      }));

      try {
        const endpoint = getCommentLikeEndpoint(itemType, c.id);
        await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({ user_id: safeUserId(currentUser) }),
        });
      } catch (err) {
        setPreviewComment((prev: any) =>
          prev && prev.id === c.id
            ? { ...prev, liked_by_me: !optimisticLiked, likes_count: c.likes_count || 0 }
            : prev
        );
        updateCachedComment(itemType, postId, c.id, (old: any) => ({
          ...old,
          liked_by_me: !optimisticLiked,
          likes_count: c.likes_count || 0,
        }));
      }
    };

    const previewAuthor = useMemo(() => {
      if (!previewComment) return null;
      return resolveCommentAuthor(previewComment, users);
    }, [previewComment, users]);

    const emojiList = useMemo(() => {
      if (reactionsArr.length > 0) {
        const em = topReactionEmojis(reactionsArr, 2);
        return em.length ? em : ['👍'];
      }
      return finalReactionCount > 0 ? ['👍'] : [];
    }, [reactionsArr, finalReactionCount]);

    const reactorName = useMemo(() => {
      if (!finalReactionCount) return '';
      if (reactionsArr.length) {
        const name = pickStableReactorName(postId, reactionsArr, users);
        if (name) return String(name).trim();
      }
      return reactorNameFromApi;
    }, [postId, finalReactionCount, reactionsArr, users, reactorNameFromApi]);

    const reactionText = useMemo(() => {
      if (!finalReactionCount) return '';
      if (reactorName) {
        return formatReactionText(finalReactionCount, reactorName);
      }
      return finalReactionCount === 1 ? '1 Reaction' : `${fmtCount(finalReactionCount)} Reactions`;
    }, [finalReactionCount, reactorName]);

    // Inside Post component, after all the useMemo declarations, before the return
    const marketplaceGridData = useMemo(() => {
      if (!isMarketplace) {
        return {
          mediaForGrid: [] as Array<{ url: string; thumb?: string; feed?: string; full?: string; }>,
          galleryUrls: [] as string[],
        };
      }
      
      const variants = getMarketplaceImageVariants(p, productData);
      const hasVariants = variants.length > 0;
      
      const mediaForGrid = hasVariants
        ? variants.map((v) => ({
            url: v.feed || v.thumb || v.full || '',
            thumb: v.thumb || v.feed || v.full || '',
            feed: v.feed || v.full || v.thumb || '',
            full: v.full || v.feed || v.thumb || '',
          }))
        : mpImages.map((url) => ({
            url,
            thumb: url,
            feed: url,
            full: url,
          }));
      
      const galleryUrls = hasVariants
        ? variants.map((v) => v.full || v.feed || v.thumb || '').filter(Boolean)
        : mpImages.filter(Boolean);
      
      return { mediaForGrid, galleryUrls };
    }, [isMarketplace, p, productData, mpImages]);

    useEffect(() => {
      const newCommentCount =
        typeof p.comments_count === 'number'
          ? p.comments_count
          : Array.isArray(p.comments)
          ? p.comments.length
          : 0;
      if (newCommentCount !== commentCount) {
        setCommentCount(newCommentCount);
      }

      const newShareCount = safeNumber(p.shares ?? p.shares_count, 0);
      if (newShareCount !== shareCount) {
        setShareCount(newShareCount);
      }
    }, [p.comments_count, p.comments, p.shares, p.shares_count]);

    const handleShareComplete = (destination: string, data?: any) => {
      const nextShares = safeNumber(data?.shares ?? data?.share_count, NaN);
      const finalShares = Number.isFinite(nextShares) ? nextShares : shareCount + 1;
      setShareCount(finalShares);
      onShare(postId, finalShares, data, p);
      setShowShareSheet(false);
    };

    const handleFollowClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (onFollow && a.id) onFollow(safeUserId(a));
    };

    // ✅ UPDATED: Complete handleReactClick with proper group post detection
      
   const handleReactClick = async (type: ReactionType) => {
  if (!currentUser) {
    alert("Please login to react.");
    return;
  }

  onReact?.(p, type);
};
      
      

    const openGallery = (urls: string[], index: number, directUrl?: string) => {
      const targetList = urls && urls.length > 0 ? urls : directUrl ? [directUrl] : [];
      setGalleryUrls(targetList);
      setGalleryIndex(index >= 0 && index < targetList.length ? index : 0);
      setGalleryOpen(true);
    };

    const handleOpenComments = (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (currentUser) {
        onOpenComments(post);
      } else {
        alert('Please login to comment');
      }
    };

    const handleOpenReactionsSheet = () => {
      if (onOpenReactions) {
        onOpenReactions(post);
      } else {
        setShowReactionsSheet(true);
      }
    };

    if (
      !isGroupPost &&
      !isMarketplace &&
      !isSharedPost &&
      (isVideoPost(p) || (videoMedia.length > 0 && !imageMedia.length) || p.media_type === 'video' || p.type === 'video' || p.type === 'reel' || p.post_type === 'reel' || p.kind === 'reel')
    ) {
      return (
        <div className={exitAnimClass}>
          <article className="w-full relative bg-[#0F172A] border-b-[8px] border-[#050B18]">
            <InstagramVideoCard
              post={p}
              author={a}
              currentUser={currentUser}
              users={users}
              stories={stories}
              autoplay={false}
              reactionCount={finalReactionCount}
              myReaction={finalMyReaction}
              commentCount={commentCount}
              shareCount={shareCount}
              emojiList={emojiList}
              reactionText={reactionText}
              onProfileClick={onProfileClick}
              onReact={(postItem, rType) => onReact(post, rType)}
              onShare={(postId, newCount, data, orig) => {
                setShareCount(newCount);
                onShare(postId, newCount, data, orig || p);
              }}
              onShareClick={() => setShowShareSheet(true)}
              onVideoClick={() => onVideoClick(post)}
              onDelete={onDelete}
              onEdit={onEdit}
              isFollowing={isFollowing}
              onFollow={onFollow}
              onHashtagClick={onHashtagClick}
              onOpenComments={() => onOpenComments(post)}
              onOpenReactions={() => handleOpenReactionsSheet()}
              onCommentAdded={() => setCommentCount((c) => c + 1)}
            />
          </article>
          <ShareBottomSheet
            isOpen={showShareSheet}
            onClose={() => setShowShareSheet(false)}
            post={{
              ...p,
              source: 'post',
            }}
            currentUser={currentUser || null}
            users={users}
            groups={groups}
            brands={brands}
            chats={chats}
            onShareComplete={handleShareComplete}
          />
        </div>
      );
    }

    return (
      <div className={exitAnimClass}>
        <article className="w-full relative bg-[#0F172A] border-b-[8px] border-[#050B18]">
          {/* HEADER SECTION - Group Post vs Regular Post */}
            {isGroupPost ? (
              <>
                <GroupPostHeader
                  post={p}
                  group={group}
                  author={a}
                  groups={groups}
                  onOpenGroup={(id) => onOpenGroup?.(id || groupId)}
                  onOpenProfile={(id) => onProfileClick(id)}
                />
                {isSponsored && (
                  <div className="px-3 md:px-4 pb-2 text-[#94A3B8] text-[15px] font-medium">
                    Sponsored
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 md:p-4 flex items-center justify-between">
                <div
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  onClick={() => onProfileClick(safeUserId(a))}
                >
                  <img
                    src={avatarFrom(a)}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-[#1E293B]"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <h4 className="font-bold text-[#F8FAFC] text-[21px] cursor-pointer hover:underline truncate">
                        {a.name || a.username || 'User'}
                      </h4>
                      {Boolean(a.is_verified) && (
                        <VerifiedBadge size={21} className="shrink-0" />
                      )}
                      {(groupName || group) && (
                        <span className="inline-flex items-center gap-1 text-[#94A3B8] text-[15px] font-normal">
                          <span className="mx-0.5">▶</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenGroup) onOpenGroup(groupId || group?.id || 0);
                            }}
                            className="font-bold text-[#F8FAFC] hover:underline cursor-pointer flex items-center gap-1 text-[21px]"
                          >
                            <span className="truncate">{groupName || group?.name}</span>
                            {Boolean(group?.is_verified || (group as any)?.verified) && (
                              <VerifiedBadge size={21} className="shrink-0" />
                            )}
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[#94A3B8] text-[15px]">
                      {isSharedPost ? (
                        <>
                          <span className="text-[#38BDF8] font-medium">
                            {isSharedSong ? 'shared a song' : isSharedProduct ? 'shared a product' : isSharedVideo ? 'shared a video' : 'shared a post'}
                          </span>
                          <span>•</span>
                          <span>{createdAtLabel}</span>
                          <span>•</span>
                          <i className="fas fa-globe-americas text-[14px]"></i>
                        </>
                      ) : isSponsored ? (
                        <>
                          <span className="font-semibold text-[#E2E8F0]">Ad</span>
                          <span>•</span>
                          <i className="fas fa-globe-americas text-[14px]" title="Public Ad"></i>
                        </>
                      ) : (
                        <>
                          {!shouldHideDateForSponsored && (
                            <>
                              <span>{createdAtLabel}</span>
                              <span>•</span>
                            </>
                          )}
                          <i className="fas fa-globe-americas text-[14px]"></i>
                        </>
                      )}
                      {p.location && !isSponsored && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[160px]">
                            {String(p.location).split(',')[0]}
                          </span>
                        </>
                      )}
                      {p.feeling && !isSponsored && (
                        <>
                          <span>•</span>
                          <span>feeling {p.feeling}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {onFollow && currentUser && safeUserId(a) !== safeUserId(currentUser) && !isSponsored && (
                  <button
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    className={`px-3 py-1.5 text-[15px] font-bold rounded-lg transition-all duration-200 ml-2 ${
                      isFollowing
                        ? 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                        : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                    } ${followLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {followLoading ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : isFollowing ? (
                      'Following'
                    ) : (
                      'Follow'
                    )}
                  </button>
                )}

                <PostMenu
                  item={{
                    ...p,
                    id: isMarketplace ? (productId || postId) : postId,
                    product_id: isMarketplace ? (productId || postId) : undefined,
                    seller_id: isMarketplace ? (p.seller_id || safeUserId(a)) : undefined,
                    user_id: isMarketplace ? (p.seller_id || safeUserId(a)) : safeUserId(a),
                    type: isMarketplace
                      ? 'product'
                      : isGroupPost
                      ? 'group_post'
                      : isMusic
                      ? 'song'
                      : 'post',
                    title: p.title || productData?.title,
                    description: p.description || p.content || productData?.description,
                    main_price: p.main_price ?? productData?.main_price,
                    discount_price: p.discount_price ?? productData?.discount_price,
                    category: p.category || productData?.category,
                    country: p.country || productData?.country,
                    address: p.address || productData?.address,
                    images: p.images || productData?.images,
                    content: p.content,
                    caption: p.caption,
                    group_id: groupId,
                  }}
                  currentUser={currentUser}
                  onShare={(item) => setShowShareSheet(true)}
                  onDeleteSuccess={(deletedId) => {
                    setIsExiting(true);
                    setTimeout(() => {
                      onDelete?.(Number(deletedId));
                    }, 380);
                  }}
                  onEditSuccess={(updatedItem) => {
                    setLocalPost((prev: any) => ({ ...prev, ...updatedItem }));
                    onEdit?.(Number(postId), updatedItem.content || updatedItem.caption || updatedItem.description || '');
                  }}
                />
              </div>
            )}

            {sponsoredHeadline && 
              sponsoredHeadline.toLowerCase() !== String(p.content || '').trim().toLowerCase() && 
              sponsoredHeadline.toLowerCase() !== String(p.title || productData?.title || '').trim().toLowerCase() && (
              <div className="px-3 md:px-4 pb-1">
                <h3 className="text-[#F8FAFC] font-bold text-[22px]">
                  {sponsoredHeadline}
                </h3>
              </div>
            )}

            {isMarketplace && (() => {
              const productTitle = String(p.title || productData?.title || p.content || '').trim();
              const rawDesc = String(p.description || productData?.description || '').trim();

              // Prevent product name appearing twice if description equals or repeats the title
              const isDescIdentical = Boolean(
                rawDesc && productTitle && (
                  rawDesc.toLowerCase() === productTitle.toLowerCase() ||
                  rawDesc.toLowerCase() === String(p.title || '').trim().toLowerCase() ||
                  rawDesc.toLowerCase() === String(p.content || '').trim().toLowerCase()
                )
              );

              let cleanDesc = isDescIdentical ? '' : rawDesc;
              if (cleanDesc && productTitle && cleanDesc.toLowerCase().startsWith(productTitle.toLowerCase())) {
                const stripped = cleanDesc.slice(productTitle.length).replace(/^[\s\-–—:\n\r]+/, '').trim();
                cleanDesc = stripped;
              }

              return (
                <>
                  <div className="px-4 pb-2 flex items-center gap-2 text-[#F8FAFC]">
                    <span className="text-[#1877F2] font-bold text-[15px] bg-[#1877F2]/10 px-2 py-1 rounded-full">
                      MarketPoint
                    </span>
                    {loc && (
                      <div className="flex items-center gap-1 text-[#94A3B8]">
                        <i className="fas fa-map-marker-alt text-[14px] text-[#F02849]"></i>
                        <span className="text-[15px]">{loc}</span>
                      </div>
                    )}
                  </div>

                  {productTitle && (
                    <div className="px-3 md:px-4 pb-2">
                      <div
                        style={{ fontSize: '19.5px' }}
                        className="text-[#F8FAFC] font-semibold leading-snug"
                      >
                        {productTitle}
                      </div>
                      {cleanDesc && (
                        <div className="mt-1">
                          <ExpandableRichText
                            text={cleanDesc}
                            users={users}
                            onProfileClick={onProfileClick}
                            onHashtagClick={onHashtagClick}
                            maxWords={14}
                            fontSizePx={16}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {isJobPost && (
              <div className="px-3 md:px-4 pb-3">
                <div className="bg-[#1E293B] rounded-xl p-4 sm:p-5 border border-[#334155]/60 mb-2">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#45BD62]/10 rounded-full border border-[#45BD62]/20">
                      <i className="fas fa-briefcase text-[#45BD62] text-xs"></i>
                      <span className="text-[#45BD62] text-xs font-bold tracking-wide">JOB POSTING</span>
                    </div>
                    {isJobExpired && (
                      <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#F3425F]/10 rounded-full border border-[#F3425F]/20">
                        <i className="fas fa-clock text-[#F3425F] text-xs"></i>
                        <span className="text-[#F3425F] text-xs font-bold">EXPIRED</span>
                      </div>
                    )}
                    {expiryDate && !isJobExpired && (
                      <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#F7B928]/10 rounded-full border border-[#F7B928]/20">
                        <i className="fas fa-calendar-alt text-[#F7B928] text-xs"></i>
                        <span className="text-[#F7B928] text-xs">
                          Expires {expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>

                  <h2 className="text-[#F8FAFC] font-bold text-xl sm:text-2xl mb-2">{jobTitle}</h2>
                  {company && (
                    <div className="flex items-center gap-2 text-[#94A3B8] mb-3">
                      <i className="fas fa-building text-sm w-5 text-[#45BD62]"></i>
                      <span className="text-base font-semibold text-[#CBD5E1]">{company}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                    {jobLocation && (
                      <div className="flex items-center gap-2 text-[#94A3B8]">
                        <i className="fas fa-map-marker-alt text-sm w-5 text-[#45BD62]"></i>
                        <span className="text-[14.5px] truncate">{jobLocation}</span>
                      </div>
                    )}
                    {jobType && (
                      <div className="flex items-center gap-2 text-[#94A3B8]">
                        <i className="fas fa-clock text-sm w-5 text-[#F7B928]"></i>
                        <span className="text-[14.5px]">{jobType}</span>
                      </div>
                    )}
                    {salary && (
                      <div className="flex items-center gap-2 text-[#94A3B8] sm:col-span-2">
                        <i className="fas fa-dollar-sign text-sm w-5 text-[#45BD62]"></i>
                        <span className="text-[14.5px] font-medium text-[#45BD62]">{salary}</span>
                      </div>
                    )}
                  </div>

                  {/* Apply Button on top after Job Type and Salary before description */}
                  <div className="mb-3">
                    {!isJobExpired ? (
                      <button
                        type="button"
                        onClick={handleJobApply}
                        disabled={appliedJob}
                        className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-3 rounded-xl font-bold text-[16px] sm:text-[17px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                      >
                        {appliedJob ? (
                          <>
                            <i className="fas fa-check text-base"></i>
                            <span>Applied</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-paper-plane text-base"></i>
                            <span>Apply Now</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full bg-[#F3425F]/10 text-[#F3425F] py-2.5 rounded-xl font-bold text-center border border-[#F3425F]/20 flex items-center justify-center gap-2 text-[15px]">
                        <i className="fas fa-clock"></i>
                        <span>This job posting has expired</span>
                      </div>
                    )}
                  </div>

                  {p.content && (
                    <div className="mt-3 pt-3 border-t border-[#334155]/50">
                      <ExpandableRichText
                        text={String(p.content)}
                        users={users}
                        onProfileClick={onProfileClick}
                        onHashtagClick={onHashtagClick}
                        maxWords={18}
                        fontSizePx={16}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {(() => {
              if (!p.content || isMarketplace || isJobPost) return null;
              
              // If post has a link preview, check if content is solely or contains the link
              let textToDisplay = String(p.content);
              if (p.link_preview && p.link_preview.url) {
                const trimmedUrl = p.link_preview.url.trim();
                if (textToDisplay.trim() === trimmedUrl) {
                  // Hide raw naked URL when preview card is displayed, exactly like Facebook
                  return null;
                }
                // Strip raw URL if user wrote a caption along with it
                textToDisplay = textToDisplay.replace(trimmedUrl, '').trim();
                if (!textToDisplay) return null;
              }

              // ✅ FULL-BLEED COLORED TEXT POST: Render text directly on the chosen color with zero container barrier
              if (p.background && !mediaInfo.mediaUrl && !isMarketplace && !isSharedPost) {
                return (
                  <div
                    className="w-full min-h-[320px] md:min-h-[380px] flex items-center justify-center p-8 sm:p-12 text-center text-white font-black text-2xl sm:text-3xl md:text-4xl shadow-inner select-text my-1 leading-relaxed tracking-tight"
                    style={{
                      background: p.background,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div className="max-w-[85%] break-words whitespace-pre-wrap font-extrabold">
                      {textToDisplay}
                    </div>
                  </div>
                );
              }

              return (
                <div className="px-3 md:px-4 pb-2">
                  <ExpandableRichText
                    text={textToDisplay}
                    users={users}
                    onProfileClick={onProfileClick}
                    onHashtagClick={onHashtagClick}
                    maxWords={14}
                    fontSizePx={isSharedPost ? 18 : 23}
                  />
                </div>
              );
            })()}

            {isSharedPost && (
              <div className="mx-3 md:mx-4 mb-3">
                {originalPost ? (
                  isSharedVideo ? (
                    <InstagramVideoShareCard
                      post={p}
                      originalPost={originalPost}
                      ownerAuthor={ownerAuthor}
                      currentUser={currentUser}
                      users={users}
                      onProfileClick={onProfileClick}
                      onVideoClick={onVideoClick}
                      onHashtagClick={onHashtagClick}
                    />
                  ) : (
                    <div className="border border-[#334155] bg-[#0A101F] rounded-2xl overflow-hidden shadow-sm hover:border-[#475569] transition-all">
                      {/* Owner Header */}
                      <div className="p-3 md:p-3.5 flex items-center justify-between border-b border-[#1E293B]/60 bg-[#0F172A]/50">
                      <div
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ownerAuthor?.id) onProfileClick(safeUserId(ownerAuthor));
                        }}
                      >
                        <img
                          src={avatarFrom(ownerAuthor)}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-[#1E293B]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="font-bold text-[#F8FAFC] text-[20px] hover:underline cursor-pointer truncate">
                              {ownerAuthor.name || 'User'}
                            </h5>
                            {Boolean(ownerAuthor.is_verified) && (
                              <VerifiedBadge size={20} className="shrink-0" />
                            )}
                            {isSharedStory && (
                              <span className="text-[#1877F2] text-[12px] font-bold bg-[#1877F2]/10 px-2 py-0.5 rounded-full">
                                Story
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[#94A3B8] text-[13px]">
                            <span>@{ownerAuthor.username || 'user'}</span>
                            {originalPost.created_at && (
                              <>
                                <span>•</span>
                                <span>{formatRelativeTime(originalPost.created_at)}</span>
                              </>
                            )}
                            <span>•</span>
                            <i className="fas fa-globe-americas text-[12px]" title="Public"></i>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Text Story Preview if shared text story without media */}
                    {isSharedStory && (originalPost.type === 'text' || originalPost.background_style) && !origMediaInfo?.urls?.length && (
                      <div
                        className="h-[300px] flex items-center justify-center text-center px-6 cursor-pointer"
                        style={{
                          background:
                            originalPost.background_style ||
                            'linear-gradient(45deg, #1877F2, #0055FF)',
                        }}
                        onClick={() => onOpenStory?.(originalPost)}
                      >
                        <div className="max-w-[85%]">
                          <p className="text-white font-bold text-2xl whitespace-pre-wrap break-words">
                            {originalPost.text_content || originalPost.content || 'Story'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Product Title if shared product */}
                    {originalPost.title && !isSharedSong && (
                      <div className="px-3 md:px-3.5 pt-3 pb-0.5">
                        <h4 className="font-bold text-[#F8FAFC] text-[18px] sm:text-[19px] leading-snug">
                          {originalPost.title}
                        </h4>
                      </div>
                    )}

                    {/* Owner Description / Content */}
                    {!isSharedSong && (() => {
                      const sharedTitle = String(originalPost.title || '').trim();
                      const rawSharedDesc = String(originalPost.description || '').trim();
                      const rawSharedContent = String(originalPost.content || originalPost.text_content || '').trim();

                      // If backend has pr.title AS content, avoid repeating the title as description
                      let candidateText = rawSharedDesc;
                      if (!candidateText || candidateText.toLowerCase() === sharedTitle.toLowerCase()) {
                        candidateText = rawSharedContent.toLowerCase() !== sharedTitle.toLowerCase() ? rawSharedContent : '';
                      }

                      if (candidateText && sharedTitle && candidateText.toLowerCase().startsWith(sharedTitle.toLowerCase())) {
                        candidateText = candidateText.slice(sharedTitle.length).replace(/^[\s\-–—:\n\r]+/, '').trim();
                      }

                      if (!candidateText) return null;

                      return (
                        <div className="p-3 md:px-3.5 text-[#F8FAFC]">
                          <ExpandableRichText
                            text={candidateText}
                            users={users}
                            onProfileClick={onProfileClick}
                            onHashtagClick={onHashtagClick}
                            maxWords={25}
                            fontSizePx={17}
                          />
                        </div>
                      );
                    })()}

                    {/* Owner Media */}
                    {!isSharedSong && origMediaInfo && origMediaInfo.urls.length > 0 && (
                      <div className="w-full bg-black">
                        {origMediaInfo.isVideo ? (
                          <div
                            className="cursor-pointer relative min-h-[260px] max-h-[480px] bg-black overflow-hidden"
                            onClick={() => onVideoClick(originalPost)}
                          >
                            <video
                              src={origMediaInfo.videoUrl || origMediaInfo.urls[0]}
                              className="w-full h-full max-h-[480px] object-contain bg-black"
                              preload="none"
                              playsInline
                              controls
                            />
                          </div>
                        ) : (
                          <MediaGrid
                            media={origMediaInfo.urls.map((u: string) => ({
                              url: u,
                              thumb: u,
                              feed: u,
                              full: u,
                            }))}
                            onOpen={(url, index) => {
                              openGallery(origMediaInfo.urls, index, url);
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Shared Product Price & View Product Button */}
                    {isSharedProduct && (
                      <div className="px-4 py-2.5 flex items-center justify-between border-t border-[#1E293B] bg-[#0A101F]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {origPrice ? (
                            <>
                              <span className="text-[#F8FAFC] text-[18px] font-bold">
                                {origCurrency}
                              </span>
                              <span className="text-[#F8FAFC] text-[21px] font-bold">
                                {origPrice}
                              </span>
                            </>
                          ) : (
                            <span className="text-[#94A3B8] text-sm font-medium">
                              {origLoc || 'Marketplace'}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-1.5 rounded-full font-bold text-[15px] transition-colors shadow-sm cursor-pointer shrink-0 flex items-center gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (targetSharedProductId) {
                              if (onViewProduct) onViewProduct(targetSharedProductId);
                              else if (onViewProductFromPost) onViewProductFromPost(targetSharedProductId);
                            }
                          }}
                        >
                          <i className="fas fa-shopping-bag text-xs" />
                          <span>View product</span>
                        </button>
                      </div>
                    )}

                    {/* Shared Song Card: Cover + Centered Play Button + Track Details & Action */}
                    {isSharedSong && sharedSongData && (
                      <div className="border-t border-[#1E293B] bg-[#0A101F]">
                        <div
                          className="relative group cursor-pointer overflow-hidden bg-slate-950/70"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenAudio) onOpenAudio(sharedSongData);
                            else if (onPlayAudioTrack) onPlayAudioTrack(sharedSongData);
                          }}
                        >
                          {/* Song Cover Art with Play Button Overlay */}
                          <div className="w-full aspect-[16/9] sm:aspect-[2/1] max-h-[320px] relative overflow-hidden bg-black/60 flex items-center justify-center">
                            <img
                              src={sharedSongData.cover_image_url}
                              alt={sharedSongData.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
                              }}
                            />
                            {/* Ambient Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0A101F] via-black/35 to-transparent" />

                            {/* Centered Large Play Button Overlay */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <button
                                type="button"
                                aria-label="Play song"
                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#1877F2]/90 hover:bg-[#1877F2] text-white flex items-center justify-center shadow-xl shadow-[#1877F2]/40 backdrop-blur-sm transform group-hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-white/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onOpenAudio) onOpenAudio(sharedSongData);
                                  else if (onPlayAudioTrack) onPlayAudioTrack(sharedSongData);
                                }}
                              >
                                <i className="fas fa-play text-2xl sm:text-3xl ml-1 text-white" />
                              </button>
                            </div>

                            {/* Genre / Duration badge on cover */}
                            {(sharedSongData.genre || sharedSongData.duration_seconds) && (
                              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                                {sharedSongData.genre && (
                                  <span className="bg-black/70 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full font-semibold border border-white/10">
                                    {sharedSongData.genre}
                                  </span>
                                )}
                                {sharedSongData.duration_seconds ? (
                                  <span className="bg-black/70 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full font-mono font-medium border border-white/10">
                                    {Math.floor(sharedSongData.duration_seconds / 60)}:
                                    {String(sharedSongData.duration_seconds % 60).padStart(2, '0')}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>

                          {/* Song Info Bar with Play Button */}
                          <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3 border-t border-[#1E293B]/70 bg-[#0B1120]">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#1E293B] shadow-sm bg-black/40">
                                <img
                                  src={sharedSongData.cover_image_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
                                  }}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[16px] sm:text-[17px] font-bold text-[#F8FAFC] truncate">
                                  {sharedSongData.title}
                                </div>
                                <div className="text-[13px] sm:text-[14px] text-[#94A3B8] truncate flex items-center gap-1.5">
                                  <span>{sharedSongData.artist_name}</span>
                                  {sharedSongData.album_name && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate">{sharedSongData.album_name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Play Button */}
                            <button
                              type="button"
                              className="bg-[#1877F2] hover:bg-[#166FE5] active:scale-95 text-white font-bold px-4 sm:px-5 py-2 rounded-xl text-[14px] sm:text-[15px] shrink-0 flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenAudio) onOpenAudio(sharedSongData);
                                else if (onPlayAudioTrack) onPlayAudioTrack(sharedSongData);
                              }}
                            >
                              <i className="fas fa-play text-xs text-white" />
                              <span>Play</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Owner Audio Preview if regular audio post (non-sharedSong) */}
                    {!isSharedSong && (originalPost.song_url || originalPost.audio_url || originalPost.item_type === 'music' || originalPost.item_type === 'song') && (
                      <div className="p-3 border-t border-[#1E293B] bg-[#0B1120] flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#1E293B] bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]">
                            {originalPost.cover_image_url || originalPost.song_cover_image_url ? (
                              <img
                                src={originalPost.cover_image_url || originalPost.song_cover_image_url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <i className="fas fa-music text-lg"></i>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-bold text-[#F8FAFC] truncate">
                              {originalPost.song_title || originalPost.title || 'Audio Track'}
                            </div>
                            <div className="text-[13px] text-[#94A3B8] truncate">
                              {originalPost.artist_name || originalPost.author_name || 'Music'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold px-4 py-2 rounded-xl text-[14px] shrink-0 flex items-center gap-1.5 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            const trk: any = {
                              id: originalPost.song_id || originalPost.id,
                              title: originalPost.song_title || originalPost.title || 'Audio Track',
                              artist: originalPost.artist_name || originalPost.author_name || 'Music',
                              artist_name: originalPost.artist_name || originalPost.author_name || 'Music',
                              url: originalPost.audio_url || originalPost.song_url || '',
                              audio_url: originalPost.audio_url || originalPost.song_url,
                              cover: originalPost.cover_image_url || originalPost.song_cover_image_url,
                              cover_image_url: originalPost.cover_image_url || originalPost.song_cover_image_url,
                              type: 'music',
                            };
                            if (onOpenAudio) onOpenAudio(trk);
                            else if (onPlayAudioTrack) onPlayAudioTrack(trk);
                          }}
                        >
                          <i className="fas fa-play text-xs" />
                          <span>Play</span>
                        </button>
                      </div>
                    )}
                  </div>
                )) : p.shared_post_id ? (
                  <div className="border border-[#334155] bg-[#0A101F] rounded-2xl overflow-hidden p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]">
                        <i className="fas fa-link text-lg"></i>
                      </div>
                      <div>
                        <div className="text-[17px] font-bold text-[#F8FAFC]">Original Post</div>
                        <div className="text-[13px] text-[#38BDF8]">
                          https://featheredsocial.site/post/{p.shared_post_id}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(`https://featheredsocial.site/post/${p.shared_post_id}`, '_blank')}
                      className="bg-[#1877F2] text-white px-4 py-1.5 rounded-lg text-[14px] font-bold hover:bg-[#166FE5]"
                    >
                      View Post
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {isMusic && !isSharedPost && regularSongData && (
              <div className="border-t border-[#1E293B] bg-[#0A101F]">
                <div
                  className="relative group cursor-pointer overflow-hidden bg-slate-950/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenAudio) onOpenAudio(regularSongData);
                    else if (onPlayAudioTrack) onPlayAudioTrack(regularSongData);
                  }}
                >
                  {/* Song Cover Art with Play Button Overlay */}
                  <div className="w-full aspect-[16/9] sm:aspect-[2/1] max-h-[320px] relative overflow-hidden bg-black/60 flex items-center justify-center">
                    <img
                      src={regularSongData.cover_image_url}
                      alt={regularSongData.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
                      }}
                    />
                    {/* Ambient Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0A101F] via-black/35 to-transparent" />

                    {/* Centered Large Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        type="button"
                        aria-label="Play song"
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#1877F2]/90 hover:bg-[#1877F2] text-white flex items-center justify-center shadow-xl shadow-[#1877F2]/40 backdrop-blur-sm transform group-hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenAudio) onOpenAudio(regularSongData);
                          else if (onPlayAudioTrack) onPlayAudioTrack(regularSongData);
                        }}
                      >
                        <i className="fas fa-play text-2xl sm:text-3xl ml-1 text-white" />
                      </button>
                    </div>

                    {/* Genre / Duration badge on cover */}
                    {(regularSongData.genre || regularSongData.duration_seconds) && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        {regularSongData.genre && (
                          <span className="bg-black/70 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full font-semibold border border-white/10">
                            {regularSongData.genre}
                          </span>
                        )}
                        {regularSongData.duration_seconds ? (
                          <span className="bg-black/70 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full font-mono font-medium border border-white/10">
                            {Math.floor(regularSongData.duration_seconds / 60)}:
                            {String(regularSongData.duration_seconds % 60).padStart(2, '0')}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Song Info Bar with Play Button */}
                  <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3 border-t border-[#1E293B]/70 bg-[#0B1120]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#1E293B] shadow-sm bg-black/40">
                        <img
                          src={regularSongData.cover_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[16px] sm:text-[17px] font-bold text-[#F8FAFC] truncate">
                          {regularSongData.title}
                        </div>
                        <div className="text-[13px] sm:text-[14px] text-[#94A3B8] truncate flex items-center gap-1.5">
                          <span>{regularSongData.artist_name}</span>
                          {regularSongData.album_name && (
                            <>
                              <span>•</span>
                              <span className="truncate">{regularSongData.album_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="bg-[#1877F2] hover:bg-[#166FE5] active:scale-95 text-white font-bold px-4 sm:px-5 py-2 rounded-xl text-[14px] sm:text-[15px] shrink-0 flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenAudio) onOpenAudio(regularSongData);
                        else if (onPlayAudioTrack) onPlayAudioTrack(regularSongData);
                      }}
                    >
                      <i className="fas fa-play text-xs text-white" />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isPodcast && !isSharedPost && (
              <div className="mx-3 md:mx-4 mb-3 bg-[#0B1120] border border-[#1E293B] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <img
                    src={podcast?.cover_image_url || ''}
                    className="w-14 h-14 rounded-xl object-cover bg-[#0B1120]"
                    alt=""
                  />
                  <div className="flex-1 overflow-hidden">
                    <div className="text-white font-bold text-[17px] truncate">
                      {podcast?.title || 'Untitled'}
                    </div>
                    <div className="text-[#94A3B8] text-[14px] truncate">
                      {podcast?.description}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAudio?.(podcast);
                    }}
                    className="bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold px-4 py-2 rounded-xl text-[15px]"
                  >
                    Play
                  </button>
                </div>
              </div>
            )}

            {p.link_preview && !mediaInfo.mediaUrl && !isMarketplace && !isSharedPost && (
              <div
                className="w-full mb-2.5 bg-[#0B1120] border-y border-[#1E293B]/70 overflow-hidden cursor-pointer hover:bg-[#141E33] transition-colors"
                onClick={() =>
                  window.open(p.link_preview.url, '_blank', 'noopener noreferrer')
                }
              >
                {p.link_preview.image && (
                  <div className="w-full h-48 bg-[#1E293B] overflow-hidden">
                    <img
                      src={p.link_preview.image}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="p-4 bg-[#1E293B]">
                  <div className="text-[#94A3B8] text-[13px] uppercase font-bold mb-1">
                    {p.link_preview.domain}
                  </div>
                  <div className="text-[#F8FAFC] font-bold text-[19px] mb-1 line-clamp-2">
                    {p.link_preview.title}
                  </div>
                  <div className="text-[#94A3B8] text-[16px] line-clamp-3">
                    {p.link_preview.description}
                  </div>
                </div>
              </div>
            )}
            
            {isMarketplace ? (
              <>
                {marketplaceGridData.mediaForGrid.length > 0 && (
                  <div className="w-full">
                    <div className="w-full bg-black">
                      <MediaGrid
                        media={marketplaceGridData.mediaForGrid}
                        onOpen={(url, index) => {
                          openGallery(marketplaceGridData.galleryUrls, index, url);
                        }}
                      />
                    </div>
                  </div>
                )}

                {(price || productId) && (
                  <div
                    className="px-4 py-2 flex items-center justify-between border-t border-[#1E293B] mt-1 cursor-pointer hover:bg-slate-800/30 transition-colors"
                    onClick={() => {
                      if (productId) {
                        if (onViewProduct) onViewProduct(productId);
                        else if (onViewProductFromPost) onViewProductFromPost(productId);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {price ? (
                        <>
                          <span className="text-[#F8FAFC] text-[19px] font-bold">
                            {currency}
                          </span>
                          <span className="text-[#F8FAFC] text-[22px] font-bold">
                            {price}
                          </span>
                        </>
                      ) : (
                        <span className="text-[#94A3B8] text-sm font-medium">
                          {loc || 'Marketplace'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-1.5 rounded-full font-bold text-[15px] transition-colors shadow-sm cursor-pointer shrink-0 flex items-center gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (productId) {
                          if (onViewProduct) onViewProduct(productId);
                          else if (onViewProductFromPost) onViewProductFromPost(productId);
                        }
                      }}
                    >
                      <i className="fas fa-shopping-bag text-xs" />
                      <span>View Product</span>
                    </button>
                  </div>
                )}

                {shouldShowSponsoredButton && (
                  <div className="px-3 pt-2 pb-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSponsoredClick();
                      }}
                      className="w-full bg-[#1877F2] hover:bg-[#166FE5] active:scale-[0.99] text-white font-semibold py-2 px-4 text-[14.5px] rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                    >
                      <span>{sponsoredCtaText}</span>
                      <i className="fas fa-chevron-right text-[11px] opacity-80"></i>
                    </button>
                  </div>
                )}

                <div className="px-3 md:px-4 py-2.5 flex items-center justify-between text-[#94A3B8] text-[15px] border-t border-[#1E293B]">
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {finalReactionCount > 0 && (
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenReactionsSheet();
                        }}
                      >
                        <div className="flex -space-x-2">
                          {emojiList.slice(0, 2).map((e, i) => (
                            <span
                              key={i}
                              className="w-[24px] h-[24px] rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[16px]"
                              style={{ zIndex: 10 - i }}
                            >
                              {e}
                            </span>
                          ))}
                        </div>

                        {reactionText && (
                          <span className="text-[15px] md:text-[16px] text-[#F8FAFC] font-bold">
                            {reactionText}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
                      onClick={() => handleOpenComments()}
                    >
                      {formatCount(commentCount)} {commentCount === 1 ? 'Discussion' : 'Discussions'}
                    </span>
                    {shareCount > 0 && (
                      <span
                        className="hover:underline cursor-pointer text-[15px] md:text-[16px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!currentUser) {
                            alert('Please login to share posts.');
                            return;
                          }
                          setShowShareSheet(true);
                        }}
                      >
                        {formatCount(shareCount)} {shareCount === 1 ? 'Share' : 'Shares'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-3.5 py-2.5 border-t border-[#1E293B] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <ReactionButton
                      currentUserReactions={finalMyReaction || undefined}
                      reactionCount={finalReactionCount}
                      onReact={handleReactClick}
                      isGuest={!currentUser}
                      postId={productId}
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenComments(e);
                      }}
                      aria-label="Discuss & Comments"
                      title="Discuss"
                    >
                      <i className="far fa-comment text-[22px]"></i>
                      {commentCount > 0 && (
                        <span className="text-[14px] font-semibold text-[#F8FAFC]">
                          {formatCount(commentCount)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                      onClick={() => {
                        if (!currentUser) {
                          alert('Please login to share posts.');
                          return;
                        }
                        setShowShareSheet(true);
                      }}
                      aria-label="Share post"
                      title="Share"
                    >
                      <i className="far fa-paper-plane text-[21px]"></i>
                      {shareCount > 0 && (
                        <span className="text-[14px] font-semibold text-[#F8FAFC]">
                          {formatCount(shareCount)}
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SavePostButton post={p} />
                    {pushButton && <div className="ml-1">{pushButton}</div>}
                  </div>
                </div>
              </>
            ) : (
              <>   
                {!isSharedPost && !p.background && imageMedia.length > 0 && (
                  <MediaGrid
                    media={imageMedia.map((m) => ({
                      url: m.feed || m.url,
                      thumb: m.thumb || m.url,
                      feed: m.feed || m.url,
                      full: m.full || m.feed || m.url,
                    }))}
                    onOpen={(url, index) => {
                      const urls = imageMedia.map((m) => m.full || m.feed || m.url);
                      openGallery(urls, index, url);
                    }}
                  />
                )}

                {!isSharedPost && !p.background && videoMedia.length > 0 && (
                  <div
                    className="cursor-pointer relative min-h-[320px] max-h-[540px] bg-black rounded-lg overflow-hidden my-2"
                    onClick={() => onVideoClick(post)}
                  >
                    <video
                      src={videoMedia[0].url}
                      className="w-full h-full max-h-[540px] object-contain bg-black"
                      preload="none"
                      playsInline
                      muted
                      controls
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center">
                        <i className="fas fa-play text-white text-xl ml-1 opacity-80"></i>
                      </div>
                    </div>
                  </div>
                )}

                {!isSharedPost && !isSongPost && !p.background && mediaInfo.mediaUrl && mediaInfo.isAudio && onPlayAudioTrack && (
                  <div className="my-3">
                    {(() => {
                      const cover =
                        (p as any).song_cover_image_url ||
                        imageMedia?.[0]?.url ||
                        a.profile_image_url;

                      const titleText = p.content || 'Audio';
                      const artistText =
                        (p as any).song_artist_name || a.name || 'Unknown';

                      return (
                        <div className="rounded-lg overflow-hidden border border-[#1E293B] bg-[#1E293B]">
                          {cover ? (
                            <div className="relative">
                              <img
                                src={cover}
                                alt="Cover"
                                className="w-full h-[260px] md:h-[320px] object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  if (
                                    a.profile_image_url &&
                                    img.src !== a.profile_image_url
                                  ) {
                                    img.src = a.profile_image_url;
                                  }
                                }}
                              />

                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                              <div className="absolute left-3 right-3 bottom-3">
                                <div className="p-3 rounded-lg bg-[#0B1120]/90 border border-[#1E293B] backdrop-blur-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#0B1120] flex-shrink-0">
                                      <img
                                        src={cover}
                                        alt="Mini cover"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="text-[#F8FAFC] font-bold text-[17px]">
                                        Audio Track
                                      </div>
                                      <div className="text-[#94A3B8] text-[15px] truncate">
                                        {titleText}
                                      </div>
                                      <div className="text-[#94A3B8] text-[14px] truncate">
                                        {artistText}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() =>
                                        onPlayAudioTrack!({
                                          id: postId,
                                          title: titleText,
                                          artist: artistText,
                                          url: mediaInfo.mediaUrl,
                                          duration: 0,
                                          coverImage: cover || a.profile_image_url,
                                        })
                                      }
                                      className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-2 rounded-lg font-bold text-[15px] transition-colors flex-shrink-0"
                                    >
                                      <i className="fas fa-play mr-1"></i> Play
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-[#1E293B]">
                              <div className="flex items-center gap-3">
                                <i className="fas fa-music text-[#1877F2] text-2xl"></i>
                                <div className="flex-1">
                                  <div className="text-[#F8FAFC] font-bold text-[17px]">
                                    Audio Track
                                  </div>
                                  <div className="text-[#94A3B8] text-[15px]">
                                    {p.content || 'Listen to audio'}
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    onPlayAudioTrack!({
                                      id: postId,
                                      title: titleText,
                                      artist: artistText,
                                      url: mediaInfo.mediaUrl,
                                      duration: 0,
                                      coverImage: a.profile_image_url,
                                    })
                                  }
                                  className="bg-[#1877F2] hover:bg-[#166FE5] text-white px-4 py-2 rounded-lg font-bold text-[15px] transition-colors"
                                >
                                  <i className="fas fa-play mr-1"></i> Play
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {shouldShowSponsoredButton && (
                  <div className="px-3 pt-2 pb-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSponsoredClick();
                      }}
                      className="w-full bg-[#1877F2] hover:bg-[#166FE5] active:scale-[0.99] text-white font-semibold py-2 px-4 text-[14.5px] rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                    >
                      <span>{sponsoredCtaText}</span>
                      <i className="fas fa-chevron-right text-[11px] opacity-80"></i>
                    </button>
                  </div>
                )}

                <div className="px-3 md:px-4 py-2.5 flex items-center justify-between text-[#94A3B8] text-[15px] border-t border-[#1E293B]">
                  <div className="flex items-center gap-2 min-h-[24px]">
                    {finalReactionCount > 0 && (
                      <div
                        className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenReactionsSheet();
                        }}
                      >
                        <div className="flex -space-x-2">
                          {emojiList.slice(0, 2).map((e, i) => (
                            <span
                              key={i}
                              className="w-[24px] h-[24px] rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[16px]"
                              style={{ zIndex: 10 - i }}
                            >
                              {e}
                            </span>
                          ))}
                        </div>

                        {reactionText && (
                          <span className="text-[15px] md:text-[16px] text-[#F8FAFC] font-bold">
                            {reactionText}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
                      onClick={() => handleOpenComments()}
                    >
                      {formatCount(commentCount)} {commentCount === 1 ? 'Discussion' : 'Discussions'}
                    </span>
                    {shareCount > 0 && (
                      <span
                        className="hover:underline cursor-pointer text-[15px] md:text-[16px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!currentUser) {
                            alert('Please login to share posts.');
                            return;
                          }
                          setShowShareSheet(true);
                        }}
                      >
                        {formatCount(shareCount)} {shareCount === 1 ? 'Share' : 'Shares'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-3.5 py-2.5 border-t border-[#1E293B] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <ReactionButton
                      currentUserReactions={finalMyReaction || undefined}
                      reactionCount={finalReactionCount}
                      onReact={handleReactClick}
                      isGuest={!currentUser}
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenComments(e);
                      }}
                      aria-label="Discuss & Comments"
                      title="Discuss"
                    >
                      <i className="far fa-comment text-[22px]"></i>
                      {commentCount > 0 && (
                        <span className="text-[14px] font-semibold text-[#F8FAFC]">
                          {formatCount(commentCount)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
                      onClick={() => {
                        if (!currentUser) {
                          alert('Please login to share posts.');
                          return;
                        }
                        setShowShareSheet(true);
                      }}
                      aria-label="Share post"
                      title="Share"
                    >
                      <i className="far fa-paper-plane text-[21px]"></i>
                      {shareCount > 0 && (
                        <span className="text-[14px] font-semibold text-[#F8FAFC]">
                          {formatCount(shareCount)}
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SavePostButton post={p} />
                    {pushButton && <div className="ml-1">{pushButton}</div>}
                  </div>
                </div>
              </>
            )}

            {/* Inline Facebook-style single comment preview */}
            {!hideCommentPreview && previewComment && previewAuthor && (
              <div className="px-3.5 pb-3 pt-1 border-t border-[#1E293B]/40">
                <div className="flex items-start gap-2.5">
                  <img
                    src={previewAuthor.image}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => previewAuthor.uid && onProfileClick(previewAuthor.uid)}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="inline-block max-w-full bg-[#162137]/65 hover:bg-[#1E293B]/70 rounded-[18px] px-3.5 py-2 border border-[#1E293B]/60 transition-colors cursor-pointer"
                      onClick={() => handleOpenComments()}
                    >
                      <div
                        className="text-[#F8FAFC] font-bold text-[21px] leading-tight cursor-pointer hover:underline inline-flex items-center gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (previewAuthor.uid) onProfileClick(previewAuthor.uid);
                        }}
                      >
                        <span className="truncate">{previewAuthor.name}</span>
                        {(previewComment.is_verified || previewAuthor.user?.is_verified) && (
                          <VerifiedBadge size={21} className="shrink-0" />
                        )}
                      </div>
                      <div className="text-[#CBD5E1] text-[20.5px] leading-[1.38] font-normal whitespace-pre-wrap break-words mt-0.5">
                        {previewComment.text}
                      </div>
                      {previewComment.image_url && (
                        <div className="mt-1.5 rounded-lg overflow-hidden max-w-[200px]">
                          <img
                            src={previewComment.image_url}
                            alt=""
                            className="object-cover rounded-lg max-h-[140px]"
                          />
                        </div>
                      )}
                    </div>
                    <div className="mt-1 ml-3 flex items-center gap-3 text-[12px]">
                      <span className="text-[#B0B3B8] font-normal">
                        {formatRelativeTime(previewComment.created_at || previewComment.createdAt || previewComment.timestamp)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleLikePreviewComment(previewComment)}
                        className={`font-bold hover:underline transition-colors inline-flex items-center gap-1 ${
                          previewComment.liked_by_me
                            ? 'text-[#F43F5E]'
                            : 'text-[#B0B3B8] hover:text-[#E4E6EB]'
                        }`}
                      >
                        <span className="text-[13px]">{previewComment.liked_by_me ? '❤️' : '🤍'}</span>
                        <span>{previewComment.liked_by_me ? 'Liked' : 'Like'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenComments()}
                        className="font-bold text-[#B0B3B8] hover:text-[#E4E6EB] hover:underline transition-colors"
                      >
                        Reply
                      </button>
                      {previewComment.likes_count > 0 && (
                        <span className="inline-flex items-center gap-1 bg-[#F43F5E]/15 text-[#F43F5E] px-1.5 py-0.5 rounded-full text-[11px] font-bold">
                          <span className="text-[10px]">❤️</span>
                          <span>{formatCount(previewComment.likes_count)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
        </article>

        <ShareBottomSheet
          isOpen={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          post={{
            ...p,
            source: isMarketplace ? 'product' : isGroupPost ? 'group_post' : isSongPost ? 'music' : 'post',
            item_type: isMarketplace ? 'product' : isGroupPost ? 'group_post' : isSongPost ? 'music' : 'post',
            product_id: productId,
            group_id: groupId,
            song_id: isSongPost ? (songData?.id || p.song_id2 || p.song_id || p.id) : undefined,
          }}
          currentUser={currentUser}
          users={users}
          groups={groups}
          brands={brands}
          chats={chats}
          onShareComplete={handleShareComplete}
        />

        <ReactionsSheet
          isOpen={showReactionsSheet}
          onClose={() => setShowReactionsSheet(false)}
          post={post}
          onProfileClick={onProfileClick}
          onOpenComments={onOpenComments}
        />

        <GalleryViewer
          isOpen={galleryOpen}
          urls={galleryUrls}
          startIndex={galleryIndex}
          onClose={() => setGalleryOpen(false)}
          post={post}
          currentUser={currentUser}
          reactionCount={finalReactionCount}
          commentCount={commentCount}
          shareCount={shareCount}
          myReaction={finalMyReaction}
          onReact={(post, type) => onReact(post, type)}
          onOpenComments={() => handleOpenComments()}
          onShare={() => setShowShareSheet(true)}
          onOpenReactions={handleOpenReactionsSheet}
        />
      </div>
    );
  },
  postPropsEqual
);

                

/**
 * =========================
 * ✅ CREATE POST CARD
 * =========================
 */
export const CreatePost: React.FC<{
  currentUser: User;
  onProfileClick: (id: number) => void;
  onClick: () => void;
  onPhotoClick: () => void;
  onVideoClick: () => void;
  onCreateEventClick: () => void;
}> = ({
  currentUser,
  onProfileClick,
  onClick,
  onPhotoClick,
  onVideoClick,
  onCreateEventClick,
}) => (
  <div className="w-full bg-[#0F172A] border-b border-[#1E293B] p-3.5 sm:p-4">
    <div className="flex items-center gap-3 mb-2.5">
      <img
        src={avatarFrom(currentUser)}
        alt=""
        className="w-10 h-10 rounded-full object-cover cursor-pointer border border-[#1E293B] flex-shrink-0"
        onClick={() => onProfileClick(safeUserId(currentUser))}
      />

      <div
        className="flex-1 bg-transparent hover:bg-transparent border-0 px-1 py-2 cursor-pointer flex items-center transition-all group"
        onClick={onClick}
      >
        <span className="text-[#94A3B8] group-hover:text-[#F8FAFC] text-[20px] font-medium tracking-tight truncate transition-colors select-none">
          What's On Your Mind?
        </span>
      </div>

      <button
        type="button"
        onClick={onPhotoClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#1E293B] text-[#10B981] transition-colors"
      >
        <i className="fas fa-image text-[19px]"></i>
        <span className="text-[14px] font-semibold text-[#CBD5E1] hidden xs:inline">Photo</span>
      </button>
    </div>

    <div className="border-t border-[#1E293B]/60 pt-2 flex items-center justify-between gap-1">
      {/* Live Video */}
      <button
        type="button"
        className="flex items-center justify-center flex-1 gap-2 py-2 px-1 hover:bg-[#1E293B] rounded-xl cursor-pointer transition-colors focus:outline-none"
        onClick={onClick}
      >
        <i className="fas fa-video text-[#1877F2] text-[18px] sm:text-[20px]"></i>
        <span className="text-[#94A3B8] hover:text-[#F8FAFC] font-semibold text-[13px] sm:text-[14px] hidden sm:block transition-colors">
          Live
        </span>
      </button>

      {/* Photo */}
      <button
        type="button"
        className="flex items-center justify-center flex-1 gap-2 py-2 px-1 hover:bg-[#1E293B] rounded-xl cursor-pointer transition-colors focus:outline-none"
        onClick={onPhotoClick}
      >
        <i className="fas fa-image text-[#10B981] text-[18px] sm:text-[20px]"></i>
        <span className="text-[#94A3B8] hover:text-[#F8FAFC] font-semibold text-[13px] sm:text-[14px] hidden sm:block transition-colors">
          Photo
        </span>
      </button>

      {/* Reel Video */}
      <button
        type="button"
        className="flex items-center justify-center flex-1 gap-2 py-2 px-1 hover:bg-[#1E293B] rounded-xl cursor-pointer transition-colors focus:outline-none"
        onClick={onVideoClick}
      >
        <i className="fas fa-camera text-[#F43F5E] text-[18px] sm:text-[20px]"></i>
        <span className="text-[#94A3B8] hover:text-[#F8FAFC] font-semibold text-[13px] sm:text-[14px] hidden sm:block transition-colors">
          Video
        </span>
      </button>

      {/* Create Event */}
      <button
        type="button"
        className="flex items-center justify-center flex-1 gap-2 py-2 px-1 hover:bg-[#1E293B] rounded-xl cursor-pointer transition-colors focus:outline-none"
        onClick={onCreateEventClick}
      >
        <i className="fas fa-calendar-alt text-[#F59E0B] text-[18px] sm:text-[20px]"></i>
        <span className="text-[#94A3B8] hover:text-[#F8FAFC] font-semibold text-[13px] sm:text-[14px] hidden sm:block transition-colors">
          Event
        </span>
      </button>
    </div>
  </div>
);
  
/**
 * =========================
 * ✅ CREATE POST MODAL (with image compression support)
 * =========================
 */

/**
 * =========================
 * ✅ CREATE POST MODAL (with image compression + native Flutter upload support)
 * =========================
 */
export const CreatePostModal = memo(
  ({
    currentUser,
    users,
    onClose,
    onCreatePost,
    onCreateEventClick,
    onPhotoClick,
    onVideoClick,
    initialMedia,
  }: {
    currentUser: User;
    users: User[];
    onClose: () => void;
    onCreatePost: (
      text: string,
      files: File[],
      meta?: {
        type?: 'text' | 'image' | 'video';
        visibility?: string;
        location?: string;
        feeling?: string;
        taggedUsers?: number[];
        background?: string;
        linkPreview?: LinkPreview | null;
        // ✅ Native Flutter upload fields
        nativeMediaMeta?: any[];
        nativeMediaUrls?: string[];
        nativeMediaTypes?: string[];
        // ✅ High quality extracted video thumbnail file
        thumbnailFile?: File | null;
        compressedVideosPromise?: Promise<CompressedVideoResult | null> | null;
        compressedVideos?: CompressedVideoResult | null;
      }
    ) => void;
    onCreateEventClick?: () => void;
    onPhotoClick?: () => void;
    onVideoClick?: () => void;
    initialMedia?: {
      files?: File[];
      previews?: string[];
      mediaUrls?: string[];
      mediaType?: 'image' | 'video' | 'mixed';
      items?: any[];
      initialText?: string;
    } | null;
  }) => {
    const isVideoUrlInternal = (u?: string | null) => {
      if (!u || typeof u !== 'string') return false;
      return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i.test(u) || u.includes('/video/');
    };

    const [view, setView] = useState<'main' | 'tag' | 'feeling' | 'location'>('main');
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [type, setType] = useState<'text' | 'image' | 'video'>('text');
    const [visibility] = useState<'Public' | 'Friends'>('Public');
    const [activeBackground, setActiveBackground] = useState('');
    const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
    const [isFetchingPreview, setIsFetchingPreview] = useState(false);
    const [taggedUsers, setTaggedUsers] = useState<number[]>([]);
    const [feeling, setFeeling] = useState('');
    const [location, setLocation] = useState('');
    const [locQuery, setLocQuery] = useState('');
    const [locResults, setLocResults] = useState<any[]>([]);
    const [locLoading, setLocLoading] = useState(false);
    const searchTimeout = useRef<any>(null);
    const previewTimeout = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // ✅ Native upload states
    const [mediaMeta, setMediaMeta] = useState<any[]>([]);
    const [mediaUrls, setMediaUrls] = useState<string[]>([]);
    const [mediaTypes, setMediaTypes] = useState<string[]>([]);

    // ✅ Background video thumbnail extractor state & ref
    const videoThumbnailRef = useRef<Promise<File | null> | null>(null);
    const videoThumbnailFile = useRef<File | null>(null);

    // ✅ Background dual video compression state & ref (1080p & 720p)
    const videoCompressionRef = useRef<Promise<CompressedVideoResult | null> | null>(null);
    const videoCompressionResult = useRef<CompressedVideoResult | null>(null);

    const isVideoFile = (f: File | any) => {
      if (!f) return false;
      const type = String(f.type || '').toLowerCase();
      const name = String(f.name || '').toLowerCase();
      return type.startsWith('video/') || /\.(mp4|webm|mov|m4v|m3u8|3gp|avi|mkv)$/i.test(name);
    };

    const triggerVideoThumbExtraction = (source: File | Blob | string) => {
      videoThumbnailFile.current = null;
      const promise = generateVideoThumbnail(source)
        .then((res) => {
          videoThumbnailFile.current = res.file;
          return res.file;
        })
        .catch((err) => {
          console.warn('Quiet video thumbnail extraction:', err);
          return null;
        });
      videoThumbnailRef.current = promise;
      return promise;
    };

    const triggerVideoCompression = async (source: File) => {
      videoCompressionResult.current = null;
      // Allow thumbnail extraction to complete first so video decoder is not congested
      if (videoThumbnailRef.current) {
        await videoThumbnailRef.current.catch(() => null);
      }
      videoCompressionRef.current = compressVideoDual(source)
        .then((res) => {
          videoCompressionResult.current = res;
          if (!videoThumbnailFile.current && res.thumbnailFile) {
            videoThumbnailFile.current = res.thumbnailFile;
          }
          return res;
        })
        .catch((err) => {
          console.warn('Quiet background video compression:', err);
          return null;
        });
    };

    // ✅ Synchronize incoming initial media (e.g. from NativeMediaGalleryModal)
    useEffect(() => {
      if (initialMedia) {
        if (initialMedia.initialText) {
          setText(initialMedia.initialText);
        }
        if (initialMedia.files && initialMedia.files.length > 0) {
          setFiles(initialMedia.files);
          const v = initialMedia.files.find(isVideoFile);
          if (v) {
            triggerVideoThumbExtraction(v);
            triggerVideoCompression(v);
          }
        }
        const incomingUrls = initialMedia.previews || initialMedia.mediaUrls || [];
        if (incomingUrls.length > 0) {
          setPreviews(incomingUrls);
          setMediaUrls(incomingUrls);
          if (!videoThumbnailFile.current) {
            const vUrl = incomingUrls.find((u) => isVideoUrlInternal(u));
            if (vUrl) triggerVideoThumbExtraction(vUrl);
          }
        }
        if (initialMedia.mediaType) {
          setType(initialMedia.mediaType === 'video' ? 'video' : 'image');
        } else if (incomingUrls.some((u) => isVideoUrlInternal(u))) {
          setType('video');
        }
        setActiveBackground('');
        setLinkPreview(null);
        setView('main');
      }
    }, [initialMedia]);

    // ==================== NATIVE APP DETECTION ====================
    const isUneraNativeApp = (): boolean => {
      return Boolean(
        (window as any).UneraNative || 
        (window as any).UNERA_IS_NATIVE_APP
      );
    };

    // ✅ Listen for native upload results
    useEffect(() => {
      const handleNativeUpload = (event: any) => {
        const media = event.detail;
        console.log("📱 Native upload received:", media);
        
        if (!media || !media.feed) {
          console.error("Invalid native upload data:", media);
          return;
        }
        
        // Add preview
        setPreviews(prev => [...prev, media.thumb || media.feed]);
        setType(media.type === 'video' ? 'video' : 'image');
        
        // Store native media metadata
        setMediaMeta(prev => [
          ...prev,
          {
            thumb: media.thumb || media.feed,
            feed: media.feed,
            full: media.full || media.feed,
            type: media.type || 'image',
          }
        ]);
        
        setMediaUrls(prev => [...prev, media.feed || media.full || media.url]);
        setMediaTypes(prev => [...prev, media.type || 'image']);
        
        // Close any open pickers
        setView('main');
      };

      window.addEventListener("uneraNativeUpload", handleNativeUpload);
      return () => {
        window.removeEventListener("uneraNativeUpload", handleNativeUpload);
      };
    }, []);

    // ✅ Debug native bridge
    useEffect(() => {
      console.log("🔍 Checking native bridge:", {
        isNativeApp: isUneraNativeApp(),
        hasUneraNative: !!(window as any).UneraNative,
        hasPostMessage: !!(window as any).UneraNative?.postMessage,
      });
    }, []);

    useEffect(() => {
      if (previewTimeout.current) {
        clearTimeout(previewTimeout.current);
      }

      if (files.length > 0 || activeBackground || mediaMeta.length > 0) {
        setLinkPreview(null);
        return;
      }

      previewTimeout.current = setTimeout(async () => {
        setIsFetchingPreview(true);
        try {
          const preview = await getLinkPreview(text);
          setLinkPreview(preview);
        } catch (error) {
          console.debug('Failed to fetch link preview');
          setLinkPreview(null);
        } finally {
          setIsFetchingPreview(false);
        }
      }, 800);

      return () => {
        if (previewTimeout.current) {
          clearTimeout(previewTimeout.current);
        }
      };
    }, [text, files, activeBackground, mediaMeta]);

    useEffect(() => {
      return () => {
        previews.forEach((p) => URL.revokeObjectURL(p));
      };
    }, [previews]);

    // ✅ Photo picker - directly opens device/phone gallery
    const handleNativePhotoClick = () => {
      fileInputRef.current?.click();
    };

    // ✅ Video picker - directly opens device/phone video gallery
    const handleNativeVideoClick = () => {
      videoInputRef.current?.click();
    };

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from<File>(e.target.files || []);
      if (list.length === 0) return;
      const v = list.find(isVideoFile) || list[0];
      if (v) {
        setFiles([v]);
        setPreviews([URL.createObjectURL(v)]);
        setType('video');
        setActiveBackground('');
        setLinkPreview(null);
        setView('main');
        triggerVideoThumbExtraction(v);
        triggerVideoCompression(v);
      }
      if (e.target) {
        e.target.value = '';
      }
    };

    // ✅ Camera - works in app and web
    const handleNativeCameraClick = () => {
      fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from<File>(e.target.files || []);
      if (list.length === 0) return;

      // Use file picker uniformly in app and web
      const videos = list.filter(isVideoFile);
      const images = list.filter((f) => !isVideoFile(f) && (f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|heic)$/i.test(f.name || '')));

      if (videos.length > 0) {
        const v = videos[0];
        setFiles([v]);
        setPreviews([URL.createObjectURL(v)]);
        setType('video');
        triggerVideoThumbExtraction(v);
        triggerVideoCompression(v);
      } else {
        setFiles(images.slice(0, 9));
        setPreviews(images.slice(0, 9).map((f) => URL.createObjectURL(f)));
        setType('image');
      }

      setActiveBackground('');
      setLinkPreview(null);
      setView('main');

      if (e.target) {
        e.target.value = '';
      }
    };

    const handleLocationSearch = async (q: string) => {
      if (q.trim().length < 3) {
        setLocResults([]);
        return;
      }
      setLocLoading(true);
      try {
        const data = await apiFetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
        setLocResults(Array.isArray(data) ? data : []);
      } catch {
        setLocResults([]);
      } finally {
        setLocLoading(false);
      }
    };

    const onLocQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocQuery(val);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => handleLocationSearch(val), 450);
    };

    const canPost =
      !!text.trim() ||
      files.length > 0 ||
      previews.length > 0 ||
      !!activeBackground ||
      mediaMeta.length > 0 ||
      mediaUrls.length > 0;

    // ✅ Updated submit with native media support & extracted video thumbnail
    const submit = async () => {
      if (!canPost) return;

      const hasNativeMedia = mediaMeta.length > 0;
      const hasUrlsOnly = previews.length > 0 && files.length === 0;
      const hasVideo = type === 'video' || files.some(isVideoFile) || previews.some((p) => isVideoUrlInternal(p));
      const computedType =
        hasVideo
          ? 'video'
          : previews.length > 0
          ? 'image'
          : 'text';

      let extractedThumbFile = videoThumbnailFile.current;
      if (!extractedThumbFile && videoThumbnailRef.current) {
        extractedThumbFile = await videoThumbnailRef.current.catch(() => null);
      }
      if (!extractedThumbFile && videoCompressionResult.current?.thumbnailFile) {
        extractedThumbFile = videoCompressionResult.current.thumbnailFile;
      }
      if (!extractedThumbFile && hasVideo) {
        const vFile = files.find(isVideoFile) || files[0];
        if (vFile) {
          try {
            const res = await generateVideoThumbnail(vFile);
            extractedThumbFile = res.file;
            videoThumbnailFile.current = res.file;
          } catch (e) {
            console.warn('Quiet video thumb fallback on submit:', e);
          }
        }
      }

      onCreatePost(text, files, {
        type: hasNativeMedia
          ? mediaMeta[0]?.type === 'video'
            ? 'video'
            : 'image'
          : files.length
          ? (files.some(isVideoFile) ? 'video' : type)
          : computedType,
        visibility,
        location: location || undefined,
        feeling: feeling || undefined,
        taggedUsers: taggedUsers.length ? taggedUsers : undefined,
        background: activeBackground || undefined,
        linkPreview: linkPreview || null,
        // ✅ Pass native uploaded URLs to App.tsx
        nativeMediaMeta: hasNativeMedia ? mediaMeta : undefined,
        nativeMediaUrls: hasNativeMedia
          ? mediaUrls
          : hasUrlsOnly
          ? previews
          : undefined,
        nativeMediaTypes: hasNativeMedia
          ? mediaTypes
          : hasUrlsOnly
          ? previews.map((p) => (isVideoUrlInternal(p) ? 'video' : 'image'))
          : undefined,
        // ✅ Pass high quality extracted video thumbnail
        thumbnailFile: extractedThumbFile || undefined,
        // ✅ Pass compressed dual video promise and result
        compressedVideosPromise: videoCompressionRef.current || undefined,
        compressedVideos: videoCompressionResult.current || undefined,
      });

      onClose();
    };

    const OptionsItem = ({
      icon,
      color,
      label,
      onClick,
    }: {
      icon: string;
      color: string;
      label: string;
      onClick: () => void;
    }) => (
      <div
        className="flex items-center gap-3 p-3 hover:bg-[#1E293B] active:bg-[#1E293B] cursor-pointer transition-colors"
        onClick={onClick}
      >
        <i className={`${icon} text-[26px] w-8 text-center`} style={{ color }}></i>
        <span className="text-[#F8FAFC] text-[19px] font-bold">{label}</span>
      </div>
    );

    if (view === 'tag') {
      return (
        <div className="fixed inset-0 z-[200] bg-[#050B18] flex flex-col animate-slide-up font-sans">
          <div className="flex items-center p-4 border-b border-[#1E293B] gap-4">
            <i
              className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
              onClick={() => setView('main')}
            ></i>
            <h3 className="text-[#F8FAFC] text-[21px] font-bold">Tag People</h3>
            <button
              onClick={() => setView('main')}
              className="ml-auto text-[#1877F2] font-bold text-[17px]"
            >
              Done
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {users
              .filter((u: any) => safeUserId(u) !== safeUserId(currentUser))
              .map((u: any) => (
                <div
                  key={safeUserId(u)}
                  className="flex items-center justify-between p-2 hover:bg-[#1E293B] rounded-lg cursor-pointer"
                  onClick={() =>
                    setTaggedUsers((prev) =>
                      prev.includes(safeUserId(u))
                        ? prev.filter((uid) => uid !== safeUserId(u))
                        : [...prev, safeUserId(u)]
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={avatarFrom(u)}
                      className="w-10 h-10 rounded-full object-cover"
                      alt=""
                    />
                    <span className="text-[#F8FAFC] font-bold text-[17px]">
                      {u.name || u.username || 'User'}
                    </span>
                  </div>
                  {taggedUsers.includes(safeUserId(u)) && (
                    <i className="fas fa-check-circle text-[#1877F2] text-xl"></i>
                  )}
                </div>
              ))}
          </div>
        </div>
      );
    }

    if (view === 'feeling') {
      return (
        <div className="fixed inset-0 z-[200] bg-[#050B18] flex flex-col animate-slide-up font-sans">
          <div className="flex items-center p-4 border-b border-[#1E293B] gap-4">
            <i
              className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
              onClick={() => setView('main')}
            ></i>
            <h3 className="text-[#F8FAFC] text-[21px] font-bold">How are you feeling?</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
            {FEELINGS.map((f) => (
              <div
                key={f}
                className="p-3 bg-[#0B1120] rounded-lg text-center cursor-pointer hover:bg-[#1E293B] text-[#F8FAFC] text-[17px] border border-[#1E293B]"
                onClick={() => {
                  setFeeling(f);
                  setView('main');
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (view === 'location') {
      return (
        <div className="fixed inset-0 z-[200] bg-[#050B18] flex flex-col animate-slide-up font-sans">
          <div className="flex items-center p-4 border-b border-[#1E293B] gap-4">
            <i
              className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
              onClick={() => setView('main')}
            ></i>
            <h3 className="text-[#F8FAFC] text-[21px] font-bold">Search Location</h3>
          </div>

          <div className="p-4 flex-1 flex flex-col overflow-hidden">
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Where are you?"
                className="w-full bg-[#1E293B] rounded-xl p-4 pl-12 text-[#F8FAFC] outline-none focus:ring-2 focus:ring-[#1877F2] transition-all text-[17px]"
                autoFocus
                value={locQuery}
                onChange={onLocQueryChange}
              />
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
              {locLoading && (
                <i className="fas fa-spinner fa-spin absolute right-4 top-1/2 -translate-y-1/2 text-[#1877F2]"></i>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {locResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {locResults.map((loc, i) => {
                    const display =
                      loc.display_name ||
                      loc.name ||
                      loc.label ||
                      `${loc.city || ''}${loc.country ? `, ${loc.country}` : ''}`.trim();

                    const title = (display || '').split(',')[0] || 'Location';

                    return (
                      <div
                        key={i}
                        className="flex items-center gap-4 p-4 hover:bg-[#1E293B] rounded-xl cursor-pointer border border-[#1E293B] transition-colors group"
                        onClick={() => {
                          setLocation(display);
                          setView('main');
                        }}
                      >
                        <div className="w-12 h-12 bg-[#1E293B] rounded-xl flex items-center justify-center group-hover:bg-[#1877F2] transition-colors">
                          <i className="fas fa-location-dot text-[#F8FAFC]"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[#F8FAFC] font-bold block truncate text-[17px]">
                            {title}
                          </span>
                          <span className="text-[#94A3B8] text-[14px] block truncate">
                            {display}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : locQuery.length >= 3 && !locLoading ? (
                <div className="text-center py-10">
                  <i className="fas fa-map-marked-alt text-4xl text-[#1E293B] mb-4"></i>
                  <p className="text-[#94A3B8] text-[17px]">No matching locations found.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[14px] font-bold text-[#94A3B8] uppercase tracking-widest mb-2 px-1">
                    Nearby Suggestions
                  </p>
                  {LOCATIONS_DATA.slice(0, 6).map((loc) => (
                    <div
                      key={loc.name}
                      className="flex items-center gap-4 p-3 hover:bg-[#1E293B] rounded-xl cursor-pointer transition-colors"
                      onClick={() => {
                        setLocation(loc.name);
                        setView('main');
                      }}
                    >
                      <div className="w-10 h-10 bg-[#1E293B] rounded-full flex items-center justify-center text-xl">
                        {loc.flag}
                      </div>
                      <span className="text-[#F8FAFC] font-bold text-[17px]">{loc.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[200] bg-[#050B18] flex flex-col animate-slide-up font-sans">
        <div className="flex items-center justify-between p-4 border-b border-[#1E293B]">
          <div className="flex items-center gap-4">
            <i
              className="fas fa-arrow-left text-[#F8FAFC] text-xl cursor-pointer"
              onClick={onClose}
            ></i>
            <h3 className="text-[#F8FAFC] text-[22px] font-bold">Create Post</h3>
          </div>
          <button
            onClick={submit}
            disabled={!canPost}
            className="text-[#F8FAFC] font-bold text-[19px] disabled:text-[#94A3B8]"
          >
            POST
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <img
                src={avatarFrom(currentUser)}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
              <div>
                <div className="flex items-center gap-1 flex-wrap">
                  <h4 className="font-bold text-[#F8FAFC] text-[19px]">
                    {(currentUser as any).name || (currentUser as any).username || 'User'}
                  </h4>
                  {feeling && (
                    <span className="text-[#F8FAFC] text-[17px]"> is feeling {feeling}</span>
                  )}
                  {location && (
                    <span className="text-[#F8FAFC] text-[17px]">
                      {' '}
                      in {location.split(',')[0]}
                    </span>
                  )}
                  {taggedUsers.length > 0 && (
                    <span className="text-[#F8FAFC] text-[17px]">
                      {' '}
                      with {taggedUsers.length} others
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  <div className="bg-[#1E293B] rounded-md px-2 py-1 inline-flex items-center gap-1 text-[15px] font-bold text-[#F8FAFC] border border-[#1E293B]">
                    <i className="fas fa-globe-americas text-[14px]"></i>
                    <span>{visibility}</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`relative mb-4 transition-all duration-300 ${
                activeBackground
                  ? 'w-full min-h-[320px] md:min-h-[380px] rounded-2xl flex items-center justify-center p-6 sm:p-10 shadow-inner overflow-hidden border-0'
                  : 'min-h-[160px]'
              }`}
              style={
                activeBackground
                  ? {
                      background: activeBackground,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              {activeBackground && (
                <button
                  type="button"
                  onClick={() => setActiveBackground('')}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-colors shadow-md z-10 cursor-pointer"
                  title="Remove color background"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              )}

              <textarea
                className={`w-full bg-transparent outline-none resize-none border-0 focus:ring-0 ${
                  activeBackground
                    ? 'text-center font-black text-2xl sm:text-3xl md:text-4xl text-white drop-shadow-md placeholder-white/70 leading-relaxed tracking-tight py-4'
                    : 'text-[#F8FAFC] placeholder-[#94A3B8] text-[24px] sm:text-[26px] leading-relaxed'
                }`}
                style={
                  activeBackground
                    ? {
                        textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                      }
                    : undefined
                }
                placeholder="What's on your mind?"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={activeBackground ? 4 : 5}
                autoFocus
              />
            </div>

            {isFetchingPreview && (
              <div className="mb-4 p-4 bg-[#0B1120] border border-[#1E293B] rounded-lg flex items-center justify-center">
                <i className="fas fa-spinner fa-spin text-[#1877F2] mr-2"></i>
                <span className="text-[#94A3B8] text-[17px]">Loading link preview...</span>
              </div>
            )}

            {linkPreview && files.length === 0 && !activeBackground && mediaMeta.length === 0 && (
              <div
                className="mb-4 bg-[#0B1120] border border-[#1E293B] rounded-lg overflow-hidden cursor-pointer hover:bg-[#1E293B] transition-colors"
                onClick={() =>
                  window.open(linkPreview.url, '_blank', 'noopener noreferrer')
                }
              >
                {linkPreview.image && (
                  <img
                    src={linkPreview.image}
                    alt="Preview"
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="p-3 bg-[#1E293B]">
                  <div className="text-[#94A3B8] text-[13px] uppercase font-bold mb-1">
                    {linkPreview.domain}
                  </div>
                  <div className="text-[#F8FAFC] font-bold text-[19px] mb-1 line-clamp-1">
                    {linkPreview.title}
                  </div>
                  <div className="text-[#94A3B8] text-[16px] line-clamp-2">
                    {linkPreview.description}
                  </div>
                </div>
              </div>
            )}

            {/* Native Upload Preview */}
            {mediaMeta.length > 0 && (
              <div className="relative rounded-lg overflow-hidden border border-[#1E293B] mb-4">
                <div
                  onClick={() => {
                    setMediaMeta([]);
                    setMediaUrls([]);
                    setMediaTypes([]);
                    setPreviews([]);
                    setType('text');
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-black/80 z-10"
                >
                  <i className="fas fa-times text-white"></i>
                </div>

                {mediaMeta[0]?.type === 'video' ? (
                  <video
                    src={mediaUrls[0]}
                    controls
                    className="w-full h-auto max-h-[400px] bg-black"
                  />
                ) : (
                  <div
                    className={`grid ${
                      mediaMeta.length === 1 ? 'grid-cols-1' : 'grid-cols-3'
                    } gap-1 bg-black`}
                  >
                    {mediaMeta.slice(0, 9).map((item, i) => (
                      <img
                        key={i}
                        src={item.feed || item.thumb}
                        className={`${
                          mediaMeta.length === 1
                            ? 'w-full h-auto max-h-[400px] object-contain'
                            : 'w-full h-28 object-cover'
                        }`}
                        alt=""
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {previews.length > 0 && mediaMeta.length === 0 && (
              <div className="relative rounded-lg overflow-hidden border border-[#1E293B] mb-4 bg-black">
                <div
                  onClick={() => {
                    setFiles([]);
                    setPreviews([]);
                    setMediaUrls([]);
                    setType('text');
                  }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center cursor-pointer hover:bg-black/80 z-10"
                >
                  <i className="fas fa-times text-white"></i>
                </div>

                {previews.length === 1 && (type === 'video' || isVideoUrlInternal(previews[0])) ? (
                  <video
                    src={previews[0]}
                    controls
                    playsInline
                    className="w-full h-auto max-h-[400px] bg-black"
                  />
                ) : previews.length === 1 ? (
                  <img
                    src={previews[0]}
                    className="w-full h-auto max-h-[400px] object-contain mx-auto"
                    alt=""
                  />
                ) : (
                  <div
                    className={`grid ${
                      previews.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                    } gap-1 bg-black p-1`}
                  >
                    {previews.slice(0, 9).map((src, i) => {
                      const isVid = isVideoUrlInternal(src);
                      return (
                        <div
                          key={i}
                          className="relative aspect-square rounded overflow-hidden bg-[#0F172A]"
                        >
                          {isVid ? (
                            <video
                              src={src}
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={src}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          )}
                          {/* Order badge 1, 2, 3... */}
                          <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#1877F2] text-white font-bold text-[10px] flex items-center justify-center shadow">
                            {i + 1}
                          </div>
                          {isVid && (
                            <div className="absolute bottom-1 right-1 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1 font-semibold">
                              <i className="fas fa-video text-[8px] text-[#38BDF8]"></i>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {previews.length === 0 && mediaMeta.length === 0 && (
              <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                <div
                  className={`w-8 h-8 rounded-lg cursor-pointer border-2 bg-[#1E293B] flex items-center justify-center flex-shrink-0 ${
                    !activeBackground ? 'border-white' : 'border-[#1E293B]'
                  }`}
                  onClick={() => setActiveBackground('')}
                >
                  <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
                    <i className="fas fa-font text-black text-xs"></i>
                  </div>
                </div>

                {BACKGROUNDS.filter((b) => b.id !== 'none').map((bg) => (
                  <div
                    key={bg.id}
                    className={`w-8 h-8 rounded-lg cursor-pointer border-2 flex-shrink-0 ${
                      activeBackground === bg.value ? 'border-white' : 'border-transparent'
                    }`}
                    style={{ background: bg.value, backgroundSize: 'cover' }}
                    onClick={() => setActiveBackground(bg.value)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#1E293B]">
            <OptionsItem
              icon="fas fa-image"
              color="#45BD62"
              label="Photo"
              onClick={handleNativePhotoClick}
            />

            <OptionsItem
              icon="fas fa-camera"
              color="#F3425F"
              label="Video"
              onClick={handleNativeVideoClick}
            />

            <OptionsItem
              icon="fas fa-user-tag"
              color="#1877F2"
              label="Tag people"
              onClick={() => setView('tag')}
            />
            <OptionsItem
              icon="far fa-smile"
              color="#F7B928"
              label="Feeling/activity"
              onClick={() => setView('feeling')}
            />
            <OptionsItem
              icon="fas fa-map-marker-alt"
              color="#F02849"
              label="Check in"
              onClick={() => setView('location')}
            />
            <div
              className="flex items-center gap-3 p-3 hover:bg-[#1E293B] active:bg-[#1E293B] cursor-pointer transition-colors border-t border-[#1E293B] mt-2"
              onClick={() => {
                onClose();
                if (onCreateEventClick) onCreateEventClick();
              }}
            >
              <i
                className="fas fa-calendar-alt text-[26px] w-8 text-center"
                style={{ color: '#F7B928' }}
              ></i>
              <span className="text-[#F8FAFC] text-[19px] font-bold">Create Event</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#1E293B]">
          <button
            onClick={submit}
            disabled={!canPost}
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold py-3 rounded-lg transition-colors disabled:bg-[#1E293B] text-[19px] shadow-sm"
          >
            POST
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={handleFileChange}
        />
        <input
          type="file"
          ref={videoInputRef}
          className="hidden"
          accept="video/*"
          onChange={handleVideoChange}
        />
      </div>
    );
  },
  (prev, next) => {
    return prev.currentUser?.id === next.currentUser?.id;
  }
);


// ==================== COMMENTS CACHE ====================
const commentsCache = new Map<number, { data: any[]; timestamp: number; postId: number }>();


/**
 * =========================
 * ✅ COMMENTS SHEET - WITH IMAGE SUPPORT
 * =========================
 */
 
export const CommentsSheet = memo(
({
  post,
  currentUser,
  users,
  onClose,
  onComment,
  onCommentAdded,
  onLikeComment,
  getCommentAuthor,
  onProfileClick,
  onHashtagClick,
  onFollow,
  checkIsFollowing,
  onViewProductFromPost,
  onOpenAudio,
  onReact,
  onShare,
  onVideoClick,
  groups = [],
  brands = [],
  chats = [],
  onOpenGroup,
  onRSVP,
  onEventClick,
  onOpenReactions,
  onViewImage,
}: {
  post: PostType;
  currentUser: User;
  users: User[];
  onClose: () => void;
  onComment?: (postId: any, text: string, parentCommentId?: number | null, imageFile?: File, imageUrl?: string | null) => void;
  onCommentAdded?: () => void;
  onLikeComment?: (commentId: number) => void;
  getCommentAuthor?: (id: number) => User | undefined;
  onProfileClick: (id: number) => void;
  onHashtagClick?: (tag: string) => void;
  onFollow?: (id: number) => void;
  checkIsFollowing?: (id: number) => boolean;
  onViewProductFromPost?: (productId: number) => void;
  onOpenAudio?: (item: any) => void;
  onReact: (post: PostType, type: ReactionType) => void;
  onShare: (id: number, newShareCount: number) => void;
  onVideoClick: (post: PostType) => void;
  groups?: Group[];
  brands?: Brand[];
  chats?: any[];
  onOpenGroup?: (groupId: number) => void;
  onRSVP?: (eventId: number, status: 'going' | 'interested' | 'not_going') => Promise<void>;
  onEventClick?: (eventId: number) => void;
  onOpenReactions?: (post: PostType) => void;
  onViewImage?: (url: string) => void;
}) => {
  const p: any = post as any;
  const postId = getFeedItemId(p);

  const discussionsTopRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Image picker states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const itemType = getFeedItemType(p);
  const [text, setText] = useState('');
  const [comments, setComments] = useState<any[]>(() => {
    const cached = getCachedComments(itemType, postId);
    if (cached?.data?.length) return cached.data;
    const postComments = Array.isArray(p.comments) ? p.comments : [];
    return postComments;
  });
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  // Cleanup image preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Helper: Get comments endpoint based on item type
  const getCommentEndpoint = () => {
    const viewerId = safeUserId(currentUser);
    const itemType = getFeedItemType(p);

    switch (itemType) {
      case 'story': {
        const storyId = p.story_id || p.id || postId;
        return `/api/stories/${storyId}/comments?viewerId=${viewerId}`;
      }
      case 'event':
        const eventId = p.event_id || p.id;
        return `/api/events/${eventId}/comments?viewerId=${viewerId}`;
      case 'group_post':
        const groupPostId = p?.id || p?.post_id || postId;
        return `/api/group-post-comments?post_id=${groupPostId}&viewerId=${viewerId}`;
      case 'product':
        const productId = p.product_id || p.id;
        return `/api/products/${productId}/reviews?viewerId=${viewerId}`;
      case 'song':
      case 'music': {
        const songId = Number(
          p?.song_id2 ||
          p?.song_id ||
          (p?.meta as any)?.song?.id ||
          (p?.meta as any)?.original_song_id ||
          (p?.shared_song as any)?.id ||
          postId ||
          p?.id ||
          0
        );
        return `/api/songs/${songId}/comments?viewerId=${viewerId}`;
      }
      case 'sponsored':
      case 'reel':
      case 'video':
      case 'post':
      default: {
        const id = p.post_id || p.reel_id || postId || p.id;
        return `/api/posts/${id}/comments?viewerId=${viewerId}`;
      }
    }
  };

  // Helper: Get add comment endpoint
  const getAddCommentEndpoint = () => {
    const itemType = getFeedItemType(p);

    switch (itemType) {
      case 'story': {
        const storyId = p.story_id || p.id || postId;
        return `/api/stories/${storyId}/comments`;
      }
      case 'event':
        const eventId = p.event_id || p.id;
        return `/api/events/${eventId}/comment`;
      case 'group_post':
        return `/api/group-post-comments`;
      case 'product':
        const productId = p.product_id || p.id;
        return `/api/products/${productId}/review`;
      case 'song':
      case 'music': {
        const songId = Number(
          p?.song_id2 ||
          p?.song_id ||
          (p?.meta as any)?.song?.id ||
          (p?.meta as any)?.original_song_id ||
          (p?.shared_song as any)?.id ||
          postId ||
          p?.id ||
          0
        );
        return `/api/songs/${songId}/comment`;
      }
      case 'sponsored':
      case 'reel':
      case 'video':
      case 'post':
      default: {
        const id = p.post_id || p.reel_id || postId || p.id;
        return `/api/posts/${id}/comments`;
      }
    }
  };

  // Helper: Get reply endpoint
  const getReplyEndpoint = (commentId: number) => {
    const itemType = getFeedItemType(p);

    switch (itemType) {
      case 'event':
        return `/api/event-comments/${commentId}/reply`;
      case 'group_post':
        return `/api/group-post-comments`;
      case 'product':
        return `/api/product-reviews/${commentId}/reply`;
      case 'song':
      case 'music': {
        const songId = Number(
          p?.song_id2 ||
          p?.song_id ||
          (p?.meta as any)?.song?.id ||
          (p?.meta as any)?.original_song_id ||
          (p?.shared_song as any)?.id ||
          postId ||
          p?.id ||
          0
        );
        return `/api/songs/${songId}/comment`;
      }
      case 'sponsored':
      case 'reel':
      case 'video':
      case 'post':
      default: {
        const id = p.post_id || p.reel_id || postId || p.id;
        return `/api/posts/${id}/comments`;
      }
    }
  };

  // Helper: Get like endpoint
  const getLikeEndpoint = (commentId: number) => {
    const itemType = getFeedItemType(p);

    switch (itemType) {
      case 'event':
        return `/api/event-comments/${commentId}/like`;
      case 'group_post':
        return `/api/group-post-comment-likes`;
      case 'product':
        return `/api/product-reviews/${commentId}/like`;
      case 'song':
      case 'music':
        return `/api/song-comments/${commentId}/like`;
      case 'reel':
      case 'video':
      case 'post':
      default:
        return `/api/post-comments/${commentId}/like`;
    }
  };

  // Helper: Upload image to server
  const uploadCommentImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('user_id', String(safeUserId(currentUser)));

    try {
      const response = await fetch('/api/comments/upload-image', {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.image_url) {
        return data.image_url;
      }
      return null;
    } catch (error) {
      console.error('Failed to upload comment image:', error);
      return null;
    }
  };

  // Scroll to top when post changes
  useEffect(() => {
    const t = setTimeout(() => {
      discussionsTopRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    }, 0);
    return () => clearTimeout(t);
  }, [postId]);

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }
    
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Resolve comment author
  const resolveAuthor = (c: any) => {
    const uid = Number(
      c?.user_id ?? c?.userId ?? c?.author_id ?? c?.authorId ?? 0
    );

    const u =
      (Number.isFinite(uid) ? users.find((x: any) => Number(x?.id) === uid) : null) ||
      (getCommentAuthor ? getCommentAuthor(uid) : null) ||
      null;

    const name =
      String(c?.author_name ?? c?.authorName ?? '').trim() ||
      String(u?.name ?? '').trim() ||
      String(u?.username ?? '').trim() ||
      'User';

    const image = avatarFrom({
      profile_image_url: c?.author_image ?? c?.authorImage ?? u?.profile_image_url,
      name,
      username: u?.username ?? c?.author_username ?? c?.username,
    });

    return { uid, name, image };
  };

  // Get reply label for comment
  const getReplyLabel = (comment: any) => {
    const a = resolveAuthor(comment);
    const uid = a.uid;

    const user = users.find((x: any) => Number(x?.id) === uid);
    const username = String(
      comment?.author_username ?? user?.username ?? comment?.username ?? ''
    ).trim();

    const display = username ? `@${username}` : a.name;
    return { ...a, username, display };
  };

  // Format count helper
  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  // Handle like comment
  const handleLikeComment = async (comment: any) => {
    if (!currentUser) return;

    const optimisticLiked = !comment.liked_by_me;
    const optimisticCount = comment.liked_by_me
      ? Math.max(0, (comment.likes_count || 0) - 1)
      : (comment.likes_count || 0) + 1;

    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? { ...c, liked_by_me: optimisticLiked, likes_count: optimisticCount }
          : c
      )
    );

    updateCachedComment(itemType, postId, comment.id, (c) => ({
      ...c,
      liked_by_me: optimisticLiked,
      likes_count: optimisticCount,
    }));

    try {
      if (onLikeComment) {
        await onLikeComment(comment.id);
      } else {
        const endpoint = getLikeEndpoint(comment.id);
        await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            user_id: safeUserId(currentUser),
            comment_id: comment.id,
            id: comment.id,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to like comment:', error);
      updateCachedComment(itemType, postId, comment.id, (c) => ({
        ...c,
        liked_by_me: !optimisticLiked,
        likes_count: comment.likes_count || 0,
      }));
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? { ...c, liked_by_me: !optimisticLiked, likes_count: comment.likes_count || 0 }
            : c
        )
      );
    }
  };

  // Handle follow click
  const handleFollowClick = (e: React.MouseEvent, userId: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (onFollow && userId && userId !== safeUserId(currentUser)) {
      onFollow(userId);
    }
  };

  // Discussion Hold / Actions State & Handlers
  const [actionModalComment, setActionModalComment] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const { getHandlers: getCommentPressHandlers } = useCommentLongPress((comment: any) => {
    setActionModalComment(comment);
  });

  const isCommentHidden = (comment: any): boolean => {
    return Boolean(
      comment?.is_hidden ||
      comment?.hidden ||
      comment?.hidden_scope ||
      comment?.hidden_by ||
      comment?.hidden_label
    );
  };

  const isCommentAuthor = (comment: any): boolean => {
    const cUid = safeUserId(currentUser);
    const aUid = Number(comment?.user_id ?? comment?.userId ?? comment?.author_id ?? 0);
    return Boolean(cUid && aUid && cUid === aUid);
  };

  const isEntityOwner = (): boolean => {
    const cUid = safeUserId(currentUser);
    if (!cUid) return false;
    const ownerId = Number(
      p?.user_id ??
      p?.userId ??
      p?.author_id ??
      p?.authorId ??
      p?.seller_id ??
      p?.artist_id ??
      p?.song_owner_id ??
      0
    );
    return Boolean(ownerId && ownerId === cUid);
  };

  const isPlatformAdmin = (): boolean => {
    const role = String((currentUser as any)?.role || '').toLowerCase();
    return ['admin', 'superadmin', 'moderator', 'owner'].includes(role);
  };

  const canHideComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isEntityOwner() || isPlatformAdmin();
  };

  const canDeleteComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isEntityOwner() || isPlatformAdmin();
  };

  const handleToggleHide = async (comment: any) => {
    if (!currentUser || !comment) return;
    const userId = safeUserId(currentUser);
    const commentId = comment.id;
    const currentlyHidden = isCommentHidden(comment);
    const nextAction: 'hide' | 'unhide' = currentlyHidden ? 'unhide' : 'hide';

    // Optimistic UI state & cache
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              is_hidden: !currentlyHidden,
              hidden_by: !currentlyHidden ? userId : null,
              hidden_scope: !currentlyHidden ? 'user' : null,
            }
          : c
      )
    );

    updateCachedComment(itemType, postId, commentId, (c: any) => ({
      ...c,
      is_hidden: !currentlyHidden,
      hidden_by: !currentlyHidden ? userId : null,
      hidden_scope: !currentlyHidden ? 'user' : null,
    }));

    showToast(nextAction === 'hide' ? 'Discussion hidden' : 'Discussion unhidden');

    try {
      switch (itemType) {
        case 'song':
        case 'music': {
          const songId = Number(
            p.song_id2 ||
            p.song_id ||
            (p?.meta as any)?.song?.id ||
            (p?.meta as any)?.original_song_id ||
            (p?.shared_song as any)?.id ||
            postId ||
            p.id ||
            0
          );
          await fetch(`/api/songs/${songId}/comments`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': String(userId),
            },
            body: JSON.stringify({
              user_id: userId,
              comment_id: commentId,
              action: nextAction, // "hide" or "unhide"
            }),
          });
          break;
        }
        case 'product': {
          const productId = p.product_id || p.id;
          await apiFetch(`/api/products/${productId}/reviews`, {
            method: 'PATCH',
            body: JSON.stringify({
              user_id: userId,
              comment_id: commentId,
              action: nextAction,
            }),
          });
          break;
        }
        case 'group_post': {
          await apiFetch(`/api/post-comments/${commentId}/hide`, {
            method: 'POST',
            body: JSON.stringify({
              user_id: userId,
              action: nextAction,
            }),
          });
          break;
        }
        case 'story': {
          const storyId = p.story_id || p.id;
          await apiFetch(`/api/stories/${storyId}/comments`, {
            method: 'PATCH',
            body: JSON.stringify({
              user_id: userId,
              comment_id: commentId,
              action: nextAction,
            }),
          });
          break;
        }
        case 'reel':
        case 'video':
        case 'post':
        default: {
          // Normal posts and videos
          await apiFetch(`/api/post-comments/${commentId}/hide`, {
            method: 'POST',
            body: JSON.stringify({
              user_id: userId,
              action: nextAction,
            }),
          });
          break;
        }
      }
    } catch (error) {
      console.error(`Failed to ${nextAction} discussion:`, error);
      showToast(`Failed to ${nextAction} discussion`);
      // Revert optimistic update
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                is_hidden: currentlyHidden,
                hidden_by: currentlyHidden ? userId : null,
                hidden_scope: currentlyHidden ? 'user' : null,
              }
            : c
        )
      );
    }
  };

  const handleDelete = async (comment: any) => {
    if (!currentUser || !comment) return;
    const userId = safeUserId(currentUser);
    const commentId = comment.id;

    // Optimistic removal from state and cache
    setComments((prev) =>
      prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId)
    );

    removeCachedComment(itemType, postId, commentId);
    showToast('Discussion deleted');

    try {
      switch (itemType) {
        case 'song':
        case 'music': {
          const songId = Number(
            p.song_id2 ||
            p.song_id ||
            (p?.meta as any)?.song?.id ||
            (p?.meta as any)?.original_song_id ||
            (p?.shared_song as any)?.id ||
            postId ||
            p.id ||
            0
          );
          await fetch(`/api/songs/${songId}/comments?comment_id=${commentId}&user_id=${userId}`, {
            method: 'DELETE',
            headers: { 'x-user-id': String(userId) },
          });
          break;
        }
        case 'product': {
          const productId = p.product_id || p.id;
          await apiFetch(`/api/products/${productId}/reviews?comment_id=${commentId}&user_id=${userId}`, {
            method: 'DELETE',
          });
          break;
        }
        case 'group_post': {
          await apiFetch(`/api/post-comments/${commentId}/delete?user_id=${userId}`, {
            method: 'DELETE',
          });
          break;
        }
        case 'story': {
          const storyId = p.story_id || p.id;
          await apiFetch(`/api/stories/${storyId}/comments?comment_id=${commentId}&user_id=${userId}`, {
            method: 'DELETE',
          });
          break;
        }
        case 'reel':
        case 'video':
        case 'post':
        default: {
          // Normal posts and videos
          await apiFetch(`/api/post-comments/${commentId}/delete?user_id=${userId}`, {
            method: 'DELETE',
          });
          break;
        }
      }

      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (error) {
      console.error('Failed to delete discussion:', error);
      showToast('Failed to delete discussion');
      fetchCommentsSilently();
    }
  };


  // Fetch comments silently (background refresh)
  const fetchCommentsSilently = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const endpoint = getCommentEndpoint();
      const viewerId = safeUserId(currentUser);
      let arr: any[] = [];

      if (itemType === 'story') {
        const storyId = p?.story_id || p?.id || postId;
        const res = await fetch(`/api/stories/${storyId}/comments?viewerId=${viewerId}`, {
          method: 'GET',
          headers: { 'x-user-id': String(viewerId) },
          signal: abortControllerRef.current.signal,
        });
        const data = await res.json().catch(() => null);
        arr = Array.isArray(data?.comments) ? data.comments : (Array.isArray(data) ? data : []);
      } else if (itemType === 'song' || itemType === 'music') {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'x-user-id': String(viewerId) },
          signal: abortControllerRef.current.signal,
        });
        const data = await res.json().catch(() => null);
        arr = Array.isArray(data) ? data : data?.comments || [];
      } else {
        const data = await apiFetch(endpoint);
        arr = Array.isArray(data) ? data : data?.comments || [];
      }

      if (arr.length > 0) {
        setComments((prev) => {
          // Keep pending optimistic comments that haven't landed on server yet
          const pending = prev.filter(
            (c) =>
              String(c.id).startsWith('tmp-') &&
              !arr.some(
                (s: any) =>
                  s.text === c.text && Number(s.user_id) === Number(c.user_id)
              )
          );
          const combined = [...arr, ...pending];
          const seen = new Set<string>();
          return combined.filter((c) => {
            const key = String(c.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
        setCachedComments(itemType, postId, arr);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      console.debug('Silent comment fetch failed:', error);
    }
  };

  // Initialize comments
  useEffect(() => {
    const initializeComments = async () => {
      const cached = getCachedComments(itemType, postId);
      if (cached && cached.data.length > 0) {
        setComments(cached.data);
      }

      const postComments = Array.isArray(p.comments) ? p.comments : [];
      if (postComments.length > 0 && (!cached || postComments.length > cached.data.length)) {
        const seen = new Set<string>();
        const unique = postComments.filter((c: any) => {
          const key = String(c?.id || '');
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setComments(unique);
        setCachedComments(itemType, postId, unique);
      }

      // Only fetch if stale (> 5 mins) or no cache
      if (!cached || !cached.isFresh || cached.data.length === 0) {
        fetchCommentsSilently();
      }
    };

    initializeComments();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [postId, p.comments, itemType]);

  // Build comment threads
  const idKey = (v: any) => String(v ?? '').trim();

  // Helper: find root comment ID for any nested reply or replyer
  const findRootCommentId = (c: any, list: any[]): string => {
    if (!c || !c.parent_comment_id) return idKey(c?.id);
    const commentMap = new Map<string, any>();
    list.forEach((item) => commentMap.set(idKey(item.id), item));

    let curr = c;
    const visited = new Set<string>();
    while (curr && curr.parent_comment_id && !visited.has(idKey(curr.id))) {
      visited.add(idKey(curr.id));
      const parent = commentMap.get(idKey(curr.parent_comment_id));
      if (parent) {
        curr = parent;
      } else {
        return idKey(curr.parent_comment_id);
      }
    }
    return idKey(curr?.id);
  };

  const buildThreads = (list: any[]) => {
    const commentMap = new Map<string, any>();
    const seen = new Set<string>();
    const uniqueList: any[] = [];

    (list || []).forEach((c) => {
      if (!c) return;
      const key = idKey(c.id);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      uniqueList.push(c);
      commentMap.set(key, c);
    });

    const findRootId = (c: any): string => {
      let curr = c;
      const visited = new Set<string>();
      while (curr && curr.parent_comment_id && !visited.has(idKey(curr.id))) {
        visited.add(idKey(curr.id));
        const parent = commentMap.get(idKey(curr.parent_comment_id));
        if (parent) {
          curr = parent;
        } else {
          return idKey(curr.parent_comment_id);
        }
      }
      return idKey(curr?.id);
    };

    const roots: any[] = [];
    const repliesByRoot = new Map<string, any[]>();

    uniqueList.forEach((c) => {
      if (!c.parent_comment_id) {
        roots.push(c);
      } else {
        const rootId = findRootId(c);
        if (!repliesByRoot.has(rootId)) {
          repliesByRoot.set(rootId, []);
        }
        repliesByRoot.get(rootId)!.push(c);
      }
    });

    repliesByRoot.forEach((arr) => {
      arr.sort((a, b) => {
        const timeA = new Date(a.created_at || a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.created_at || b.createdAt || b.timestamp || 0).getTime();
        return timeA - timeB;
      });
    });

    return roots.map((root) => ({
      root,
      replies: repliesByRoot.get(idKey(root.id)) || [],
    }));
  };

  const toggleThread = (rootId: any, open: boolean) => {
    const key = String(rootId);
    setExpandedThreads((prev) => ({ ...prev, [key]: open }));
  };

  const threads = useMemo(() => buildThreads(comments), [comments]);

  // Initiate reply to a comment or a replyer
  const handleInitiateReply = (comment: any) => {
    const target = getReplyLabel(comment);
    const rootId = findRootCommentId(comment, comments);
    setReplyTo({
      ...comment,
      _reply_author: target,
      _root_id: rootId,
    });
    if (rootId) {
      toggleThread(rootId, true);
    }
    inputRef.current?.focus();
    setShowEmojiPicker(false);
  };

  // Handle comment submission with image support
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const t = text.trim();
    if (!t && !selectedImage) return;

    setUploadingImage(true);

    let uploadedImageUrl: string | null = null;
    
    // Upload image if present
    if (selectedImage) {
      uploadedImageUrl = await uploadCommentImage(selectedImage);
      if (!uploadedImageUrl && selectedImage) {
        console.error('Failed to upload image');
        setUploadingImage(false);
        alert('Failed to upload image. Please try again.');
        return;
      }
    }

    const replyDisplay = replyTo?._reply_author?.display;
    const prefix = replyDisplay ? `${replyDisplay} ` : '';
    const finalText = replyTo && !t.startsWith(prefix) ? prefix + t : t;
    const rootId = replyTo?._root_id || (replyTo ? findRootCommentId(replyTo, comments) : null);
    const parentCommentId = replyTo?.id || null;

    // Optimistic comment
    const optimisticComment = {
      id: `tmp-${Date.now()}`,
      post_id: postId,
      user_id: safeUserId(currentUser),
      text: finalText,
      image_url: uploadedImageUrl,
      parent_comment_id: parentCommentId,
      created_at: new Date().toISOString(),
      replies_count: 0,
      likes_count: 0,
      liked_by_me: false,
    };

    // Clear form
    setText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(null);
    setImagePreview(null);

    setComments((prev) => {
      const next = [...prev, optimisticComment];
      addCachedComment(itemType, postId, optimisticComment);
      return next;
    });

    if (rootId) {
      toggleThread(rootId, true);
    }

    // Actual API call: If onComment is provided, it handles the backend insertion and state sync.
    // Otherwise fallback to direct endpoint POST.
    try {
      if (itemType === 'story') {
        const storyId = p?.story_id || p?.id || postId;
        await fetch(`/api/stories/${storyId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': String(safeUserId(currentUser)),
          },
          body: JSON.stringify({
            user_id: safeUserId(currentUser),
            content: finalText,
            image_url: uploadedImageUrl || null,
            parent_id: parentCommentId ?? null,
          }),
        });
      } else if (itemType === 'song' || itemType === 'music') {
        const songId = Number(
          p?.song_id2 ||
          p?.song_id ||
          (p?.meta as any)?.song?.id ||
          (p?.meta as any)?.original_song_id ||
          (p?.shared_song as any)?.id ||
          postId ||
          p?.id ||
          0
        );
        await fetch(`/api/songs/${songId}/comment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': String(safeUserId(currentUser)),
          },
          body: JSON.stringify({
            user_id: safeUserId(currentUser),
            text: finalText,
            image_url: uploadedImageUrl || null,
            parent_comment_id: parentCommentId ?? null,
          }),
        });
      } else if (onComment) {
        await onComment(post || postId, finalText, parentCommentId, selectedImage || undefined, uploadedImageUrl);
      } else {
        let endpoint = '';
        let body: any = {
          text: finalText,
          user_id: safeUserId(currentUser),
          parent_comment_id: parentCommentId,
          post_id: postId || p?.id,
          comment_id: replyTo?.id,
        };
        
        if (uploadedImageUrl) {
          body.image_url = uploadedImageUrl;
        }

        if (replyTo) {
          endpoint = getReplyEndpoint(replyTo.id);
        } else {
          endpoint = getAddCommentEndpoint();
        }

        await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      if (onCommentAdded) {
        onCommentAdded();
      }

      fetchCommentsSilently();
    } catch (err: any) {
      console.error('Failed to post comment:', err);
      alert('Failed to post comment. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Add emoji to input
  const addEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Refresh comments on window focus
  useEffect(() => {
    const handleFocus = () => {
      const cached = getCachedComments(itemType, postId);
      if (!cached || !cached.isFresh) {
        fetchCommentsSilently();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [postId, itemType]);

  // Render single comment (Facebook style)
  const renderOneComment = (comment: any, isReply: boolean = false) => {
    const a = resolveAuthor(comment);
    const isCurrentUserComment = a.uid === safeUserId(currentUser);
    const isFollowing = checkIsFollowing ? checkIsFollowing(a.uid) : false;
    const authorUser = users.find((x: any) => Number(x?.id) === a.uid);
    const isHidden = isCommentHidden(comment);
    const pressHandlers = getCommentPressHandlers(comment);

    return (
      <div className={`flex gap-2.5 sm:gap-3 ${isReply ? 'mt-2.5' : ''}`}>
        <img
          src={a.image}
          className={`${
            isReply ? 'w-8 h-8' : 'w-9 h-9'
          } rounded-full object-cover cursor-pointer shrink-0 mt-0.5 hover:opacity-90 transition-opacity`}
          alt=""
          onClick={() => a.uid && onProfileClick(a.uid)}
        />
        <div className="flex-1 min-w-0">
          <div
            {...pressHandlers}
            className={`group/comment relative inline-block max-w-full sm:max-w-[92%] rounded-[18px] px-3.5 py-2.5 sm:px-4 sm:py-3 border shadow-sm transition-all select-none cursor-pointer ${
              isHidden
                ? 'bg-[#162137]/35 hover:bg-[#1E293B]/45 border-amber-500/30 opacity-75'
                : 'bg-[#162137]/65 hover:bg-[#1E293B]/70 border-[#1E293B]/60'
            }`}
            title="Hold for discussion options"
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[#F8FAFC] font-bold text-[21px] leading-tight cursor-pointer hover:underline inline-flex items-center gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  if (a.uid) onProfileClick(a.uid);
                }}
              >
                <span className="truncate">{a.name}</span>
                {(comment?.is_verified || authorUser?.is_verified) && (
                  <VerifiedBadge size={21} className="shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isHidden && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                    Hidden
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionModalComment(comment);
                  }}
                  className="opacity-0 group-hover/comment:opacity-100 p-1 text-[#94A3B8] hover:text-[#F8FAFC] rounded-full hover:bg-[#1E293B] transition-opacity"
                  title="More options"
                >
                  <i className="fas fa-ellipsis-h text-xs" />
                </button>
              </div>
            </div>
            <div className={`text-[#CBD5E1] ${isReply ? 'text-[19.5px]' : 'text-[20.5px]'} leading-[1.38] font-normal whitespace-pre-wrap break-words mt-1`}>
              <RichText
                text={String(comment.text || '')}
                users={users}
                onProfileClick={onProfileClick}
                onHashtagClick={onHashtagClick}
              />
            </div>
            {comment.image_url && (
              <div className="mt-2 rounded-xl overflow-hidden">
                <img
                  src={comment.image_url}
                  alt="Comment attachment"
                  className="max-w-full max-h-[220px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(comment.image_url, '_blank');
                  }}
                />
              </div>
            )}
          </div>
          <div className="mt-1 ml-3 flex items-center gap-3 sm:gap-4 text-[12px]">
            <span className="text-[#B0B3B8] font-normal">
              {formatRelativeTime(comment.created_at || comment.createdAt || comment.timestamp)}
            </span>
            <button
              type="button"
              onClick={() => handleLikeComment(comment)}
              className={`font-bold hover:underline transition-colors inline-flex items-center gap-1 ${
                comment.liked_by_me
                  ? 'text-[#F43F5E]'
                  : 'text-[#B0B3B8] hover:text-[#E4E6EB]'
              }`}
            >
              <span className="text-[13px]">{comment.liked_by_me ? '❤️' : '🤍'}</span>
              <span>{comment.liked_by_me ? 'Liked' : 'Like'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleInitiateReply(comment)}
              className="font-bold text-[#B0B3B8] hover:text-[#E4E6EB] hover:underline transition-colors"
            >
              Reply
            </button>
            {isHidden && (
              <span className="text-amber-400/90 font-medium text-[11px] inline-flex items-center gap-1">
                <i className="far fa-eye-slash text-[10px]" />
                <span>Hidden</span>
              </span>
            )}
            {comment.likes_count > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#F43F5E]/15 text-[#F43F5E] px-1.5 py-0.5 rounded-full text-[11px] font-bold">
                <span className="text-[10px]">❤️</span>
                <span>{formatCount(comment.likes_count)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="comments-sheet-root flex flex-col bg-[#0B1120]">
      {/* Header */}
      <div className="p-4 border-b border-[#1E293B] flex items-center justify-between bg-[#0B1120] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center transition-colors"
            onClick={onClose}
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-[#E4E6EB] text-xl"></i>
          </button>
          <div className="text-[#E4E6EB] font-bold text-[22px]">
            {post?.type === 'event'
              ? 'Event Discussion'
              : (String(post?.type) === 'reel' || post?.media_type === 'video' || (post as any)?.post_type === 'reel')
              ? 'Video Discussion'
              : 'Post'}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-[#CBD5E1] text-[20.5px] font-semibold">
            {formatCount(comments.length)} discussions
          </div>
          <button
            type="button"
            className="text-[#1877F2] font-bold text-[17px] hover:underline"
            onClick={onClose}
          >
            See less
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scroll-smooth bg-[#0B1120]">
        {/* Original Post Card */}
        <div className="border-b border-[#1E293B] bg-[#0B1120]">
          {post && (
            <Post
              hideCommentPreview={true}
              post={post}
              author={
                (post as any).author || {
                  id: (post as any).user_id || (post as any).author_id || 0,
                  name: (post as any).name || (post as any).username || 'User',
                  username: (post as any).username || '',
                  profile_image_url: (post as any).profile_image_url || '',
                }
              }
              currentUser={currentUser}
              users={users}
              onProfileClick={onProfileClick}
              onReact={onReact}
              onShare={onShare}
              onViewImage={onViewImage || (() => {})}
              onOpenComments={() => {}}
              onVideoClick={onVideoClick}
              onPlayAudioTrack={onOpenAudio}
              onHashtagClick={onHashtagClick}
              onViewProductFromPost={onViewProductFromPost}
              onOpenGroup={onOpenGroup}
              onOpenAudio={onOpenAudio}
              onRSVP={onRSVP}
              groups={groups}
              brands={brands}
              chats={chats}
              onFollow={onFollow}
              onEventClick={onEventClick}
              onOpenReactions={onOpenReactions}
            />
          )}
        </div>

        {/* Comments Section */}
        <div className="p-4">
          <div ref={discussionsTopRef} />

          {/* Reply To Indicator */}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 bg-[#0B1120] px-3 py-2 rounded-2xl border border-[#1E293B]">
              <span className="text-xs text-[#94A3B8]">Replying to</span>
              <span className="text-xs text-[#1877F2] font-black">
                {replyTo?._reply_author?.display || replyTo?._reply_author?.name || 'User'}
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="ml-auto text-[#94A3B8] hover:text-white"
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>
          )}

          {/* Image Preview for new comment */}
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                className="h-20 rounded-xl border border-white/10 object-cover"
                alt="Preview"
              />
              <button
                type="button"
                onClick={() => {
                  if (imagePreview) URL.revokeObjectURL(imagePreview);
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
              >
                <i className="fas fa-times text-white text-xs" />
              </button>
            </div>
          )}

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="mb-3 flex flex-wrap gap-2 bg-[#0B1120] border border-[#1E293B] rounded-2xl p-3">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl leading-none active:scale-90 transition-transform hover:bg-white/10 p-1 rounded-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Empty State */}
          {comments.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-[#B0B3B8] text-[19px] mb-2">No discussions yet</div>
              <p className="text-[#B0B3B8] text-[15px]">Be the first to start a discussion!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {threads.map(({ root, replies }) => {
                const rootId = String(root.id);
                const isExpanded = !!expandedThreads[rootId];
                const MAX_PREVIEW = 1;
                const hiddenCount = Math.max(0, replies.length - MAX_PREVIEW);
                const visibleReplies = isExpanded ? replies : replies.slice(-MAX_PREVIEW);

                return (
                  <div key={rootId} className="space-y-2">
                    {renderOneComment(root, false)}

                    {!isExpanded && hiddenCount > 0 && (
                      <button
                        type="button"
                        className="ml-11 sm:ml-12 text-[#1877F2] font-semibold text-[13px] sm:text-[14px] hover:underline flex items-center gap-1.5 py-1"
                        onClick={() => toggleThread(rootId, true)}
                      >
                        <i className="fas fa-reply fa-rotate-180 text-[11px]" />
                        <span>
                          View previous {hiddenCount} repl{hiddenCount === 1 ? 'y' : 'ies'}
                        </span>
                      </button>
                    )}

                    {visibleReplies.map((reply) => (
                      <div key={String(reply.id)} className="ml-10 sm:ml-12 relative">
                        <div className="absolute -left-5 sm:-left-6 top-0 bottom-0 w-[2px] bg-[#334155]/60 rounded-full" />
                        {renderOneComment(reply, true)}
                      </div>
                    ))}

                    {isExpanded && replies.length > MAX_PREVIEW && (
                      <button
                        type="button"
                        className="ml-11 sm:ml-12 text-[#B0B3B8] text-[13px] hover:text-[#E4E6EB] hover:underline py-1"
                        onClick={() => toggleThread(rootId, false)}
                      >
                        Hide replies
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Comment Input Footer - solid dark, non-transparent */}
      <div className="p-3 pb-5 border-t border-[#1E293B] bg-[#0B1120] sticky bottom-0">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 bg-[#162137]/65 border border-[#1E293B]/60 px-3 py-2 rounded-2xl">
            <span className="text-xs text-[#B0B3B8]">Replying to</span>
            <span className="text-xs text-[#1877F2] font-black">
              {replyTo?._reply_author?.display || replyTo?._reply_author?.name || 'User'}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="ml-auto text-[#B0B3B8] hover:text-white"
            >
              <i className="fas fa-times text-xs" />
            </button>
          </div>
        )}

        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img
              src={imagePreview}
              className="h-20 rounded-xl border border-[#1E293B] object-cover"
              alt=""
            />
            <button
              type="button"
              onClick={() => {
                if (imagePreview) URL.revokeObjectURL(imagePreview);
                setSelectedImage(null);
                setImagePreview(null);
              }}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
            >
              <i className="fas fa-times text-white text-xs" />
            </button>
          </div>
        )}

        {showEmojiPicker && (
          <div className="mb-3 flex flex-wrap gap-2 bg-[#0F172A] border border-[#1E293B] rounded-2xl p-3">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addEmoji(emoji)}
                className="text-2xl leading-none active:scale-90 transition-transform hover:bg-[#1E293B] p-1 rounded-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#94A3B8] hover:bg-[#1E293B] active:scale-95"
          >
            <i className="far fa-image text-[25px]" />
          </button>

          <div className="flex-1 flex items-center bg-[#0F172A] border border-[#1E293B] rounded-full px-4 py-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-[#F8FAFC] outline-none text-[16px] placeholder:text-[#64748B]"
              placeholder={
                replyTo
                  ? `Reply to ${replyTo?._reply_author?.display || replyTo?._reply_author?.name || 'user'}`
                  : `Comment as ${currentUser?.name || 'User'}`
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#94A3B8] hover:bg-[#1E293B]"
              title="Sticker"
            >
              <i className="far fa-sticky-note text-[21px]" />
            </button>

            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#94A3B8] hover:bg-[#1E293B]"
              title="GIF"
            >
              <span className="text-[12px] font-black border border-[#64748B] text-[#94A3B8] rounded-md px-1 leading-[16px]">
                GIF
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#1E293B] ${
                showEmojiPicker ? 'text-[#1877F2]' : 'text-[#94A3B8]'
              }`}
              title="Emoji"
            >
              <i className="far fa-smile text-[23px]" />
            </button>
          </div>

          <button
            type="submit"
            disabled={(!text.trim() && !selectedImage) || uploadingImage}
            className="w-10 h-10 rounded-full bg-[#1877F2] hover:bg-[#166FE5] disabled:bg-[#1E293B] disabled:text-[#64748B] text-white flex items-center justify-center shadow-[0_8px_20px_rgba(24,119,242,0.35)] active:scale-95 transition-all"
          >
            {uploadingImage ? (
              <i className="fas fa-spinner fa-spin text-[14px]" />
            ) : (
              <i className="fas fa-arrow-up text-[16px]" />
            )}
          </button>
        </form>
      </div>

      {/* Discussion Long-Press / Hold Action Modal */}
      {actionModalComment && (
        <CommentActionModal
          isOpen={Boolean(actionModalComment)}
          onClose={() => setActionModalComment(null)}
          comment={actionModalComment}
          authorName={resolveAuthor(actionModalComment).name}
          authorAvatar={resolveAuthor(actionModalComment).image}
          commentText={String(actionModalComment.text || '')}
          isHidden={isCommentHidden(actionModalComment)}
          canHide={canHideComment(actionModalComment)}
          canDelete={canDeleteComment(actionModalComment)}
          onToggleHide={handleToggleHide}
          onDelete={handleDelete}
          onReply={(c) => handleInitiateReply(c)}
        />
      )}

      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 rounded-full bg-[#1E293B] border border-[#334155] text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
},
(prev, next) => isSameFeedItem(prev.post, next.post) && prev.currentUser?.id === next.currentUser?.id);

          

/**
 * =========================
 * ✅ SUGGESTED PRODUCTS WIDGET
 * =========================
 */
export const SuggestedProductsWidget = memo(
  ({
    products,
    currentUser,
    onViewProduct,
    onSeeAll,
  }: {
    products: Product[];
    currentUser: User;
    onViewProduct: (product: Product) => void;
    onSeeAll: () => void;
  }) => {
    const suggested = (products || [])
      .filter((p: any) => p.seller_id !== safeUserId(currentUser))
      .slice(0, 4);

    if (suggested.length === 0) return null;

    return (
      <div className="w-full">
        <div className="bg-[#0B1120] w-full p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[#F8FAFC] font-bold text-[21px]">MarketPoint for you</h3>
            <button
              onClick={onSeeAll}
              className="text-[#1877F2] font-bold text-[17px] hover:bg-[#1E293B] px-2 py-1 rounded transition-colors"
            >
              See all
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {suggested.map((product: any) => {
              const countryData = MARKETPLACE_COUNTRIES.find((c) =>
                String(product.address || '').toLowerCase().includes(c.name.toLowerCase())
              );
              const symbol = countryData ? countryData.symbol : '$';

              return (
                <div
                  key={String(product.id)}
                  className="cursor-pointer group"
                  onClick={() => onViewProduct(product)}
                >
                  <div className="aspect-square rounded-lg overflow-hidden relative mb-1.5 shadow-sm border border-[#1E293B]">
                    <img
                      src={product.images?.[0]}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[13px] font-bold text-white">
                      {symbol}
                      {product.main_price}
                    </div>
                    {Boolean(product.is_sponsored || product.sponsored || product.is_ad || product.ad_id) && (
                      <div className="absolute top-2 left-2 bg-[#F97316] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow z-10">
                        Ad
                      </div>
                    )}
                  </div>
                  <h4 className="text-[#F8FAFC] text-[15px] font-bold truncate px-0.5 leading-tight">
                    {product.title}
                  </h4>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-[10px] bg-[#050B18] border-t border-white/10" />
      </div>
    );
  },
  (prev, next) => {
    return prev.products === next.products && prev.currentUser?.id === next.currentUser?.id;
  }
);

// ==================== SPONSORED PRODUCT CARD ====================
export interface SponsoredProductCardProps {
  product?: any;
  ad?: any;
  currentUser?: User | null;
  users?: User[];
  onProfileClick?: (id: number) => void;
  onViewProduct?: (productId: number) => void;
  onReact?: (post: any, type: ReactionType) => void;
  onOpenComments?: (post: any) => void;
  onShare?: (id: number, newCount: number, data?: any, source?: any) => void;
  onDelete?: (id: number) => void;
  onEdit?: (id: number, content: string) => void;
}

export const SponsoredProductCard: React.FC<SponsoredProductCardProps> = ({
  product = {} as any,
  ad = {} as any,
  currentUser,
  users = [],
  onProfileClick = () => {},
  onViewProduct,
  onReact = () => {},
  onOpenComments = () => {},
  onShare = () => {},
  onDelete,
  onEdit,
}) => {
  const prod: any = product || {};
  const a: any = ad || {};
  const prodId = Number(prod?.id || prod?.product_id || a?.product_id || a?.source_id || 0);
  const rawImages = prod?.images || (a?.media_url ? [a.media_url] : []);
  const imgList = Array.isArray(rawImages) ? rawImages : [];
  const mainPrice = prod?.main_price ?? a?.main_price;
  const discountPrice = prod?.discount_price ?? a?.discount_price;
  const priceVal = discountPrice || mainPrice;

  const sponsoredProductPost = useMemo(() => ({
    ...prod,
    id: prodId || `sp-prod-${a?.id || Date.now()}`,
    product_id: prodId,
    user_id: prod?.seller_id || a?.advertiser_id || a?.user_id,
    seller_id: prod?.seller_id || a?.advertiser_id || a?.user_id,
    name: prod?.seller_name || prod?.seller?.name || a?.advertiser_name || a?.name || 'Seller',
    username: prod?.seller_username || a?.username || 'seller',
    profile_image_url: prod?.seller_avatar || a?.profile_image_url,
    is_verified: Boolean(prod?.seller?.is_verified || a?.is_verified),
    title: prod?.title || a?.headline || a?.title || '',
    description: prod?.description || a?.description || '',
    main_price: mainPrice,
    discount_price: discountPrice,
    price: priceVal,
    currency: prod?.currency || 'TZS',
    location: prod?.address || prod?.location || a?.target_location || '',
    address: prod?.address || a?.target_location || '',
    images: imgList,
    image_variants: prod?.image_variants || [],
    is_sponsored: true,
    sponsored: true,
    is_ad: true,
    ad_id: Number(a?.id || 0),
    type: 'product',
    item_type: 'product',
    post_type: 'product',
    source: 'product',
    sponsored_meta: {
      ad_id: Number(a?.id || 0),
      advertiser_id: Number(a?.advertiser_id || prod?.seller_id || 0),
      campaign_name: a?.campaign_name || a?.title || prod?.title || 'Sponsored Product',
      headline: a?.headline || a?.title || prod?.title || '',
      cta_text: a?.cta_button || a?.cta_text || 'Shop Now',
      cta_url: a?.destination_url || a?.cta_url || '',
      contact_type: a?.contact_type || 'link',
      phone_number: a?.phone_number || prod?.phone_number || '',
      email_address: a?.email_address || '',
    },
  }), [prod, a, prodId, mainPrice, discountPrice, priceVal, imgList]);

  return (
    <Post
      post={sponsoredProductPost as any}
      author={
        prod?.seller || {
          id: sponsoredProductPost.user_id,
          name: sponsoredProductPost.name,
          username: sponsoredProductPost.username,
          profile_image_url: sponsoredProductPost.profile_image_url,
          is_verified: sponsoredProductPost.is_verified,
        }
      }
      currentUser={currentUser || null}
      users={users}
      onProfileClick={onProfileClick}
      onViewProductFromPost={onViewProduct}
      onReact={onReact}
      onOpenComments={onOpenComments}
      onShare={onShare}
      onDelete={onDelete}
      onEdit={onEdit}
      onViewImage={() => {}}
      onVideoClick={() => {}}
    />
  );
};

// ==================== EXPORTED HELPERS ====================
export {
  SponsoredProductCard as SponsoredProductPostCard,
  getMediaTypeInfo,
  getMarketplaceImages,
  getMarketplacePriceLine,
  normalizeEventFromFeed,
  topReactionEmojis,
  pickStableReactorName,
  safeArray,
  safeNumber,
  safeString,
  safePostId,
  safeUserId,
  formatReelCount,
  getReelAuthorName,
  getFeedItemType,
  getFeedItemId,
  getFeedKey,
  isSameFeedItem,
};

/**
 * =========================
 * ✅ FEED PROPS INTERFACE
 * =========================
 */


interface FeedProps {
  // ========== NEW PROPS ==========
  items?: FeedItem[];
  onOpenStory?: (story: Story) => void;
  stories?: any[];
  // ========== END NEW PROPS ==========

  feedItems: any[];

  onDeletePost?: (id: number) => void;
  onEditPost?: (id: number, content: string) => void;

  currentUser: User | null;
  users: User[];

  onProfileClick: (id: number) => void;

  onReact: (post: PostType, type: ReactionType) => void;

  onShare: (id: number, newShareCount: number, data?: any, sourcePost?: any) => void;

  onOpenComments: (post: PostType) => void;

  onViewImage: (url: string) => void;

  onVideoClick: (post: PostType) => void;

  onPlayAudioTrack?: (track: AudioTrack) => void;

  onHashtagClick?: (tag: string) => void;

  onFollow?: (id: number) => void;

  followLoading?: { [key: number]: boolean };

  checkIsFollowing?: (id: number) => boolean;

  groups?: Group[];

  brands?: Brand[];

  chats?: any[];

  onViewProductFromPost?: (productId: number) => void;

  onRSVPEvent?: (
    eventId: number,
    status: "going" | "interested" | "not_going"
  ) => Promise<void>;

  getPostAuthor?: (post: PostType) => User;

  // =========================
  // Push More button props
  // =========================
  onPushMore?: (postId: number) => void;

  pushedPosts?: Record<number, boolean>;

  // =========================
  // Reel props
  // =========================
  onOpenReel?: (reelId: number | string) => void;

  onOpenReelMenu?: (reel: any) => void;

  // =========================
  // People You May Know props
  // =========================
  peopleYouMayKnow?: any[];

  peopleYouMayKnowInsertIndex1?: number;

  peopleYouMayKnowInsertIndex2?: number;

  onFollowFromPymk?: (id: number) => void;

  pymkLoading?: boolean;

  // =========================
  // Groups You May Join props
  // =========================
  groupsYouMayJoin?: any[];

  groupsYouMayJoinInsertIndex?: number;

  onJoinGroupSuggestion?: (groupId: number) => void;

  gymjLoading?: boolean;

  onOpenGroup?: (groupId: number) => void;

  // =========================
  // Login
  // =========================
  onLoginClick?: () => void;

  // =========================
  // ✅ INFINITE SCROLL
  // =========================
  onLoadMoreFeed?: () => void;

  hasMoreFeed?: boolean;

  feedLoadingMore?: boolean;

  // =========================
  // ✅ GROUP POST REACTIONS
  // =========================
  onToggleGroupPostLike?: (
    postId: number,
    type?: ReactionType
  ) => Promise<{ liked: boolean; likes_count: number } | void>;

  onApplyToJob?: (postId: number, applicationData?: any) => void;
}
  
    
/**
 * =========================
 * ✅ MAIN FEED COMPONENT (NO SPONSORED CARD - ALL POSTS GO THROUGH Post COMPONENT)
 * =========================
 */



export const Feed = memo(({
  items,
  feedItems: feedItemsProp,
  onOpenStory,
  stories = [],
  currentUser,
  users,
  onProfileClick,
  onReact,
  onShare,
  onOpenComments,
  onViewImage,
  onVideoClick,
  onPlayAudioTrack,
  onHashtagClick,
  onFollow,
  followLoading = {},
  checkIsFollowing,
  groups = [],
  brands = [],
  chats = [],
  onViewProductFromPost,
  onRSVPEvent,
  getPostAuthor,
  onPushMore,
  pushedPosts = {},
  onOpenReel,
  onOpenReelMenu,
  peopleYouMayKnow = [],
  peopleYouMayKnowInsertIndex1 = -1,
  peopleYouMayKnowInsertIndex2 = -1,
  onFollowFromPymk,
  pymkLoading = false,
  groupsYouMayJoin = [],
  groupsYouMayJoinInsertIndex = -1,
  onJoinGroupSuggestion,
  gymjLoading = false,
  onOpenGroup,
  onLoginClick,

  onDeletePost,
  onEditPost,

  // ✅ new from App.tsx
  onLoadMoreFeed,
  hasMoreFeed = true,
  feedLoadingMore = false,
  onApplyToJob,
}: FeedProps) => {
  const feedMoreRef = useRef<HTMLDivElement | null>(null);

  const safeFeedItems = React.useMemo(() => {
    const rawList = (items && items.length > 0)
      ? items
      : (feedItemsProp && feedItemsProp.length > 0)
      ? feedItemsProp.map((item: any) => ({
          kind: "post" as const,
          data: item,
          created_at: item.created_at,
        }))
      : [];

    const seenKeys = new Set<string>();
    const deduped: FeedItem[] = [];

    for (const item of rawList) {
      if (!item) continue;
      const data = item.data || item;
      
      // ✅ Never show group events in Feed
      const isGrpEvent = Boolean(
        (data.group_id && (data.item_type === 'event' || data.type === 'event' || data.source === 'event' || !!data.event_id)) ||
        data.is_group_event ||
        data.source === 'group_event' ||
        data.item_type === 'group_event' ||
        (data.meta && typeof data.meta === 'object' && data.meta.group_id && (data.meta.type === 'event' || data.meta.event))
      );
      if (isGrpEvent) continue;

      const key = getFeedKey(data) || (data?.id ? `${getFeedItemType(data)}:${data.id}` : null);
      if (key) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
      }
      deduped.push(item);
    }

    return deduped;
  }, [items, feedItemsProp]);

  // ✅ Facebook-style pagination: 15 posts initial + silent infinite scroll (no visible loader)
  const [visibleFeedCount, setVisibleFeedCount] = useState(15);
  const isPagingRef = useRef(false);
  const lastDbRequestTimeRef = useRef(0);

  const paginatedFeedItems = React.useMemo(() => {
    return safeFeedItems.slice(0, visibleFeedCount);
  }, [safeFeedItems, visibleFeedCount]);

  const getStableItemKey = useCallback((item: any) => {
    return getFeedKey(item);
  }, []);

  const triggerLoadMore = useCallback(() => {
    // 1. In-memory pagination first: reveal next 15 items locally (zero database requests)
    if (visibleFeedCount < safeFeedItems.length) {
      if (isPagingRef.current) return;
      isPagingRef.current = true;
      setVisibleFeedCount((prev) => Math.min(prev + 15, safeFeedItems.length));
      setTimeout(() => {
        isPagingRef.current = false;
      }, 250);
      return;
    }

    // 2. Fetch from backend only when all local items have been shown
    if (!onLoadMoreFeed) return;
    if (!hasMoreFeed) return;
    if (feedLoadingMore) return;

    const now = Date.now();
    if (now - lastDbRequestTimeRef.current < 2500) {
      // Cooldown to protect database from rapid calls
      return;
    }

    lastDbRequestTimeRef.current = now;
    onLoadMoreFeed();
  }, [visibleFeedCount, safeFeedItems.length, onLoadMoreFeed, hasMoreFeed, feedLoadingMore]);

  useEffect(() => {
    const el = feedMoreRef.current;
    if (!el) return;

    // Use IntersectionObserver with 600px margin for silent, seamless prefetching (no polling timer or scroll flood)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          triggerLoadMore();
        }
      },
      {
        root: null,
        rootMargin: "600px 0px",
        threshold: 0,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [triggerLoadMore]);

  return (
    <div className="w-full flex flex-col">
      {paginatedFeedItems.map((item, index) => {
        if (item.kind === "story") {
          return (
            <FeedStoryCard
              key={`story-${item.data.id}-${index}`}
              story={item.data}
              onOpen={onOpenStory}
              currentUser={currentUser}
              users={users}
              groups={groups}
              brands={brands}
              chats={chats}
              onProfileClick={onProfileClick}
              onReact={(storyId, rType) => {
                const storyPost = {
                  ...item.data,
                  id: storyId,
                  story_id: storyId,
                  item_type: 'story',
                  type: 'story',
                  post_type: 'story',
                };
                onReact?.(storyPost as any, rType);
              }}
              onOpenComments={(s) => {
                const storyPost = {
                  ...(s || item.data),
                  id: (s || item.data).id,
                  story_id: (s || item.data).id,
                  item_type: 'story',
                  type: 'story',
                  post_type: 'story',
                };
                onOpenComments(storyPost as any);
              }}
              onShare={(s, destination, data) => {
                const storyPost = {
                  ...(s || item.data),
                  id: (s || item.data).id,
                  story_id: (s || item.data).id,
                  item_type: 'story',
                  type: 'story',
                  post_type: 'story',
                };
                onShare(
                  storyPost.id,
                  safeNumber(data?.shares ?? storyPost.shares ?? storyPost.shares_count, 0),
                  data,
                  storyPost
                );
              }}
            />
          );
        }

        if (item.kind === "reel") {
          const reel = item.data;
          const authorId = Number(reel?.user_id || reel?.userId || 0);
          const authorObj =
            users?.find((u) => Number(u.id) === authorId) ||
            reel?.user || {
              id: authorId,
              name: reel?.author || reel?.author_name || 'Creator',
              username: reel?.username || (reel?.author || 'creator').toLowerCase().replace(/\s+/g, '_'),
              profile_image_url: reel?.avatar || reel?.avatar_url,
              is_verified: Boolean(reel?.verified),
            };

          const matchingPost = (feedItemsProp || []).find((p: any) =>
            (reel?.id != null && Number(p.id) === Number(reel.id)) ||
            (p.video_url && (p.video_url === reel?.video_url || p.video_url === reel?.videoUrl))
          );

          const reelRawReactions =
            (Array.isArray(reel?.reactions) && reel.reactions.length > 0 ? reel.reactions : null) ||
            (Array.isArray(matchingPost?.reactions) && matchingPost.reactions.length > 0 ? matchingPost.reactions : null) ||
            (Array.isArray(reel?.reactions_preview) && reel.reactions_preview.length > 0 ? reel.reactions_preview : null) ||
            (Array.isArray(matchingPost?.reactions_preview) && matchingPost.reactions_preview.length > 0 ? matchingPost.reactions_preview : null) ||
            [];

          const reelReactionCount = safeNumber(
            reel?.reactions_count ??
            reel?.reactionsCount ??
            matchingPost?.reactions_count ??
            matchingPost?.reactionsCount ??
            reel?.likes_count ??
            reel?.likesCount ??
            matchingPost?.likesCount ??
            matchingPost?.likes_count ??
            reel?.likes ??
            reelRawReactions.length,
            0
          );

          const reelCommentCount = safeNumber(
            reel?.comments_count ??
            reel?.comment_count ??
            reel?.commentsCount ??
            matchingPost?.comments_count ??
            matchingPost?.comment_count ??
            matchingPost?.commentsCount ??
            (Array.isArray(reel?.comments) ? reel.comments.length : (Array.isArray(matchingPost?.comments) ? matchingPost.comments.length : 0)),
            0
          );

          const reelShareCount = safeNumber(
            reel?.shares_count ??
            reel?.sharesCount ??
            reel?.shares ??
            matchingPost?.shares_count ??
            matchingPost?.sharesCount ??
            matchingPost?.shares ??
            0,
            0
          );

          const reelMyReaction =
            reel?.my_reaction ||
            reel?.myReaction ||
            reel?.reaction ||
            matchingPost?.my_reaction ||
            matchingPost?.myReaction ||
            (currentUser && reelRawReactions.length
              ? reelRawReactions.find((r: any) => Number(r.user_id) === Number(currentUser.id))?.type
              : null) ||
            null;

          const reelReactorName =
            reel?.reactor_name ||
            reel?.reactorName ||
            matchingPost?.reactor_name ||
            matchingPost?.reactorName ||
            pickStableReactorName(reel?.id, reelRawReactions, users);

          const reelReactionText = formatReactionText(reelReactionCount, reelReactorName);

          const reelEmojiList =
            reelRawReactions.length > 0
              ? topReactionEmojis(reelRawReactions, 2)
              : reelReactionCount > 0
              ? ['👍']
              : [];

          const reelAsPost: any = {
            ...(matchingPost || {}),
            ...reel,
            id: reel?.id,
            reel_id: reel?.id,
            user_id: authorId,
            content: reel?.caption || reel?.content || matchingPost?.content || '',
            caption: reel?.caption || reel?.content || matchingPost?.content || '',
            video_url: reel?.video_url || reel?.videoUrl || reel?.video || matchingPost?.video_url || '',
            media_url: reel?.video_url || reel?.videoUrl || reel?.video || matchingPost?.video_url || '',
            thumbnail_url: reel?.thumbnail_url || reel?.thumbnail || reel?.cover_url || matchingPost?.thumbnail_url || '',
            media_type: 'video',
            type: 'video',
            shares: reelShareCount,
            shares_count: reelShareCount,
            views: safeNumber(reel?.views ?? matchingPost?.views, 0),
            likes_count: reelReactionCount,
            likesCount: reelReactionCount,
            reactions_count: reelReactionCount,
            reactions: reelRawReactions,
            reactions_preview: reelRawReactions,
            reactor_name: reelReactorName,
            comments_count: reelCommentCount,
            comment_count: reelCommentCount,
            comments: Array.isArray(reel?.comments) ? reel.comments : (Array.isArray(matchingPost?.comments) ? matchingPost.comments : []),
            my_reaction: reelMyReaction,
            myReaction: reelMyReaction,
            visibility: 'public',
            created_at: reel?.created_at || item.created_at || matchingPost?.created_at || new Date().toISOString(),
            user: authorObj,
            author: authorObj,
          };

          const isFollowing = checkIsFollowing?.(authorId) || false;

          return (
            <article key={`reel-${reel?.id || index}`} className="w-full relative bg-[#0F172A] border-b-[8px] border-[#050B18]">
              <InstagramVideoCard
                post={reelAsPost}
                author={authorObj}
                currentUser={currentUser}
                users={users}
                stories={stories}
                autoplay={false}
                reactionCount={reelReactionCount}
                myReaction={reelMyReaction}
                commentCount={reelCommentCount}
                shareCount={reelShareCount}
                emojiList={reelEmojiList}
                reactionText={reelReactionText}
                onProfileClick={(userId) => onProfileClick?.(Number(userId))}
                onReact={(p, rType) => onReact?.(p, rType)}
                onShare={(postId, newCount, data, orig) => onShare?.(postId, newCount, data, orig || reelAsPost)}
                onVideoClick={() => {
                  if (onVideoClick) {
                    onVideoClick(reelAsPost);
                  } else if (onOpenReel) {
                    onOpenReel(reel?.id);
                  }
                }}
                isFollowing={isFollowing}
                onFollow={() => onFollow?.(authorId)}
                onHashtagClick={onHashtagClick}
                onOpenComments={() => onOpenComments?.(reelAsPost)}
                onCommentAdded={() => {}}
              />
            </article>
          );
        }

        const post = item.data;
        const postAuthorId = Number(post.user_id);
        const isFollowing = checkIsFollowing?.(postAuthorId) || false;
        const isPostOwner = currentUser && Number(currentUser.id) === postAuthorId;
        const isAdminUser = currentUser && currentUser.role === "admin";
        const isPushed = Boolean(pushedPosts?.[post.id] || (post as any)?.is_pushed || (post as any)?.pushed);
        const showPushButton = (isPostOwner || isAdminUser) && onPushMore && !isPushed;

        const showFirstPymk =
          peopleYouMayKnow &&
          peopleYouMayKnow.length > 0 &&
          peopleYouMayKnowInsertIndex1 >= 0 &&
          index === peopleYouMayKnowInsertIndex1;

        const showSecondPymk =
          peopleYouMayKnow &&
          peopleYouMayKnow.length > 0 &&
          peopleYouMayKnowInsertIndex2 >= 0 &&
          index === peopleYouMayKnowInsertIndex2;

        const showGroupsYouMayJoin =
          groupsYouMayJoin &&
          groupsYouMayJoin.length > 0 &&
          groupsYouMayJoinInsertIndex >= 0 &&
          index === groupsYouMayJoinInsertIndex;

        return (
          <React.Fragment key={`post-${post.id}-${index}`}>
          <Post
  post={post as PostType}
  author={getPostAuthor?.(post as PostType) || post.author || post}
  currentUser={currentUser}
  users={users}
  stories={stories}
  onOpenStory={onOpenStory}
  onProfileClick={onProfileClick}
  onReact={onReact}
  onShare={onShare}
  onViewImage={onViewImage}
  onOpenComments={onOpenComments}
  onVideoClick={onVideoClick}
  onPlayAudioTrack={onPlayAudioTrack}
  groups={groups}
  brands={brands}
  chats={chats}
  onHashtagClick={onHashtagClick}
  isFollowing={isFollowing}
  onFollow={() => onFollow?.(postAuthorId)}
  followLoading={followLoading?.[postAuthorId] || false}
  onViewProductFromPost={onViewProductFromPost}
  onRSVP={onRSVPEvent}
  onOpenGroup={onOpenGroup}
  onDelete={onDeletePost}
  onEdit={onEditPost}
  onApplyToJob={onApplyToJob}
  
  pushButton={showPushButton ? (
    <button
      onClick={() => onPushMore?.(post.id)}
      className="px-3 py-1 rounded-md text-sm font-semibold ml-2 bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
    >
      Push
    </button>
  ) : undefined}
/>
            
    

            {showFirstPymk && (
              <PeopleYouMayKnowGrid
                users={peopleYouMayKnow}
                onFollow={(id: number) => onFollowFromPymk?.(id)}
                currentUser={currentUser}
                isLoading={pymkLoading}
                onLoginClick={onLoginClick}
                onProfileClick={onProfileClick}
                title="People You May Know"
                maxDisplay={8}
              />
            )}

            {showSecondPymk && (
              <PeopleYouMayKnowGrid
                users={peopleYouMayKnow}
                onFollow={(id: number) => onFollowFromPymk?.(id)}
                currentUser={currentUser}
                isLoading={pymkLoading}
                onLoginClick={onLoginClick}
                onProfileClick={onProfileClick}
                title="More People You May Know"
                maxDisplay={8}
              />
            )}

            {showGroupsYouMayJoin && (
              <GroupsYouMayJoinCard
                groups={groupsYouMayJoin}
                currentUser={currentUser}
                isLoading={gymjLoading}
                onJoin={(groupId: number) => onJoinGroupSuggestion?.(groupId)}
                onLoginClick={onLoginClick}
                onOpenGroup={(groupId: number) => onOpenGroup?.(groupId)}
                onProfileClick={onProfileClick}
                title="Groups You May Join"
                maxDisplay={8}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Completely hidden sentinel for silent Facebook-style infinite scroll (no visible loader) */}
      {(visibleFeedCount < safeFeedItems.length || hasMoreFeed) && (
        <div
          ref={feedMoreRef}
          className="h-1 w-full opacity-0 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </div>
  );
});


       
// ==================== ADDITIONAL EXPORTS ====================
export default Feed;

export type { FeedProps, PeopleSuggestion, GroupSuggestion, FeedEventItem };

export {
  reactionEmoji,
  fmtCount,
  formatReactionText,
  formatViewCount,
  getPostTextPreview,
  toDateSafe,
  safeJsonArray,
  safeParseJsonArray,
  getMarketplaceProductId,
  getPostMediaList,
  getOrientation,
  apiFetch,
  classifyOrientations,
  MediaGrid,
  ProgressiveTileImage,
  ProgressiveTileImage as ProgressiveFeedImage,
};

export { BACKGROUNDS, FEELINGS, QUICK_EMOJIS };

export const getPostType = (post: any): string => {
  if (post?.type === 'sponsored' || post?.ad_type) return 'sponsored';
  if (post?.type === 'reel' || post?.item_type === 'reel') return 'reel';
  if (post?.type === 'event' || post?.item_type === 'event') return 'event';
  if (post?.type === 'product' || post?.marketplace) return 'product';
  if (post?.group_id || post?.group) return 'group_post';
  return 'post';
};

export const isVideoPost = (post: any): boolean => {
  const mediaInfo = getMediaTypeInfo(post);
  return mediaInfo.isVideo || (post?.media_type === 'video');
};

export const isImagePost = (post: any): boolean => {
  const mediaInfo = getMediaTypeInfo(post);
  return mediaInfo.isImage || (post?.media_type === 'image');
};

export const isAudioPost = (post: any): boolean => {
  const mediaInfo = getMediaTypeInfo(post);
  return mediaInfo.isAudio || (post?.media_type === 'audio');
};


// CSS injection
const injectGlobalStyles = () => {
  if (typeof document === 'undefined') return;
  
  const styleId = 'feed-global-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes slide-up {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      .animate-slide-up {
        animation: slide-up 0.3s ease-out;
      }
      
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      
      .custom-scrollbar::-webkit-scrollbar-track {
        background: #0B1120;
        border-radius: 10px;
      }
      
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1E293B;
        border-radius: 10px;
      }
      
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #334155;
      }
      
      .line-clamp-1 {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      
      .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      
      .line-clamp-3 {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      
      /* Comments Sheet Fix - prevents blank screen */
      .comments-sheet-root {
        position: fixed !important;
        inset: 0 !important;
        z-index: 99999 !important;
        width: 100vw !important;
        height: 100dvh !important;
        background: #050B18 !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }
};

if (typeof window !== 'undefined') {
  injectGlobalStyles();
}

export const FEED_VERSION = '2.0.0';
export const LAST_UPDATED = '2024-03-27';
                       
