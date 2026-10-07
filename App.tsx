import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Login, Register } from './components/Auth';
import { Header, Sidebar, RightSidebar } from './components/Layout';
import {
  CreatePost,
  Post,
  CommentsSheet,
  CreatePostModal,
  ShareBottomSheet,
  PeopleYouMayKnowGrid,
  GroupsYouMayJoinCard,
  FeedItem,
  Feed,
} from './components/Feed';
import { StoryReel, CreateStoryModal, StoryViewerModal, StoryCommentsSheet } from './components/Story';
import { UserProfile } from './components/UserProfile';
import { MarketplacePage, ProductDetailModal } from './components/Marketplace';
import { ReelsFeed } from './components/Reels';
import { VideosPage } from './components/VideosPage';
import {
  rankAndRotateVideos,
  mixFeedWithStrictVideoSpacing,
  getVisitSequence,
  markVideosAsSeen,
} from './utils/feedVideoRotation';
import { compressProfileImage, compressCoverImage } from './utils/imageCompression';
import { AllEvents } from "./components/AllEvents";
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ImageViewer, ProfessionalLoader } from './components/Common';
import {
  BirthdaysPage,
  MemoriesPage,
  SuggestedProfilesPage,
} from './components/MenuPages';
import { SavedPostsPage } from './components/SavedPostsPage';
import StoryFeeds from './components/StoryFeeds';
import { HelpSupportPage } from './components/HelpSupport';
import { CreateEventModal } from './components/Events';
import { BrandsPage } from './components/Brands';
import MusicSystem, { GlobalAudioPlayer, MusicCommentsSheet } from './components/MusicSystem';
import { GroupsPage } from './components/Groups';
import { ToolsPage } from './components/Tools';
import { PrivacyPolicyPage } from './components/PrivacyPolicy';
import { SettingsPage } from './components/Settings';
import { TermsOfServicePage } from './components/TermsOfService';
import { ChatWindow } from './components/Chat';
import { ChatsList } from './components/ChatsList';
import { CallScreen } from './components/CallScreen';
import Recorder from './components/Recorder';
import { ReelCameraCreator } from './components/Reels';
import { NotificationsPage } from './components/NotificationsPage';
import { SearchPage } from './components/SearchPage';
import Dashboard from './components/Dashboard';
import AdCreator from './components/AdCreator';
import AdsManager from './components/AdsManager';
import { moderateUser } from './lib/moderation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartLine, 
  faPlus, 
  faBullhorn, 
  faChartBar 
} from '@fortawesome/free-solid-svg-icons';
import { TrendingUp } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import { buildImageUploadBundle } from './utils/imageCompression';
import { generateVideoThumbnail } from './utils/videoThumbnail';
import { compressVideoDual, CompressedVideoResult } from './utils/videoCompressor';
import { resolveApiUrl } from './utils/api';
import {
  PostUploadProgressBanner,
  PostUploadBottomPill,
  PostUploadState,
} from './components/PostUploadProgress';
import {
  User,
  Post as PostType,
  Story,
  Reel,
  Notification,
  Event,
  Product,
  AudioTrack,
  ReactionType,
  Group,
  Brand,
  Song,
  AdCampaign,
} from './types';
import { MOCK_SONGS, INITIAL_EVENTS } from './constants';

// ============================================================================
// ✅ FEED IDENTITY HELPERS - HYBRID MIXED FEED SYSTEM
// ============================================================================

/**
 * Get feed item type for proper identification
 * Supports: post, reel, event, product, group_post, music, podcast, sponsored
 */
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
  ) {
    return 'story_share';
  }

  if (
    item?.kind === 'story' ||
    item?.source === 'story' ||
    item?.item_type === 'story' ||
    item?.type === 'story' ||
    item?.post_type === 'story' ||
    meta?.kind === 'story' ||
    meta?.type === 'story' ||
    (item?.story_id && !item?.shared_post_id)
  ) {
    return 'story';
  }

  // Sponsored/Ad items
  if (item?.source === 'sponsored' || 
      item?.item_type === 'sponsored' || 
      item?.type === 'sponsored' || 
      meta?.kind === 'ad') {
    return 'sponsored';
  }
  
  if (item?.source === 'product' || 
      item?.item_type === 'product' ||
      item?.type === 'marketplace' || 
      item?.type === 'product' ||
      item?.post_type === 'product' ||
      meta?.type === 'product' || 
      meta?.kind === 'product' ||
      !!item?.product_id ||
      !!meta?.marketplace?.id) {
    return 'product';
  }
  
  if (item?.source === 'event' || 
      item?.item_type === 'event' ||
      item?.type === 'event' ||
      item?.post_type === 'event' ||
      meta?.type === 'event' || 
      meta?.kind === 'event' ||
      !!item?.event_id ||
      !!meta?.event) {
    return 'event';
  }
  
  if (item?.source === 'group_post' || 
      item?.item_type === 'group_post' ||
      !!item?.group_id || 
      !!item?.group) {
    return 'group_post';
  }
  
  if ((item?.source === 'reel' || 
      item?.item_type === 'reel' || 
      !!item?.reel_id) && !item?.shared_post_id) {
    return 'reel';
  }
  
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
    Boolean(
      item?.song_id2 ||
      item?.song_id ||
      item?.song_title ||
      (item?.audio_url &&
        !item?.podcast_id &&
        meta?.kind !== 'podcast' &&
        meta?.type !== 'podcast' &&
        item?.item_type !== 'podcast' &&
        item?.type !== 'podcast')
    )
  ) {
    return 'music';
  }
  if (meta?.kind === 'podcast' || meta?.type === 'podcast') return 'podcast';
  
  return 'post';
};

/**
 * Get feed item ID based on type - ALWAYS returns numeric ID
 * Supports hybrid feed items (post, reel, event, product, group_post, music, podcast, sponsored)
 */
const getFeedItemId = (item: any): number => {
  if (!item || typeof item !== 'object') return 0;

  const type = getFeedItemType(item);

  switch (type) {
    case 'story_share':
      return Number(item?.share_id ?? item?.id ?? 0);
    case 'story':
      return Number(item?.story_id ?? item?.id ?? 0);
    case 'product':
      return Number(item?.product_id ?? item?.meta?.marketplace?.id ?? item?.id ?? 0);
    case 'event':
      return Number(item?.event_id ?? item?.id ?? 0);
    case 'group_post':
      return Number(item?.post_id ?? item?.id ?? 0);
    case 'reel':
      return Number(item?.reel_id ?? item?.id ?? 0);
    case 'music':
      return Number(
        item?.song_id2 ??
        item?.song_id ??
        (item?.meta as any)?.song?.id ??
        (item?.meta as any)?.original_song_id ??
        (item?.shared_song as any)?.id ??
        item?.id ??
        0
      );
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

/**
 * Get feed key for mixed-feed identification (post:123, reel:456, etc.)
 */
const getFeedKey = (item: any): string => {
  if (!item) return "";

  // Handle string input (already a key)
  if (typeof item === "string") return item;

  // Handle object with feed_key
  if (item?.feed_key) return String(item.feed_key);

  // Generate feed_key from type and numeric ID
  const type = getFeedItemType(item);
  const id = getFeedItemId(item);

  return `${type}:${id}`;
};

/**
 * Safe item comparison using feed keys and numeric IDs
 */
const isSameFeedItem = (a: any, b: any): boolean => {
  if (!a || !b) return false;

  // First try by feed_key
  const aKey = getFeedKey(a);
  const bKey = getFeedKey(b);
  if (aKey && bKey) return aKey === bKey;

  // Fallback to type + numeric ID comparison
  const aType = getFeedItemType(a);
  const bType = getFeedItemType(b);
  const aId = getFeedItemId(a);
  const bId = getFeedItemId(b);

  return aType === bType && aId > 0 && bId > 0 && aId === bId;
};

/**
 * Optimistic reaction update for hybrid feed items
 * Uses identity string for matching instead of numeric ID only
 */
const applyOptimisticReaction = (
  p: any,
  targetIdentity: string,
  type: ReactionType,
  meId: number
) => {
  if (!p) return p;

  // Match by feed_key instead of numeric ID
  const same = getFeedKey(p) === targetIdentity;
  if (!same) return p;

  const prevMy = p?.my_reaction ?? p?.myReaction ?? null;
  const nextMy = prevMy === type ? null : type;

  const prevArr = safeArray<any>(p?.reactions);
  const withoutMe = prevArr.filter((r: any) => Number(r?.user_id) !== Number(meId));
  const nextArr = nextMy ? [...withoutMe, { user_id: meId, type: nextMy }] : withoutMe;

  const prevCount = safeNumber(
    p?.reactions_count,
    safeNumber(p?.reactionsCount, safeNumber(p?.likesCount, prevArr.length))
  );

  let nextCount = prevCount;

  if (!prevMy && nextMy) {
    nextCount = prevCount + 1;
  } else if (prevMy && !nextMy) {
    nextCount = Math.max(0, prevCount - 1);
  } else if (prevMy && nextMy) {
    nextCount = prevCount;
  }

  return {
    ...p,
    reactions: nextArr,
    my_reaction: nextMy,
    myReaction: nextMy,
    reactions_count: nextCount,
    reactionsCount: nextCount,
    likesCount: nextCount,
  };
};

/** ---------- Type for People You May Know suggestions ---------- */
type PeopleSuggestion = {
  id: number;
  username: string;
  name: string;
  profile_image_url: string | null;
  is_verified: boolean;
  role: string;
  mutual_count: number;
  is_following: boolean;
  score: number;
};

/** ---------- Type for Groups You May Join suggestions ---------- */
type GroupSuggestion = {
  id: number;
  admin_id: number;
  name: string;
  description: string;
  type: "public" | "private";
  cover_image?: string;
  profile_image?: string;
  created_at?: string;
  category: string;
  members_count: number;
  mutual_count: number;
  is_member: boolean;
  score: number;
};

/** ---------- Safety helpers ---------- */
const safeArray = <T = any,>(v: any): T[] => {
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
const safeString = (v: any, fallback = '') => (typeof v === 'string' ? v : String(v || ''));
const safeBoolean = (v: any, fallback = false) => (typeof v === 'boolean' ? v : !!v);

/** ✅ JSON parsing helper for meta fields */
const parseJSON = (v: any) => {
  if (!v) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
};

 const safeImageVariants = (value: any) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => ({
        thumb: String(v?.thumb || '').trim(),
        feed: String(v?.feed || v?.full || '').trim(),
        full: String(v?.feed || v?.full || '').trim(),
        type: 'image',
      }))
      .filter((v) => v.feed);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v: any) => ({
          thumb: String(v?.thumb || '').trim(),
          feed: String(v?.feed || v?.full || '').trim(),
          full: String(v?.feed || v?.full || '').trim(),
          type: 'image',
        }))
        .filter((v: any) => v.feed);
    } catch {
      return [];
    }
  }
  return [];
}; 

/** ---------- Constants ---------- */
const DEFAULT_MUSIC_COVER = 'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';
const DEFAULT_EVENT_COVER = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1500&q=80';
const LS_USER_KEY = 'user';

/** ===== FB-LIKE STORY SEEN SYSTEM ===== */
const STORY_SEEN_KEY = 'unera_story_seen_v1';
const STORY_SEEN_LIMIT = 2500;

/** ===== CACHE CONSTANTS ===== */
const STORIES_CACHE_KEY = "unera_stories_cache_v1";
const STORIES_CACHE_TTL_MS = 60_000;
const STORY_VIEWERS_CACHE_KEY = "unera_story_viewers_";
const VIEWERS_TTL = 2 * 60_000;

/** ===== PYMK CONSTANTS ===== */
const PYMK_HIDDEN_KEY = "unera_pymk_hidden_v1";

/** ===== GROUPS YOU MAY JOIN CONSTANTS ===== */
const GROUPS_YOU_MAY_JOIN_HIDDEN_KEY = "unera_groups_you_may_join_hidden_v1";

/** ---------- Video/Reel ID resolver ---------- */
const resolveVideoId = (item: any): number | null => {
  if (!item) return null;
  
  const possibleIds = [
    item?.post_id,
    item?.postId,
    item?.reel_id,
    item?.reelId,
    item?.video_id,
    item?.videoId,
    item?.id,
  ];
  
  for (const id of possibleIds) {
    if (id === undefined || id === null) continue;
    const num = Number(id);
    if (Number.isFinite(num) && num > 0) return num;
  }
  
  return null;
};

//=====VIDEO AUDIO EXTRACTOR=====
  
async function extractAudioFromVideo(file: File): Promise<File | null> {
  let video: HTMLVideoElement | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let isStopped = false;
  
  try {
    const videoUrl = URL.createObjectURL(file);
    video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    
    await new Promise<void>((resolve, reject) => {
      if (!video) return reject(new Error('Video element not created'));
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video metadata'));
    });
    
    const duration = video.duration;
    if (!duration || duration <= 0) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    sourceNode = audioContext.createMediaElementSource(video);
    
    const dest = audioContext.createMediaStreamDestination();
    sourceNode.connect(dest);
    // IMPORTANT: DO NOT connect to speakers
    
    stream = dest.stream;
    
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
    
    if (!mimeType) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.start(250);
    await video.play();
    
    await new Promise<void>((resolve) => {
      const stopAt = Math.min(duration, 60);
      const timer = setTimeout(() => {
        if (!isStopped) {
          isStopped = true;
          resolve();
        }
      }, stopAt * 1000);
      
      if (video) {
        video.onended = () => {
          if (!isStopped) {
            isStopped = true;
            clearTimeout(timer);
            resolve();
          }
        };
      }
    });
    
    const recordingStopped = new Promise<Blob>((resolve) => {
      if (!mediaRecorder) return resolve(new Blob());
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      mediaRecorder.stop();
    });
    
    if (video) video.pause();
    const recordedBlob = await recordingStopped;
    URL.revokeObjectURL(videoUrl);
    
    if (!recordedBlob.size) return null;
    
    return new File(
      [recordedBlob],
      `original-audio-${Date.now()}.webm`,
      { type: mimeType }
    );
    
  } catch (error) {
    console.warn('Audio extraction from video failed:', error);
    return null;
  } finally {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    if (sourceNode && audioContext) {
      try { sourceNode.disconnect(); } catch {}
    }
    if (audioContext) {
      try { await audioContext.close(); } catch {}
    }
    if (video) {
      try { video.pause(); } catch {}
      try { video.remove(); } catch {}
    }
    if (stream) {
      try { stream.getTracks().forEach(track => track.stop()); } catch {}
    }
  }
}  

  //===OTHER RECORDER SOUND EXTRACTOR HELPERS ===
      
const isVideoLikeAudioUrl = (url?: string) => {
  const u = String(url || '').toLowerCase().split('?')[0];

  return (
    u.endsWith('.mp4') ||
    u.endsWith('.mov') ||
    u.endsWith('.webm') ||
    u.endsWith('.m4v') ||
    u.includes('/uploads/videos/')
  );
};

const remoteUrlToVideoFile = async (url: string): Promise<File> => {
  const res = await fetch(url, { cache: 'force-cache' });

  if (!res.ok) {
    throw new Error('Failed to load original sound video');
  }

  const blob = await res.blob();
  const type = blob.type || 'video/mp4';

  return new File(
    [blob],
    `original-sound-video-${Date.now()}.mp4`,
    { type }
  );
};
/** ---------- Stable key generator ---------- */
const getStableItemKey = (item: any, prefix = 'item'): string => {
  const id = resolveVideoId(item);
  if (id) return `${prefix}-${id}`;
  
  const fallbackParts = [
    item?.user_id,
    item?.userId,
    item?.created_at,
    item?.createdAt,
    item?.media_url,
    item?.content?.substring(0, 20)
  ].filter(Boolean);
  
  return `${prefix}-${fallbackParts.join('-') || Math.random()}`;
};

const readStorySeen = (): number[] => {
  try {
    const raw = localStorage.getItem(STORY_SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};

const writeStorySeen = (ids: number[]) => {
  try {
    const dedup = Array.from(new Set(ids.map(Number).filter(Number.isFinite))).slice(0, STORY_SEEN_LIMIT);
    localStorage.setItem(STORY_SEEN_KEY, JSON.stringify(dedup));
  } catch {}
};

/** Stories cache functions */
const readStoriesCache = () => {
  try {
    const raw = localStorage.getItem(STORIES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.stories)) return null;
    
    if (Date.now() - parsed.ts > STORIES_CACHE_TTL_MS) {
      localStorage.removeItem(STORIES_CACHE_KEY);
      return null;
    }
    
    return parsed as { ts: number; stories: any[] };
  } catch {
    return null;
  }
};

const writeStoriesCache = (stories: any[]) => {
  try {
    localStorage.setItem(STORIES_CACHE_KEY, JSON.stringify({ 
      ts: Date.now(), 
      stories: stories.map(s => normalizeStory(s)) 
    }));
  } catch {}
};

/** Viewers cache functions */
const readViewersCache = (storyId: number) => {
  try {
    const raw = localStorage.getItem(`${STORY_VIEWERS_CACHE_KEY}${storyId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.ts && Date.now() - parsed.ts > VIEWERS_TTL) {
      localStorage.removeItem(`${STORY_VIEWERS_CACHE_KEY}${storyId}`);
      return null;
    }
    return parsed.viewers as any[];
  } catch {
    return null;
  }
};

const writeViewersCache = (storyId: number, viewers: any[]) => {
  try {
    localStorage.setItem(`${STORY_VIEWERS_CACHE_KEY}${storyId}`, 
      JSON.stringify({ ts: Date.now(), viewers }));
  } catch {}
};

/** ---------- Error Boundary for Crash Protection ---------- */
class ErrorBoundary extends React.Component<{ children?: any }, { error: any }> {
  state: { error: any } = { error: null };
  props: { children?: any };
  constructor(props: { children?: any }) {
    super(props);
    this.props = props;
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("UI crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-white">
          <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-4">
            <p className="font-bold text-red-400">Component crashed</p>
            <p className="text-[#94A3B8] text-sm mt-2">
              Open DevTools Console to see the exact error.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** ---------- Facebook-like feed session + seen cache ---------- */
const FEED_SESSION_KEY = 'unera_feed_session_seed';
const FEED_LAST_ACTIVE_KEY = 'unera_feed_last_active';
const FEED_SEEN_KEY = 'unera_feed_seen_ids';
const FEED_RETURN_THRESHOLD_MS = 3 * 60 * 1000;
const FEED_SEEN_LIMIT = 1500;

const nowMs = () => Date.now();

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const mulberry32 = (seed: number) => {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashToSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const getOrCreateSessionSeed = (userId?: number | null) => {
  try {
    const existing = sessionStorage.getItem(FEED_SESSION_KEY);
    if (existing) return Number(existing) || 1;

    const seedStr = `${userId ?? 'guest'}:${nowMs()}:${Math.random()}`;
    const seed = hashToSeed(seedStr);
    sessionStorage.setItem(FEED_SESSION_KEY, String(seed));
    return seed;
  } catch {
    return hashToSeed(`${userId ?? 'guest'}:${nowMs()}`);
  }
};

const seededShuffle = <T,>(arr: T[], seed: number) => {
  const a = arr.slice();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const getSeenSet = () => {
  const ids = readJson<number[]>(FEED_SEEN_KEY, []);
  return new Set(ids.map(Number).filter(Number.isFinite));
};

const pushSeenIds = (ids: number[]) => {
  const existing = readJson<number[]>(FEED_SEEN_KEY, []);
  const merged = [...ids, ...existing].map(Number).filter(Number.isFinite);
  const dedup = Array.from(new Set(merged)).slice(0, FEED_SEEN_LIMIT);
  writeJson(FEED_SEEN_KEY, dedup);
};

const diversifyFeed = (posts: PostType[], seed: number) => {
  if (!Array.isArray(posts) || posts.length <= 2) return posts;

  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const buckets = new Map<string, PostType[]>();

  const keyOf = (p: any) => {
    const uid = Number(p?.user_id ?? 0);
    const type = String(p?.type ?? 'post');
    return `u:${uid}|t:${type}`;
  };

  for (const p of posts) {
    const k = keyOf(p);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(p);
  }

  const keys = seededShuffle(Array.from(buckets.keys()), Math.floor(rnd() * 1e9));
  const out: PostType[] = [];
  let lastAuthor = -1;
  let repeats = 0;

  while (out.length < posts.length) {
    let progressed = false;

    for (const k of keys) {
      const b = buckets.get(k);
      if (!b || b.length === 0) continue;

      const candidate = b[0];
      const author = Number((candidate as any).user_id ?? -1);

      if (author === lastAuthor && repeats >= 1) continue;

      out.push(b.shift()!);
      progressed = true;

      if (author === lastAuthor) repeats++;
      else {
        lastAuthor = author;
        repeats = 0;
      }

      if (out.length >= posts.length) break;
    }

    if (!progressed) {
      for (const k of keys) {
        const b = buckets.get(k);
        if (b && b.length) {
          out.push(b.shift()!);
          if (out.length >= posts.length) break;
        }
      }
    }
  }

  return out;
};

/** Name validation helper */
const isBadName = (v: any): boolean => {
  const s = String(v ?? '').trim();
  return !s || s.toLowerCase() === 'user' || s.toLowerCase() === 'un';
};

/** Safe User Merge Helper with name protection */
const isHttpUrl = (v: any) =>
  typeof v === 'string' && (v.startsWith('https://') || v.startsWith('http://'));

const mergeUserSafe = (oldU: any, newU: any) => {
  const next = { ...oldU, ...newU };

  if (!isHttpUrl(newU?.profile_image_url) && isHttpUrl(oldU?.profile_image_url)) {
    next.profile_image_url = oldU.profile_image_url;
  }
  if (!isHttpUrl(newU?.cover_image_url) && isHttpUrl(oldU?.cover_image_url)) {
    next.cover_image_url = oldU.cover_image_url;
  }

  if (!Array.isArray(newU?.followers) && Array.isArray(oldU?.followers)) {
    next.followers = oldU.followers;
  }
  if (!Array.isArray(newU?.following) && Array.isArray(oldU?.following)) {
    next.following = oldU.following;
  }

  if (isBadName(newU?.name) && !isBadName(oldU?.name)) {
    next.name = oldU.name;
  }
  if (isBadName(newU?.username) && !isBadName(oldU?.username)) {
    next.username = oldU.username;
  }

  return next;
};

/** ---------- UNERA Professional Profile Picture Generator ---------- */
const COLORS = [
  '#1877F2',
  '#45BD62',
  '#F3425F',
  '#F7B928',
  '#9360F7',
  '#FF6B35',
  '#00B5AD',
  '#E41E3F',
  '#7B68EE',
  '#20B2AA',
  '#FF6347',
  '#9B59B6',
  '#1ABC9C',
  '#3498DB',
  '#E74C3C',
  '#2ECC71',
  '#F39C12',
  '#D35400',
];

const getUserColor = (identifier: string | number): string => {
  if (!identifier && identifier !== 0) return '#1877F2';
  const str = String(identifier);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLORS.length;
  return COLORS[index];
};

const generateInitials = (name: string): string => {
  if (!name || typeof name !== 'string' || name.trim().length === 0) return 'UN';
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 'UN';
  if (words.length === 1) {
    const w = words[0];
    if (w.length >= 2) return w.substring(0, 2).toUpperCase();
    return (w.charAt(0) + w.charAt(0)).toUpperCase();
  }
  return words[0].charAt(0).toUpperCase() + words[1].charAt(0).toUpperCase();
};

const generateProfilePictureUrl = (name: string, identifier: string | number): string => {
  const initials = generateInitials(name);
  const backgroundColor = getUserColor(identifier).replace('#', '');
  const size = 128;
  const fontSize = 0.5;
  const textColor = 'FFFFFF';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    initials
  )}&background=${backgroundColor}&color=${textColor}&size=${size}&font-size=${fontSize}&bold=true&rounded=true&length=2`;
};

/**
 * Normalize raw D1 rows to UI-safe PostType shape
 */
const normalizePost = (p: any): PostType => {
  const mediaUrls =
    Array.isArray(p?.media_urls) ? p.media_urls :
    typeof p?.media_urls === "string" ? (() => { try { return JSON.parse(p.media_urls); } catch { return []; } })() :
    Array.isArray(p?.mediaUrls) ? p.mediaUrls :
    typeof p?.mediaUrls === "string" ? (() => { try { return JSON.parse(p.mediaUrls); } catch { return []; } })() :
    [];

  const mediaTypes =
    Array.isArray(p?.media_types) ? p.media_types :
    typeof p?.media_types === "string" ? (() => { try { return JSON.parse(p.media_types); } catch { return []; } })() :
    Array.isArray(p?.mediaTypes) ? p.mediaTypes :
    typeof p?.mediaTypes === "string" ? (() => { try { return JSON.parse(p.mediaTypes); } catch { return []; } })() :
    [];

  const rawMediaMeta = Array.isArray(p?.media) ? p.media : (Array.isArray(p?.media_meta) ? p.media_meta : []);
  const videoFromMedia = rawMediaMeta.find((m: any) => m?.type === 'video')?.feed || rawMediaMeta.find((m: any) => m?.type === 'video')?.url;
  const videoUrl = p?.video_url ?? p?.videoUrl ?? p?.video ?? videoFromMedia ?? null;
  const feedUrl = p?.feed_url ?? p?.feedUrl ?? null;
  const mediaUrl = p?.media_url ?? p?.mediaUrl ?? videoUrl ?? feedUrl ?? (mediaUrls[0] ?? null);
  const isVideo =
    p?.media_type === 'video' ||
    p?.type === 'video' ||
    Boolean(videoUrl) ||
    (typeof mediaUrl === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(mediaUrl));
  const mediaType = isVideo ? 'video' : (p?.media_type ?? p?.mediaType ?? (mediaTypes[0] ?? null));

  const resolvedId = safeNumber(p?.id ?? p?.post_id ?? p?.postId ?? p?.postID);

  // Handle event posts specifically
  if (
    p?.type === 'event' ||
    p?.post_type === 'event' ||
    p?.item_type === 'event' ||
    p?.source === 'event' ||
    p?.meta?.kind === 'event' ||
    String(p?.feed_key || '').startsWith('event:') ||
    (p?.event_id && !p?.post_id && !p?.group_post_id)
  ) {
    const commentsCount = safeNumber(
      p?.comments_count ??
      p?.comment_count ??
      (Array.isArray(p?.comments) ? p.comments.length : 0) ??
      p?.meta?.comments_count ??
      0
    );
    const reactionsCount = safeNumber(
      p?.reactions_count ??
      p?.reactionsCount ??
      p?.likesCount ??
      p?.likes_count ??
      (Array.isArray(p?.reactions) ? p.reactions.length : 0) ??
      p?.meta?.reactions_count ??
      0
    );
    const sharesCount = safeNumber(
      p?.shares_count ??
      p?.shares ??
      p?.share_count ??
      p?.meta?.shares_count ??
      0
    );
    const myReaction = p?.my_reaction ?? p?.myReaction ?? p?.meta?.my_reaction ?? null;

    return {
      ...p,
      id: resolvedId,
      user_id: safeNumber(p?.user_id),
      content: safeString(p?.content),
      type: 'event',
      item_type: 'event',
      source: 'event',
      post_type: 'event',
      kind: 'event',
      event_id: p?.event_id || p?.meta?.event_id || resolvedId,
      media_url: p?.meta?.event?.cover_url || p?.cover_url || mediaUrl,
      media_type: 'image',
      feed_key: p?.feed_key || `event:${resolvedId}`,
      reactions: safeArray(p?.reactions),
      reactions_preview: safeArray(p?.reactions_preview),
      reactions_by_type: safeArray(p?.reactions_by_type),
      comments: safeArray(p?.comments),
      comments_count: commentsCount,
      reactions_count: reactionsCount,
      reactionsCount,
      likesCount: reactionsCount,
      shares: sharesCount,
      shares_count: sharesCount,
      my_reaction: myReaction,
      myReaction,
      views: safeNumber(p?.views),
      reactor_name: p?.reactor_name ?? p?.reactorName ?? p?.meta?.reactor_name ?? '',
      meta: {
        kind: 'event',
        type: 'event',
        event_id: p?.event_id || p?.meta?.event_id || resolvedId,
        comments_count: commentsCount,
        reactions_count: reactionsCount,
        shares_count: sharesCount,
        my_reaction: myReaction,
        event: p?.meta?.event || {
          id: p?.event_id || resolvedId,
          title: p?.meta?.event?.title || p?.title || p?.content,
          description: p?.meta?.event?.description || p?.description,
          date: p?.meta?.event?.date || p?.event_date,
          time: p?.meta?.event?.time,
          location: p?.meta?.event?.location || p?.location,
          cover_url: p?.meta?.event?.cover_url || p?.cover_url || mediaUrl,
          attendees: p?.meta?.event?.attendees || [],
          interested: p?.meta?.event?.interested || [],
        }
      }
    } as any;
  }

    const resolvedBackground =
      (typeof p?.colours === 'string' && p.colours.trim()) ||
      (typeof p?.background === 'string' && p.background.trim()) ||
      (typeof p?.background_style === 'string' && p.background_style.trim()) ||
      (typeof p?.color === 'string' && p.color.trim()) ||
      (typeof p?.meta?.background === 'string' && p.meta.background.trim()) ||
      (typeof p?.meta?.colours === 'string' && p.meta.colours.trim()) ||
      (rawMediaMeta.find((m: any) => m?.type === 'background' || m?.background || m?.colours)?.colours) ||
      (rawMediaMeta.find((m: any) => m?.type === 'background' || m?.background || m?.colours)?.background) ||
      null;

    return {
      ...p,
      id: resolvedId,
      user_id: p?.user_id === null || p?.user_id === undefined ? null : safeNumber(p?.user_id),
      content: safeString(p?.content || p?.text_content || p?.description),
      text_content: p?.text_content || p?.content || '',
      background: resolvedBackground,
      colours: resolvedBackground,
      background_style: resolvedBackground || '',
      author_name: p?.author_name || p?.author_full_name || p?.author?.name || p?.user?.name || '',
      author_username: p?.author_username || p?.author?.username || p?.user?.username || '',
      author_image: p?.author_image || p?.author?.profile_image_url || p?.user?.profile_image_url || '',

      media_url: resolvedBackground && mediaUrls.length === 0 && !videoUrl ? null : mediaUrl,
      video_url: videoUrl || (isVideo ? mediaUrl : null),
    thumbnail_url: p?.thumbnail_url || p?.thumbnail || p?.thumb_url || (rawMediaMeta[0]?.thumb && rawMediaMeta[0]?.thumb !== (videoUrl || mediaUrl) ? rawMediaMeta[0]?.thumb : null) || (mediaUrls.length === 2 && mediaUrls[1] !== (videoUrl || mediaUrl) ? mediaUrls[1] : null) || null,
    thumbnail: p?.thumbnail || p?.thumbnail_url || p?.thumb_url || (rawMediaMeta[0]?.thumb && rawMediaMeta[0]?.thumb !== (videoUrl || mediaUrl) ? rawMediaMeta[0]?.thumb : null) || (mediaUrls.length === 2 && mediaUrls[1] !== (videoUrl || mediaUrl) ? mediaUrls[1] : null) || null,
    media_type: mediaType,

    media_urls: mediaUrls.length ? mediaUrls : (mediaUrl ? [mediaUrl] : []),
    media_types: mediaTypes.length ? mediaTypes : (mediaType ? [mediaType] : []),

    reactions: safeArray(p?.reactions),
    comments: safeArray(p?.comments),
    comments_count: safeNumber(p?.comments_count ?? p?.comment_count ?? (Array.isArray(p?.comments) ? p.comments.length : 0)),
    shares: safeNumber(p?.shares ?? p?.shares_count),
    shares_count: safeNumber(p?.shares_count ?? p?.shares),
    views: safeNumber(p?.views),
    visibility: p?.visibility ?? 'public',
    type:
      p?.type ??
      (() => {
        const t = mediaType || mediaTypes[0] || null;
        if (!t) return 'post';
        if (t.startsWith('image/')) return 'image';
        if (t.startsWith('video/')) return 'video';
        if (t.startsWith('audio/')) return 'audio';
        return 'post';
      })(),
    
    created_at: p?.created_at ?? p?.createdAt ?? new Date().toISOString(),
    
    my_reaction: p?.my_reaction ?? p?.myReaction ?? null,
    myReaction: p?.myReaction ?? p?.my_reaction ?? null,
    reactions_count: safeNumber(p?.reactions_count ?? p?.reactionsCount ?? p?.likesCount ?? p?.likes_count ?? p?.likes ?? 0),
    reactionsCount: safeNumber(p?.reactionsCount ?? p?.reactions_count ?? p?.likesCount ?? p?.likes_count ?? p?.likes ?? 0),
    likesCount: safeNumber(p?.likesCount ?? p?.likes_count ?? p?.reactions_count ?? p?.reactionsCount ?? p?.likes ?? 0),
    likes_count: safeNumber(p?.likes_count ?? p?.likesCount ?? p?.reactions_count ?? p?.reactionsCount ?? p?.likes ?? 0),

    reactor_name: p?.reactor_name ?? p?.reactorName ?? '',
    reactions_preview: safeArray(p?.reactions_preview),
    reactions_by_type: safeArray(p?.reactions_by_type),

    // Event specific metadata preservation
    item_type: p?.item_type ?? p?.source ?? (p?.event_id ? 'event' : 'post'),
    source: p?.source ?? p?.item_type ?? (p?.event_id ? 'event' : 'post'),
    event_id: p?.event_id ?? (p?.item_type === 'event' || p?.source === 'event' ? p?.id : undefined),
    attending_count: safeNumber(p?.attending_count ?? p?.attendees_count),
    interested_count: safeNumber(p?.interested_count),
    my_rsvp_status: p?.my_rsvp_status ?? p?.user_rsvp_status ?? '',

    // Shared post properties (Facebook style post sharing)
    shared_post_id: p?.shared_post_id ?? p?.sharedPostId ?? (p?.shared_post?.id || p?.shared_story?.id || null),
    shared_post: (() => {
      let sp = p?.shared_post ?? p?.sharedPost ?? p?.shared_story;
      if (typeof sp === 'string') {
        try { sp = JSON.parse(sp); } catch { sp = null; }
      }
      return sp ? normalizePost(sp) : null;
    })(),
    shared_story: (() => {
      let st = p?.shared_story ?? p?.sharedStory ?? (p?.shared_post?.item_type === 'story' ? p.shared_post : null);
      if (typeof st === 'string') {
        try { st = JSON.parse(st); } catch { st = null; }
      }
      return st || null;
    })(),
    shared_user: (() => {
      let su = p?.shared_user ?? p?.sharedUser;
      if (typeof su === 'string') {
        try { su = JSON.parse(su); } catch { su = null; }
      }
      return su || null;
    })(),

    // ✅ IMPORTANT: Include feed_key for hybrid identification
    feed_key: p?.feed_key || `${p?.source || p?.item_type || p?.type || 'post'}:${resolvedId}`,

    meta: parseJSON(p?.meta) || null,
  } as any;
};

/** Event normalization helpers */
const toISO = (d: any) => {
  const dt = new Date(d);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
};

const toDateOnly = (d: any) => toISO(d).split('T')[0] || new Date().toISOString().slice(0, 10);

const toTimeHM = (d: any) => {
  const s = String(d ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return '12:00';
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** Normalize event data */
const normalizeEvent = (e: any): Event => {
  const id = safeNumber(e?.id ?? e?.event_id ?? 0);

  const rawEventDate = e?.event_date ?? e?.date ?? e?.eventDate ?? new Date().toISOString();

  const date = toDateOnly(rawEventDate) || new Date().toISOString().slice(0, 10);
  const rawTime = e?.event_time ?? e?.time ?? e?.eventTime ?? '';
  const time = (rawTime ? toTimeHM(rawTime) : toTimeHM(rawEventDate)) || '12:00';

  const attendeesRaw =
    Array.isArray(e?.attendees) ? e.attendees :
    Array.isArray(e?.attendee_ids) ? e.attendee_ids :
    Array.isArray(e?.attendees_ids) ? e.attendees_ids :
    [];

  const interestedRaw =
    Array.isArray(e?.interestedIds) ? e.interestedIds :
    Array.isArray(e?.interested_ids) ? e.interested_ids :
    Array.isArray(e?.interested) ? e.interested :
    [];

  const cover =
    safeString(e?.image ?? e?.cover_url ?? e?.cover_image ?? e?.coverImage ?? e?.cover, '') || DEFAULT_EVENT_COVER;

  return {
    ...e,
    id,

    title: safeString(e?.title, 'Untitled Event'),
    description: safeString(e?.description, ''),
    location: safeString(e?.location, ''),

    date,
    time,

    image: cover,
    cover_url: cover,
    cover_image: cover,

    visibility: safeString(e?.visibility, 'worldwide') as any,

    organizerId: safeNumber(e?.organizerId ?? e?.creator_id ?? e?.user_id ?? 0),
    organizer_name: safeString(e?.organizer_name ?? e?.creator_name ?? ''),
    organizer_avatar: safeString(e?.organizer_avatar ?? e?.creator_avatar ?? ''),

    attendees: safeArray(attendeesRaw).map(Number).filter(Number.isFinite),
    interestedIds: safeArray(interestedRaw).map(Number).filter(Number.isFinite),

    event_date: toISO(rawEventDate),
    event_time: time,

    created_at: safeString(e?.created_at ?? e?.createdAt ?? '', new Date().toISOString()),
    
    group_id: e?.group_id ? safeNumber(e.group_id) : null,
    user_rsvp_status: e?.user_rsvp_status ?? null,
  } as any;
};
/** Normalize story data */
    const normalizeStory = (s: any, existingUser?: User): Story => {
  const resolvedId = safeNumber(s?.id ?? s?.story_id ?? 0);
  const userId = safeNumber(s?.user_id ?? s?.userId ?? 0);

  let storyUser = s?.user;
  if (existingUser) {
    storyUser = storyUser ? mergeUserSafe(existingUser, storyUser) : existingUser;
  }

  const rawMediaUrl = String(s?.media_url ?? s?.mediaUrl ?? '').trim();
  const rawText = String(s?.text_content ?? s?.text ?? '').trim();

  const normalizedType =
    s?.type === 'text' || s?.type === 'video' || s?.type === 'image'
      ? s.type
      : rawMediaUrl.toLowerCase().match(/\.(mp4|webm|mov|m4v)(\?|$)/)
      ? 'video'
      : rawText
      ? 'text'
      : 'image';

  let mediaMeta: any[] = [];
  if (Array.isArray(s?.media_meta)) {
    mediaMeta = s.media_meta.map((m: any) => ({
      thumb: String(m?.thumb || '').trim(),
      feed: String(m?.feed || m?.full || m?.thumb || '').trim(),
      full: String(m?.feed || m?.full || m?.thumb || '').trim(),
      type: m?.type || normalizedType,
    }));
  } else if (typeof s?.media_meta === 'string') {
    try {
      const parsed = JSON.parse(s.media_meta);
      if (Array.isArray(parsed)) {
        mediaMeta = parsed.map((m: any) => ({
          thumb: String(m?.thumb || '').trim(),
          feed: String(m?.feed || m?.full || m?.thumb || '').trim(),
          full: String(m?.feed || m?.full || m?.thumb || '').trim(),
          type: m?.type || normalizedType,
        }));
      }
    } catch {}
  }

  let mediaUrls: string[] = [];
  if (Array.isArray(s?.media_urls)) {
    mediaUrls = s.media_urls.map((x: any) => String(x || '').trim()).filter(Boolean);
  } else if (typeof s?.media_urls === 'string') {
    try {
      const parsed = JSON.parse(s.media_urls);
      if (Array.isArray(parsed)) {
        mediaUrls = parsed.map((x: any) => String(x || '').trim()).filter(Boolean);
    }
    } catch {}
  }

  let mediaTypes: string[] = [];
  if (Array.isArray(s?.media_types)) {
    mediaTypes = s.media_types.map((x: any) => String(x || '').trim()).filter(Boolean);
  } else if (typeof s?.media_types === 'string') {
    try {
      const parsed = JSON.parse(s.media_types);
      if (Array.isArray(parsed)) {
        mediaTypes = parsed.map((x: any) => String(x || '').trim()).filter(Boolean);
      }
    } catch {}
  }

  const finalMediaUrl =
    rawMediaUrl ||
    mediaMeta[0]?.feed ||
    mediaMeta[0]?.full ||
    mediaMeta[0]?.thumb ||
    mediaUrls[0] ||
    '';

  const isValidStoryAuthorName = (v: any) => {
    if (!v || typeof v !== 'string') return false;
    const trimmed = v.trim();
    return trimmed.length > 0 && trimmed.toLowerCase() !== 'user' && trimmed.toLowerCase() !== 'un';
  };

  const authorName =
    (isValidStoryAuthorName(s?.author_full_name) ? s.author_full_name.trim() : null) ||
    (isValidStoryAuthorName(s?.author_name) ? s.author_name.trim() : null) ||
    (isValidStoryAuthorName(storyUser?.name) ? storyUser.name.trim() : null) ||
    (isValidStoryAuthorName(existingUser?.name) ? existingUser.name.trim() : null) ||
    (isValidStoryAuthorName(s?.authorName) ? s.authorName.trim() : null) ||
    storyUser?.username ||
    existingUser?.username ||
    s?.author_username ||
    s?.username ||
    'User';

  const authorUsername =
    s?.author_username ||
    storyUser?.username ||
    existingUser?.username ||
    s?.authorUsername ||
    s?.username ||
    '';

  const authorImage =
    s?.author_image ||
    storyUser?.profile_image_url ||
    storyUser?.avatar_url ||
    existingUser?.profile_image_url ||
    existingUser?.avatar_url ||
    s?.authorImage ||
    '';

  const isVerified = Boolean(
    s?.author_is_verified ||
    s?.author_verified ||
    storyUser?.is_verified ||
    existingUser?.is_verified
  );

  const authorObj = storyUser || {
    id: userId,
    name: authorName,
    username: authorUsername,
    user_name: authorUsername,
    profile_image_url: authorImage,
    avatar_url: authorImage,
    is_verified: isVerified,
    verified: isVerified,
  };

  return {
    id: resolvedId,
    user_id: userId,
    type: normalizedType as 'text' | 'image' | 'video',
    text_content: rawText,
    media_url: finalMediaUrl,
    media_urls: mediaUrls,
    media_types: mediaTypes,
    media_meta: mediaMeta,
    background_style: s?.background_style ?? s?.backgroundStyle ?? '',
    music_url: s?.music_url ?? s?.musicUrl ?? '',
    music_title: s?.music_title ?? s?.musicTitle ?? '',
    created_at: s?.created_at ?? s?.createdAt ?? new Date().toISOString(),
    author_name: authorName,
    author_full_name: authorName,
    author_username: authorUsername,
    author_image: authorImage,
    username: authorUsername,
    liked_by_me: Boolean(s?.liked_by_me ?? s?.likedByMe ?? false),
    user: authorObj,
    author: authorObj,
    views: safeArray(s?.views),
    views_count: safeNumber(s?.views_count ?? s?.viewsCount, 0),
    reactions_count: safeNumber(s?.reactions_count ?? s?.reactionsCount, 0),
    comments_count: safeNumber(s?.comments_count ?? s?.commentsCount ?? s?.discussions_count ?? (Array.isArray(s?.comments) ? s.comments.length : 0), 0),
    shares_count: safeNumber(s?.shares_count ?? s?.sharesCount ?? s?.shares, 0),
    my_reaction: s?.my_reaction ?? s?.myReaction ?? null,
    reaction_breakdown: s?.reaction_breakdown ?? {},
    expires_at: null,
    is_active: true,
  } as any;
};

/**
 * Normalize user data with UNERA-style profile pictures
 */
const normalizeUser = (u: any): User => {
  const resolvedId = safeNumber(u?.id ?? u?.user_id ?? u?.userId);
  
  const incomingName = safeString(u?.name, '');
  const incomingUsername = safeString(u?.username, '');
  
  const hasValidIncomingName = !isBadName(incomingName);
  const hasValidIncomingUsername = !isBadName(incomingUsername);
  
  const userName = hasValidIncomingName ? incomingName : 
                   hasValidIncomingUsername ? incomingUsername : 
                   'User';

  const userUsername = hasValidIncomingUsername ? incomingUsername :
                       hasValidIncomingName ? userName.toLowerCase().replace(/\s+/g, '') :
                       'user';

  const colorIdentifier = resolvedId > 0 ? resolvedId : userName;

  const existingProfileImage = u?.profile_image_url ?? u?.avatar_url ?? u?.profileImage ?? '';
  let profileImageUrl = existingProfileImage;

  const shouldGenerateNewPicture =
    !profileImageUrl ||
    profileImageUrl.trim() === '' ||
    profileImageUrl.includes('ui-avatars.com/api/?name=User') ||
    profileImageUrl.includes('ui-avatars.com/api/?name=UNERA') ||
    profileImageUrl.includes('ui-avatars.com/api/?background=1877F2&color=fff') ||
    (profileImageUrl.includes('ui-avatars.com/api/?name=') && !profileImageUrl.includes('font-size=0.5'));

  if (shouldGenerateNewPicture) {
    profileImageUrl = generateProfilePictureUrl(userName, colorIdentifier);
  }

  const cover = typeof (u?.cover_image_url ?? u?.coverImage) === 'string'
    ? String(u?.cover_image_url ?? u?.coverImage).trim()
    : undefined;

  return {
    ...u,
    id: resolvedId,
    name: userName,
    username: userUsername,
    followers: safeArray<number>(u?.followers),
    following: safeArray<number>(u?.following),
    profile_image_url: profileImageUrl,
    cover_image_url: cover,
    is_verified: Boolean(u?.is_verified ?? u?.isVerified),
    role: u?.role ?? 'user',
    created_at: u?.created_at ?? u?.joined_date ?? u?.joinedDate ?? null,
  } as any;
};

/**
 * Normalize reel data
 */
const normalizeReel = (r: any): Reel => {
  const resolvedId = safeNumber(r?.id ?? r?.reel_id ?? 0);
  const userId = safeNumber(r?.user_id ?? r?.userId ?? 0);
  const soundKey = String(r?.sound_key ?? r?.soundKey ?? '');
  const isTrimmedAudio = soundKey.startsWith('trimmed:');
  const rawAudioStart = safeNumber(r?.audio_start ?? r?.audioStart ?? 0);
  const rawAudioEnd = safeNumber(r?.audio_end ?? r?.audioEnd ?? 0);
  const rawAudioUrl = safeString(r?.audio_url ?? r?.audioUrl ?? '');
  const audioStart = isTrimmedAudio ? 0 : rawAudioStart;
  const audioEnd = isTrimmedAudio ? 0 : rawAudioEnd;

  const videoLow = safeString(r?.video_url_low ?? r?.videoUrlLow ?? '');
  const videoMedium = safeString(r?.video_url_medium ?? r?.videoUrlMedium ?? r?.video_url ?? r?.videoUrl ?? '');
  const videoHd = safeString(r?.video_url_hd ?? r?.videoUrlHd ?? '');
  const videoMain = safeString(r?.video_url ?? r?.videoUrl ?? videoMedium ?? videoLow ?? '');

  const comments = safeArray(r?.comments).map((c: any) => ({
    ...c,
    id: safeNumber(c?.id ?? 0),
    reel_id: safeNumber(c?.reel_id ?? c?.reelId ?? resolvedId),
    user_id: safeNumber(c?.user_id ?? c?.userId ?? 0),
    parent_comment_id:
      c?.parent_comment_id == null && c?.parentId == null && c?.parent_id == null
        ? null
        : safeNumber(c?.parent_comment_id ?? c?.parentId ?? c?.parent_id ?? 0),
    text: String(c?.text ?? ''),
    image_url: c?.image_url ?? c?.imageUrl ?? '',
    created_at: c?.created_at ?? c?.createdAt ?? new Date().toISOString(),
  }));

  return {
    ...r,
    id: resolvedId,
    userId,
    user_id: userId,
    videoUrl: videoMain,
    video_url: videoMain,
    video_url_low: videoLow,
    video_url_medium: videoMedium,
    video_url_hd: videoHd,
    caption: safeString(r?.caption ?? ''),
    songName: safeString(r?.song_name ?? r?.songName ?? 'Original Sound'),
    song_name: safeString(r?.song_name ?? r?.songName ?? 'Original Sound'),
    audioUrl: rawAudioUrl,
    audio_url: rawAudioUrl,
    audioStart,
    audioEnd,
    audio_start: audioStart,
    audio_end: audioEnd,
    visibility: safeString(r?.visibility ?? 'public'),
    location: safeString(r?.location ?? ''),
    views: safeNumber(r?.views ?? r?.views_count ?? 0),
    shares: safeNumber(r?.shares ?? r?.shares_count ?? 0),
    shares_count: safeNumber(r?.shares_count ?? r?.shares ?? 0),
    songId: r?.song_id ?? r?.songId ?? null,
    soundKey,
    sound_key: soundKey,
    reactions: safeArray(r?.reactions),
    reactions_preview: safeArray(r?.reactions_preview),
    comments,
    created_at: r?.created_at ?? r?.createdAt ?? new Date().toISOString(),
    thumbnail_url: safeString(r?.thumbnail_url ?? r?.cover_url ?? ''),
    thumbnail: safeString(r?.thumbnail_url ?? r?.cover_url ?? ''),
    reactions_count: safeNumber(r?.reactions_count ?? r?.reactionsCount ?? r?.likes_count ?? r?.likesCount ?? safeArray(r?.reactions).length),
    reactionsCount: safeNumber(r?.reactions_count ?? r?.reactionsCount ?? r?.likes_count ?? r?.likesCount ?? safeArray(r?.reactions).length),
    likes_count: safeNumber(r?.likes_count ?? r?.likesCount ?? r?.reactions_count ?? safeArray(r?.reactions).length),
    likesCount: safeNumber(r?.likes_count ?? r?.likesCount ?? r?.reactions_count ?? safeArray(r?.reactions).length),
    comments_count: safeNumber(r?.comments_count ?? r?.comment_count ?? comments.length),
    comment_count: safeNumber(r?.comments_count ?? r?.comment_count ?? comments.length),
    my_reaction: r?.my_reaction ?? r?.myReaction ?? null,
    myReaction: r?.my_reaction ?? r?.myReaction ?? null,
    reactor_name: r?.reactor_name ?? r?.reactorName ?? '',
    author: r?.author || r?.author_name || '',
    author_name: r?.author_name || r?.author || '',
    avatar: r?.avatar || r?.avatar_url || r?.author_image || '',
    avatar_url: r?.avatar_url || r?.avatar || '',
    verified: !!(r?.verified || r?.is_verified),
    isTrimmedAudio,
    feed_key: `reel:${resolvedId}`,
    
    // ✅ ADD LYRICS AND DESCRIPTION FIELDS
    lyricsText: r?.lyricsText ?? r?.lyrics_text ?? '',
    lyrics_text: r?.lyrics_text ?? r?.lyricsText ?? '',
    lyricsTheme: r?.lyricsTheme ?? r?.lyrics_theme ?? 'karaoke',
    lyrics_theme: r?.lyrics_theme ?? r?.lyricsTheme ?? 'karaoke',
    lyricsEnabled: !!(r?.lyricsEnabled ?? r?.lyrics_enabled),
    lyrics_enabled: r?.lyrics_enabled ?? (r?.lyricsEnabled ? 1 : 0),
    descriptionHtml: r?.descriptionHtml ?? r?.description_html ?? '',
    description_html: r?.description_html ?? r?.descriptionHtml ?? '',
  } as any;
};


/**
 * Normalize song data
 */
const normalizeSong = (s: any): Song => {
  return {
    ...s,
    id: s?.id ?? s?.song_id ?? 0,
    title: s?.title ?? s?.name ?? 'Unknown',
    artist: s?.artist ?? s?.artist_name ?? '',
    audio_url: s?.audio_url ?? s?.url ?? s?.file_url ?? '',
    audio_fetch_url: s?.audio_fetch_url ?? '',
    cover_url: s?.cover_url ?? s?.cover ?? DEFAULT_MUSIC_COVER,
    duration: s?.duration ?? 0,
    playCount: s?.playCount ?? s?.plays ?? 0,
    artistId: s?.artistId ?? s?.artist_id ?? 0,
    type: s?.type ?? 'music',
  } as any;
};

/**
 * Normalize product data
 */
const normalizeProduct = (p: any) => {
  let imgs: string[] = [];
  try {
    const parsed = typeof p?.images === 'string' ? JSON.parse(p.images) : p.images;
    imgs = Array.isArray(parsed) ? parsed : [];
  } catch {
    imgs = [];
  }

  let imageVariants: any[] = [];
  try {
    const parsed = typeof p?.image_variants === 'string' ? JSON.parse(p.image_variants) : p?.image_variants;
    imageVariants = Array.isArray(parsed) ? parsed.map((v: any) => ({
      thumb: v?.thumb || '',
      feed: v?.feed || v?.full || '',
      full: v?.feed || v?.full || '',
      type: v?.type || 'image',
    })) : [];
  } catch {
    imageVariants = [];
  }

  return {
    ...p,
    id: safeNumber(p?.id),
    seller_id: safeNumber(p?.seller_id),
    seller_name: safeString(p?.seller_name ?? p?.sellerName ?? 'Seller'),
    seller_avatar: safeString(p?.seller_avatar ?? p?.sellerAvatar ?? ''),
    images: imgs.length ? imgs : [],
    image_variants: imageVariants,
    main_price: safeNumber(p?.main_price),
    discount_price: p?.discount_price == null ? null : safeNumber(p?.discount_price),
    quantity: safeNumber(p?.quantity, 1),
    address: safeString(p?.address),
    title: safeString(p?.title),
    description: safeString(p?.description),
    category: safeString(p?.category),
    country: safeString(p?.country),
    phone_number: safeString(p?.phone_number ?? ''),
    created_at: p?.created_at ?? new Date().toISOString(),
  } as any;
};

// ============================================================================
// ✅ NOTIFICATION ENRICHMENT HELPERS
// ============================================================================

const getFirstMediaPreview = (item: any): string => {
  if (!item) return "";
  if (typeof item.image === "string" && item.image) return item.image;
  if (typeof item.image_url === "string" && item.image_url) return item.image_url;
  if (typeof item.thumbnail === "string" && item.thumbnail) return item.thumbnail;
  if (typeof item.thumbnail_url === "string" && item.thumbnail_url) return item.thumbnail_url;
  if (typeof item.cover_url === "string" && item.cover_url) return item.cover_url;
  if (typeof item.poster_url === "string" && item.poster_url) return item.poster_url;
  if (typeof item.preview_image === "string" && item.preview_image) return item.preview_image;
  
  const mediaMeta = (item as any).media_meta;
  if (typeof mediaMeta === "string") {
    try {
      const parsed = JSON.parse(mediaMeta);
      if (Array.isArray(parsed) && parsed[0]) {
        return parsed[0].thumb || parsed[0].feed || parsed[0].full || "";
      }
    } catch {}
  }
  if (Array.isArray(mediaMeta) && mediaMeta[0]) {
    return mediaMeta[0].thumb || mediaMeta[0].feed || mediaMeta[0].full || "";
  }
  return "";
};

const getContentPreviewText = (item: any, kind: string): string => {
  if (!item) return "";
  if (kind === "post" || kind === "group_post") {
    return String(item.content || "").trim();
  }
  if (kind === "reel") {
    return String(item.caption || item.content || "").trim();
  }
  if (kind === "story") {
    return String(item.caption || item.content || "").trim();
  }
  if (kind === "song") {
    return String(item.title || item.description || item.caption || "").trim();
  }
  if (kind === "podcast") {
    return String(item.title || item.description || "").trim();
  }
  if (kind === "event") {
    return String(item.title || item.description || "").trim();
  }
  if (kind === "product") {
    return String(item.name || item.description || "").trim();
  }
  return "";
};

const enrichNotification = (
  n: any,
  ctx: {
    posts: PostType[];
    reels: Reel[];
    stories: Story[];
    songs: Song[];
    podcasts: any[];
    products: Product[];
    events: Event[];
    groupPosts: any[];
  }
): any => {
  const entityType = String(n?.entity_type || "").toLowerCase();
  const entityId = Number(n?.entity_id || 0);
  
  let target_type = entityType;
  let target_id = entityId;
  let preview_text = "";
  let preview_image = "";
  
  if (entityType === "post") {
    const item = ctx.posts.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "post");
    preview_image = getFirstMediaPreview(item);
    target_type = "post";
    target_id = entityId;
  } else if (entityType === "reel") {
    const item = ctx.reels.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "reel");
    preview_image = getFirstMediaPreview(item);
    target_type = "reel";
    target_id = entityId;
  } else if (entityType === "story") {
    const item = ctx.stories.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "story");
    preview_image = getFirstMediaPreview(item);
    target_type = "story";
    target_id = entityId;
  } else if (entityType === "song") {
    const item = ctx.songs.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "song");
    preview_image = getFirstMediaPreview(item);
    target_type = "song";
    target_id = entityId;
  } else if (entityType === "podcast") {
    const item = ctx.podcasts.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "podcast");
    preview_image = getFirstMediaPreview(item);
    target_type = "podcast";
    target_id = entityId;
  } else if (entityType === "product") {
    const item = ctx.products.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "product");
    preview_image = getFirstMediaPreview(item);
    target_type = "product";
    target_id = entityId;
  } else if (entityType === "event") {
    const item = ctx.events.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "event");
    preview_image = getFirstMediaPreview(item);
    target_type = "event";
    target_id = entityId;
  } else if (entityType === "group_post") {
    const item = ctx.groupPosts.find((x) => Number(x.id) === entityId);
    preview_text = getContentPreviewText(item, "group_post");
    preview_image = getFirstMediaPreview(item);
    target_type = "group_post";
    target_id = entityId;
  }
  
  return {
    ...n,
    target_type,
    target_id,
    preview_text,
    preview_image,
  };
};
    
// ==================== GROUP POST IMAGE BUNDLE HELPERS ====================

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, type, quality);
  });

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

const loadVideoElement = (src: string): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.playsInline = true;
    v.muted = true;
    v.src = src;
    const cleanup = () => {
      v.onloadedmetadata = null;
      v.onerror = null;
    };
    v.onloadedmetadata = () => {
      cleanup();
      resolve(v);
    };
    v.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video'));
    };
  });

const calcContainSize = (w: number, h: number, max: number) => {
  if (!w || !h) return { width: max, height: max };
  if (Math.max(w, h) <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
};

const buildGroupImageBundle = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const thumbSize = calcContainSize(img.naturalWidth, img.naturalHeight, 320);
    const feedSize = calcContainSize(img.naturalWidth, img.naturalHeight, 1080);

    const drawToCanvas = (width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');
      ctx.drawImage(img, 0, 0, width, height);
      return canvas;
    };

    const thumbCanvas = drawToCanvas(thumbSize.width, thumbSize.height);
    const feedCanvas = drawToCanvas(feedSize.width, feedSize.height);

    const thumbBlob = await canvasToBlob(thumbCanvas, 'image/webp', 0.72);
    const feedBlob = await canvasToBlob(feedCanvas, 'image/webp', 0.82);

    const ts = Date.now();
    const safeBase = (file.name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const thumbFile = new File([thumbBlob], `${ts}_${safeBase}_thumb.webp`, { type: 'image/webp' });
    const feedFile = new File([feedBlob], `${ts}_${safeBase}_feed.webp`, { type: 'image/webp' });

    return {
      thumb: thumbFile,
      feed: feedFile,
      full: feedFile, // Group only compresses to feed image - both full and feed point to the compressed feed image!
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const buildGroupVideoThumbnail = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideoElement(objectUrl);
    const seekTo = Math.min(
      Math.max((video.duration || 1) * 0.2, 0.1),
      Math.max((video.duration || 1) - 0.1, 0.1)
    );

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.currentTime = seekTo;
      } catch {
        resolve();
      }
    });

    const thumbSize = calcContainSize(video.videoWidth || 320, video.videoHeight || 320, 320);
    const canvas = document.createElement('canvas');
    canvas.width = thumbSize.width;
    canvas.height = thumbSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    ctx.drawImage(video, 0, 0, thumbSize.width, thumbSize.height);

    const thumbBlob = await canvasToBlob(canvas, 'image/webp', 0.72);
    const ts = Date.now();
    return new File([thumbBlob], `${ts}-thumbnail.webp`, { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const uploadGroupImageBundle = async (file: File) => {
  const bundle = await buildGroupImageBundle(file);
  const formData = new FormData();
  formData.append('thumbnail', bundle.thumb);
  formData.append('feed', bundle.feed);
  formData.append('original', bundle.full);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || 'Group image upload failed');
  }

  const thumb = result?.uploaded?.thumbnail?.url || result?.media_urls?.thumb || '';
  const feed = result?.uploaded?.feed?.url || result?.media_urls?.feed || '';

  if (!feed) {
    throw new Error('Group image upload failed: missing feed URL');
  }

  return {
    kind: 'image' as const,
    thumb: thumb || feed,
    feed,
    full: feed,
    type: 'image',
  };
};

const uploadGroupVideoBundle = async (file: File) => {
  const thumbFile = await buildGroupVideoThumbnail(file);
  const formData = new FormData();
  formData.append('thumbnail', thumbFile);
  formData.append('original', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || 'Group video upload failed');
  }

  const thumb = result?.uploaded?.thumbnail?.url || result?.media_urls?.thumb || '';
  const original = result?.uploaded?.original?.url || result?.url || '';

  if (!original) {
    throw new Error('Group video upload failed: missing original video URL');
  }

  return {
    kind: 'video' as const,
    thumb,
    feed: '',
    full: original,
    type: 'video',
  };
};

 // ============================================================================
// ✅ NATIVE VIDEO HELPERS
// ============================================================================

const isUneraNativeApp = (): boolean => {
  if ((window as any).UNERA_IS_NATIVE_APP === true) return true;
  if ((window as any).UneraNative?.postMessage) return true;
  if ((window as any).flutter_inappwebview?.callHandler) return true;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('uneraapp')) return true;
  return false;
};

const openNativeReelGallery = (sound?: any): boolean => {
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ 
        action: 'open_reel_gallery_native',
        sound: sound || null 
      })
    );
    return true;
  }
  
  if ((window as any).flutter_inappwebview?.callHandler) {
    (window as any).flutter_inappwebview.callHandler('openReelGallery', sound);
    return true;
  }
  
  return false;
};

const openNativeVideoPicker = (): boolean => {
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ action: 'pick_video' })
    );
    return true;
  }
  return false;
};

      
// ============================================================================
// 🔧 Normalize groups
// ============================================================================

const normalizeGroup = (g: any): Group => {
  const id = safeNumber(g?.id ?? g?.group_id ?? g?.groupId);
  const name = safeString(g?.name, "Untitled Group");
  const description = safeString(g?.description, "");
  const type = String(g?.type || "public").toLowerCase() === "private" ? "private" : "public";

  const members =
    g?.members === undefined || g?.members === null
      ? undefined
      : safeArray(g.members)
          .map((m: any) => Number(m?.user_id ?? m?.id ?? m))
          .filter(Number.isFinite);

  const rawIsMember = g?.is_member ?? g?.isMember;
  const normalizedIsMember =
    rawIsMember === true ||
    rawIsMember === 1 ||
    rawIsMember === "1" ||
    rawIsMember === "true"
      ? true
      : rawIsMember === false ||
        rawIsMember === 0 ||
        rawIsMember === "0" ||
        rawIsMember === "false"
      ? false
      : undefined;

  return {
    ...g,
    id,
    admin_id: safeNumber(g?.admin_id ?? g?.adminId ?? 0),
    name,
    description,
    type,
    category: (g?.category as any) || "general",
    cover_image: safeString(g?.cover_image ?? g?.coverImage ?? ""),
    profile_image: safeString(g?.profile_image ?? g?.profileImage ?? ""),
    created_at: g?.created_at ?? new Date().toISOString(),
    members,
    posts: safeArray(g?.posts),
    events: safeArray(g?.events),
    member_posting_allowed: Boolean(g?.member_posting_allowed ?? true),
    members_count: safeNumber(g?.members_count ?? members?.length ?? 0),
    is_member: normalizedIsMember,
  } as any;
};
      
  //=======GALLERY CREATOR COMPONENT ======
// Reel Gallery Creator Component - Stable bridge to Flutter
const ReelGalleryCreator: React.FC<{
  sound?: UseSoundPayload;
  onClose: () => void;
  onDone: (payload: {
    file?: File;
    thumbnailFile?: File;
    sound?: UseSoundPayload;
    effectId?: string;
    nativeVideoUrl?: string;
    nativeVideoMeta?: any;
  }) => void;
}> = ({ sound, onClose, onDone }) => {
  const openedRef = useRef(false);
  const closedRef = useRef(false);

  useEffect(() => {
    const finishClose = () => {
      if (closedRef.current) return;
      closedRef.current = true;
      onClose();
    };

    const handleNativeUpload = (event: any) => {
      const media = event.detail;
      if (!media || media.type !== "video") return;

      closedRef.current = true;

      onDone({
        file: undefined,
        thumbnailFile: undefined,
        sound,
        effectId: media.effectId || "none",
        nativeVideoUrl: media.full || media.feed || media.url,
        nativeVideoMeta: {
          thumb: media.thumb || media.thumbnail || "",
          feed: media.feed || media.full || media.url || "",
          full: media.full || media.feed || media.url || "",
          type: "video",
          mimeType: media.mimeType || "video/mp4",
          fileName: media.fileName || `reel-${Date.now()}.mp4`,
        },
      });
    };

    const handleCancel = () => finishClose();
    const handleError = () => finishClose();

    window.addEventListener("uneraNativeUpload", handleNativeUpload);
    window.addEventListener("uneraNativeUploadCancel", handleCancel);
    window.addEventListener("uneraNativeUploadError", handleError);

    const timer = window.setTimeout(() => {
      if (openedRef.current) return;
      openedRef.current = true;

      const native = (window as any).UneraNative;

      if (native?.postMessage) {
        native.postMessage(
          JSON.stringify({
            action: "open_reel_gallery_native",
            sound: sound
              ? {
                  songName: sound.songName,
                  audioUrl: sound.audioUrl,
                  audioStart: sound.audioStart,
                  audioEnd: sound.audioEnd,
                  songId: sound.songId,
                }
              : null,
          })
        );
      } else {
        alert("Native app required for reel creation");
        finishClose();
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("uneraNativeUpload", handleNativeUpload);
      window.removeEventListener("uneraNativeUploadCancel", handleCancel);
      window.removeEventListener("uneraNativeUploadError", handleError);
    };
  }, [sound, onClose, onDone]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-[3px] border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white font-bold">Opening gallery...</p>
      </div>
    </div>
  );
};

      

/** ---------- Marketplace Context ---------- */
export const MarketplaceContext = React.createContext<{
  onViewProduct: (productId: number) => void;
  getProductData: (productId: number) => { 
    price: number; 
    location: string;
    currency?: string;
  } | null;
}>({
  onViewProduct: () => {},
  getProductData: () => null,
});

/** ✅ helper for JSON POST requests */
const postJSON = async (url: string, body: any) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}: ${url}`);
  }
  if (data?.success === false) {
    throw new Error(data?.error || `Request failed: ${url}`);
  }
  return data;
};

/** Optimistic reel reaction helper */
const applyOptimisticReelReaction = (r: any, reelId: number, type: ReactionType, meId: number) => {
  if (Number(r?.id) !== Number(reelId)) return r;

  const reactions = safeArray<any>(r?.reactions);
  const hasLiked = reactions.some((reaction: any) => 
    Number(reaction?.userId ?? reaction?.user_id) === Number(meId) && reaction?.type === type
  );

  let newReactions = [...reactions];
  
  if (hasLiked) {
    newReactions = newReactions.filter((reaction: any) => 
      !(Number(reaction?.userId ?? reaction?.user_id) === Number(meId) && reaction?.type === type)
    );
  } else {
    newReactions.push({ userId: meId, user_id: meId, type });
  }
  return {
    ...r,
    reactions: newReactions,
    likesCount: newReactions.length,
    reactions_count: newReactions.length,
  };
};
 // Add this helper function near your other utility functions (around line 200-300)

// Rotate stories - returns 8-10 different stories, different order on each refresh
const getRotatedStories = (stories: Story[], currentUser: User | null, seed?: number): Story[] => {
  if (!stories || stories.length === 0) return [];
  
  const meId = currentUser?.id || 0;
  const following = new Set(currentUser?.following || []);
  
  // Get unseen stories first
  const unseenStories = stories.filter(s => !s.viewed_by_me);
  const seenStories = stories.filter(s => s.viewed_by_me);
  const myStories = stories.filter(s => s.user_id === meId);
  
  // Score each story for priority
  const scoredStories = stories.map(story => {
    let score = 0;
    const uid = story.user_id;
    const isMine = uid === meId;
    const isFollowing = following.has(uid);
    const isUnseen = !story.viewed_by_me;
    
    if (isUnseen) score += 100;
    if (isFollowing) score += 50;
    if (isMine) score += 30;
    
    // Fresher stories get higher score
    const ageHours = (Date.now() - new Date(story.created_at).getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 48 - ageHours) * 1.5;
    
    return { story, score };
  });
  
  // Sort by score
  scoredStories.sort((a, b) => b.score - a.score);
  
  // Select 8-10 random stories from the top 20
  const topStories = scoredStories.slice(0, 20).map(s => s.story);
  const storyCount = Math.min(topStories.length, Math.floor(Math.random() * 3) + 8); // 8, 9, or 10
  
  // Shuffle the selected stories for random order
  const shuffled = [...topStories];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, storyCount);
};

// Interleave stories and posts - never put stories consecutively
const interleaveItems = (posts: any[], stories: any[]) => {
  if (stories.length === 0) return posts;
  if (posts.length === 0) return stories;
  
  const result: any[] = [];
  const postsCopy = [...posts];
  const storiesCopy = [...stories];
  
  // Calculate spacing - insert story every 3-5 posts
  const storyInterval = Math.max(3, Math.floor(posts.length / (stories.length + 1)));
  
  let storyIndex = 0;
  let postIndex = 0;
  let postsSinceLastStory = 0;
  
  while (postIndex < postsCopy.length || storyIndex < storiesCopy.length) {
    const shouldInsertStory = storyIndex < storiesCopy.length && 
      (postsSinceLastStory >= storyInterval || 
       (postIndex >= postsCopy.length && storyIndex < storiesCopy.length));
    
    if (shouldInsertStory) {
      result.push(storiesCopy[storyIndex]);
      storyIndex++;
      postsSinceLastStory = 0;
    } else if (postIndex < postsCopy.length) {
      result.push(postsCopy[postIndex]);
      postIndex++;
      postsSinceLastStory++;
    } else if (storyIndex < storiesCopy.length) {
      result.push(storiesCopy[storyIndex]);
      storyIndex++;
    } else {
      break;
    }
  }
  
  return result;
}; 

const isHttpUrl2 = (u: string) => u.startsWith('http://') || u.startsWith('https://');
const isBlobUrl = (u: string) => u.startsWith('blob:');
const isHttpsUrl = (u: string) => u.startsWith('https://');
const isAbsoluteUrl = (u: string) => isHttpsUrl(u) || isHttpUrl2(u) || isBlobUrl(u);

const ensureAbsoluteUrl = (u?: string | null): string => {
  if (!u) return '';
  if (isAbsoluteUrl(u)) return u;
  return `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`;
};

const toFetchableAudioUrl = (u?: string | null): string => {
  const url = ensureAbsoluteUrl(u);
  if (!url) return '';

  if (isBlobUrl(url)) return url;

  if (isHttpUrl2(url) && window.location.protocol === 'https:') {
    return url.replace('http://', 'https://');
  }

  const USE_AUDIO_PROXY = true;

  if (USE_AUDIO_PROXY) {
    const isSameOrigin = (() => {
      try {
        return new URL(url).origin === window.location.origin;
      } catch {
        return false;
      }
    })();

    if (!isSameOrigin) {
      try {
        const host = new URL(url).hostname;
        if (host === 'media.unera.social') {
          return `/api/proxy-audio?url=${encodeURIComponent(url)}`;
        }
      } catch {}
    }
  }

  return url;
};

const toBlobUrl = async (remoteUrl: string): Promise<string> => {
  try {
    const fetchableUrl = toFetchableAudioUrl(remoteUrl);
    const res = await fetch(fetchableUrl);
    if (!res.ok) throw new Error(`Audio fetch failed: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Failed to create blob URL:', error);
    throw new Error(`Could not load audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const targetUrl = resolveApiUrl(url);
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  try {
    const rawUser = localStorage.getItem('social_platform_current_user') || localStorage.getItem('unera_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u?.id && !(headers as any)['x-user-id']) {
        (headers as any)['x-user-id'] = String(u.id);
      }
    }
  } catch {}

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData) headers['Content-Type'] = (headers['Content-Type'] as string) || 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, { ...options, headers, signal: controller.signal });

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    try {
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text.startsWith('<') ? `HTTP ${res.status}` : text };
        }
      }
    } catch (e: any) {
      data = { error: e?.message || 'Failed to parse response' };
    }

    if (!res.ok) {
      const msg =
        typeof data?.error === 'string' && !data.error.startsWith('<')
          ? data.error
          : data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchUserFollowData = async (userId: number): Promise<{ followers: number[], following: number[] }> => {
  try {
    const data = await apiFetch(`/api/user-follows/list?userId=${userId}`);
    return {
      followers: safeArray<number>(data?.followers),
      following: safeArray<number>(data?.following)
    };
  } catch (error) {
    console.error('Failed to fetch follow data:', error);
    return { followers: [], following: [] };
  }
};

const uploadToCloudflareR2 = async (file: File, folder = 'posts'): Promise<{ url: string; type: string; filename: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);
    formData.append('type', file.type);
    formData.append('folder', folder);
    formData.append('timestamp', Date.now().toString());

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    if (!result.url) throw new Error('No URL returned from upload');

    return { url: result.url, type: file.type, filename: file.name };
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

const ensureR2Url = async (input: any, folder: string, fallbackName: string) => {
  if (!input) return '';

  if (typeof input === 'string' && isAbsoluteUrl(input)) {
    return input;
  }

  if (typeof input === 'string' && isBlobUrl(input)) {
    try {
      const res = await fetch(input);
      if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
      
      const blob = await res.blob();
      
      const fileType = folder.includes('audio') ? blob.type || 'audio/wav' : 'application/octet-stream';
      const fileName = folder.includes('audio') ? 
        `audio-${Date.now()}.${fileType.split('/')[1] || 'wav'}` : 
        fallbackName;
      
      const file = new File([blob], fileName, { type: fileType });
      const up = await uploadToCloudflareR2(file, folder);
      return up.url;
    } catch (error) {
      console.error('Failed to process blob URL:', error);
      throw new Error('Failed to process audio file');
    }
  }

  if (typeof File !== 'undefined' && input instanceof File) {
    if (folder.includes('audio') && !input.type) {
      const fileType = 'audio/wav';
      const fileName = `audio-${Date.now()}.wav`;
      const newFile = new File([input], fileName, { type: fileType });
      const up = await uploadToCloudflareR2(newFile, folder);
      return up.url;
    }
    const up = await uploadToCloudflareR2(input, folder);
    return up.url;
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const fileType = folder.includes('audio') ? input.type || 'audio/wav' : 'application/octet-stream';
    const fileName = folder.includes('audio') ? 
      `audio-${Date.now()}.${fileType.split('/')[1] || 'wav'}` : 
      fallbackName;
    
    const file = new File([input], fileName, { type: fileType });
    const up = await uploadToCloudflareR2(file, folder);
    return up.url;
  }

  return '';
};

type ReelSound = {
  songName: string;
  audioUrl: string;
  audioStart?: number;
  audioEnd?: number;
  songId?: string | number;
  soundKey?: string;
  isTrimmedAudio?: boolean;
  originalUrl?: string;
};
  type UseSoundPayload = {
  songName?: string;
  audioUrl?: string;
  originalUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  songId?: string | number;
  soundKey?: string;
  isTrimmedAudio?: boolean;
};

export type View =
  | 'home'
  | 'reels'
  | 'marketplace'
  | 'saved-posts'
  | 'saved'
  | 'groups'
  | 'brands'
  | 'music'
  | 'tools'
  | 'profiles'
  | 'events'
  | 'birthdays'
  | 'memories'
  | 'settings'
  | 'privacy'
  | 'terms'
  | 'help'
  | 'profile'
  | 'login'
  | 'register'
  | 'recorder'
  | 'notifications'
  | 'messages'
  | 'story-feed'
  | 'ads'
  | 'post'
  | 'reel'
  | 'group'
  | 'event'
  | 'music-item'
  | 'product'
  | 'group-post';

const normalizeFeedRowToPost = (row: any): PostType => {
  return normalizePost({
    ...row,
    user_id: safeNumber(row?.user_id),
    content: row?.content ?? '',
    created_at: row?.created_at,
    media_url: row?.media_url ?? null,
    media_type: row?.media_type ?? null,
    shares: row?.shares ?? 0,
    views: row?.views ?? 0,
    pool: row?.pool,
    follower_count: row?.follower_count,
  });
};

const authorFromFeedRow = (row: any): User => {
  const username = row?.username ?? 'user';
  const rawName = row?.name || row?.author?.name || row?.author_name || row?.author_full_name;
  const name = (typeof rawName === 'string' && rawName.trim().length > 0 && rawName.trim().toLowerCase() !== 'user' && rawName.trim().toLowerCase() !== 'un')
    ? rawName.trim()
    : (username !== 'user' ? username : 'User');

  return normalizeUser({
    id: row?.user_id,
    username,
    name,
    profile_image_url: row?.profile_image_url ?? '',
    is_verified: row?.is_verified ?? 0,
    role: row?.role ?? 'user',
    followers: [],
    following: [],
    created_at: row?.joined_date ?? row?.created_at ?? null,
  });
};

const mergeFeed = (prev: PostType[], incoming: PostType[]): PostType[] => {
  const getItemKey = (p: any): string => {
    return getFeedKey(p) || (p?.id ? `${getFeedItemType(p)}:${p.id}` : `${p?.source || p?.item_type || 'post'}:${p.id}`);
  };

  const map = new Map<string, PostType>();
  prev.forEach((p: any) => {
    const key = getItemKey(p);
    map.set(key, p);
  });

  incoming.forEach((p: any) => {
    const key = getItemKey(p);
    const existing = map.get(key);
    if (existing) {
      const maxShares = Math.max(
        safeNumber((existing as any).shares, 0),
        safeNumber((existing as any).shares_count, 0),
        safeNumber((p as any).shares, 0),
        safeNumber((p as any).shares_count, 0)
      );
      map.set(key, {
        ...existing,
        ...p,
        reactions: (p as any).reactions?.length ? (p as any).reactions : (existing as any).reactions,
        reactions_count: (p as any).reactions_count !== undefined ? (p as any).reactions_count : (existing as any).reactions_count,
        my_reaction: (p as any).my_reaction !== undefined && (p as any).my_reaction !== null ? (p as any).my_reaction : (existing as any).my_reaction,
        myReaction: (p as any).myReaction !== undefined && (p as any).myReaction !== null ? (p as any).myReaction : (existing as any).myReaction,
        shares: maxShares,
        shares_count: maxShares,
        comments_count: Math.max(safeNumber((existing as any).comments_count, 0), safeNumber((p as any).comments_count, 0)),
      } as any);
    } else {
      map.set(key, p);
    }
  });

  const prevKeys = new Set(prev.map((p: any) => getItemKey(p)));
  const newOnes = incoming.filter((p: any) => !prevKeys.has(getItemKey(p)));

  const combined = [
    ...newOnes,
    ...prev.map((p: any) => map.get(getItemKey(p))!).filter(Boolean),
  ];

  const seenKeys = new Set<string>();
  const deduped: PostType[] = [];
  for (const item of combined) {
    const k = getItemKey(item);
    if (k && !seenKeys.has(k)) {
      seenKeys.add(k);
      deduped.push(item);
    }
  }

  return deduped;
};

const createFallbackUser = (): User => {
  const fallbackName = 'User';
  const fallbackId = 0;
  return {
    id: fallbackId,
    username: 'user',
    name: fallbackName,
    email: '',
    profile_image_url: generateProfilePictureUrl(fallbackName, fallbackId),
    cover_image_url: '',
    followers: [],
    following: [],
    is_verified: false,
    role: 'user',
    is_online: false,
    location: '',
    bio: '',
    created_at: null,
  };
};

const authHeaders = () => {
  const token = localStorage.getItem('unera_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

async function apiPost(endpoint: string, body?: any) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : '{}',
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || data?.message || `API ${res.status}`);
  return data?.data ?? data;
}

async function recordPlay(track: AudioTrack, userId: any) {
  const id = String(track.id);

  if (track.type === 'music') {
    try {
      return await apiPost(`/api/songs/${encodeURIComponent(id)}/play`, { user_id: userId ?? null });
    } catch {
      return await apiPost(`/api/song-plays`, { song_id: id, user_id: userId ?? null });
    }
  }

  if (track.type === 'podcast') {
    try {
      return await apiPost(`/api/podcasts/${encodeURIComponent(id)}/play`, { user_id: userId ?? null });
    } catch {
      return await apiPost(`/api/podcast-episode-plays`, { episode_id: id, user_id: userId ?? null });
    }
  }

  return null;
}

// ============================================================================
// ✅ REEL FEED INTEGRATION
// ============================================================================

const shuffleArray = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Add this interface BEFORE the App function
interface AppProps {
  initialView?: View;
}

// Change the App function signature
export default function App({ initialView = 'home' }: AppProps) {
  // Add these hooks right after useLanguage() or at the beginning
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  
  useLanguage();


  /** ---------- State ---------- */
const [users, setUsers] = useState<User[]>([]);
const [posts, setPosts] = useState<PostType[]>([]);
const [pushedPosts, setPushedPosts] = useState<Record<number, boolean>>({});
const [profilePosts, setProfilePosts] = useState<PostType[]>([]);
const [stories, setStories] = useState<Story[]>([]);
const [reels, setReels] = useState<Reel[]>([]);
const [products, setProducts] = useState<Product[]>([]);
const [groups, setGroups] = useState<Group[]>([]);
const [brands, setBrands] = useState<Brand[]>([]);
const [events, setEvents] = useState<Event[]>([]);
const [chats, setChats] = useState<any[]>([]);
const [storyCreateLoading, setStoryCreateLoading] = useState(false);
const [nativeReelVideoUrl, setNativeReelVideoUrl] = useState<string>('');
const [nativeReelMediaMeta, setNativeReelMediaMeta] = useState<any | null>(null);

  // REEL PUBLISHING STATES 
const [reelPublishing, setReelPublishing] = useState(false);
const [reelPublishingProgress, setReelPublishingProgress] = useState(0);
const [reelPublishingText, setReelPublishingText] = useState('');

  // Reel gallery creator states
const [showReelGallery, setShowReelGallery] = useState(false);
const [selectedReelSoundForGallery, setSelectedReelSoundForGallery] = useState<UseSoundPayload | undefined>(undefined);
const [pendingReelThumbnailFile, setPendingReelThumbnailFile] = useState<File | null>(null);
const [pendingReelEffectId, setPendingReelEffectId] = useState('none');

// Story comments states
const [activeStoryCommentId, setActiveStoryCommentId] = useState<number | null>(null);
const [showStoryComments, setShowStoryComments] = useState(false);

  const [songs, setSongs] = useState<Song[]>([]);
  
  const [selectedReelSound, setSelectedReelSound] = useState<ReelSound | null>(null);

  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);


  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'reels' | 'marketplace' | 'groups'>('home');
  const [view, setView] = useState<View>('home');
  const [selectedReelId, setSelectedReelId] = useState<number | string | null>(null);
  const [badgeCounts, setBadgeCounts] = useState({
  home: 0,
  music: 0,
  messages: 0,
  reels: 0,
  notifications: 0,
  marketplace: 0,
});

  // Navigation history state
  const [navigationHistory, setNavigationHistory] = useState<View[]>(['home']);

  const [activeChatUser, setActiveChatUser] = useState<User | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatsListOpen, setIsChatsListOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [pendingReelFile, setPendingReelFile] = useState<File | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reelVideoInputRef = useRef<HTMLInputElement>(null);

  // ===== NOTIFICATION & AD STATES =====
  const [notifications, setNotifications] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [showAdAnalytics, setShowAdAnalytics] = useState(false);
  const [adAnalyticsId, setAdAnalyticsId] = useState<number | null>(null);

  // AD DASHBOARD STATE
  const [adCampaigns, setAdCampaigns] = useState<any[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [activeAdTab, setActiveAdTab] = useState<'analytics' | 'create' | 'ads'>('analytics');
  
  const [selectedPostForAd, setSelectedPostForAd] = useState<PostType | null>(null);

  // ============================================================================
  // ✅ REACTION LOCK STATE
  // ============================================================================
  const [reactingMap, setReactingMap] = useState<Record<string, boolean>>({});
  const setReacting = useCallback((identity: string, value: boolean) => {
    setReactingMap(prev => ({ ...prev, [identity]: value }));
  }, []);

  // ============================================================================
  // ✅ COMMENTS IDENTITY STATE
  // ============================================================================

type ActiveCommentsIdentity = {
  type: 'feed_post' | 'group_post' | 'marketplace_post' | 'event_post' | 'reel_post' | 'music_post';
  id: string | number;
};


const [activeCommentsIdentity, setActiveCommentsIdentity] = useState<ActiveCommentsIdentity | null>(null);
const [commentPostSnapshot, setCommentPostSnapshot] = useState<PostType | null>(null);
                   
  
  // ============================================================================
  // ✅ People You May Know - State declarations
  // ============================================================================
  const [peopleYouMayKnow, setPeopleYouMayKnow] = useState<PeopleSuggestion[]>([]);
  const [pymkLoading, setPymkLoading] = useState(false);
  const [pymkHydrated, setPymkHydrated] = useState(false);

  const [pymkHiddenIds, setPymkHiddenIds] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(PYMK_HIDDEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  });

  // ============================================================================
  // ✅ Groups You May Join - State declarations
  // ============================================================================
  const [groupsYouMayJoin, setGroupsYouMayJoin] = useState<GroupSuggestion[]>([]);
  const [gymjLoading, setGymjLoading] = useState(false);
  const [gymjHydrated, setGymjHydrated] = useState(false);

  const [gymjHiddenIds, setGymjHiddenIds] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(GROUPS_YOU_MAY_JOIN_HIDDEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  });

  const [feedHydrated, setFeedHydrated] = useState(false);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  
  const [authHydrated, setAuthHydrated] = useState(false);

  const lastGoodPostsRef = useRef<PostType[]>([]);
  const stableFeedRef = useRef<PostType[]>([]);
  const scheduleSilentRefreshRef = useRef<any>(null);
  const triggerSilentRefreshRef = useRef<() => void>(() => {});

  const [loginError, setLoginError] = useState('');

  const unreadNotifications = notifications.filter(n => !n.is_read).length;
   useEffect(() => {
  const unreadMessages = chats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0);
  const newReels = reels.filter(r => {
    const hoursOld = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
    return hoursOld < 24;
  }).length;
  const newMusic = songs.filter(s => {
    const hoursOld = (Date.now() - new Date(s.created_at || s.release_date || 0).getTime()) / (1000 * 60 * 60);
    return hoursOld < 24;
  }).length;
  const marketplaceActivity = products.filter(p => p.has_new_activity).length;
  const newHomePosts = posts.filter(p => {
    const hoursOld = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60);
    return hoursOld < 24;
  }).length;

  setBadgeCounts({
    home: newHomePosts,
    music: newMusic,
    messages: unreadMessages,
    reels: newReels,
    notifications: unreadNotifications,
    marketplace: marketplaceActivity,
  });
}, [chats, reels, songs, products, posts, unreadNotifications]);

    //=====NOTIFICATION DECLARATIONS ===
const enrichedNotifications = useMemo(() => {
  return (Array.isArray(notifications) ? notifications : []).map((n) =>
    enrichNotification(n, {
      posts: Array.isArray(posts) ? posts : [],
      reels: Array.isArray(reels) ? reels : [],
      stories: Array.isArray(stories) ? stories : [],
      songs: Array.isArray(songs) ? songs : [],
      podcasts: [],
      products: Array.isArray(products) ? products : [],
      events: Array.isArray(events) ? events : [],
      groupPosts: [],
    })
  );
}, [notifications, posts, reels, stories, songs, products, events]);
  // ============================================================================
  // ✅ MUSIC REACTION/COMMENT/SHARE STATE (NEW)
  // ============================================================================
  const [trackReactions, setTrackReactions] = useState<Record<string, { count: number; myReaction?: ReactionType }>>({});
  const [trackComments, setTrackComments] = useState<Record<string, number>>({});
  const [trackShares, setTrackShares] = useState<Record<string, number>>({});
  const [showMusicComments, setShowMusicComments] = useState(false);
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<AudioTrack | null>(null);

  const requireAuth = useCallback(
    (actionName = 'This action') => {
      if (currentUser) return true;
      setLoginError(`${actionName} requires login.`);
      setView('login');
      return false;
    },
    [currentUser]
  );

      //==== REF====
  const usersRef = useRef<User[]>([]);
  const storiesInFlightRef = useRef(false);
  const reelsInFlightRef = useRef(false);
  const postsInFlightRef = useRef(false);
  const usersInFlightRef = useRef(false);
  const otherDataInFlightRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
const [recordingTime, setRecordingTime] = useState(0);
const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
const [isRecording, setIsRecording] = useState(false);
const [recorderActiveTab, setRecorderActiveTab] = useState<'record' | 'preview'>('record'); 
  
  const reelsRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  const [seenStoryIds, setSeenStoryIds] = useState<Set<number>>(() => new Set(readStorySeen()));
  const [storyMuted, setStoryMuted] = useState(true);

  const markStorySeen = useCallback((storyId: number) => {
    const id = Number(storyId);
    if (!id) return;

    setSeenStoryIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeStorySeen(Array.from(next) as number[]);
      return next;
    });
  }, []);

  const orderedStories = useMemo(() => {
    const list = safeArray(stories);

    const scoreStory = (s: any) => {
      const isMine = currentUser && Number(s.user_id) === Number(currentUser.id);
      const unseen = !seenStoryIds.has(Number(s.id));
      
      const mineBoost = isMine ? 100 : 0;
      const unseenBoost = unseen ? 50 : 0;
      
      const t = new Date(s.created_at || 0).getTime() || 0;
      const recencyFactor = t / 1e13;
      
      const isFollowing = currentUser && safeArray<number>(currentUser.following).includes(Number(s.user_id));
      const followBoost = isFollowing ? 30 : 0;
      
      return mineBoost + unseenBoost + followBoost + recencyFactor;
    };

    return [...list].sort((a, b) => scoreStory(b) - scoreStory(a));
  }, [stories, seenStoryIds, currentUser]);

  const preloadStoryMedia = useCallback((s: Story) => {
    const url = String(s?.media_url || '');
    if (!url) return;

    if (s.type === 'image') {
      const img = new Image();
      img.src = url;
      return;
    }

    if (s.type === 'video') {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = url;
      return;
    }
  }, []);

  const activeStory = useMemo(() => {
    if (!activeStoryId) return null;
    return orderedStories.find(s => Number(s.id) === Number(activeStoryId)) || null;
  }, [activeStoryId, orderedStories]);

  const closeStoryViewer = useCallback(() => {
    setActiveStoryId(null);
  }, []);

  const getNextStory = useCallback((current: Story | null) => {
    if (!current) return null;
    const list = orderedStories;
    const idx = list.findIndex(s => Number(s.id) === Number(current.id));
    if (idx < 0) return null;
    return list[idx + 1] || null;
  }, [orderedStories]);

  const goNextStory = useCallback(() => {
    setActiveStoryId(prevId => {
      if (!prevId) return null;
      const currentStory = orderedStories.find(s => Number(s.id) === Number(prevId));
      if (!currentStory) return null;
      
      const next = getNextStory(currentStory);
      if (next) {
        markStorySeen(Number(next.id));
        return Number(next.id);
      }
      return null;
    });
  }, [getNextStory, markStorySeen, orderedStories]);

  const goPrevStory = useCallback(() => {
    setActiveStoryId(prevId => {
      if (!prevId) return null;
      const list = orderedStories;
      const idx = list.findIndex(s => Number(s.id) === Number(prevId));
      if (idx <= 0) return null;
      
      const prev = list[idx - 1];
      if (prev) {
        markStorySeen(Number(prev.id));
        return Number(prev.id);
      }
      return null;
    });
  }, [orderedStories, markStorySeen]);

  const handleStoryNext = useCallback(() => {
    if (!activeStoryId) return;
    
    const list = orderedStories;
    const idx = list.findIndex(s => Number(s.id) === Number(activeStoryId));
    
    if (idx >= list.length - 1) {
      closeStoryViewer();
      return;
    }
    
    const next = list[idx + 1];
    if (next) {
      setActiveStoryId(next.id);
      markStorySeen(next.id);
      preloadStoryMedia(next);
    }
  }, [activeStoryId, orderedStories, closeStoryViewer, markStorySeen, preloadStoryMedia]);

const [deleteStoryLoading, setDeleteStoryLoading] = useState(false);

const deleteStory = useCallback(async (storyId: number) => {
  if (!requireAuth('Deleting stories')) return;
  if (!currentUser) return;

  setDeleteStoryLoading(true);
  try {
    await apiFetch(`/api/stories/${storyId}`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: currentUser.id }),
    });

    setStories(prev => prev.filter(story => Number(story.id) !== Number(storyId)));

    setActiveStoryId(prev => (Number(prev) === Number(storyId) ? null : prev));

    try {
      const cached = readStoriesCache();
      const nextCached = safeArray(cached?.stories).filter((s: any) => Number(s?.id) !== Number(storyId));
      writeStoriesCache(nextCached);
    } catch {}

    const toast = document.createElement('div');
    toast.className =
      'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
    toast.innerText = 'Story deleted!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  } catch (error) {
    console.error('Failed to delete story:', error);
    setLoginError('Failed to delete story');
  } finally {
    setDeleteStoryLoading(false);
  }
}, [currentUser, requireAuth]);

// ============================================================================
// ✅ STORY UPLOAD HELPERS
// ============================================================================

const STORY_VIDEO_MAX_SECONDS = 90;

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const loadVideoElement = (src: string) => new Promise<HTMLVideoElement>((resolve, reject) => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.playsInline = true;
  v.muted = true;
  v.src = src;
  const cleanup = () => {
    v.onloadedmetadata = null;
    v.onerror = null;
  };
  v.onloadedmetadata = () => {
    cleanup();
    resolve(v);
  };
  v.onerror = () => {
    cleanup();
    reject(new Error('Failed to load video'));
  };
});

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => 
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, type, quality);
  });

const makeStoryImageVariants = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    
    const calcSize = (w: number, h: number, max: number) => {
      if (Math.max(w, h) <= max) return { width: w, height: h };
      const scale = max / Math.max(w, h);
      return {
        width: Math.round(w * scale),
        height: Math.round(h * scale),
      };
    };
    
    const feedSize = calcSize(img.naturalWidth, img.naturalHeight, 1080);
    const thumbSize = calcSize(img.naturalWidth, img.naturalHeight, 320);
    
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = img.naturalWidth;
    fullCanvas.height = img.naturalHeight;
    fullCanvas.getContext('2d')!.drawImage(img, 0, 0);
    
    const feedCanvas = document.createElement('canvas');
    feedCanvas.width = feedSize.width;
    feedCanvas.height = feedSize.height;
    feedCanvas.getContext('2d')!.drawImage(img, 0, 0, feedSize.width, feedSize.height);
    
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbSize.width;
    thumbCanvas.height = thumbSize.height;
    thumbCanvas.getContext('2d')!.drawImage(img, 0, 0, thumbSize.width, thumbSize.height);
    
    const fullFile = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp' 
      ? file 
      : new File([await canvasToBlob(fullCanvas, 'image/jpeg', 0.92)], `${Date.now()}-original.jpg`, { type: 'image/jpeg' });
    
    const feedBlob = await canvasToBlob(feedCanvas, 'image/webp', 0.82);
    const thumbBlob = await canvasToBlob(thumbCanvas, 'image/webp', 0.72);
    
    const feedFile = new File([feedBlob], `${Date.now()}-feed.webp`, { type: 'image/webp' });
    const thumbFile = new File([thumbBlob], `${Date.now()}-thumbnail.webp`, { type: 'image/webp' });
    
    return { fullFile, feedFile, thumbFile };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const makeStoryVideoThumbnail = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideoElement(objectUrl);
    
    if (Number.isFinite(video.duration) && video.duration > STORY_VIDEO_MAX_SECONDS) {
      throw new Error('Story video must be 1 minute 30 seconds or less');
    }
    
    const seekTo = Math.min(Math.max(video.duration * 0.2, 0.1), Math.max(video.duration - 0.1, 0.1));
    
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('error', onError);
        reject(new Error('Could not generate video thumbnail'));
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      try {
        video.currentTime = seekTo;
      } catch {
        resolve();
      }
    });
    
    const max = 320;
    const scale = max / Math.max(video.videoWidth || max, video.videoHeight || max);
    const width = Math.max(1, Math.round((video.videoWidth || max) * Math.min(scale, 1)));
    const height = Math.max(1, Math.round((video.videoHeight || max) * Math.min(scale, 1)));
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(video, 0, 0, width, height);
    
    const thumbBlob = await canvasToBlob(canvas, 'image/webp', 0.72);
    return new File([thumbBlob], `${Date.now()}-thumbnail.webp`, { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const uploadStoryImageBundle = async (file: File) => {
  const { fullFile, feedFile, thumbFile } = await makeStoryImageVariants(file);
  const fd = new FormData();
  fd.append('original', fullFile);
  fd.append('feed', feedFile);
  fd.append('thumbnail', thumbFile);
  
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => null);
  
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to upload story image');
  }
  
  return {
    media_url: data?.uploaded?.feed?.url || data?.uploaded?.original?.url || null,
    media_urls: [data?.uploaded?.feed?.url || data?.uploaded?.original?.url].filter(Boolean),
    media_types: ['image'],
    media_meta: [{
      thumb: data?.uploaded?.thumbnail?.url || null,
      feed: data?.uploaded?.feed?.url || data?.uploaded?.original?.url || null,
      full: data?.uploaded?.original?.url || null,
      type: 'image',
    }],
  };
};

const uploadStoryVideoBundle = async (file: File) => {
  const thumbFile = await makeStoryVideoThumbnail(file);
  const fd = new FormData();
  fd.append('original', file);
  fd.append('thumbnail', thumbFile);
  
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => null);
  
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to upload story video');
  }
  
  return {
    media_url: data?.uploaded?.original?.url || null,
    media_urls: [data?.uploaded?.original?.url].filter(Boolean),
    media_types: ['video'],
    media_meta: [{
      thumb: data?.uploaded?.thumbnail?.url || null,
      feed: null,
      full: data?.uploaded?.original?.url || null,
      type: 'video',
    }],
  };
};

// ==================== STORY REACTIONS, SHARE & COMMENT HANDLERS ====================

const fetchStoryReactions = useCallback(async (storyId: number) => {
  try {
    const viewerParam = currentUser?.id ? `?viewerId=${currentUser.id}` : '';
    const data = await apiFetch(`/api/stories/${storyId}/reactions${viewerParam}`, {
      headers: currentUser?.id ? { 'x-user-id': String(currentUser.id) } : undefined,
    });
    const reactions = Array.isArray(data?.reactions) ? data.reactions : (Array.isArray(data) ? data : []);
    const counts = data?.counts || {};
    
    const totalCount = Object.values(counts).reduce((a: number, b: number) => a + b, 0) || reactions.length;
    
    return {
      reactions,
      counts: {
        ...counts,
        total: totalCount
      }
    };
  } catch (error) {
    console.error('Failed to fetch story reactions:', error);
    return { reactions: [], counts: {} };
  }
}, [currentUser]);

const handleStoryShare = useCallback((storyOrId: any) => {
  if (!requireAuth('Sharing stories')) return;
  if (!currentUser) return;

  const storyObj =
    typeof storyOrId === 'object' && storyOrId !== null
      ? storyOrId
      : stories.find((s) => Number(s.id) === Number(storyOrId)) || { id: storyOrId };

  const storyId = Number(storyObj.id || storyOrId);
  const normalizedStoryPost = {
    ...storyObj,
    id: storyId,
    story_id: storyId,
    item_type: 'story',
    type: 'story',
    post_type: 'story',
    shares: safeNumber(storyObj.shares ?? storyObj.shares_count, 0),
    shares_count: safeNumber(storyObj.shares_count ?? storyObj.shares, 0),
    author: storyObj.author_name || storyObj.user?.name || 'Creator',
    user: storyObj.user || {
      id: Number(storyObj.user_id || 0),
      name: storyObj.author_name || 'Creator',
      username: storyObj.author_username || 'creator',
      profile_image_url: storyObj.author_image,
    },
  };

  setActiveSharePost(normalizedStoryPost);
  setShowShareSheet(true);
}, [currentUser, requireAuth, stories]);

// Updated: Opens the story comments modal
const handleStoryComment = useCallback((storyId: number) => {
  if (!requireAuth('Commenting on stories')) return;
  if (!currentUser) return;
  
  setActiveStoryCommentId(storyId);
  setShowStoryComments(true);
}, [currentUser, requireAuth]);

// ✅ END OF STORY HANDLERS ✅

  // ============================================================================
// ==================== ✅ HELPERS FOR MIXED FEED ✅ ===========================
// ============================================================================

const seededRand01Feed = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
};

const safeNum = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getRotatedReels = (input: any[], currentUser: any, seed: number) => {
  const arr = Array.isArray(input) ? input.slice() : [];
  if (!arr.length) return [];

  const meId = safeNum(currentUser?.id, 0);
  const following = new Set(
    (Array.isArray(currentUser?.following) ? currentUser.following : []).map((x: any) => safeNum(x))
  );

  const scored = arr.map((reel, index) => {
    const authorId = safeNum(reel?.user_id ?? reel?.user?.id, 0);
    const isMine = !!meId && authorId === meId;
    const isFollowing = !!authorId && following.has(authorId);

    let score = 0;

    // don't force my reels at top
    if (isMine) score -= 40;

    // followed creators get gentle boost
    if (isFollowing) score += 15;

    // keep fresh-ish order but allow rotation
    score += Math.max(0, 12 - index);

    // refresh rotation
    score += seededRand01Feed(seed + safeNum(reel?.id, index) * 181) * 10;

    return { reel, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const out: any[] = [];
  const usedAuthors = new Set<number>();

  for (const item of scored) {
    const authorId = safeNum(item.reel?.user_id ?? item.reel?.user?.id, 0);
    if (authorId && usedAuthors.has(authorId)) continue;
    out.push(item.reel);
    if (authorId) usedAuthors.add(authorId);
    if (out.length >= 8) break;
  }

  for (const item of scored) {
    if (out.length >= 10) break;
    if (!out.some((x) => safeNum(x?.id) === safeNum(item.reel?.id))) {
      out.push(item.reel);
    }
  }

  return out;
};

const interleaveFeedItems = (
  postItems: Array<{ kind: 'post'; data: any; created_at: string }>,
  storyItems: Array<{ kind: 'story'; data: any; created_at: string }>,
  reelItems: Array<{ kind: 'reel'; data: any; created_at: string }>
) => {
  // IMPORTANT: keep posts exactly as feeds.ts gave them
  const feed = [...postItems];
  const stories = [...storyItems];
  const reels = [...reelItems];

  const out: Array<{ kind: 'post' | 'story' | 'reel'; data: any; created_at: string }> = [];

  let postIndex = 0;
  let storyIndex = 0;
  let reelIndex = 0;

  // spaced slots so stories/reels don't congest top
  let nextStorySlot = 2; // first story after ~2 feed items
  let nextReelSlot = 5;  // first reel after ~5 feed items

  while (postIndex < feed.length || storyIndex < stories.length || reelIndex < reels.length) {
    const len = out.length;
    const lastKind = len ? out[len - 1].kind : '';

    const canPlaceStory =
      storyIndex < stories.length &&
      len >= nextStorySlot &&
      lastKind !== 'story';

    const canPlaceReel =
      reelIndex < reels.length &&
      len >= nextReelSlot &&
      lastKind !== 'reel';

    // prefer story first, then reel, but never bunch them too tightly
    if (canPlaceStory && lastKind !== 'reel') {
      out.push(stories[storyIndex++]);
      nextStorySlot += 7;
      continue;
    }

    if (canPlaceReel && lastKind !== 'story') {
      out.push(reels[reelIndex++]);
      nextReelSlot += 8;
      continue;
    }

    if (postIndex < feed.length) {
      out.push(feed[postIndex++]);
      continue;
    }

    if (storyIndex < stories.length && lastKind !== 'story') {
      out.push(stories[storyIndex++]);
      continue;
    }

    if (reelIndex < reels.length && lastKind !== 'reel') {
      out.push(reels[reelIndex++]);
      continue;
    }

    if (storyIndex < stories.length) {
      out.push(stories[storyIndex++]);
      continue;
    }

    if (reelIndex < reels.length) {
      out.push(reels[reelIndex++]);
      continue;
    }

    break;
  }

  return out;
};

// ============================================================================
// ==================== ✅ MIXED FEED ITEMS (TIKTOK-STYLE ROTATION & SPACING) ✅
// ============================================================================

// changes only on full manual page/app refresh
const feedRefreshSeedRef = useRef<number>(Date.now());

// Visit sequence tracks session and return visits to rotate video feed smoothly
const [feedVisitSeq, setFeedVisitSeq] = useState<number>(() => getVisitSequence());

// Increment visit sequence when user returns to feed or tab becomes visible
useEffect(() => {
  const onFocusOrVisible = () => {
    if (document.visibilityState === 'visible') {
      setFeedVisitSeq(prev => prev + 1);
    }
  };
  window.addEventListener('visibilitychange', onFocusOrVisible);
  return () => window.removeEventListener('visibilitychange', onFocusOrVisible);
}, []);

// Freeze stories for current page session
const frozenStoriesRef = useRef<any[] | null>(null);

useEffect(() => {
  if (
    frozenStoriesRef.current === null &&
    Array.isArray(orderedStories) &&
    orderedStories.length > 0
  ) {
    frozenStoriesRef.current = getRotatedStories(
      orderedStories,
      currentUser,
      feedRefreshSeedRef.current
    );
  }
}, [orderedStories, currentUser]);

// Rotated & ranked reels using TikTok-style algorithm:
// - Views, reactions, comments weighted
// - Exploration push for less popular videos
// - Rotates on every visit so user doesn't see the same videos repeatedly
const rotatedReels = useMemo(() => {
  if (!Array.isArray(reels) || reels.length === 0) return [];
  return rankAndRotateVideos(reels, {
    currentUserId: currentUser?.id,
    visitSequence: feedVisitSeq,
    explorationPushRatio: 0.35,
  });
}, [reels, currentUser?.id, feedVisitSeq]);

// Mark top rotated reels as seen for future rotation cycles
useEffect(() => {
  if (rotatedReels.length > 0) {
    const ids = rotatedReels.slice(0, 10).map((r: any) => r.id).filter(Boolean);
    markVideosAsSeen(ids);
  }
}, [rotatedReels]);

const mixedFeedItems = useMemo(() => {
  // Deduplicate posts by feed key first
  const seenKeys = new Set<string>();
  const uniquePosts: PostType[] = [];
  for (const post of safeArray(posts)) {
    if (!post) continue;
    const key = getFeedKey(post) || (post.id ? `${getFeedItemType(post)}:${post.id}` : null);
    if (key) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    }
    uniquePosts.push(post);
  }

  const postItems = uniquePosts.map((post) => ({
    kind: 'post' as const,
    data: post,
    created_at: post?.created_at || '',
  }));

  const storyItems = safeArray(frozenStoriesRef.current || orderedStories || []).map((story) => ({
    kind: 'story' as const,
    data: story,
    created_at: story?.created_at || '',
  }));

  const reelItems = safeArray(rotatedReels).map((reel) => ({
    kind: 'reel' as const,
    data: reel,
    created_at: reel?.created_at || '',
  }));

  // Feed only displays videos originated from posts, not Reels
  return mixFeedWithStrictVideoSpacing(postItems, storyItems, [], {
    minSpacing: 3,
    firstVideoSlot: 2,
  });
}, [posts, orderedStories, rotatedReels]);

// ============================================================================
// ==================== ✅ END MIXED FEED ITEMS ✅ =============================
// ============================================================================

               
  const handleStoryPrev = useCallback(() => {
    if (!activeStoryId) return;
    
    const list = orderedStories;
    const idx = list.findIndex(s => Number(s.id) === Number(activeStoryId));
    
    if (idx <= 0) {
      closeStoryViewer();
      return;
    }
    
    const prev = list[idx - 1];
    if (prev) {
      setActiveStoryId(prev.id);
      markStorySeen(prev.id);
      preloadStoryMedia(prev);
    }
  }, [activeStoryId, orderedStories, closeStoryViewer, markStorySeen, preloadStoryMedia]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  
  const handleActiveReelConsumed = useCallback(() => {
    setSelectedReelId(null);
  }, []);
  
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  const [activePostId, setActivePostId] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [postUploadState, setPostUploadState] = useState<PostUploadState | null>(null);
  const [showCreateReelModal, setShowCreateReelModal] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const phonePhotoInputRef = useRef<HTMLInputElement>(null);
  const phoneVideoInputRef = useRef<HTMLInputElement>(null);
  const [pendingPostMedia, setPendingPostMedia] = useState<{
    files?: File[];
    previews?: string[];
    mediaUrls?: string[];
    mediaType?: 'image' | 'video' | 'mixed';
    attachedMusic?: any;
    items?: any[];
  } | null>(null);

  const [activeSharePost, setActiveSharePost] = useState<any>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareInProgress, setShareInProgress] = useState(false);

  const [followLoading, setFollowLoading] = useState<{ [key: number]: boolean }>({});

  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);

  const [currentAudioTrack, setCurrentAudioTrack] = useState<AudioTrack | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playHistory, setPlayHistory] = useState<AudioTrack[]>([]);
  const [likedTracks, setLikedTracks] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('unera_liked_tracks') || '[]');
    } catch {
      return [];
    }
  });
  const [trackPlays, setTrackPlays] = useState<Record<string, number>>({});
  const [myTotalPlays, setMyTotalPlays] = useState<number>(() => {
    try {
      const rawUser = localStorage.getItem(LS_USER_KEY);
      let uid = 0;
      try { 
        const user = JSON.parse(rawUser || '{}');
        uid = Number(user?.id || 0); 
      } catch {}
      
      const key = uid ? `unera_my_total_plays_${uid}` : 'unera_my_total_plays';
      const v = Number(localStorage.getItem(key) || 0);
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  });
  
  const [playsLoading, setPlaysLoading] = useState(false);

  const lastPlayedKeyRef = useRef<string>('');

  useEffect(() => {
    localStorage.setItem('unera_liked_tracks', JSON.stringify(likedTracks));
  }, [likedTracks]);

  useEffect(() => {
    if (!currentUser?.id) return;
    
    const key = `unera_my_total_plays_${Number(currentUser.id)}`;
    localStorage.setItem(key, String(myTotalPlays));
    
    localStorage.setItem('unera_my_total_plays', String(myTotalPlays));
  }, [myTotalPlays, currentUser?.id]);


// Handle URL routing and initialView prop
useEffect(() => {
  if (!initialView) return;
  
  // Handle profile from URL
  if (initialView === 'profile') {
    const userId = params.userId;
    const username = params.username;
    
    if (userId) {
      setSelectedUserId(Number(userId));
      setView('profile');
    } else if (username) {
      const user = users.find(u => u.username === username);
      if (user) {
        setSelectedUserId(user.id);
        setView('profile');
      }
    }
    return;
  }
  
  // Handle post from URL
  if (initialView === 'post' && params.postId) {
    setView('home');
    setActivePostId(Number(params.postId));
    return;
  }
  
  // Handle reel from URL
  if (initialView === 'reel' && params.reelId) {
    setSelectedReelId(Number(params.reelId));
    setView('reels');
    setActiveTab('reels');
    return;
  }
  
  // Handle group from URL
  if (initialView === 'group' && params.groupId) {
    setView('groups');
    setActiveGroupId(Number(params.groupId));
    setActiveTab('groups');
    return;
  }
  
  // Handle event from URL
  if (initialView === 'event' && params.eventId) {
    setActiveEventId(Number(params.eventId));
    setView('events');
    setActiveTab('events');
    return;
  }
  
  // Handle music from URL
  if ((initialView === 'music-item' || initialView === 'music') && params.musicId) {
    setView('music');
    setActiveTab('music');
    return;
  }
  
  // Handle product from URL
  if (initialView === 'product' && params.productId) {
    setView('marketplace');
    setActiveTab('marketplace');
    return;
  }
  
  // Handle group post from URL
  if (initialView === 'group-post' && params.groupId && params.postId) {
    setView('groups');
    setActiveGroupId(Number(params.groupId));
    setActiveTab('groups');
    return;
  }
  
  // For all other simple views (privacy, terms, settings, etc.)
  if (['privacy', 'terms', 'settings', 'help', 'notifications', 'messages', 
       'profiles', 'story-feed', 'birthdays', 'memories', 'tools', 'ads', 
       'brands'].includes(initialView)) {
    setView(initialView as View);
  }
  
  // Update active tab for simple views
  if (['home', 'feed'].includes(initialView)) {
    setActiveTab('home');
  } else if (initialView === 'notifications') {
    setActiveTab('notifications');
  } else if (initialView === 'messages') {
    setActiveTab('messages');
  }
  
  // ❌ REMOVED: window.scrollTo(0, 0);
}, [initialView, params, users]);
    
  // ============================================================================
  // ✅ MUSIC HANDLERS
  // ============================================================================

const handleMusicReact = useCallback(async (track: AudioTrack, type: ReactionType) => {
  if (!requireAuth('Reacting')) return;
  if (!currentUser || !track) return;

  const trackId = track.id;
  const trackType = track.type || 'music';
  const meId = currentUser.id;
  
  // ✅ CONSISTENT KEY FORMAT: type:id
  const trackKey = `${trackType}:${trackId}`;
  const reactionLockKey = `reaction_${trackKey}`;

  // Prevent double-tap
  if (reactingMap[reactionLockKey]) {
    console.log('Reaction already in progress for:', trackKey);
    return;
  }

  reactingMap[reactionLockKey] = true;

  // ---- OPTIMISTIC UPDATE ----
  const currentReaction = trackReactions[trackKey];
  const currentType = currentReaction?.myReaction;
  const currentCount = currentReaction?.count || 0;
  const currentCommentsCount = trackComments[trackKey] || 0;

  // Calculate optimistic values (matches backend toggle logic)
  const isRemoving = currentType === type;
  const isChanging = currentType && currentType !== type;
  const isNew = !currentType;

  const optimisticMyReaction = isRemoving ? undefined : type;
  const optimisticCount = isRemoving 
    ? Math.max(0, currentCount - 1)
    : isNew 
      ? currentCount + 1
      : currentCount;

  // Apply optimistic update using CONSISTENT key
  setTrackReactions(prev => ({
    ...prev,
    [trackKey]: {
      count: optimisticCount,
      myReaction: optimisticMyReaction
    }
  }));

  try {
    const data = await apiFetch(`/api/songs/${trackId}/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(meId),
      },
      body: JSON.stringify({ 
        user_id: meId,
        type: type 
      }),
    });

    if (data?.success !== false) {
      const serverMyReaction = data?.my_reaction || data?.myReaction || null;
      const serverCount = Number(
        data?.reactions_count || 
        data?.reactionsCount || 
        data?.likes_count || 
        data?.likesCount || 
        0
      );
      
      // ✅ ALSO UPDATE comments count from backend response
      const serverCommentsCount = Number(data?.comments_count || 0);

      console.log('✅ Song reaction success:', {
        trackKey,
        myReaction: serverMyReaction,
        count: serverCount,
        commentsCount: serverCommentsCount
      });

      // Update track reactions with CONSISTENT key
      setTrackReactions(prev => ({
        ...prev,
        [trackKey]: {
          count: serverCount,
          myReaction: serverMyReaction || undefined
        }
      }));
      
      // ✅ Update comments count if returned from backend
      if (serverCommentsCount > 0) {
        setTrackComments(prev => ({
          ...prev,
          [trackKey]: serverCommentsCount
        }));
      }

      // Update songs array if exists
      setSongs(prev => 
        prev.map(song => {
          if (String(song.id) === String(trackId)) {
            return {
              ...song,
              reactionCount: serverCount,
              myReaction: serverMyReaction || undefined,
              stats: {
                ...(song.stats || {}),
                reactions: serverCount
              }
            };
          }
          return song;
        })
      );
      
      // ✅ After successful reaction, refresh full reaction data from GET endpoint
      // This ensures we have latest counts, previews, and user data
      fetchSongReactionsData(trackId).then(reactionData => {
        if (reactionData) {
          setTrackReactions(prev => ({
            ...prev,
            [trackKey]: {
              count: reactionData.reactionsCount,
              myReaction: reactionData.myReaction || undefined,
              // Optionally store full reaction data
              counts: reactionData.counts,
              reactions: reactionData.reactions,
            }
          }));
          
          // Update comments count from GET endpoint
          if (reactionData.commentsCount > 0) {
            setTrackComments(prev => ({
              ...prev,
              [trackKey]: reactionData.commentsCount
            }));
          }
        }
      });
      
    } else {
      throw new Error(data?.error || 'Reaction failed');
    }
  } catch (error: any) {
    console.error('❌ Failed to react to song:', error);
    
    // Rollback using CONSISTENT key
    setTrackReactions(prev => ({
      ...prev,
      [trackKey]: {
        count: currentCount,
        myReaction: currentType
      }
    }));

    // Rollback comments count
    setTrackComments(prev => ({
      ...prev,
      [trackKey]: currentCommentsCount
    }));

    // Rollback songs array
    setSongs(prev => 
      prev.map(song => {
        if (String(song.id) === String(trackId)) {
          return {
            ...song,
            reactionCount: currentCount,
            myReaction: currentType
          };
        }
        return song;
      })
    );

    setLoginError(error?.message || 'Failed to react. Please try again.');
  } finally {
    setTimeout(() => {
      delete reactingMap[reactionLockKey];
    }, 500);
  }
}, [
  currentUser,
  requireAuth,
  reactingMap,
  trackReactions,
  trackComments,
  setTrackReactions,
  setTrackComments,
  setSongs,
  setLoginError,
  apiFetch
]);


// ============================================================================
//====Feed-specific music reaction handler
// ============================================================================
const handleFeedMusicReact = useCallback(async (track: AudioTrack, type: ReactionType) => {
  console.log('🔍 [FeedReact] Called:', { trackId: track?.id, type, trackType: track?.type });
  
  if (!track?.id) {
    console.error('❌ [FeedReact] No track ID - aborting');
    return;
  }
  
  // Call the main music reaction handler
  console.log('📤 [FeedReact] Calling handleMusicReact...');
  await handleMusicReact(track, type);
  console.log('✅ [FeedReact] handleMusicReact completed');
  
  const trackId = String(track.id);
  
  // Update posts that contain this music track
  setPosts(prev => {
    let updatedCount = 0;
    const updated = prev.map(post => {
      if (post.meta?.song?.id === trackId || post.song?.id === trackId) {
        updatedCount++;
        const currentReaction = post.musicReaction;
        const currentCount = post.musicReactionsCount || 0;
        const isRemoving = currentReaction === type;
        const isChanging = currentReaction && currentReaction !== type;
        const isNew = !currentReaction;
        
        return {
          ...post,
          musicReaction: isRemoving ? undefined : type,
          musicReactionsCount: isRemoving 
            ? Math.max(0, currentCount - 1)
            : isNew 
              ? currentCount + 1
              : currentCount
        };
      }
      return post;
    });
    console.log(`📝 [FeedReact] Updated ${updatedCount} posts`);
    return updated;
  });
  
  // Update profile posts if they contain this music track
  setProfilePosts(prev => {
    let updatedCount = 0;
    const updated = prev.map(post => {
      if (post.meta?.song?.id === trackId || post.song?.id === trackId) {
        updatedCount++;
        const currentReaction = post.musicReaction;
        const currentCount = post.musicReactionsCount || 0;
        const isRemoving = currentReaction === type;
        
        return {
          ...post,
          musicReaction: isRemoving ? undefined : type,
          musicReactionsCount: isRemoving 
            ? Math.max(0, currentCount - 1)
            : currentCount + 1
        };
      }
      return post;
    });
    console.log(`📝 [FeedReact] Updated ${updatedCount} profile posts`);
    return updated;
  });
}, [handleMusicReact, setPosts, setProfilePosts]);



// ============================================================================
//=====Compute musicReactions map for Feed
// ============================================================================

const feedMusicReactions = useMemo(() => {
  const map: Record<string, { myReaction?: ReactionType; count: number }> = {};
  
  let postsWithMusic = 0;
  let postsWithReactions = 0;
  
  posts.forEach(post => {
    const songId = post.meta?.song?.id || post.song?.id;
    if (songId) {
      postsWithMusic++;
      const trackKey = `music:${songId}`;
      const trackReaction = trackReactions[trackKey];
      
      console.log(`🔍 [FeedReactions] Post ${post.id}:`, {
        songId,
        trackKey,
        hasReaction: !!trackReaction,
        trackReaction
      });
      
      if (trackReaction) {
        postsWithReactions++;
        map[String(post.id)] = {
          myReaction: trackReaction.myReaction,
          count: trackReaction.count
        };
      }
    }
  });
  
  console.log(`📊 [FeedReactions] Map built: ${postsWithMusic} music posts, ${postsWithReactions} with reactions, ${Object.keys(map).length} entries`);
  console.log('📊 [FeedReactions] Final map:', map);
  console.log('📊 [FeedReactions] trackReactions state:', trackReactions);
  
  return map;
}, [posts, trackReactions]);
    

// ============================================================================
// ✅ ADD THIS: Helper function to fetch song reactions from GET endpoint
// ============================================================================

/**
 * Fetch full reaction data for a song from GET endpoint
 * Used to sync after POST reaction or refresh data
 */
const fetchSongReactionsData = useCallback(async (songId: string | number) => {
  if (!songId) return null;
  
  try {
    const viewerId = currentUser?.id || 0;
    const url = `/api/songs/${songId}/reactions${viewerId ? `?viewerId=${viewerId}` : ''}`;
    
    const response = await apiFetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(viewerId ? { 'x-user-id': String(viewerId) } : {}),
      },
    });
    
    if (response?.success) {
      return {
        reactions: response.reactions || [],
        reactionsCount: response.reactions_count || 0,
        counts: response.counts || {},
        myReaction: response.my_reaction || null,
        commentsCount: response.comments_count || 0,
      };
    }
    
    console.warn('Failed to fetch song reactions:', response?.error);
    return null;
  } catch (error) {
    console.error('Error fetching song reactions:', error);
    return null;
  }
}, [currentUser, apiFetch]);

// ============================================================================
// ✅ ADD THIS: Bulk fetch reactions for multiple songs
// ============================================================================

/**
 * Fetch reactions for multiple songs efficiently
 * Used when loading music feed to populate reaction counts
 */
const fetchBulkSongReactionsData = useCallback(async (songIds: (string | number)[]) => {
  if (!songIds.length) return;
  
  const viewerId = currentUser?.id || 0;
  
  // Fetch reactions for each song in parallel (limit to 10 concurrent)
  const batchSize = 10;
  const batches = [];
  
  for (let i = 0; i < songIds.length; i += batchSize) {
    batches.push(songIds.slice(i, i + batchSize));
  }
  
  const allResults: any[] = [];
  
  for (const batch of batches) {
    const promises = batch.map(async (songId) => {
      try {
        const url = `/api/songs/${songId}/reactions${viewerId ? `?viewerId=${viewerId}` : ''}`;
        const response = await apiFetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(viewerId ? { 'x-user-id': String(viewerId) } : {}),
          },
        });
        
        if (response?.success) {
          return {
            songId: String(songId),
            reactionsCount: response.reactions_count || 0,
            myReaction: response.my_reaction || null,
            counts: response.counts || {},
            commentsCount: response.comments_count || 0,
            reactions: response.reactions || [],
          };
        }
        return null;
      } catch (error) {
        console.error(`Failed to fetch reactions for song ${songId}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    allResults.push(...results.filter(Boolean));
  }
  
  // Update state with fetched data
  const newTrackReactions: Record<string, { count: number; myReaction?: ReactionType; counts?: Record<string, number>; reactions?: any[] }> = {};
  const newTrackComments: Record<string, number> = {};
  
  allResults.forEach(result => {
    if (result) {
      const key = `music:${result.songId}`;
      newTrackReactions[key] = {
        count: result.reactionsCount,
        myReaction: result.myReaction || undefined,
        counts: result.counts,
        reactions: result.reactions,
      };
      
      if (result.commentsCount > 0) {
        newTrackComments[key] = result.commentsCount;
      }
    }
  });
  
  // Merge with existing state
  setTrackReactions(prev => {
    const merged = { ...prev };
    Object.entries(newTrackReactions).forEach(([key, value]) => {
      merged[key] = {
        ...merged[key],
        ...value,
      };
    });
    return merged;
  });
  
  setTrackComments(prev => ({ ...prev, ...newTrackComments }));
  
  console.log('✅ Bulk loaded reactions for', Object.keys(newTrackReactions).length, 'songs');
  
  return newTrackReactions;
}, [currentUser, apiFetch, setTrackReactions, setTrackComments]);

// ============================================================================
// ✅ ADD THIS: Load reactions when songs first appear
// ============================================================================

useEffect(() => {
  if (songs.length > 0) {
    const songIds = songs.map(s => s.id);
    fetchBulkSongReactionsData(songIds);
  }
}, [songs.length > 0]); // Only run when songs array becomes non-empty

// ============================================================================
// ✅ ADD THIS: Refresh reactions when track changes
// ============================================================================

useEffect(() => {
  if (currentAudioTrack?.id) {
    const trackKey = `${currentAudioTrack.type || 'music'}:${currentAudioTrack.id}`;
    
    // Only refresh if we don't already have data
    if (!trackReactions[trackKey]) {
      fetchSongReactionsData(currentAudioTrack.id).then(reactionData => {
        if (reactionData) {
          setTrackReactions(prev => ({
            ...prev,
            [trackKey]: {
              count: reactionData.reactionsCount,
              myReaction: reactionData.myReaction || undefined,
              counts: reactionData.counts,
              reactions: reactionData.reactions,
            }
          }));
          
          if (reactionData.commentsCount > 0) {
            setTrackComments(prev => ({
              ...prev,
              [trackKey]: reactionData.commentsCount
            }));
          }
        }
      });
    }
  }
}, [currentAudioTrack?.id]);



        

  // Handle open music comments
  const handleOpenMusicComments = useCallback((track: AudioTrack) => {
    if (!currentUser) {
      setLoginError('Please login to comment');
      setView('login');
      return;
    }
    setSelectedMusicTrack(track);
    setShowMusicComments(true);
  }, [currentUser]);

  // Handle music share
  const handleMusicShare = useCallback((track: AudioTrack) => {
    if (!currentUser) {
      setLoginError('Please login to share');
      setView('login');
      return;
    }
    
    // Create a post-like object for the music track
    const musicPost = {
      id: track.id,
      user_id: currentUser.id,
      content: `${track.title} by ${track.artist}`,
      type: track.type,
      media_url: track.cover,
      author: {
        name: currentUser.name,
        username: currentUser.username,
        profile_image_url: currentUser.profile_image_url,
      },
      created_at: new Date().toISOString(),
    };
    
    setActiveSharePost(musicPost);
    setShowShareSheet(true);
  }, [currentUser]);

  // Handle comment added for music track
  const handleMusicCommentAdded = useCallback((trackId: string) => {
    setTrackComments(prev => ({
      ...prev,
      [trackId]: (prev[trackId] || 0) + 1
    }));
  }, []);
    // Handle share complete for music track
const handleMusicShareComplete = useCallback((destination: string, data?: any, track?: AudioTrack) => {
  if (data?.success && track) {
    const key = `${track.type}:${String(track.id)}`;
    setTrackShares(prev => ({
      ...prev,
      [key]: (prev[key] || 0) + 1
    }));
  }
}, []);

  // Incoming call polling effect
  useEffect(() => {
    if (!currentUser?.id) return;

    if (!audioRef.current) {
      audioRef.current = new Audio('/sounds/ringtone.mp3');
      audioRef.current.loop = true;
    }

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/calls/incoming?user_id=${currentUser.id}`);
        const call = res?.call;

        if (call?.id && call?.status === "ringing") {
          setIncomingCall(call);
          
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.log('Ringtone play failed:', e));
          }
        }
      } catch (error) {
        console.debug('Call polling error:', error);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [currentUser]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!currentUser) return;

    try {
      const data = await apiFetch("/api/notifications", {
        headers: {
          "x-user-id": String(currentUser.id)
        }
      }).catch(() => []);

      setNotifications(Array.isArray(data) ? data : (data?.notifications ?? []));
    } catch {
      setNotifications([]);
    }
  }, [currentUser]);

  const [hasMoreNotifications, setHasMoreNotifications] = useState(true);

  // Load more notifications (previous notifications)
  const loadMoreNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiFetch("/api/notifications", {
        headers: {
          "x-user-id": String(currentUser.id),
        },
      }).catch(() => []);

      const list = Array.isArray(data) ? data : (data?.notifications ?? []);
      if (Array.isArray(list) && list.length > 0) {
        setNotifications((prev) => {
          const prevList = Array.isArray(prev) ? prev : [];
          const existingIds = new Set(prevList.map((n: any) => Number(n.id)));
          const newItems = list.filter((n: any) => !existingIds.has(Number(n.id)));
          if (newItems.length === 0) {
            setHasMoreNotifications(false);
            return prevList;
          }
          return [...prevList, ...newItems];
        });
      } else {
        setHasMoreNotifications(false);
      }
    } catch {
      setHasMoreNotifications(false);
    }
  }, [currentUser]);

  // Mark notifications as read
  const markNotificationsRead = async () => {
    if (!currentUser) return;

    try {
      await apiFetch("/api/notifications/read", {
        method: "POST",
        headers: {
          "x-user-id": String(currentUser.id)
        }
      }).catch(() => {});
    } catch {
      // Ignored
    }
  };

  // Auto refresh notifications
  useEffect(() => {
    if (!currentUser) return;

    fetchNotifications();

    const interval = setInterval(fetchNotifications, 20000);

    return () => clearInterval(interval);
  }, [currentUser, fetchNotifications]);

  // Fetch ads
  const fetchAds = useCallback(async () => {
    try {
      const data = await apiFetch("/api/ads/feeds")
        .catch(async () => apiFetch("/api/ads/feed"))
        .catch(() => ({ ads: [] }));
      setAds(safeArray(data?.ads));
    } catch {
      setAds([]);
    }
  }, []);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  const openAdAnalytics = (adId: number) => {
    setAdAnalyticsId(adId);
    setShowAdAnalytics(true);
  };

  const openChatWith = useCallback((userId: number) => {
    const recipient = users.find(u => Number(u.id) === Number(userId));
    if (recipient) {
      setActiveChatUser(recipient);
      setIsChatOpen(true);
    }
  }, [users]);

  // ============================================================================
  // ✅ PYMK Helpers
  // ============================================================================
  const persistPymkHidden = useCallback((ids: number[]) => {
    const dedup = Array.from(new Set(ids.map(Number).filter(Number.isFinite))).slice(0, 2000);
    setPymkHiddenIds(dedup);
    try {
      localStorage.setItem(PYMK_HIDDEN_KEY, JSON.stringify(dedup));
    } catch {}
  }, []);

  const hidePymkUser = useCallback((userId: number) => {
    const id = Number(userId);
    if (!id) return;

    setPeopleYouMayKnow(prev => prev.filter(u => Number(u.id) !== id));
    persistPymkHidden([id, ...pymkHiddenIds]);
  }, [persistPymkHidden, pymkHiddenIds]);

  // PYMK Fetch
  const fetchPeopleYouMayKnow = useCallback(async () => {
    if (!currentUser?.id) {
      setPeopleYouMayKnow([]);
      return;
    }

    if (!pymkHydrated) setPymkLoading(true);

    try {
      const data = await apiFetch(`/api/suggestions?user_id=${currentUser.id}&limit=20`);
      const raw = safeArray<any>(data?.suggestions ?? data);
      const hiddenSet = new Set(pymkHiddenIds.map(Number));

      const normalized: PeopleSuggestion[] = raw
        .map((u: any) => ({
          id: safeNumber(u?.id ?? u?.user_id),
          username: safeString(u?.username),
          name: safeString(u?.name || u?.username || "User"),
          profile_image_url: safeString(u?.profile_image_url || ""),
          is_verified: !!u?.is_verified,
          role: safeString(u?.role || "user"),
          mutual_count: safeNumber(u?.mutual_count, 0),
          is_following: !!u?.is_following,
          score: safeNumber(u?.score, 0),
        }))
        .filter((u: PeopleSuggestion) => u.id > 0)
        .filter((u: PeopleSuggestion) => !hiddenSet.has(Number(u.id)));

      setPeopleYouMayKnow(normalized);
      setPymkHydrated(true);
    } catch (error) {
      console.warn('Failed to fetch People You May Know:', error);
      setPeopleYouMayKnow([]);
    } finally {
      setPymkLoading(false);
    }
  }, [currentUser, pymkHiddenIds]);

  // PYMK Effect
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchPeopleYouMayKnow();
  }, [currentUser?.id, pymkHiddenIds]);


//===INFINITE SCROLL ===
      
const [extraFeedItems, setExtraFeedItems] = useState<FeedItem[]>([]);
const [feedNextCursor, setFeedNextCursor] = useState<string | null>(null);
const [hasMoreFeed, setHasMoreFeed] = useState(true);
const [feedLoadingMore, setFeedLoadingMore] = useState(false);

const feedSeedRef = useRef<number>(Math.floor(Date.now() / 1000));
const feedLoadingLockRef = useRef(false);
const lastFeedFetchTimestampRef = useRef(0);

const loadMoreFeed = useCallback(async () => {
  const now = Date.now();
  if (feedLoadingLockRef.current) return;
  if (feedLoadingMore) return;
  if (!hasMoreFeed) return;
  if (!currentUser?.id) return;
  if (now - lastFeedFetchTimestampRef.current < 2000) return;

  feedLoadingLockRef.current = true;
  lastFeedFetchTimestampRef.current = now;
  setFeedLoadingMore(true);

  try {
    const currentItems = [...mixedFeedItems, ...extraFeedItems];

    const seenIds = currentItems
      .map((item: any) => Number(item?.data?.id || item?.id))
      .filter(Boolean)
      .slice(-250);

    const oldestCreatedAt = currentItems
      .map((item: any) => String(item?.data?.created_at || item?.created_at || ""))
      .filter(Boolean)
      .sort()[0];

    const params = new URLSearchParams({
      userId: String(currentUser.id),
      limit: "20",
      seed: String(feedSeedRef.current),
      seen: seenIds.join(","),
    });

    if (feedNextCursor || oldestCreatedAt) {
      params.set("cursor", feedNextCursor || oldestCreatedAt);
    }

    const res = await fetch(`/api/feeds?${params.toString()}`, {
      headers: {
        ...authHeaders(),
      },
    });

    const data = await res.json();

    if (!data?.success) return;

    const incoming: FeedItem[] = (data.feed || []).map((post: any) => ({
      kind: "post" as const,
      data: post,
      created_at: post.created_at,
    }));

    if (incoming.length === 0) {
      setHasMoreFeed(false);
      return;
    }

    setExtraFeedItems(prev => {
      const map = new Map<string, FeedItem>();
      const existingKeys = new Set<string>();
      safeArray(posts).forEach((p: any) => {
        const k = getFeedKey(p) || (p?.id ? `${getFeedItemType(p)}:${p.id}` : null);
        if (k) existingKeys.add(k);
      });

      [...prev, ...incoming].forEach((item: any) => {
        const post = item.data || item;
        const key = getFeedKey(post) || post.feed_key || `${post.source || post.item_type || "post"}:${post.id}`;
        if (!existingKeys.has(key) && !map.has(key)) {
          map.set(key, item);
        }
      });

      return Array.from(map.values());
    });

    setFeedNextCursor(data.nextCursor || null);
    setHasMoreFeed(true);
  } catch (err) {
    console.error("APP_LOAD_MORE_FEED_ERROR", err);
  } finally {
    setFeedLoadingMore(false);
    setTimeout(() => {
      feedLoadingLockRef.current = false;
    }, 1000);
  }
}, [
  feedLoadingMore,
  hasMoreFeed,
  currentUser?.id,
  mixedFeedItems,
  extraFeedItems,
  feedNextCursor,
]);


        

  // ============================================================================
  // ✅ Groups You May Join - Helpers
  // ============================================================================
  const persistGymjHidden = useCallback((ids: number[]) => {
    const dedup = Array.from(new Set(ids.map(Number).filter(Number.isFinite))).slice(0, 2000);
    setGymjHiddenIds(dedup);
    try {
      localStorage.setItem(GROUPS_YOU_MAY_JOIN_HIDDEN_KEY, JSON.stringify(dedup));
    } catch {}
  }, []);

  const hideGroupSuggestion = useCallback((groupId: number) => {
    const id = Number(groupId);
    if (!id) return;

    setGroupsYouMayJoin(prev => prev.filter(g => Number(g.id) !== id));
    persistGymjHidden([id, ...gymjHiddenIds]);
  }, [persistGymjHidden, gymjHiddenIds]);

  // Groups You May Join - Fetch
  const fetchGroupsYouMayJoin = useCallback(async () => {
    if (!currentUser?.id) {
      setGroupsYouMayJoin([]);
      return;
    }

    if (!gymjHydrated) setGymjLoading(true);

    try {
      const data = await apiFetch(`/api/group-suggestions?user_id=${currentUser.id}&limit=12`);
      const raw = safeArray<any>(data?.groups ?? data);
      const hiddenSet = new Set(gymjHiddenIds.map(Number));

      const normalized: GroupSuggestion[] = raw
        .map((g: any) => ({
          id: safeNumber(g?.id),
          admin_id: safeNumber(g?.admin_id),
          name: safeString(g?.name, "Untitled Group"),
          description: safeString(g?.description),
          type: (g?.type === "private" ? "private" : "public") as "public" | "private",
          cover_image: safeString(g?.cover_image),
          profile_image: safeString(g?.profile_image),
          created_at: safeString(g?.created_at),
          category: safeString(g?.category, "general"),
          members_count: safeNumber(g?.members_count, 0),
          mutual_count: safeNumber(g?.mutual_count, 0),
          is_member: !!g?.is_member,
          score: safeNumber(g?.score, 0),
        }))
        .filter((g: any) => g.id > 0)
        .filter((g: any) => !hiddenSet.has(Number(g.id)));

      setGroupsYouMayJoin(normalized);
      setGymjHydrated(true);
    } catch (error) {
      console.warn('Failed to fetch Groups You May Join:', error);
      setGroupsYouMayJoin([]);
    } finally {
      setGymjLoading(false);
    }
  }, [currentUser, gymjHiddenIds]);

  // Groups You May Join - Effect
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchGroupsYouMayJoin();
  }, [currentUser?.id, gymjHiddenIds]);

  const resolveTrackOwner = useCallback((track: any): User | null => {
    if (!track) return null;

    const ownerId =
      safeNumber(track.user_id ?? track.owner_user_id ?? track.artist_user_id ?? track.creator_id ?? 0, 0);

    if (ownerId) {
      const found = users.find((u) => Number(u.id) === Number(ownerId));
      if (found) return found;
    }

    if (track?.owner && (track.owner.id || track.owner.user_id)) {
      return normalizeUser(track.owner);
    }

    return null;
  }, [users]);

  const fetchMyTotalPlays = useCallback(async (userId: number) => {
    if (!userId) return myTotalPlays;

    const cacheKey = `unera_my_total_plays_${userId}`;

    const cached = (() => {
      try {
        const v = Number(localStorage.getItem(cacheKey) || localStorage.getItem('unera_my_total_plays') || 0);
        return Number.isFinite(v) ? v : 0;
      } catch {
        return 0;
      }
    })();

    setPlaysLoading(true);
    try {
      const totalRes = await apiFetch(`/api/user-plays/total?userId=${userId}`);
      const total = safeNumber(totalRes?.total, NaN);

      if (Number.isFinite(total) && total > 0) {
        setMyTotalPlays(total);
        localStorage.setItem(cacheKey, String(total));
        return total;
      }

      throw new Error('Invalid total from API');
    } catch {
      try {
        const [s, p] = await Promise.all([
          apiFetch(`/api/song-plays/total?userId=${userId}`).catch(() => ({ total: NaN })),
          apiFetch(`/api/podcast-episode-plays/total?userId=${userId}`).catch(() => ({ total: NaN })),
        ]);
        
        const sTotal = safeNumber(s?.total, NaN);
        const pTotal = safeNumber(p?.total, NaN);

        if (Number.isFinite(sTotal) || Number.isFinite(pTotal)) {
          const total = (Number.isFinite(sTotal) ? sTotal : 0) + (Number.isFinite(pTotal) ? pTotal : 0);
          setMyTotalPlays(total);
          localStorage.setItem(cacheKey, String(total));
          return total;
        }

        setMyTotalPlays(cached);
        return cached;
      } catch {
        setMyTotalPlays(cached);
        return cached;
      }
    } finally {
      setPlaysLoading(false);
    }
  }, [myTotalPlays]);

  const fetchSongs = useCallback(async () => {
    try {
      const data = await apiFetch('/api/songs').catch(() => null);
      let list = Array.isArray(data) ? data : (data?.songs ?? data?.data ?? null);
      
      if (!list || !list.length) {
        list = MOCK_SONGS;
      }
      
      const normalized = list
        .map((song: any) => {
          const s = normalizeSong(song);
          const raw = ensureAbsoluteUrl(s.audio_url);
          const fetchable = toFetchableAudioUrl(raw);

          return {
            ...s,
            audio_url: raw,
            audio_fetch_url: fetchable,
          } as any;
        })
        .filter((x: any) => x.audio_url);
      
      setSongs(normalized);
    } catch {
      const fallback = MOCK_SONGS.map(normalizeSong);
      setSongs(fallback);
    }
  }, []);

  const fetchStories = useCallback(async () => {
    if (storiesInFlightRef.current) return;
    storiesInFlightRef.current = true;
    
    try {
      const cached = readStoriesCache();
      if (cached?.stories?.length) {
        const cachedList = cached.stories;
        setStories(prev => (prev.length ? prev : cachedList.map(s => normalizeStory(s))));
      }

      const viewerId = currentUser?.id || 0;
      const data = await apiFetch(`/api/stories?viewerId=${viewerId}`).catch(() => ({ stories: [] }));
      const storiesList = safeArray(data?.stories ?? data);
      
      writeStoriesCache(storiesList);
      
      const prevUsers = usersRef.current;

      const map = new Map<number, User>();
      prevUsers.forEach(u => map.set(Number(u.id), u));

      const normalizedStories = storiesList.map((story: any) => {
        const uid = Number(story.user_id);
        const existing = map.get(uid);
        const st = normalizeStory(story, existing);

        if (st.user) {
          const incoming = normalizeUser(st.user);
          const cur = map.get(uid);
          map.set(uid, cur ? normalizeUser(mergeUserSafe(cur, incoming)) : incoming);
        }
        return st;
      });

      setStories(prev => {
        const map = new Map<number, Story>();
        safeArray(prev).forEach(st => map.set(Number(st.id), st));

        return normalizedStories.map(ns => {
          const old = map.get(Number(ns.id));
          if (!old) return ns;

          return {
            ...old,
            ...ns,
            liked_by_me: ns.liked_by_me ?? old.liked_by_me,
            my_reaction: ns.my_reaction ?? old.my_reaction,
            views_count: ns.views_count ?? old.views_count,
            reactions_count: ns.reactions_count ?? old.reactions_count,
            comments_count: ns.comments_count ?? old.comments_count,
            shares_count: ns.shares_count ?? old.shares_count,
          };
        });
      });
      
      setUsers(Array.from(map.values()));
      
    } catch {
      // Handled gracefully
    } finally {
      storiesInFlightRef.current = false;
    }
  }, [currentUser]);

  const fetchStoryViewers = useCallback(async (storyId: number) => {
    const cached = readViewersCache(storyId);
    if (cached) return cached;

    try {
      const data = await apiFetch(`/api/stories/${storyId}/viewers?limit=200`).catch(() => ({ viewers: [] }));
      const viewers = safeArray(data?.viewers ?? data);
      
      const formattedViewers = viewers.map((v: any) => ({
        id: v.id,
        story_id: v.story_id,
        user_id: v.user_id,
        viewed_at: v.viewed_at,
        reaction: v.reaction ?? null,
        user: normalizeUser({
          id: v.user_id,
          username: v.username,
          name: v.name,
          profile_image_url: v.profile_image_url,
          is_verified: v.is_verified,
          role: v.role,
        }),
      }));

      writeViewersCache(storyId, formattedViewers);
      return formattedViewers;
    } catch {
      return [];
    }
  }, []);

  const fetchStoryAnalytics = useCallback(async (storyId: number) => {
    try {
      const data = await apiFetch(`/api/stories/${storyId}/analytics`).catch(() => null);
      return {
        total_views: safeNumber(data?.total_views, 0),
        unique_viewers: safeNumber(data?.unique_viewers, 0),
        views_with_reactions: safeNumber(data?.views_with_reactions, 0),
        reaction_breakdown: data?.reaction_breakdown || {},
        completion_rate: safeNumber(data?.completion_rate, 0),
        average_view_time: safeNumber(data?.average_view_time, 0),
      };
    } catch {
      return {
        total_views: 0,
        unique_viewers: 0,
        views_with_reactions: 0,
        reaction_breakdown: {},
        completion_rate: 0,
        average_view_time: 0,
      };
    }
  }, []);

  const viewStory = useCallback(async (storyId: number) => {
    if (!requireAuth('Viewing stories')) return;
    if (!currentUser) return;

    setStories(prev =>
      prev.map(story => {
        if (Number(story.id) !== Number(storyId)) return story;
        
        return {
          ...story,
          views_count: (story.views_count || 0) + 1,
        };
      })
    );

    try {
      const res = await apiFetch(`/api/stories/${storyId}/view`, {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id }),
      });

      if (res?.views_count !== undefined) {
        setStories(prev =>
          prev.map(story => {
            if (Number(story.id) !== Number(storyId)) return story;
            
            return {
              ...story,
              views_count: Number(res.views_count ?? story.views_count),
            };
          })
        );
      }
    } catch (error) {
      console.error('Failed to record story view:', error);
    }
  }, [currentUser, requireAuth]);

  const [focusedStoryId, setFocusedStoryId] = useState<number | null>(null);

  const openStoryViewer = useCallback((storyOrId: Story | number) => {
    const id = typeof storyOrId === 'number' ? storyOrId : Number(storyOrId?.id);
    if (!id) return;

    const targetStory = typeof storyOrId === 'object' && storyOrId !== null
      ? storyOrId
      : orderedStories.find(s => Number(s.id) === id);

    setActiveStoryId(id);

    if (currentUser) {
      viewStory(id);
    }

    markStorySeen(id);

    if (targetStory) {
      preloadStoryMedia(targetStory);
    }
    const next = (() => {
      const idx = orderedStories.findIndex(x => Number(x.id) === id);
      return idx >= 0 ? orderedStories[idx + 1] : null;
    })();
    if (next) preloadStoryMedia(next);
  }, [currentUser, viewStory, markStorySeen, preloadStoryMedia, orderedStories]);

  const likeStory = useCallback(async (storyId: number) => {
    if (!requireAuth('Liking stories')) return;
    if (!currentUser) return;

    setStories(prev =>
      prev.map(story => {
        if (Number(story.id) !== Number(storyId)) return story;
        
        const currentlyLiked = story.liked_by_me;
        
        return {
          ...story,
          liked_by_me: !currentlyLiked,
          my_reaction: !currentlyLiked ? 'like' : null,
          reactions_count: currentlyLiked 
            ? Math.max(0, (story.reactions_count || 0) - 1)
            : (story.reactions_count || 0) + 1,
        };
      })
    );

    try {
      const response = await apiFetch(`/api/stories/${storyId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({ 
          user_id: currentUser.id, 
          type: 'like',
          reaction: 'like' 
        }),
      });

      if (response?.story) {
        const updatedStory = normalizeStory(response.story, currentUser);
        
        setStories(prev =>
          prev.map(story => {
            if (Number(story.id) !== Number(storyId)) return story;
            
            return {
              ...story,
              liked_by_me: updatedStory.my_reaction === 'like',
              my_reaction: updatedStory.my_reaction,
              reactions_count: updatedStory.reactions_count,
            };
          })
        );
      }

    } catch (error) {
      console.error('Failed to like story:', error);
    }
  }, [currentUser, requireAuth]);

  const reactToStory = useCallback(async (storyId: number, reaction: string) => {
    if (!requireAuth('Reacting to stories')) return;
    if (!currentUser) return;

    setStories(prev =>
      prev.map(story => {
        if (Number(story.id) !== Number(storyId)) return story;
        
        const currentReaction = story.my_reaction;
        const isSameReaction = currentReaction === reaction;
        
        return {
          ...story,
          my_reaction: isSameReaction ? null : reaction,
          reactions_count: isSameReaction 
            ? Math.max(0, (story.reactions_count || 0) - 1)
            : (story.reactions_count || 0) + 1,
          liked_by_me: isSameReaction ? false : true,
        };
      })
    );

    try {
      const response = await apiFetch(`/api/stories/${storyId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({ 
          user_id: currentUser.id, 
          type: reaction,
          reaction: reaction 
        }),
      });

      if (response?.story) {
        const updatedStory = normalizeStory(response.story, currentUser);
        
        setStories(prev =>
          prev.map(story => {
            if (Number(story.id) !== Number(storyId)) return story;
            
            return {
              ...story,
              my_reaction: updatedStory.my_reaction,
              reactions_count: updatedStory.reactions_count,
              reaction_breakdown: updatedStory.reaction_breakdown || {},
              liked_by_me: Boolean(updatedStory.my_reaction),
            };
          })
        );
      }

    } catch (error) {
      console.error('Failed to react to story:', error);
    }
  }, [currentUser, requireAuth]);

  const replyToStory = useCallback(async (storyId: number, text: string) => {
    if (!requireAuth('Replying to stories')) return;
    if (!currentUser) return;

    try {
      await apiFetch(`/api/stories/${storyId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ 
          user_id: currentUser.id, 
          text: text 
        }),
      });

      const toast = document.createElement('div');
      toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
      toast.innerText = 'Reply sent!';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);

    } catch (error) {
      console.error('Failed to reply to story:', error);
      setLoginError('Failed to send reply');
    }
  }, [currentUser, requireAuth]);

const createStory = useCallback(async (storyData: Partial<Story> & { 
  media_file?: File; 
  audio_file?: File; 
  video_file?: File;
  media_urls?: string[];
  media_types?: string[];
  media_meta?: any[];
}) => {
  if (!requireAuth('Creating stories')) return;
  if (!currentUser) return;
  
  const hasText = storyData.text_content && storyData.text_content.trim().length > 0;
  const hasMedia = storyData.media_file || storyData.video_file || storyData.media_url;
  
  if (!hasText && !hasMedia) {
    setLoginError('Please add text or media to your story');
    return;
  }
  
  setShowCreateStoryModal(false);
  setStoryCreateLoading(true);
  
  try {
    let mediaUrl = storyData.media_url || null;
    let musicUrl = storyData.music_url || null;
    let mediaType = storyData.type || 'text';
    let mediaUrls: string[] | null = Array.isArray((storyData as any).media_urls) ? (storyData as any).media_urls : null;
    let mediaTypes: string[] | null = Array.isArray((storyData as any).media_types) ? (storyData as any).media_types : null;
    let mediaMeta: any[] | null = Array.isArray((storyData as any).media_meta) ? (storyData as any).media_meta : null;
    
    // VIDEO
    if (storyData.video_file) {
      const videoFile = storyData.video_file;
      if (videoFile.size > 50 * 1024 * 1024) {
        throw new Error('Video file size must be less than 50MB');
      }
      const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      if (!validVideoTypes.includes(videoFile.type)) {
        throw new Error('Please upload a valid video file (MP4, WebM, or MOV)');
      }

      const uploaded = await uploadStoryVideoBundle(videoFile);

      mediaUrl = uploaded.media_url;
      mediaUrls = uploaded.media_urls;
      mediaTypes = uploaded.media_types;
      mediaMeta = Array.isArray(uploaded.media_meta)
        ? uploaded.media_meta.map((m: any) => ({
            ...m,
            thumb: m?.thumb || '',
            feed: m?.feed || m?.full || m?.thumb || '',
            full: m?.feed || m?.full || m?.thumb || '', // ✅ full = feed
            type: m?.type || 'video',
          }))
        : uploaded.media_meta;

      mediaType = 'video';
    }
    // IMAGE
    else if (storyData.media_file) {
      const imageFile = storyData.media_file;
      if (imageFile.size > 10 * 1024 * 1024) {
        throw new Error('Image file size must be less than 10MB');
      }
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validImageTypes.includes(imageFile.type)) {
        throw new Error('Please upload a valid image file (JPEG, PNG, WebP, or GIF)');
      }

      const uploaded = await uploadStoryImageBundle(imageFile);

      mediaUrl = uploaded.media_url;
      mediaUrls = uploaded.media_urls;
      mediaTypes = uploaded.media_types;
      mediaMeta = Array.isArray(uploaded.media_meta)
        ? uploaded.media_meta.map((m: any) => ({
            ...m,
            thumb: m?.thumb || '',
            feed: m?.feed || m?.full || m?.thumb || '',
            full: m?.feed || m?.full || m?.thumb || '', // ✅ full = feed
            type: m?.type || 'image',
          }))
        : uploaded.media_meta;

      mediaType = 'image';
    }

    // AUDIO
    if (storyData.audio_file) {
      const audioFile = storyData.audio_file;
      if (audioFile.size > 5 * 1024 * 1024) {
        throw new Error('Audio file size must be less than 5MB');
      }
      const uploadResult = await uploadToCloudflareR2(audioFile, 'story-audio');
      musicUrl = uploadResult.url;
    }

    // ✅ final safety normalization
    if (Array.isArray(mediaMeta)) {
      mediaMeta = mediaMeta.map((m: any) => ({
        ...m,
        thumb: m?.thumb || '',
        feed: m?.feed || m?.full || m?.thumb || '',
        full: m?.feed || m?.full || m?.thumb || '', // ✅ full always feed
        type: m?.type || mediaType,
      }));
    }
    
    const payload = {
      user_id: currentUser.id,
      type: mediaType,
      text_content: storyData.text_content?.trim() || null,
      media_url: mediaUrl || null,
      media_urls: mediaUrls || null,
      media_types: mediaTypes || null,
      media_meta: mediaMeta || null,
      background_style: storyData.background_style || null,
      music_url: musicUrl || null,
      music_title: storyData.music_title || null,
      created_at: new Date().toISOString(),
    };
    
    const data = await apiFetch('/api/stories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    const newStory = normalizeStory(data?.story ?? data, currentUser);
    newStory.user = currentUser;
    newStory.author_name = currentUser.name;
    newStory.author_username = currentUser.username;
    newStory.author_image = currentUser.profile_image_url;

    // ✅ keep full = feed after response too
    if (Array.isArray((newStory as any).media_meta)) {
      (newStory as any).media_meta = (newStory as any).media_meta.map((m: any) => ({
        ...m,
        thumb: m?.thumb || '',
        feed: m?.feed || m?.full || m?.thumb || '',
        full: m?.feed || m?.full || m?.thumb || '',
        type: m?.type || newStory.type || 'image',
      }));
    }
    
    setStories(prev => [newStory, ...safeArray(prev)]);
    
    try {
      const cached = readStoriesCache();
      const updatedCache = [newStory, ...safeArray(cached?.stories)];
      writeStoriesCache(updatedCache);
    } catch (error) {
      console.warn('Failed to update stories cache:', error);
    }
    
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
    toast.innerText = 'Story posted successfully!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    
    return newStory;
  } catch (error: any) {
    console.error('Failed to create story:', error);
    setLoginError(error?.message || 'Failed to create story');
    
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
    toast.innerText = error?.message || 'Failed to create story';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
    
    throw error;
  } finally {
    setStoryCreateLoading(false);
  }
}, [currentUser, requireAuth, setStories, setShowCreateStoryModal]);
  
  useEffect(() => {
    if (!authHydrated) return;

    if (currentUser?.id) {
      fetchMyTotalPlays(Number(currentUser.id)).catch(() => {});
    } else {
      setMyTotalPlays(0);
    }
  }, [authHydrated, currentUser?.id, fetchMyTotalPlays]);

  const onPlayTrack = useCallback((track: AudioTrack) => {
    const trackWithCover = {
      ...track,
      cover: track.cover && 
             track.cover.trim() !== '' && 
             track.cover.startsWith('http')
             ? track.cover
             : DEFAULT_MUSIC_COVER
    };

    setCurrentAudioTrack(trackWithCover);
    setIsAudioPlaying(true);

    setPlayHistory(prev => {
      const last = prev[0];
      if (last && last.type === track.type && String(last.id) === String(track.id)) return prev;
      return [trackWithCover, ...prev].slice(0, 50);
    });
  }, []);

  const onTogglePlay = useCallback(() => {
    setIsAudioPlaying(p => !p);
  }, []);

  const onClosePlayer = useCallback(() => {
    setIsAudioPlaying(false);
    setCurrentAudioTrack(null);
  }, []);

  const onNext = useCallback(() => {
    setPlayHistory(prev => {
      if (prev.length < 2) return prev;
      const next = prev[1];
      const nextWithCover = {
        ...next,
        cover: next.cover && 
               next.cover.trim() !== '' && 
               next.cover.startsWith('http')
               ? next.cover
               : DEFAULT_MUSIC_COVER
      };
      setCurrentAudioTrack(nextWithCover);
      setIsAudioPlaying(true);
      return [nextWithCover, ...prev.filter((_, i) => i !== 1)].slice(0, 50);
    });
  }, []);

  const onPrevious = useCallback(() => {
    setPlayHistory(prev => {
      if (prev.length < 2) return prev;
      const prevTrack = prev[1];
      const prevTrackWithCover = {
        ...prevTrack,
        cover: prevTrack.cover && 
               prevTrack.cover.trim() !== '' && 
               prevTrack.cover.startsWith('http')
               ? prevTrack.cover
               : DEFAULT_MUSIC_COVER
      };
      setCurrentAudioTrack(prevTrackWithCover);
      setIsAudioPlaying(true);
      return [prevTrackWithCover, ...prev.filter((_, i) => i !== 1)].slice(0, 50);
    });
  }, []);

  const onStarted = useCallback(async (track: AudioTrack) => {
    try {
      setPlaysLoading(true);

      const userId = (currentUser as any)?.id ?? null;

      if (userId) {
        setMyTotalPlays(p => p + 1);
        
        const key = `unera_my_total_plays_${Number(userId)}`;
        const current = Number(localStorage.getItem(key) || '0');
        localStorage.setItem(key, String(current + 1));
      }

      const res = await recordPlay(track, userId);

      const newPlays = Number(res?.plays_count ?? res?.plays ?? res?.count ?? 0);

      const key = `${track.type}:${String(track.id)}`;
      if (Number.isFinite(newPlays) && newPlays > 0) {
        setTrackPlays(prev => ({ ...prev, [key]: newPlays }));
      } else {
        setTrackPlays(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
      }
    } catch (e) {
      const key = `${track.type}:${String(track.id)}`;
      setTrackPlays(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    } finally {
      setPlaysLoading(false);
    }
  }, [currentUser]);

  const handleMusicSystemLikeSync = useCallback((key: string, liked: boolean) => {
    setLikedTracks(prev => {
      const has = prev.includes(key);
      if (liked && !has) return [...prev, key];
      if (!liked && has) return prev.filter(x => x !== key);
      return prev;
    });
  }, []);

  const isPlayerLiked = useMemo(() => {
    if (!currentAudioTrack) return false;
    return likedTracks.includes(`${currentAudioTrack.type}:${String(currentAudioTrack.id)}`);
  }, [currentAudioTrack, likedTracks]);

  // Push More function
  const pushMore = async (postId: number) => {
    if (!requireAuth('Boosting posts')) return;
    if (!currentUser) return;

    try {
      const selectedPost = posts.find(p => p.id === postId);
      
      if (!selectedPost) {
        throw new Error('Post not found');
      }

      setSelectedPostForAd(selectedPost);
      
      navigateTo('ads');
      setActiveAdTab('create');
      
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
      toast.innerText = 'Opening ad creator...';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
      
    } catch (err) {
      console.error('Push more failed', err);
      
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
      toast.innerText = 'Failed to open ad creator';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
  };

// Navigation function with history tracking + React Router
const navigateTo = useCallback((target: View) => {
  setView(prevView => {
    if (prevView === target) return prevView;
    
    setNavigationHistory(prev => [...prev, prevView]);
    return target;
  });
  
  // Update URL using React Router
  switch(target) {
    case 'home':
      navigate('/');
      setActiveTab('home');
      break;
    case 'reels':
      navigate('/reels');
      setActiveTab('reels');
      break;
    case 'marketplace':
      navigate('/marketplace');
      setActiveTab('marketplace');
      break;
    case 'groups':
      navigate('/groups');
      setActiveTab('groups');
      break;
    case 'music':
      navigate('/music');
      setActiveTab('music');
      break;
    case 'events':
      navigate('/events');
      setActiveTab('events');
      break;
    case 'brands':
      navigate('/brands');
      setActiveTab('brands');
      break;
    case 'privacy':
      navigate('/privacy');
      break;
    case 'terms':
      navigate('/terms');
      break;
    case 'settings':
      navigate('/settings');
      break;
    case 'help':
      navigate('/help');
      break;
    case 'notifications':
      navigate('/notifications');
      break;
    case 'messages':
      navigate('/messages');
      break;
    case 'profile':
      if (currentUser) {
        navigate(`/@${currentUser.username}`);
      }
      break;
    case 'tools':
      navigate('/tools');
      break;
    case 'ads':
      navigate('/ads');
      break;
    case 'birthdays':
      navigate('/birthdays');
      break;
    case 'memories':
      navigate('/memories');
      break;
    case 'profiles':
      navigate('/profiles');
      break;
    case 'story-feed':
      navigate('/story-feed');
      break;
    case 'saved-posts':
    case 'saved':
      navigate('/saved');
      break;
    default:
      navigate('/');
  }
  
  window.scrollTo(0, 0);
}, [navigate, currentUser]);

  const handleOpenStoryFromFeed = useCallback((storyOrId: Story | number) => {
    const id = typeof storyOrId === 'number' ? storyOrId : Number(storyOrId?.id);
    navigateTo('story-feed');
    if (id) {
      setFocusedStoryId(id);
    }
    openStoryViewer(storyOrId);
  }, [navigateTo, openStoryViewer]);
  
                     
      


  // Back navigation function
  const goBack = useCallback(() => {
    setNavigationHistory(prev => {
      if (prev.length === 0) {
        setView('home');
        setActiveTab('home');
        return ['home'];
      }
      
      const newHistory = [...prev];
      const previousView = newHistory.pop() as View;
      
      setView(previousView);
      if (['home', 'reels', 'marketplace', 'groups', 'brands', 'music', 'events'].includes(previousView)) {
        setActiveTab(previousView as any);
      }
      
      return newHistory;
    });
    
    window.scrollTo(0, 0);
  }, []);

  // ADVERTISING SYSTEM FUNCTIONS
  const fetchMyAds = useCallback(async () => {
    if (!currentUser) return;
    
    setAdsLoading(true);
    try {
      const data = await apiFetch('/api/ads/my', {
        headers: {
          'x-user-id': String(currentUser.id)
        }
      }).catch(() => ({ ads: [] }));
      
      const campaigns = (data?.ads || []).map((ad: any) => {
        const impressions = Number(ad.analytics?.impressions ?? ad.impressions ?? 0);
        const clicks = Number(ad.analytics?.clicks ?? ad.clicks ?? 0);
        const views = Number(ad.analytics?.views ?? ad.views ?? 0);
        const spend = Number(ad.analytics?.spend ?? ad.spent ?? ad.budget ?? 0);
        const ctr = Number(ad.ctr ?? (impressions > 0 ? clicks / impressions : 0));
        const mediaUrls = Array.isArray(ad.media_urls) ? ad.media_urls : (ad.media_url ? [ad.media_url] : []);
        const mediaUrl = ad.mediaUrl || ad.media_url || (mediaUrls.length > 0 ? mediaUrls[0] : '');

        return {
          ...ad,
          id: Number(ad.id),
          advertiser_id: Number(ad.advertiser_id || currentUser.id),
          post_id: ad.post_id ? Number(ad.post_id) : undefined,
          name: ad.name || ad.campaign_name || `Campaign #${ad.id}`,
          type: (ad.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          mediaUrl,
          media_urls: mediaUrls,
          media_types: Array.isArray(ad.media_types) ? ad.media_types : [],
          description: ad.description || '',
          link: ad.destination_url || ad.link || '',
          cta: (ad.cta_button || ad.cta || 'Learn More') as any,
          location: ad.target_location || ad.location || 'Global',
          days: ad.days || (ad.start_date && ad.end_date ? Math.max(1, Math.ceil((new Date(ad.end_date).getTime() - new Date(ad.start_date).getTime()) / (1000 * 60 * 60 * 24))) : 7),
          createdAt: ad.createdAt || (ad.created_at ? new Date(ad.created_at).getTime() : Date.now()),
          status: ad.status || 'active',
          analytics: {
            impressions,
            clicks,
            views,
            spend,
          },
          impressions,
          clicks,
          views,
          spent: spend,
          ctr,
          start_date: ad.start_date,
          end_date: ad.end_date,
          budget: Number(ad.budget || 0)
        };
      });
      
      setAdCampaigns(campaigns);
    } catch {
      setAdCampaigns([]);
    } finally {
      setAdsLoading(false);
    }
  }, [currentUser]);

  // Create new ad campaign
  const createAdCampaign = useCallback(async (
    postId: number,
    campaignData: {
      name: string;
      link?: string;
      phone?: string;
      email?: string;
      cta: string;
      location: string;
      budget: number;
      days: number;
    }
  ) => {
    if (!requireAuth('Creating ads')) return false;
    if (!currentUser) return false;

    try {
      const response = await fetch('/api/ads/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id)
        },
        body: JSON.stringify({
          post_id: postId,
          ...campaignData
        })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchMyAds();
        
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
        toast.innerText = 'Campaign created successfully!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to create campaign:', error);
      
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-fade-in z-[300]';
      toast.innerText = 'Failed to create campaign';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
      
      return false;
    }
  }, [currentUser, requireAuth, fetchMyAds]);

  // Pause campaign
  const pauseCampaign = useCallback(async (adId: number) => {
    if (!requireAuth('Pausing campaigns')) return false;
    if (!currentUser) return false;

    try {
      const response = await fetch('/api/ads/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id)
        },
        body: JSON.stringify({
          ad_id: adId,
          action: 'pause'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchMyAds();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to pause campaign:', error);
      return false;
    }
  }, [currentUser, requireAuth, fetchMyAds]);

  // Resume campaign
  const resumeCampaign = useCallback(async (adId: number) => {
    if (!requireAuth('Resuming campaigns')) return false;
    if (!currentUser) return false;

    try {
      const response = await fetch('/api/ads/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id)
        },
        body: JSON.stringify({
          ad_id: adId,
          action: 'resume'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchMyAds();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to resume campaign:', error);
      return false;
    }
  }, [currentUser, requireAuth, fetchMyAds]);

  // Delete campaign
  const deleteCampaign = useCallback(async (adId: number) => {
    if (!requireAuth('Deleting campaigns')) return false;
    if (!currentUser) return false;

    try {
      const response = await fetch('/api/ads/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id)
        },
        body: JSON.stringify({
          ad_id: adId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        await fetchMyAds();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      return false;
    }
  }, [currentUser, requireAuth, fetchMyAds]);

  // Helper to create marketplace feed items (local feed only, product lives in products table)
  const createMarketplacePost = useCallback(
    (product: any) => {
      if (!currentUser || !product) return null;

      const variants = safeImageVariants(product.image_variants);
      const images: string[] = safeArray<string>(product.images);
      
      const mediaMeta = variants.length > 0 
        ? variants.map((v) => ({
            thumb: v.thumb || v.feed,
            feed: v.feed,
            full: v.feed, // keep full = feed
            type: 'image',
          }))
        : images.map((url) => ({
            thumb: url,
            feed: url,
            full: url,
            type: 'image',
          }));
      
      const media_urls = variants.length > 0 
        ? variants.map((v) => v.feed).filter(Boolean) 
        : images;
      
      const media_url = media_urls[0] || '';
      const media_type = media_url ? 'image' : null;
      const price = product.discount_price ?? product.main_price ?? null;
      const currency = product.currency_symbol || 'TZS';
      const location = product.address || '';
      const productId = Number(product.id);

      const productPost = normalizePost({
        id: productId,
        product_id: productId,
        feed_key: `product:${productId}`,
        user_id: currentUser.id,
        seller_id: currentUser.id,
        owner_id: currentUser.id,
        owner_field: 'seller_id',
        username: currentUser.username,
        name: currentUser.name || currentUser.username,
        profile_image_url: currentUser.profile_image_url,
        is_verified: currentUser.is_verified,
        role: currentUser.role || 'user',
        title: product.title || '',
        content: product.title || '',
        description: product.description || '',
        price,
        main_price: product.main_price,
        discount_price: product.discount_price,
        currency,
        location,
        address: location,
        visibility: 'public',
        type: 'marketplace',
        post_type: 'product',
        item_type: 'product',
        kind: 'product',
        source: 'product',
        media_url,
        media_type,
        images: media_urls,
        media_urls,
        media_types: media_urls.map(() => 'image'),
        image_variants: mediaMeta,
        media_meta: mediaMeta,
        comments_count: 0,
        reactions_count: 0,
        shares: 0,
        views: 0,
        created_at: product.created_at || new Date().toISOString(),
        meta: {
          kind: 'product',
          type: 'product',
          product_id: productId,
          title: product.title,
          description: product.description,
          price,
          currency,
          location,
          images: media_urls,
          image_variants: mediaMeta,
          marketplace: {
            id: productId,
            product_id: productId,
            price,
            currency,
            location,
            title: product.title,
            images: media_urls,
            image_variants: mediaMeta,
          },
        },
      });

      setPosts(prev => {
        const filtered = safeArray(prev).filter((p: any) => 
          p?.feed_key !== `product:${productId}` &&
          !(Number(p?.product_id) === productId) &&
          !(Number(p?.id) === productId && (p?.type === 'marketplace' || p?.item_type === 'product'))
        );
        const next = [productPost, ...filtered];
        lastGoodPostsRef.current = next;
        return next;
      });

      setExtraFeedItems(prev => safeArray(prev).filter((item: any) => {
        const p = item?.data || item;
        return (
          p?.feed_key !== `product:${productId}` &&
          !(Number(p?.product_id) === productId) &&
          !(Number(p?.id) === productId && (p?.type === 'marketplace' || p?.item_type === 'product'))
        );
      }));

      if (Number(currentUser.id) === Number(selectedUserId)) {
        setProfilePosts(prev => {
          const filtered = safeArray(prev).filter((p: any) => 
            p?.feed_key !== `product:${productId}` &&
            !(Number(p?.product_id) === productId) &&
            !(Number(p?.id) === productId && (p?.type === 'marketplace' || p?.item_type === 'product'))
          );
          return [productPost, ...filtered];
        });
      }

      triggerSilentRefreshRef.current?.();

      return productPost;
    },
    [currentUser, selectedUserId]
  );

  const createProduct = useCallback(async (productData: any) => {
    if (!requireAuth("Creating products")) return;
    if (!currentUser) return;

    const payload = { ...productData, seller_id: currentUser.id };

    const tempId = Date.now();
    const optimistic = normalizeProduct({
      ...payload,
      id: tempId,
      seller_name: currentUser.name,
      seller_avatar: currentUser.profile_image_url,
      seller_id: currentUser.id,
    });

    setProducts(prev => [optimistic, ...safeArray(prev)]);

    try {
      const res = await apiFetch("/api/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdProduct = normalizeProduct(res?.product ?? res);
      
      setProducts(prev => {
        const filtered = safeArray(prev).filter((x: any) => Number(x.id) !== Number(tempId));
        return [createdProduct, ...filtered];
      });

      createMarketplacePost(createdProduct);
      
      return createdProduct;
    } catch (e: any) {
      setProducts(prev => safeArray(prev).filter((x: any) => Number(x.id) !== Number(tempId)));
      setLoginError(e?.message || "Failed to create product");
      throw e;
    }
  }, [currentUser, requireAuth, createMarketplacePost]);

  const roleOf = (u: any) => String(u?.role || '').trim().toLowerCase();
  const isAdmin = (u: any) => roleOf(u) === 'admin';
  const isModerator = (u: any) => roleOf(u) === 'moderator';

  const requireAdmin = useCallback((action = 'This action') => {
    if (!requireAuth(action)) return false;
    if (!isAdmin(currentUser)) {
      setLoginError(`${action} requires admin.`);
      return false;
    }
    return true;
  }, [requireAuth, currentUser]);

  const requireModOrAdmin = useCallback((action = 'This action') => {
    if (!requireAuth(action)) return false;
    if (!(isAdmin(currentUser) || isModerator(currentUser))) {
      setLoginError(`${action} requires moderator or admin.`);
      return false;
    }
    return true;
  }, [requireAuth, currentUser]);

  const openProfile = useCallback((id: number) => {
    const numId = Number(id);
    if (!numId) return;
    setSelectedUserId(numId);
    
    // Check if user is in users list; if in PYMK suggestions, pre-seed immediately
    const existsInUsers = users.some(u => Number(u.id) === numId);
    if (!existsInUsers) {
      const pymk = peopleYouMayKnow.find(u => Number(u.id) === numId);
      if (pymk) {
        const seededUser: User = {
          id: pymk.id,
          name: pymk.name,
          username: pymk.username,
          profile_image_url: pymk.profile_image_url,
          is_verified: pymk.is_verified,
          role: (pymk.role as any) || 'user',
          bio: '',
          work: '',
          location: '',
          education: '',
          website: '',
          followers: [],
          following: [],
          is_online: false,
        };
        setUsers(prev => {
          const map = new Map<number, User>();
          prev.forEach(u => map.set(Number(u.id), u));
          map.set(Number(seededUser.id), seededUser);
          return Array.from(map.values());
        });
      }

      // Also fetch full user details from API
      apiFetch(`/api/users?id=${numId}`).then((fresh) => {
        if (fresh && fresh.id) {
          const normalized = normalizeUser(fresh);
          setUsers(prev => {
            const map = new Map<number, User>();
            prev.forEach(u => map.set(Number(u.id), u));
            map.set(Number(normalized.id), normalized);
            return Array.from(map.values());
          });
        }
      }).catch(() => {});
    }

    navigateTo('profile');
    window.scrollTo(0, 0);
  }, [navigateTo, users, peopleYouMayKnow]);

  const handleOpenChat = useCallback((recipient: User) => {
    if (!requireAuth('Messaging')) return;
    
    if (isChatsListOpen) {
      setIsChatsListOpen(false);
    }
    
    if (activeChatUser?.id === recipient.id) {
      setIsChatOpen(prev => !prev);
    } else {
      setActiveChatUser(recipient);
      setIsChatOpen(true);
    }
  }, [activeChatUser?.id, requireAuth, isChatsListOpen]);

  const handleOpenChatsList = useCallback(() => {
    if (!requireAuth('Messages')) return;
    
    if (isChatOpen) {
      setIsChatOpen(false);
    }
    
    setIsChatsListOpen(prev => !prev);
  }, [requireAuth, isChatOpen]);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  const handleCloseChatsList = useCallback(() => {
    setIsChatsListOpen(false);
  }, []);

  const handleSendMessage = useCallback(async (text: string, sticker?: string) => {
    if (!currentUser || !activeChatUser) return;
    
    try {
      await apiFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: activeChatUser.id,
          text_content: text,
          sticker: sticker
        }),
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, [currentUser, activeChatUser]);

  const handleOpenChatWithProduct = useCallback(async (recipient: User, product: Product) => {
    if (!requireAuth('Messaging')) return;
    if (!currentUser) return;

    if (Number(currentUser.id) === Number((product as any)?.seller_id || recipient.id)) {
      alert('This is your own product listing.');
      return;
    }

    setActiveProduct(null);
    if (isChatsListOpen) {
      setIsChatsListOpen(false);
    }

    setActiveChatUser(recipient);
    setIsChatOpen(true);

    const pTitle = (product as any)?.title || 'Product';
    const pId = (product as any)?.id;
    const inquiryText = `${pTitle}: Hello, I am interested in this product. Is it still available?${pId ? ` [product:${pId}]` : ''}`;

    try {
      await apiFetch('/api/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: recipient.id,
          text_content: inquiryText,
        }),
      });
      window.dispatchEvent(new CustomEvent('new_message_sent', {
        detail: { recipient_id: recipient.id, text_content: inquiryText }
      }));
    } catch (error) {
      console.error('Failed to send product inquiry:', error);
    }
  }, [currentUser, requireAuth, isChatsListOpen]);

  const handleOpenProductById = useCallback(async (productId: number) => {
    setIsChatOpen(false);
    setIsChatsListOpen(false);

    let prod = products.find((p) => Number(p.id) === Number(productId));
    if (!prod) {
      try {
        const res = await apiFetch(`/api/products?id=${productId}`);
        if (res?.product) {
          prod = normalizeProduct(res.product);
          setProducts((prev) => [prod, ...safeArray(prev)]);
        }
      } catch (err) {
        console.error('Failed to load product for viewing:', err);
      }
    }

    if (prod) {
      navigateTo('marketplace');
      setActiveProduct(prod);
    }
  }, [products, navigateTo]);

  const fetchUsersList = useCallback(async () => {
    if (usersInFlightRef.current) return;
    usersInFlightRef.current = true;
    
    try {
      const u = await apiFetch('/api/users').catch(() => []);
      const newUsers = safeArray(u).map(normalizeUser);
      
      setUsers(prev => {
        const map = new Map<number, User>();
        safeArray(prev).forEach(user => map.set(Number(user.id), user));
        
        newUsers.forEach(newUser => {
          const id = Number(newUser.id);
          if (!id) return;
          
          const existing = map.get(id);
          if (existing) {
            map.set(id, normalizeUser(mergeUserSafe(existing, newUser)));
          } else {
            map.set(id, normalizeUser(newUser));
          }
        });
        
        return Array.from(map.values());
      });

      // Synchronize currentUser with fresh user data from database (especially admin/moderator role)
      try {
        const rawUser = localStorage.getItem(LS_USER_KEY);
        const myId = Number(JSON.parse(rawUser || '{}')?.id || 0);
        if (myId) {
          const freshCurrent = newUsers.find((u) => Number(u.id) === myId);
          if (freshCurrent) {
            setCurrentUser((prev) => (prev ? normalizeUser({ ...prev, ...freshCurrent }) : prev));
            const saved = rawUser ? JSON.parse(rawUser) : {};
            localStorage.setItem(LS_USER_KEY, JSON.stringify(normalizeUser({ ...saved, ...freshCurrent })));
          }
        }
      } catch {}
    } catch {
    } finally {
      usersInFlightRef.current = false;
    }
  }, []);
  

  // fetchReels
  const fetchReels = useCallback(async () => {
    if (reelsInFlightRef.current) return;
    reelsInFlightRef.current = true;
    const requestId = ++reelsRequestIdRef.current;
    
    try {
      const [data, postsData] = await Promise.all([
        apiFetch('/api/reels').catch(() => []),
        apiFetch('/api/posts').catch(() => []),
      ]);
      const reelsList = safeArray(data?.reels ?? data);
      const postsList = safeArray(postsData?.posts ?? postsData);
      
      const normalizedReels = reelsList.map((reel: any) => {
        const normalized = normalizeReel(reel);
        const author = users.find((u) => Number(u.id) === Number(normalized.userId));
        return {
          ...normalized,
          author: author?.name || normalized.author || normalized.author_name || 'User',
          author_name: author?.name || normalized.author_name || normalized.author || 'User',
          avatar: author?.profile_image_url || normalized.avatar || '',
          avatar_url: author?.profile_image_url || normalized.avatar_url || normalized.avatar || '',
          verified: author?.is_verified || normalized.verified || false,
          audioUrl: toFetchableAudioUrl(normalized.audioUrl),
          audio_url: toFetchableAudioUrl(normalized.audio_url),
          videoUrl: normalized.video_url_medium || normalized.video_url || normalized.video_url_low || '',
          video_url: normalized.video_url_medium || normalized.video_url || normalized.video_url_low || '',
        };
      });

      // Extract all videos from posts.ts so every video in posts is shown
      postsList.forEach((post: any) => {
        const rawMedia = Array.isArray(post?.media) ? post.media : (Array.isArray(post?.media_meta) ? post.media_meta : []);
        const vFromMedia = rawMedia.find((m: any) => m?.type === 'video')?.feed || rawMedia.find((m: any) => m?.type === 'video')?.url;
        const vUrl =
          post?.video_url ||
          vFromMedia ||
          (post?.media_type === 'video' ? post?.feed_url || post?.media_url : null) ||
          (typeof post?.feed_url === 'string' && post.feed_url.match(/\.(mp4|webm|mov|m4v)/i) ? post.feed_url : null) ||
          (typeof post?.media_url === 'string' && post.media_url.match(/\.(mp4|webm|mov|m4v)/i) ? post.media_url : null);

        if (vUrl) {
          const alreadyExists = normalizedReels.some(
            (r: any) => (r.videoUrl || r.video_url) === vUrl || String(r.id) === String(post.id)
          );
          if (!alreadyExists) {
            const author = users.find((u) => Number(u.id) === Number(post.user_id)) || post.user || post.author;
            const reelCommentsCount = safeNumber(
              post.comments_count ??
              post.comment_count ??
              post.commentsCount ??
              (Array.isArray(post.comments) ? post.comments.length : 0),
              0
            );
            const reelSharesCount = safeNumber(
              post.shares_count ??
              post.shares ??
              post.sharesCount ??
              0,
              0
            );
            const reelReactionCount = safeNumber(
              post.reactions_count ??
              post.reactionsCount ??
              post.likesCount ??
              post.likes_count ??
              (Array.isArray(post.reactions) ? post.reactions.length : (Array.isArray(post.reactions_preview) ? post.reactions_preview.length : 0)),
              0
            );

            normalizedReels.push({
              id: Number(post.id) || Date.now(),
              userId: Number(post.user_id) || 0,
              user_id: Number(post.user_id) || 0,
              author: author?.name || 'User',
              author_name: author?.name || 'User',
              avatar: author?.profile_image_url || '',
              avatar_url: author?.profile_image_url || '',
              verified: Boolean(author?.is_verified),
              videoUrl: vUrl,
              video_url: vUrl,
              video_url_medium: vUrl,
              video_url_low: vUrl,
              thumbnail_url: post.thumb_url || rawMedia[0]?.thumb || '',
              caption: post.content || '',
              content: post.content || '',
              likes_count: reelReactionCount,
              likesCount: reelReactionCount,
              reactions_count: reelReactionCount,
              reactionsCount: reelReactionCount,
              comments_count: reelCommentsCount,
              comment_count: reelCommentsCount,
              commentsCount: reelCommentsCount,
              comments: Array.isArray(post.comments) ? post.comments : [],
              shares_count: reelSharesCount,
              shares: reelSharesCount,
              sharesCount: reelSharesCount,
              reactions: Array.isArray(post.reactions) ? post.reactions : [],
              reactions_preview: Array.isArray(post.reactions_preview) ? post.reactions_preview : [],
              reactor_name: post.reactor_name || post.reactorName || '',
              my_reaction: post.my_reaction || post.myReaction || null,
              myReaction: post.my_reaction || post.myReaction || null,
              views: post.views || 0,
              created_at: post.created_at || new Date().toISOString(),
              source: 'post',
            } as any);
          }
        }
      });
      
      if (!isMountedRef.current) return;
      if (requestId !== reelsRequestIdRef.current) return;
      
      setReels(normalizedReels);
    } catch {
      if (!isMountedRef.current) return;
      if (requestId !== reelsRequestIdRef.current) return;
      setReels([]);
    } finally {
      if (requestId === reelsRequestIdRef.current) {
        reelsInFlightRef.current = false;
      }
    }
  }, [users]);

  const generateSoundKey = useCallback((reelData: any, selectedReelSound: ReelSound | null): string => {
  if (reelData.soundKey) return String(reelData.soundKey);

  // ✅ NEW: prioritize extracted/original audio first
  if (reelData.audioFile && !reelData.originalSoundId) {
    return `original:extracted:${Date.now()}`;
  }

  if (reelData.originalSoundId) {
    return `song:${reelData.originalSoundId}`;
  }

  // keep existing logic
  if (selectedReelSound?.songId) {
    return `song:${selectedReelSound.songId}`;
  }

  if (selectedReelSound?.audioUrl) {
    return `audio:${selectedReelSound.audioUrl}`;
  }

  if (reelData.audioUrl) {
    return `audio:${reelData.audioUrl}`;
  }

  return 'original:none';
}, []);

  
const isVideoLikeAudioUrl = (url?: string) => {
  const u = String(url || '').toLowerCase().split('?')[0];

  return (
    u.endsWith('.mp4') ||
    u.endsWith('.mov') ||
    u.endsWith('.webm') ||
    u.endsWith('.m4v') ||
    u.includes('/uploads/videos/')
  );
};

const remoteUrlToVideoFile = async (url: string): Promise<File> => {
  const res = await fetch(url, { cache: 'force-cache' });

  if (!res.ok) {
    throw new Error('Failed to load original sound video');
  }

  const blob = await res.blob();
  const type = blob.type || 'video/mp4';

  return new File(
    [blob],
    `original-sound-video-${Date.now()}.mp4`,
    { type }
  );
};



  
  //===CREATE REEL FUNCTION ====

const createReel = useCallback(async (
  reelData: Partial<Reel> & {
  videoFile?: File | Blob;
  thumbnailFile?: File | Blob;
  audioFile?: File | Blob;
  originalSoundId?: string | number;
  nativeVideoUrl?: string;
  nativeVideoMeta?: any;

  lyricsText?: string;
  lyricsTheme?: string;
  lyricsEnabled?: boolean;
  descriptionHtml?: string;
}
) => {
  if (!requireAuth('Creating reels')) return;
  if (!currentUser) return;

  console.log("createReel input:", reelData);
  setIsFeedRefreshing(true);

  try {
    let videoUrl = '';
    let videoUrlLow = '';
    let videoUrlMedium = '';
    let videoUrlHd = '';
    let thumbnailUrl = '';
    let mediaMeta: any = null;

    setReelPublishingProgress(5);
    setReelPublishingText('Preparing your reel...');

    const isNativeVideo = !!reelData.nativeVideoUrl;

    if (isNativeVideo) {
      setReelPublishingProgress(20);
      setReelPublishingText('Processing video...');

      videoUrl = String(reelData.nativeVideoUrl || '');
      videoUrlLow = videoUrl;
      videoUrlMedium = videoUrl;
      videoUrlHd = '';

      mediaMeta = reelData.nativeVideoMeta || {
        thumb: videoUrl,
        feed: videoUrl,
        full: videoUrl,
        url: videoUrl,
        type: 'video',
      };

      thumbnailUrl =
        mediaMeta.thumb ||
        mediaMeta.thumbnail ||
        mediaMeta.thumbnail_url ||
        mediaMeta.feed ||
        mediaMeta.full ||
        videoUrl;

      setReelPublishingProgress(35);
      setReelPublishingText('Video ready, preparing...');
    } else if (reelData.videoFile) {
      setReelPublishingProgress(15);
      setReelPublishingText('Uploading video...');

      videoUrlMedium = await ensureR2Url(
        reelData.videoFile,
        'reels',
        `reel-${Date.now()}.mp4`
      );

      videoUrlLow = videoUrlMedium;
      videoUrl = videoUrlMedium;
      videoUrlHd = '';

      setReelPublishingProgress(45);
      setReelPublishingText('Preparing thumbnail...');

      if (reelData.thumbnailFile) {
        thumbnailUrl = await ensureR2Url(
          reelData.thumbnailFile,
          'reels-thumbs',
          `reel-thumb-${Date.now()}.webp`
        );
      }

      if (!videoUrl || !videoUrl.startsWith('http')) {
        throw new Error('Video upload failed');
      }
    } else {
      throw new Error('No video source provided');
    }

    setReelPublishingProgress(60);
    setReelPublishingText('Processing audio track...');

    let audioUrl = '';

    if (reelData.audioFile) {
      audioUrl = await ensureR2Url(
        reelData.audioFile,
        'reel-audio',
        `audio-${Date.now()}.webm`
      );
    } else {
      const candidateAudioUrl =
        reelData.audioUrl ||
        selectedReelSound?.originalUrl ||
        selectedReelSound?.audioUrl ||
        '';

      // ✅ IMPORTANT:
      // Keep original-sound MP4 as audio_url.
      // Do not extract/convert to webm here.
      audioUrl = candidateAudioUrl;
    }

    const soundKey = generateSoundKey(reelData, selectedReelSound);
    const isTrimmedAudio = soundKey.startsWith('trimmed:');

    const audioStart = isTrimmedAudio
      ? 0
      : reelData.audioStart ?? selectedReelSound?.audioStart ?? 0;

    const audioEnd = isTrimmedAudio
      ? 0
      : reelData.audioEnd ?? selectedReelSound?.audioEnd ?? 0;

    setReelPublishingProgress(75);
    setReelPublishingText('Publishing your reel...');

    const payload = {
  user_id: currentUser.id,
  caption: reelData.caption || '',

  video_url: videoUrl,
  video_url_low: videoUrlLow,
  video_url_medium: videoUrlMedium,
  video_url_hd: videoUrlHd,

  thumbnail_url: thumbnailUrl || '',
  media_meta: mediaMeta ? JSON.stringify(mediaMeta) : null,

  song_name:
    reelData.songName ||
    selectedReelSound?.songName ||
    'Original Sound',

  // ✅ For original sound, this may be MP4.
  audio_url: audioUrl,

  audio_start: audioStart,
  audio_end: audioEnd,

  song_id:
    reelData.originalSoundId ||
    selectedReelSound?.songId ||
    null,

  sound_key: soundKey,

  // ✅ IMPORTANT: Recorder.tsx sends camelCase
  // Backend expects snake_case
  lyrics_text:
    (reelData as any).lyrics_text ??
    reelData.lyricsText ??
    '',

  lyrics_theme:
    (reelData as any).lyrics_theme ??
    reelData.lyricsTheme ??
    'karaoke',

  lyrics_enabled:
    (reelData as any).lyrics_enabled !== undefined
      ? ((reelData as any).lyrics_enabled ? 1 : 0)
      : reelData.lyricsEnabled
        ? 1
        : 0,

  description_html:
    (reelData as any).description_html ??
    reelData.descriptionHtml ??
    '',

  visibility: reelData.visibility || 'public',
  location: reelData.location || '',

  views: 0,
  shares: 0,

  filter_id:
    (reelData as any).filterId ||
    (reelData as any).effectId ||
    'none',

  filter_intensity: (reelData as any).filterIntensity ?? 0.75,
};

    console.log("Sending reel to API:", payload);

    const data = await apiFetch('/api/reels', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    setReelPublishingProgress(100);
    setReelPublishingText('Reel posted successfully!');

    const newReel = normalizeReel(data.reel || data);

    newReel.author = currentUser.name;
    newReel.author_name = currentUser.name;
    newReel.avatar = currentUser.profile_image_url;
    newReel.avatar_url = currentUser.profile_image_url;
    newReel.verified = currentUser.is_verified;

    setReels(prev => [newReel, ...safeArray(prev)]);
    setLoginError('Reel posted successfully!');
    setSelectedReelSound(null);
  } catch (error: any) {
    console.error('Failed to create reel:', error);
    setReelPublishingText(error?.message || 'Failed to create reel');
    setReelPublishingProgress(0);
    setLoginError(error?.message || 'Failed to create reel');
    throw error;
  } finally {
    setIsFeedRefreshing(false);
    setShowCreateReelModal(false);
  }
}, [
  currentUser,
  requireAuth,
  selectedReelSound,
  generateSoundKey,
]);



    
  const reactToReel = useCallback(async (reelId: number, type?: ReactionType) => {
    if (!requireAuth('Reacting to reels')) return;
    if (!currentUser) return;

    const reactionType = type || 'love';
    
    setReels(prev => 
      safeArray(prev).map(reel => 
        reel.id === reelId 
          ? applyOptimisticReelReaction(reel, reelId, reactionType, currentUser.id)
          : reel
      )
    );

    setPosts(prev =>
      safeArray(prev).map(post =>
        (post.id === reelId || post.reel_id === reelId)
          ? applyOptimisticReaction(post, getFeedKey(post), reactionType, currentUser.id)
          : post
      )
    );

    try {
      await apiFetch(`/api/posts/${reelId}/react`, {
        method: 'POST',
        body: JSON.stringify({ type: reactionType, user_id: currentUser.id, post_id: reelId }),
      }).catch(async () => {
        return await apiFetch(`/api/reels/${reelId}/react`, {
          method: 'POST',
          body: JSON.stringify({ type: reactionType, user_id: currentUser.id }),
        });
      });
      
    } catch (error) {
      console.error('Failed to react to reel:', error);
      fetchReels().catch(() => {});
    }
  }, [currentUser, requireAuth, fetchReels]);

  const commentOnReel = useCallback(async (
    reelId: number,
    payload: {
      text: string;
      parentId?: number | null;
      imageFile?: File | null;
    }
  ) => {
    if (!requireAuth('Commenting on reels')) return;
    if (!currentUser) return;
    
    if (!payload.text?.trim() && !payload.imageFile) {
      setLoginError('Comment cannot be empty');
      return;
    }

    try {
      let image_url = '';

      if (payload.imageFile) {
        image_url = await ensureR2Url(
          payload.imageFile,
          'reel-comments',
          `comment-${Date.now()}.jpg`
        );
      }

      const data = await apiFetch(`/api/reel-comments`, {
        method: 'POST',
        body: JSON.stringify({
          reel_id: reelId,
          user_id: currentUser.id,
          text: payload.text || '',
          parent_comment_id: payload.parentId ?? null,
          image_url: image_url || '',
        }),
      });

      const createdComment = {
        ...(data?.comment || {}),
        id: safeNumber(data?.comment?.id ?? 0),
        reel_id: safeNumber(data?.comment?.reel_id ?? reelId),
        user_id: safeNumber(data?.comment?.user_id ?? currentUser.id),
        parent_comment_id:
          data?.comment?.parent_comment_id == null
            ? null
            : safeNumber(data?.comment?.parent_comment_id ?? 0),
        text: String(data?.comment?.text ?? payload.text ?? ''),
        image_url: data?.comment?.image_url ?? image_url ?? '',
        created_at: data?.comment?.created_at ?? new Date().toISOString(),
      };

      setReels(prev =>
        safeArray(prev).map(reel =>
          reel.id === reelId
            ? {
                ...reel,
                comments: [createdComment, ...safeArray(reel.comments)],
                comments_count: safeNumber(reel.comments_count ?? reel.comments?.length ?? 0) + 1,
              }
            : reel
        )
      );
    } catch (error) {
      console.error('Failed to comment on reel:', error);
      setLoginError('Failed to post comment');
    }
  }, [currentUser, requireAuth]);

  const editCommentOnReel = useCallback(async (
    commentId: number,
    payload: {
      text?: string;
      imageFile?: File | null;
      image_url?: string;
    }
  ) => {
    if (!requireAuth('Editing comments')) return;
    if (!currentUser) return;

    try {
      let image_url = payload.image_url || '';

      if (payload.imageFile) {
        image_url = await ensureR2Url(
          payload.imageFile,
          'reel-comments',
          `comment-edit-${Date.now()}.jpg`
        );
      }

      const data = await apiFetch(`/api/reel-comments`, {
        method: 'PATCH',
        body: JSON.stringify({
          id: commentId,
          user_id: currentUser.id,
          text: payload.text ?? '',
          image_url,
        }),
      });

      const updated = data?.comment || {};

      setReels(prev =>
        safeArray(prev).map(reel => ({
          ...reel,
          comments: safeArray(reel.comments).map((comment: any) =>
            Number(comment.id) === Number(commentId)
              ? {
                  ...comment,
                  ...updated,
                  text: String(updated?.text ?? payload.text ?? comment.text ?? ''),
                  image_url: updated?.image_url ?? image_url ?? comment.image_url ?? '',
                }
              : comment
          ),
        }))
      );
    } catch (error) {
      console.error('Failed to edit comment:', error);
      setLoginError('Failed to edit comment');
    }
  }, [currentUser, requireAuth]);

  const deleteCommentOnReel = useCallback(async (commentId: number) => {
    if (!requireAuth('Deleting comments')) return;
    if (!currentUser) return;

    try {
      await apiFetch(`/api/reel-comments?id=${commentId}&user_id=${currentUser.id}`, {
        method: 'DELETE',
      });

      setReels(prev =>
        safeArray(prev).map(reel => {
          const before = safeArray(reel.comments);
          const filtered = before.filter((comment: any) => {
            const parentId = comment?.parent_comment_id ?? comment?.parentId ?? comment?.parent_id;
            return Number(comment.id) !== Number(commentId) &&
                   Number(parentId) !== Number(commentId);
          });

          const removedCount = before.length - filtered.length;

          return removedCount > 0
            ? {
                ...reel,
                comments: filtered,
                comments_count: Math.max(
                  0,
                  safeNumber(reel.comments_count ?? before.length) - removedCount
                ),
              }
            : reel;
        })
      );
    } catch (error) {
      console.error('Failed to delete comment:', error);
      setLoginError('Failed to delete comment');
    }
  }, [currentUser, requireAuth]);

  const editReel = useCallback(async (
    reelId: number,
    payload: {
      caption?: string;
      visibility?: string;
      location?: string;
      thumbnail_url?: string;
    }
  ) => {
    if (!requireAuth('Editing reels')) return;
    if (!currentUser) return;

    try {
      const data = await apiFetch(`/api/reels/${reelId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          user_id: currentUser.id,
          caption: payload.caption ?? '',
          visibility: payload.visibility ?? 'public',
          location: payload.location ?? '',
          thumbnail_url: payload.thumbnail_url ?? '',
        }),
      });

      const updated = normalizeReel(data?.reel || {});

      setReels(prev =>
        safeArray(prev).map(reel =>
          reel.id === reelId
            ? {
                ...reel,
                ...updated,
                author: reel.author,
                author_name: reel.author_name,
                avatar: reel.avatar,
                verified: reel.verified,
              }
            : reel
        )
      );
    } catch (error) {
      console.error('Failed to edit reel:', error);
      setLoginError('Failed to edit reel');
    }
  }, [currentUser, requireAuth]);

  const deleteReel = useCallback(async (reelId: number) => {
    if (!requireAuth('Deleting reels')) return;
    if (!currentUser) return;

    try {
      await apiFetch(`/api/reels/${reelId}?user_id=${currentUser.id}`, {
        method: 'DELETE',
      });

      setReels(prev => safeArray(prev).filter(reel => Number(reel.id) !== Number(reelId)));
    } catch (error) {
      console.error('Failed to delete reel:', error);
      setLoginError('Failed to delete reel');
    }
  }, [currentUser, requireAuth]);

  const shareReel = useCallback(async (reelId: number, type: 'feed' | 'copy') => {
    if (!requireAuth('Sharing reels')) return;
    if (!currentUser) return;

    try {
      await apiFetch(`/api/posts/${reelId}/share`, {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id, destination: type, post_id: reelId }),
      }).catch(async () => {
        return await apiFetch(`/api/reels/${reelId}/share`, {
          method: 'POST',
          body: JSON.stringify({ user_id: currentUser.id, destination: type }),
        });
      });
      
      setReels(prev => 
        safeArray(prev).map(reel => 
          reel.id === reelId 
            ? { ...reel, shares: (reel.shares || 0) + 1 }
            : reel
        )
      );

      setPosts(prev =>
        safeArray(prev).map(post =>
          (post.id === reelId || post.reel_id === reelId)
            ? { ...post, shares: (post.shares || 0) + 1, shares_count: (post.shares_count || 0) + 1 }
            : post
        )
      );
      
      if (type === 'copy') {
        const reelLink = `${window.location.origin}/reels/${reelId}`;
        try {
          await navigator.clipboard.writeText(reelLink);
          setLoginError('Link copied to clipboard!');
        } catch (err) {
          console.error('Clipboard copy failed:', err);
          setLoginError('Failed to copy link');
        }
      }
      
    } catch (error) {
      console.error('Failed to share reel:', error);
      setLoginError('Failed to share');
    }
  }, [currentUser, requireAuth]);

  const useSoundFromReel = useCallback((soundFromReel: any) => {
    const audioUrlRaw = soundFromReel?.audio_url ?? soundFromReel?.audioUrl ?? '';
    
    if (!audioUrlRaw) return;

    const songName = soundFromReel?.song_name ?? soundFromReel?.songName ?? 'Original Sound';
    const audioStart = safeNumber(soundFromReel?.audio_start ?? soundFromReel?.audioStart ?? 0);
    const audioEnd = safeNumber(soundFromReel?.audio_end ?? soundFromReel?.audioEnd ?? 0);
    const songId = soundFromReel?.song_id ?? soundFromReel?.songId ?? null;
    const soundKey = String(soundFromReel?.sound_key ?? soundFromReel?.soundKey ?? '');

    const isTrimmedAudio = soundKey.startsWith('trimmed:');

    setSelectedReelSound({
      songName,
      audioUrl: soundFromReel?.audio_fetch_url || toFetchableAudioUrl(audioUrlRaw),
      originalUrl: audioUrlRaw,
      audioStart,
      audioEnd,
      songId,
      soundKey,
      isTrimmedAudio,
    });

    setShowCreateReelModal(true);
  }, []);

  const fetchPostsForHome = useCallback(
    async (viewer: User | null) => {
      if (postsInFlightRef.current) return;
      postsInFlightRef.current = true;
      
      setIsFeedRefreshing(true);

      try {
        const seed = getOrCreateSessionSeed(viewer?.id ?? null);
        const seen = getSeenSet();

        if (viewer?.id) {
          const data = await apiFetch(`/api/feeds?userId=${viewer.id}&limit=50`);
          const rows = safeArray<any>(data?.feed);

          if (rows.length > 0) {
            setUsers((prev) => {
              const map = new Map<number, User>();
              safeArray(prev).forEach((u) => map.set(Number(u.id), normalizeUser(u)));

              rows.forEach((r) => {
                const author = authorFromFeedRow(r);
                if (!author?.id) return;
                
                const existing = map.get(author.id);
                if (existing) {
                  map.set(author.id, normalizeUser(mergeUserSafe(existing, author)));
                } else {
                  map.set(author.id, author);
                }
              });

              return Array.from(map.values());
            });

            const normalized = rows.map(normalizeFeedRowToPost);

            const unseen = normalized.filter((p: any) => !seen.has(Number(p.id)));
            const seenOnes = normalized.filter((p: any) => seen.has(Number(p.id)));

            const ordered = diversifyFeed(
              [...seededShuffle(unseen, seed), ...seededShuffle(seenOnes, seed ^ 0xabcddcba)],
              seed
            );

            pushSeenIds(ordered.slice(0, 40).map((p: any) => Number(p.id)));

            setPosts((prev) => {
              const next = mergeFeed(prev, ordered);
              lastGoodPostsRef.current = next;
              stableFeedRef.current = next;
              return next;
            });

            if (!feedHydrated) setFeedHydrated(true);

            if (activeCommentsIdentity != null) {
              const found = ordered.find((p: any) => getFeedKey(p) === activeCommentsIdentity);
              if (found) setCommentPostSnapshot(found);
            }

            return;
          }
        }

        const p = await apiFetch('/api/posts');
        const normalized = safeArray(p?.posts ?? p).map(normalizePost);

        if (normalized.length) {
          const unseen = normalized.filter((x: any) => !seen.has(Number(x.id)));
          const seenOnes = normalized.filter((x: any) => seen.has(Number(x.id)));

          const ordered = diversifyFeed(
            [...seededShuffle(unseen, seed), ...seededShuffle(seenOnes, seed ^ 0xabcddcba)],
            seed
          );

          pushSeenIds(ordered.slice(0, 40).map((x: any) => Number(x.id)));

          setPosts((prev) => {
            const next = mergeFeed(prev, ordered);
            stableFeedRef.current = next;
            lastGoodPostsRef.current = next;
            return next;
          });
        } else if (lastGoodPostsRef.current.length) {
          setPosts(lastGoodPostsRef.current);
        }

        if (!feedHydrated) setFeedHydrated(true);

        if (activeCommentsIdentity != null) {
          const found = normalized.find((x: any) => getFeedKey(x) === activeCommentsIdentity);
          if (found) setCommentPostSnapshot(found);
        }
      } catch {
        if (lastGoodPostsRef.current.length) setPosts(lastGoodPostsRef.current);
        if (!feedHydrated) setFeedHydrated(true);
      } finally {
        setIsFeedRefreshing(false);
        postsInFlightRef.current = false;
      }
    },
    [activeCommentsIdentity, feedHydrated]
  );

  const fetchProfilePosts = useCallback(async (profileUserId: number) => {
    try {
      const viewerId = currentUser?.id ? Number(currentUser.id) : 0;
      const data = await apiFetch(`/api/posts/by-user?userId=${profileUserId}&viewerId=${viewerId}&limit=50`);
      
      const list = safeArray<any>((data as any)?.posts ?? (data as any)?.results ?? data);
      const normalized = list.map(normalizePost);

      normalized.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

      setProfilePosts(prev => {
        const localTruth = [...safeArray(posts), ...safeArray(prev)];
        const map = new Map<number, any>();
        localTruth.forEach((p: any) => map.set(Number(p.id), p));

        return normalized.map((p: any) => {
          const local = map.get(Number(p.id));
          if (!local) return p;

          return {
            ...p,
            my_reaction: p.my_reaction ?? local.my_reaction ?? local.myReaction ?? null,
            myReaction: p.myReaction ?? p.my_reaction ?? local.my_reaction ?? local.myReaction ?? null,
            reactions: Array.isArray(p.reactions) && p.reactions.length ? p.reactions : safeArray(local.reactions),
            reactions_count: safeNumber(p.reactions_count, safeNumber(local.reactions_count, safeNumber(local.likesCount, 0))),
            reactionsCount: safeNumber(p.reactionsCount, safeNumber(local.reactionsCount, safeNumber(local.likesCount, 0))),
            likesCount: safeNumber(p.likesCount, safeNumber(local.likesCount, safeNumber(local.reactions_count, 0))),
          };
        });
      });
    } catch {
    }
  }, [currentUser, posts]);

  const fetchUserFollowDataForUI = useCallback(async (userId: number) => {
    try {
      const followData = await fetchUserFollowData(userId);
      
      setUsers(prev => {
        return prev.map(user => {
          if (Number(user.id) === Number(userId)) {
            return normalizeUser({
              ...user,
              followers: followData.followers,
              following: followData.following
            });
          }
          return user;
        });
      });

      if (currentUser && Number(currentUser.id) === Number(userId)) {
        const updatedCurrentUser = normalizeUser({
          ...currentUser,
          followers: followData.followers,
          following: followData.following
        });
        setCurrentUser(updatedCurrentUser);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedCurrentUser));
      }

      return followData;
    } catch (error) {
      console.error('Failed to fetch follow data for UI:', error);
      return { followers: [], following: [] };
    }
  }, [currentUser]);

  useEffect(() => {
    if (view !== 'profile' || !selectedUserId) return;
    
    fetchUserFollowDataForUI(Number(selectedUserId)).catch(() => {});
  }, [view, selectedUserId, fetchUserFollowDataForUI]);

  useEffect(() => {
    if (!currentUser?.id) return;
    
    fetchUserFollowDataForUI(Number(currentUser.id)).catch(() => {});
  }, [currentUser?.id, fetchUserFollowDataForUI]);

  const scheduleSilentRefresh = useCallback(() => {
    if (scheduleSilentRefreshRef.current) clearTimeout(scheduleSilentRefreshRef.current);
    scheduleSilentRefreshRef.current = setTimeout(() => {
      fetchPostsForHome(currentUser).catch(() => {});
      fetchReels().catch(() => {});
    }, 8000);
  }, [currentUser, fetchPostsForHome, fetchReels]);
  triggerSilentRefreshRef.current = scheduleSilentRefresh;

  // Event Functions
  const fetchEvents = useCallback(async (): Promise<Event[]> => {
    try {
      const data = await apiFetch('/api/events').catch(() => null);
      const list = safeArray(data?.events ?? data);
      if (!list.length && INITIAL_EVENTS.length) {
        return INITIAL_EVENTS.map(normalizeEvent);
      }
      return list.map(normalizeEvent);
    } catch {
      return INITIAL_EVENTS.map(normalizeEvent);
    }
  }, []);

  const onRSVPEvent = useCallback(
    async (eventId: number, status: "going" | "interested" | "not_going") => {
      if (!requireAuth("RSVP to events")) return;
      if (!currentUser) return;

      const meId = Number(currentUser.id);
      const id = Number(eventId);
      if (!id) return;

      setEvents(prev =>
        safeArray(prev).map(ev => {
          const e: any = normalizeEvent(ev);
          if (Number(e.id) !== id) return e;

          const attendees = new Set<number>(safeArray(e.attendees).map(Number));
          const interested = new Set<number>(safeArray(e.interestedIds ?? e.interested_ids).map(Number));

          if (status === "going") {
            attendees.add(meId);
            interested.delete(meId);
          } else if (status === "interested") {
            interested.add(meId);
            attendees.delete(meId);
          } else {
            attendees.delete(meId);
            interested.delete(meId);
          }

          return {
            ...e,
            attendees: Array.from(attendees),
            interestedIds: Array.from(interested),
            user_rsvp_status: status === "not_going" ? "" : status,
          };
        })
      );

      try {
        const foundEvent = safeArray(events).find((ev: any) => Number(ev?.id) === id);
        const isGroupEvent = !!(foundEvent?.group_id || foundEvent?.is_group_event);
        const base = isGroupEvent ? `/api/group-events/${id}` : `/api/events/${id}`;

        if (status === "going") {
          await postJSON(`${base}/attend`, { 
            event_id: id, 
            user_id: meId, 
            action: "attend" 
          });
          
          await postJSON(`${base}/interested`, { 
            event_id: id, 
            user_id: meId, 
            action: "remove" 
          }).catch(() => {});
        } 
        else if (status === "interested") {
          await postJSON(`${base}/interested`, { 
            event_id: id, 
            user_id: meId, 
            action: "interested" 
          });
          
          await postJSON(`${base}/attend`, { 
            event_id: id, 
            user_id: meId, 
            action: "remove" 
          }).catch(() => {});
        } 
        else if (status === "not_going") {
          await postJSON(`${base}/attend`, { 
            event_id: id, 
            user_id: meId, 
            action: "remove" 
          }).catch(() => {});
          
          await postJSON(`${base}/interested`, { 
            event_id: id, 
            user_id: meId, 
            action: "remove" 
          }).catch(() => {});
        }

        const fresh = await fetchEvents().catch(() => []);
        setEvents(fresh);

        return { success: true };
      } catch (err: any) {
        console.error('RSVP failed:', err);
        const fresh = await fetchEvents().catch(() => []);
        setEvents(fresh);
        throw err;
      }
    },
    [currentUser, requireAuth, fetchEvents]
  );

  const joinEvent = useCallback(async (eventId: number) => {
    return onRSVPEvent(eventId, 'going');
  }, [onRSVPEvent]);

  const markEventInterested = useCallback(async (eventId: number) => {
    return onRSVPEvent(eventId, 'interested');
  }, [onRSVPEvent]);

  const createEvent = useCallback(async (eventData: any) => {
    if (!requireAuth('Creating events')) return;
    if (!currentUser) return;

    const uiDate = safeString(eventData?.date ?? '', '');
    const uiTime = safeString(eventData?.time ?? '', '');
    const apiISO = safeString(eventData?.event_date ?? '', '');
    const apiTime = safeString(eventData?.event_time ?? '', '');

    const d = uiDate || toDateOnly(apiISO) || new Date().toISOString().slice(0, 10);
    const t = apiTime || uiTime || '12:00';
    const eventDateISO = new Date(`${d}T${t}:00`).toISOString();

    const cover =
      safeString(eventData?.cover_url ?? eventData?.image ?? eventData?.cover ?? eventData?.cover_image, '') || DEFAULT_EVENT_COVER;

    const eventTitle = safeString(eventData?.title).trim() || 'Event';

    setPostUploadState({
      isUploading: true,
      progress: 20,
      title: `Publishing "${eventTitle}"…`,
      secondaryStatus: 'Preparing event details...',
      previewUrl: cover,
      isSuccess: false,
    });

    const payload = {
      title: eventTitle,
      description: safeString(eventData?.description).trim(),
      event_date: eventDateISO,
      event_time: apiTime || uiTime || '12:00',
      location: safeString(eventData?.location).trim(),
      visibility: safeString(eventData?.visibility, 'worldwide'),
      cover_url: cover,
      image: cover,
      creator_id: Number(currentUser.id),
      creator_name: safeString(currentUser.name),
      creator_avatar: safeString(currentUser.profile_image_url),
      group_id: eventData?.group_id ? Number(eventData.group_id) : null,
    };

    try {
      setPostUploadState((prev) => prev ? ({
        ...prev,
        progress: 55,
        secondaryStatus: 'Registering event with Feathered...',
      }) : null);

      const res = await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(payload) });
      const newEvent = normalizeEvent(res?.event ?? res);
      
      setEvents((prev: any) => [newEvent, ...safeArray(prev)]);

      setPostUploadState((prev) => prev ? ({
        ...prev,
        progress: 85,
        secondaryStatus: 'Displaying event in feed...',
      }) : null);

      try {
        // Build the feed event item with interactive buttons (RSVP Going, Interested), date, time, location, etc.
        // Events are stored exclusively in the events table (/api/events) - NEVER written to the posts table.
        const eventFeedPost = normalizePost({
          id: Number(newEvent.id),
          event_id: Number(newEvent.id),
          feed_key: `event:${newEvent.id}`,
          type: 'event',
          item_type: 'event',
          post_type: 'event',
          kind: 'event',
          source: 'event',
          user_id: Number(currentUser.id),
          creator_id: Number(currentUser.id),
          owner_id: Number(currentUser.id),
          owner_field: 'creator_id',
          username: currentUser.username,
          name: currentUser.name || currentUser.username,
          profile_image_url: currentUser.profile_image_url,
          is_verified: currentUser.is_verified,
          role: currentUser.role || 'user',
          title: newEvent.title,
          content: newEvent.title,
          description: newEvent.description,
          event_description: newEvent.description,
          event_date: newEvent.date || newEvent.event_date,
          event_time: newEvent.time,
          location: newEvent.location,
          cover_url: newEvent.cover_url || cover,
          media_url: newEvent.cover_url || cover,
          media_type: 'image',
          media_urls: (newEvent.cover_url || cover) ? [newEvent.cover_url || cover] : [],
          media_types: (newEvent.cover_url || cover) ? ['image'] : [],
          visibility: newEvent.visibility || 'worldwide',
          attending_count: 0,
          interested_count: 0,
          comments_count: 0,
          reactions_count: 0,
          shares: 0,
          shares_count: 0,
          views: 0,
          my_reaction: null,
          my_rsvp_status: null,
          created_at: (newEvent as any).created_at || new Date().toISOString(),
          updated_at: (newEvent as any).updated_at || null,
          meta: {
            type: 'event',
            kind: 'event',
            event_id: Number(newEvent.id),
            title: newEvent.title,
            description: newEvent.description,
            event_date: newEvent.date || newEvent.event_date,
            location: newEvent.location,
            cover_url: newEvent.cover_url || cover,
            attending_count: 0,
            interested_count: 0,
            event: {
              id: Number(newEvent.id),
              title: newEvent.title,
              description: newEvent.description,
              date: newEvent.date || newEvent.event_date,
              time: newEvent.time,
              location: newEvent.location,
              cover_url: newEvent.cover_url || cover,
              attendees: newEvent.attendees || [],
              interested: newEvent.interestedIds || [],
            }
          }
        });

        setPosts(prev => {
          const next = [eventFeedPost, ...safeArray(prev)];
          lastGoodPostsRef.current = next;
          stableFeedRef.current = next;
          return next;
        });
      } catch (feedErr) {
        console.error('Failed to inject event into local feed:', feedErr);
      }

      setPostUploadState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: true,
        progress: 100,
        title: 'Event published!',
        secondaryStatus: 'Your event is now live for attendees.',
      }) : null);

      setTimeout(() => {
        setPostUploadState(null);
      }, 2800);

      scheduleSilentRefresh();
      return newEvent;
    } catch (error) {
      console.error('Failed to create event:', error);
      setPostUploadState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: false,
        progress: 0,
        title: 'Failed to create event',
        secondaryStatus: (error as any)?.message || 'Something went wrong',
        error: (error as any)?.message,
      }) : null);
      setTimeout(() => {
        setPostUploadState(null);
      }, 4000);
      throw error;
    }
  }, [currentUser, requireAuth, selectedUserId]);

  //====Refresh group members helper


const refreshGroupMembers = useCallback(async (groupId: number) => {
  try {
    const res = await apiFetch(`/api/group-members?group_id=${Number(groupId)}`);
    const members = safeArray((res as any)?.members)
      .map((m: any) => Number(m?.user_id ?? m?.id ?? m))
      .filter(Number.isFinite);

    const meId = currentUser?.id ? Number(currentUser.id) : 0;

    setGroups(prev =>
      prev.map(g => {
        if (Number(g.id) !== Number(groupId)) return g;

        const amMember =
          !!meId &&
          (Number(g.admin_id) === meId || members.includes(meId));

        return {
          ...g,
          members,
          members_count: members.length,
          is_member: amMember,
        };
      })
    );
  } catch (error) {
    console.error('Failed to refresh group members:', error);
  }
}, [currentUser]);

  //===fetch otherdata ===

const fetchOtherData = useCallback(async () => {
  if (otherDataInFlightRef.current) return;
  otherDataInFlightRef.current = true;

  try {
    const [pr, b, c] = await Promise.all([
      apiFetch('/api/products').catch(() => []),
      apiFetch('/api/brands').catch(() => []),
      apiFetch('/api/chats').catch(() => []),
    ]);

    const prRaw = pr;
    const prList =
      Array.isArray(prRaw) ? prRaw :
      Array.isArray((prRaw as any)?.products) ? (prRaw as any).products :
      Array.isArray((prRaw as any)?.data) ? (prRaw as any).data :
      Array.isArray((prRaw as any)?.results) ? (prRaw as any).results :
      Array.isArray((prRaw as any)?.items) ? (prRaw as any).items :
      [];

    setProducts(prList.map(normalizeProduct));
    setBrands(safeArray(b));

    const eventsData = await fetchEvents().catch(() => []);
    setEvents(eventsData);

    setChats(safeArray(c));
  } catch (error) {
    console.error('Failed to fetch other data:', error);
  } finally {
    otherDataInFlightRef.current = false;
  }
}, [fetchEvents]);

              
            
  //===fetch Group for viewers====
            

const fetchGroupsForViewer = useCallback(async () => {
  const viewerId = currentUser?.id ? Number(currentUser.id) : 0;

  try {
    const g = await apiFetch(`/api/groups?viewerId=${viewerId}`).catch(() => []);
    const gRaw = g;
    const gList = Array.isArray(gRaw)
      ? gRaw
      : Array.isArray((gRaw as any)?.groups) ? (gRaw as any).groups
      : Array.isArray((gRaw as any)?.results) ? (gRaw as any).results
      : [];

    setGroups(prev => {
      const byId = new Map(prev.map(g => [Number(g.id), g]));

      return gList.map((ng: any) => {
        const old: any = byId.get(Number(ng.id));

        const hasMembers =
          ng?.members !== undefined &&
          ng?.members !== null &&
          Array.isArray(ng.members);

        const members = hasMembers
          ? ng.members
              .map((m: any) => Number(m?.user_id ?? m?.id ?? m))
              .filter(Number.isFinite)
          : old?.members;

        const members_count = hasMembers
          ? members.length
          : safeNumber(
              ng?.members_count ??
              old?.members_count ??
              old?.members?.length ??
              0
            );

        const rawIsMember = ng?.is_member ?? ng?.isMember;
        const parsedIncomingIsMember =
          rawIsMember === true ||
          rawIsMember === 1 ||
          rawIsMember === "1" ||
          rawIsMember === "true"
            ? true
            : rawIsMember === false ||
              rawIsMember === 0 ||
              rawIsMember === "0" ||
              rawIsMember === "false"
            ? false
            : undefined;

        const is_member =
          parsedIncomingIsMember !== undefined
            ? parsedIncomingIsMember
            : old?.is_member ?? false;

        const category = ng?.category || old?.category || "general";

        return normalizeGroup({
          ...old,
          ...ng,
          members,
          members_count,
          is_member,
          category,
        });
      });
    });
  } catch (error) {
    console.error('Failed to fetch groups for viewer:', error);
  }
}, [currentUser]);
                    

            

  const isGroupMember = useCallback((group: Group): boolean => {
    if (!currentUser) return false;
    
    const meId = Number(currentUser.id);
    
    if (group.admin_id === meId) return true;
    
    if (group.is_member === true) return true;
    if (group.is_member === false) return false;
    
    return Array.isArray(group.members) && group.members.includes(meId);
  }, [currentUser]);

  const fetchGroupPosts = useCallback(async (groupId: number, limit = 15, offset = 0) => {
    try {
      const viewerId = currentUser?.id ? Number(currentUser.id) : 0;
      const res = await apiFetch(`/api/group-posts?group_id=${groupId}&viewerId=${viewerId}&limit=${limit}&offset=${offset}`);
      
      const posts = safeArray((res as any)?.posts ?? res);
      return posts.map(normalizePost);
    } catch (error) {
      console.error('Failed to fetch group posts:', error);
      return [];
    }
  }, [currentUser]);

  const toggleGroupPostLike = useCallback(async (postId: number, type?: ReactionType) => {
    if (!requireAuth("Liking")) return { liked: false, likes_count: 0 };
    const meId = Number(currentUser!.id);
    const reactionType = type || 'like';

    try {
      const res = await apiFetch("/api/group-post-likes", {
        method: "POST",
        body: JSON.stringify({ 
          user_id: meId, 
          post_id: Number(postId),
          type: reactionType 
        })
      });

      return {
        liked: !!(res as any)?.liked,
        likes_count: Number((res as any)?.likes_count || 0),
      };
    } catch (error) {
      console.error('Failed to toggle group post like:', error);
      return { liked: false, likes_count: 0 };
    }
  }, [currentUser, requireAuth]);

  const fetchGroupPostComments = useCallback(async (postId: number) => {
    try {
      const viewerId = currentUser?.id || 0;
      const res = await apiFetch(`/api/group-post-comments?post_id=${Number(postId)}&viewerId=${viewerId}`);
      return safeArray((res as any)?.comments ?? res);
    } catch (error) {
      console.error('Failed to fetch group comments:', error);
      return [];
    }
  }, [currentUser]);

//===CREATE GROUP COMMENT===
            
  const createGroupPostComment = useCallback(async (
    postId: any,
    text: string,
    parent_comment_id?: number | null,
    imageFile?: File | null,
    imageUrl?: string | null
  ) => {
    if (!requireAuth("Commenting")) return;
    const meId = Number(currentUser!.id);
    const targetPostId = Number(
      typeof postId === 'object' && postId !== null
        ? (postId.id ?? postId.post_id ?? postId.postId ?? 0)
        : postId
    );

    if (!targetPostId) {
      console.error('Invalid post id for group comment:', postId);
      return;
    }

    try {
      let finalImageUrl = imageUrl || null;
      if (!finalImageUrl && imageFile) {
        finalImageUrl = await ensureR2Url(
          imageFile,
          'comments',
          `group-comment-${Date.now()}.jpg`
        );
      }

      const res = await apiFetch("/api/group-post-comments", {
        method: "POST",
        body: JSON.stringify({
          user_id: meId,
          post_id: targetPostId,
          text: String(text || "").trim(),
          image_url: finalImageUrl || null,
          parent_comment_id: parent_comment_id ?? null,
        }),
      });

      return res;
    } catch (error) {
      console.error('Failed to create group comment:', error);
      throw error;
    }
  }, [currentUser, requireAuth]);

        //===JOIN GROUP ===
            
const joinGroup = useCallback(async (groupId: number) => {
  if (!requireAuth("Joining groups")) return;
  if (!currentUser) return;

  const meId = Number(currentUser.id);

  // optimistic update in main groups state
  setGroups(prev =>
    prev.map(g => {
      if (Number(g.id) !== Number(groupId)) return g;

      const currentMembers = Array.isArray(g.members) ? g.members : [];
      const nextMembers = currentMembers.includes(meId)
        ? currentMembers
        : [...currentMembers, meId];

      return {
        ...g,
        members: nextMembers,
        members_count: Math.max(Number(g.members_count || 0), nextMembers.length),
        is_member: true,
      };
    })
  );

  try {
    const result = await apiFetch("/api/group-members", {
      method: "POST",
      body: JSON.stringify({
        group_id: Number(groupId),
        user_id: meId,
        role: "member",
      }),
    });

    // hard refresh members after join
    await refreshGroupMembers(groupId);

    // keep joined state durable in main groups state
    setGroups(prev =>
      prev.map(g => {
        if (Number(g.id) !== Number(groupId)) return g;

        const currentMembers = Array.isArray(g.members) ? g.members : [];
        const nextMembers = currentMembers.includes(meId)
          ? currentMembers
          : [...currentMembers, meId];

        return {
          ...g,
          members: nextMembers,
          members_count: Math.max(Number(g.members_count || 0), nextMembers.length),
          is_member: true,
        };
      })
    );

    return result;
  } catch (error) {
    console.error('Failed to join group:', error);

    // rollback
    setGroups(prev =>
      prev.map(g => {
        if (Number(g.id) !== Number(groupId)) return g;

        const currentMembers = Array.isArray(g.members) ? g.members : [];
        const nextMembers = currentMembers.filter(id => id !== meId);

        return {
          ...g,
          members: nextMembers,
          members_count: nextMembers.length,
          is_member: false,
        };
      })
    );

    setLoginError('Failed to join group');
    throw error;
  }
}, [currentUser, requireAuth, refreshGroupMembers]);


  // Join from Groups You May Join
  const joinFromSuggestion = useCallback(async (groupId: number) => {
    const id = Number(groupId);
    if (!id) return;

    setGroupsYouMayJoin(prev =>
      prev.map(g => Number(g.id) === id ? { ...g, is_member: true } : g)
    );

    try {
      await joinGroup(id);
      setGroupsYouMayJoin(prev => prev.filter(g => Number(g.id) !== id));
    } catch (error) {
      console.error("Failed to join from suggestion:", error);
      setGroupsYouMayJoin(prev =>
        prev.map(g => Number(g.id) === id ? { ...g, is_member: false } : g)
      );
    }
  }, [joinGroup]);

   //===LEAVE GROUP ======

const leaveGroup = useCallback(async (groupId: number) => {
  if (!requireAuth("Leaving groups")) return;
  if (!currentUser) return;

  const meId = Number(currentUser.id);

  // optimistic update in main groups state
  setGroups(prev =>
    prev.map(g => {
      if (Number(g.id) !== Number(groupId)) return g;

      const currentMembers = Array.isArray(g.members) ? g.members : [];
      const nextMembers = currentMembers.filter(id => id !== meId);

      return {
        ...g,
        members: nextMembers,
        members_count: nextMembers.length,
        is_member: false,
      };
    })
  );

  try {
    const result = await apiFetch(
      `/api/group-members?group_id=${Number(groupId)}&user_id=${meId}`,
      { method: "DELETE" }
    );

    await refreshGroupMembers(groupId);

    // keep leave state durable in main groups state
    setGroups(prev =>
      prev.map(g => {
        if (Number(g.id) !== Number(groupId)) return g;

        const currentMembers = Array.isArray(g.members) ? g.members : [];
        const nextMembers = currentMembers.filter(id => id !== meId);

        return {
          ...g,
          members: nextMembers,
          members_count: nextMembers.length,
          is_member: false,
        };
      })
    );

    return result;
  } catch (error) {
    console.error('Failed to leave group:', error);

    // rollback
    setGroups(prev =>
      prev.map(g => {
        if (Number(g.id) !== Number(groupId)) return g;

        const currentMembers = Array.isArray(g.members) ? g.members : [];
        const nextMembers = currentMembers.includes(meId)
          ? currentMembers
          : [...currentMembers, meId];

        return {
          ...g,
          members: nextMembers,
          members_count: Math.max(Number(g.members_count || 0), nextMembers.length),
          is_member: true,
        };
      })
    );

    setLoginError('Failed to leave group');
    throw error;
  }
}, [currentUser, requireAuth, refreshGroupMembers]);
    
  //===CREATE GROUP POST =====
            
 const createGroupPost = useCallback(async (
  groupId: number,
  text: string,
  files?: File[] | File | null,
  metadata?: any
) => {
  if (!requireAuth("Posting")) return;
  const meId = Number(currentUser!.id);

  let media_url: string | null = null;
  let media_type: string | null = null;
  let media_urls: string[] = [];
  let media_types: string[] = [];
  let media_meta: any[] = [];

  const fileArray = Array.isArray(files) ? files : (files ? [files] : []);
  const firstFile = fileArray[0];
  let previewUrl: string | undefined;
  if (firstFile && firstFile.type.startsWith('image/')) {
    try { previewUrl = URL.createObjectURL(firstFile); } catch (e) {}
  }

  const targetGroup = groups.find((g: any) => Number(g.id) === Number(groupId));
  const groupName = targetGroup?.name ? `"${targetGroup.name}"` : 'group';

  setPostUploadState({
    isUploading: true,
    progress: 15,
    title: `Posting to ${groupName}…`,
    secondaryStatus: fileArray.length > 0
      ? (fileArray.length > 1 ? `Optimizing ${fileArray.length} photos...` : 'Preparing media attachment...')
      : 'Publishing post to group...',
    previewUrl,
    isSuccess: false,
  });

  if (fileArray.length > 0) {
    try {
      let completedFiles = 0;
      const uploadResults = await Promise.all(
        fileArray.map(async (file) => {
          if (!file.type.startsWith('image/')) {
            throw new Error('Video uploads are disabled in groups. Only photos can be posted.');
          }
          const res = await uploadGroupImageBundle(file);

          completedFiles++;
          const pct = Math.min(85, 20 + Math.round((completedFiles / fileArray.length) * 65));
          setPostUploadState((prev) => prev ? ({
            ...prev,
            progress: pct,
            secondaryStatus: fileArray.length > 1
              ? `Uploaded photo ${completedFiles} of ${fileArray.length}...`
              : 'Photo uploaded. Publishing post...',
          }) : null);

          return res;
        })
      );

      media_meta = uploadResults.map((r) => ({
        thumb: r.thumb,
        feed: r.feed,
        full: r.feed, // group only compress to feed image
        type: 'image',
      }));

      media_urls = uploadResults.map((r) => r.feed).filter(Boolean);
      media_types = uploadResults.map(() => 'image');
      media_url = media_urls[0] || null;
      media_type = 'image';
    } catch (error) {
      console.error('Failed to upload files:', error);
      setPostUploadState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: false,
        progress: 0,
        title: 'Upload failed',
        secondaryStatus: (error as any)?.message || 'Failed to upload files',
        error: (error as any)?.message,
      }) : null);
      setTimeout(() => {
        setPostUploadState(null);
        if (previewUrl) {
          try { URL.revokeObjectURL(previewUrl); } catch (e) {}
        }
      }, 4000);
      throw new Error('Failed to upload files');
    }
  }

  try {
    setPostUploadState((prev) => prev ? ({
      ...prev,
      progress: 90,
      secondaryStatus: 'Publishing post to group...',
    }) : null);

    const payload: any = {
      group_id: Number(groupId),
      user_id: meId,
      content: String(text || "").trim() || null,
      media_url,
      media_type,
    };

    if (media_urls.length > 0) {
      payload.media_urls = media_urls;
      payload.media_types = media_types;
      payload.media_meta = media_meta;
    }

    if (metadata) {
      if (metadata.job_title) payload.job_title = metadata.job_title;
      if (metadata.company) payload.company = metadata.company;
      if (metadata.street) payload.street = metadata.street;
      if (metadata.district) payload.district = metadata.district;
      if (metadata.region) payload.region = metadata.region;
      if (metadata.country) payload.country = metadata.country;
      if (metadata.location) payload.location = metadata.location;
      if (metadata.salary) payload.salary = metadata.salary;
      if (metadata.job_type) payload.job_type = metadata.job_type;
      if (metadata.application_type) payload.application_type = metadata.application_type;
      if (metadata.application_value) payload.application_value = metadata.application_value;
      if (metadata.expiry_date) payload.expiry_date = metadata.expiry_date;

      if (metadata.price) payload.price = metadata.price;
      if (metadata.currency) payload.currency = metadata.currency;
      if (metadata.condition) payload.condition = metadata.condition;
      if (metadata.status) payload.status = metadata.status;
      if (metadata.location !== undefined) payload.location = metadata.location;

      if (metadata.artist) payload.artist = metadata.artist;
      if (metadata.series) payload.series = metadata.series;
      if (metadata.episode) payload.episode = metadata.episode;
      if (metadata.duration) payload.duration = metadata.duration;
    }

    console.log('Creating group post with payload:', payload);

    const result = await apiFetch("/api/group-posts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setPostUploadState((prev) => prev ? ({
      ...prev,
      isUploading: false,
      isSuccess: true,
      progress: 100,
      title: 'Group post published!',
      secondaryStatus: 'Your post is now visible in the group.',
    }) : null);

    setTimeout(() => {
      setPostUploadState(null);
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      }
    }, 2800);
    
    return result;
  } catch (error) {
    console.error('Failed to create group post:', error);
    setPostUploadState((prev) => prev ? ({
      ...prev,
      isUploading: false,
      isSuccess: false,
      progress: 0,
      title: 'Upload failed',
      secondaryStatus: (error as any)?.message || 'Could not publish group post.',
      error: (error as any)?.message,
    }) : null);
    setTimeout(() => {
      setPostUploadState(null);
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      }
    }, 4000);
    throw error;
  }
}, [currentUser, requireAuth, groups]);

 //=======CREATE  GROUP=======

  
    const createGroup = useCallback(async (groupData: Partial<Group>) => {
    if (!requireAuth("Creating groups")) return;
    const meId = Number(currentUser!.id);

    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          ...groupData,
          admin_id: meId,
          description: String(groupData.description || "").trim(),
          created_at: new Date().toISOString(),
        }),
      });

      fetchOtherData().catch(() => {});
      return res;
    } catch (error) {
      console.error('Failed to create group:', error);
      throw error;
    }
  }, [currentUser, requireAuth, fetchOtherData]);

  const deleteGroup = useCallback(async (groupId: number) => {
    if (!requireAdmin('Deleting groups')) return;

    try {
      await apiFetch(`/api/groups?id=${Number(groupId)}`, {
        method: "DELETE",
      });

      fetchOtherData().catch(() => {});
      return true;
    } catch (error) {
      console.error('Failed to delete group:', error);
      throw error;
    }
  }, [requireAdmin, fetchOtherData]);

  const updateGroupSettings = useCallback(async (groupId: number, settings: Partial<Group>) => {
    if (!requireAuth("Updating group settings")) return;

    try {
      const res = await apiFetch(`/api/groups?id=${Number(groupId)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          description: settings.description ? String(settings.description).trim() : undefined,
        }),
      });

      fetchOtherData().catch(() => {});
      return res;
    } catch (error) {
      console.error('Failed to update group settings:', error);
      throw error;
    }
   }, [requireAuth, fetchOtherData]);

const fetchGroupDetails = useCallback(async (groupId: number) => {
  try {
    const viewerId = currentUser?.id ? Number(currentUser.id) : 0;
    const res = await apiFetch(`/api/groups?id=${Number(groupId)}&viewerId=${viewerId}`);

    const groupData = (res as any)?.group ?? res;
    const rawMembers = safeArray((res as any)?.members);

    const normalizedMembers = rawMembers
      .map((m: any) => Number(m?.user_id ?? m?.id ?? m))
      .filter(Number.isFinite);

    const normalizedGroup = normalizeGroup({
      ...groupData,
      members: normalizedMembers,
      members_count:
        typeof groupData?.members_count === "number"
          ? groupData.members_count
          : normalizedMembers.length,
    });

    return {
      group: normalizedGroup,
      members: normalizedMembers,
    };
  } catch (error) {
    console.error("Failed to fetch group details:", error);
    return { group: null, members: [] };
  }
}, [currentUser]);
                   

  const fetchGroupEvents = useCallback(async (groupId: number): Promise<Event[]> => {
    try {
      const data = await apiFetch(`/api/groups/${groupId}/events?viewerId=${currentUser?.id || 0}`);
      
      const events = safeArray(data?.events ?? data);
      return events.map(normalizeEvent);
    } catch (error) {
      console.error('Failed to fetch group events:', error);
      return [];
    }
  }, [currentUser]);

  const createGroupEvent = useCallback(async (groupId: number, eventData: Partial<Event>): Promise<Event> => {
    if (!requireAuth('Creating events')) throw new Error('Authentication required');
    if (!currentUser) throw new Error('User not authenticated');

    const title = String(eventData.title || "").trim();
    const description = String(eventData.description || "").trim();
    
    const event_date = eventData.start_time || eventData.event_date || eventData.date || new Date().toISOString();
    
    const location = String(eventData.location || "").trim();
    
    const cover_url = String(
      eventData.cover_url || 
      eventData.cover_image || 
      eventData.image || 
      DEFAULT_EVENT_COVER
    ).trim();

    if (!title) throw new Error('Event title is required');
    if (!event_date) throw new Error('Event date is required');

    const payload = {
      group_id: Number(groupId),
      creator_id: Number(currentUser.id),
      creator_name: currentUser.name,
      creator_avatar: currentUser.profile_image_url,
      title,
      description,
      event_date,
      location,
      cover_url,
      visibility: "group",
    };

    try {
      const data = await apiFetch(`/api/groups/${groupId}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const newEvent = normalizeEvent(data?.event ?? data);
      
      setEvents(prev => [newEvent, ...safeArray(prev)]);
      
      return newEvent;
    } catch (error) {
      console.error('Failed to create group event:', error);
      throw error;
    }
  }, [currentUser, requireAuth]);

  const handleEventRSVP = useCallback(async (eventId: number, status: string): Promise<any> => {
    if (!requireAuth('RSVP to events')) return;
    if (!currentUser) return;

    let mappedStatus: "going" | "interested" | "not_going";
    
    if (status === 'going') {
      mappedStatus = 'going';
    } else if (status === 'interested') {
      mappedStatus = 'interested';
    } else {
      mappedStatus = 'not_going';
    }

    return onRSVPEvent(eventId, mappedStatus);
  }, [currentUser, requireAuth, onRSVPEvent]);

  const editGroupPost = useCallback(async (postId: number, content: string) => {
    if (!requireAuth('Editing group posts')) return;

    const meId = Number(currentUser!.id);
    const clean = String(content || '').trim();
    if (!clean) throw new Error('Content is empty');

    const res = await apiFetch(`/api/group-posts?post_id=${Number(postId)}`, {
      method: 'PUT',
      body: JSON.stringify({ 
        user_id: meId, 
        content: clean 
      }),
    });

    return res;
  }, [currentUser, requireAuth]);

  const deleteGroupPost = useCallback(async (groupId: number, postId: number) => {
    if (!requireAuth("Deleting group posts")) return;

    const meId = Number(currentUser!.id);

    try {
      await apiFetch(`/api/group-posts?post_id=${Number(postId)}&user_id=${meId}`, {
        method: "DELETE",
      });
      return true;
    } catch (error) {
      console.error('Failed to delete group post:', error);
      throw error;
    }
  }, [currentUser, requireAuth]);

    //===REMOVE GROUP MEMBER =====
    
const removeGroupMember = useCallback(async (groupId: number, memberId: number) => {
  if (!requireAuth('Removing group members')) return;
  if (!currentUser) return;

  try {
    return await apiFetch(
      `/api/group-members?group_id=${Number(groupId)}&user_id=${Number(memberId)}&actor_id=${Number(currentUser.id)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    console.error('Failed to remove group member:', error);
    throw error;
  }
}, [currentUser, requireAuth]);
    
//====MAKE MODERATOR ===  

   const makeModerator = useCallback(async (groupId: number, memberId: number) => {
  if (!currentUser) throw new Error("You must be logged in");

  try {
    const res = await apiFetch(`/api/group-members?action=make-moderator`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        user_id: Number(memberId),
        actor_id: Number(currentUser.id),
      }),
    });

    console.log("makeModerator success:", res);
    return res;
  } catch (error: any) {
    console.error("makeModerator failed:", error);
    throw error;
  }
}, [currentUser]); 
  
    
const toggleMemberPosting = useCallback(async (groupId: number, userId: number, disabled: boolean) => {
  if (!requireAuth("Managing group members")) return;
  if (!currentUser) return;
  try {
    const result = await apiFetch(`/api/group-members?action=toggle-posting`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        user_id: Number(userId),
        disabled: Boolean(disabled),
        actor_id: Number(currentUser.id),
      }),
    });
    return result;
  } catch (error) {
    console.error('Failed to toggle posting:', error);
    throw error;
  }
}, [currentUser, requireAuth]);

const disableAllMembers = useCallback(async (groupId: number) => {
  if (!requireAuth("Managing group members")) return;
  if (!currentUser) return;
  try {
    const result = await apiFetch(`/api/group-members?action=disable-all-members`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        actor_id: Number(currentUser.id),
      }),
    });
    return result;
  } catch (error) {
    console.error('Failed to disable all members posting:', error);
    throw error;
  }
}, [currentUser, requireAuth]);

const enableAllMembers = useCallback(async (groupId: number) => {
  if (!requireAuth("Managing group members")) return;
  if (!currentUser) return;
  try {
    const result = await apiFetch(`/api/group-members?action=enable-all-members`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        actor_id: Number(currentUser.id),
      }),
    });
    return result;
  } catch (error) {
    console.error('Failed to enable all members posting:', error);
    throw error;
  }
}, [currentUser, requireAuth]);

const makeAdmin = useCallback(async (groupId: number, userId: number) => {
  if (!requireAuth("Managing group members")) return;
  if (!currentUser) return;
  try {
    const result = await apiFetch(`/api/group-members?action=make-admin`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        user_id: Number(userId),
        actor_id: Number(currentUser.id),
      }),
    });
    return result;
  } catch (error) {
    console.error('Failed to make admin:', error);
    throw error;
  }
}, [currentUser, requireAuth]);

const removeAdmin = useCallback(async (groupId: number, userId: number) => {
  if (!requireAuth("Managing group members")) return;
  if (!currentUser) return;
  try {
    const result = await apiFetch(`/api/group-members?action=remove-admin`, {
      method: 'PATCH',
      body: JSON.stringify({
        group_id: Number(groupId),
        user_id: Number(userId),
        actor_id: Number(currentUser.id),
      }),
    });
    return result;
  } catch (error) {
    console.error('Failed to remove admin:', error);
    throw error;
  }
}, [currentUser, requireAuth]);


    

  

  //====UPDATE GROUP IMAGE ======
const updateGroupImage = useCallback(
  async (groupId: number, type: 'cover' | 'profile', file?: File | null, imageUrl?: string) => {
    if (!requireAuth("Updating group image")) {
      throw new Error("Authentication required");
    }

    try {
      let finalImageUrl = imageUrl || '';

      // Only upload if we have a file and no native URL provided
      if (file && !imageUrl) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok || !uploadData?.success) {
          throw new Error(uploadData?.error || "Upload failed");
        }

        if (uploadData?.media_urls) {
          try {
            const media =
              typeof uploadData.media_urls === "string"
                ? JSON.parse(uploadData.media_urls)
                : uploadData.media_urls;

            finalImageUrl = type === "cover"
              ? String(media?.full || media?.feed || uploadData?.url || "").trim()
              : String(media?.feed || media?.full || uploadData?.url || "").trim();
          } catch {
            finalImageUrl = uploadData?.url || "";
          }
        } else if (uploadData?.url) {
          finalImageUrl = String(uploadData.url).trim();
        }

        if (!finalImageUrl) {
          throw new Error("Compressed image URL was not returned");
        }
      }

      if (!finalImageUrl) {
        throw new Error("No image URL provided");
      }

      const field = type === "cover" ? "cover_image" : "profile_image";

      const updateRes = await fetch(`/api/groups?id=${Number(groupId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [field]: finalImageUrl,
        }),
      });

      const updateData = await updateRes.json().catch(() => null);

      if (!updateRes.ok || !updateData?.success) {
        throw new Error(updateData?.error || "Group update failed");
      }

      // keep groups list in sync immediately
      setGroups(prev =>
        prev.map(g =>
          Number(g.id) !== Number(groupId)
            ? g
            : {
                ...g,
                ...(type === "cover"
                  ? { cover_image: finalImageUrl }
                  : { profile_image: finalImageUrl }),
              }
        )
      );

      // ✅ REMOVE this line - setActiveGroupDetails is not needed
      

      return finalImageUrl;
    } catch (error) {
      console.error("Failed to update group image:", error);
      throw error;
    }
  },
  [requireAuth]
);

 //====GROUP INVITES ===÷
 
  const fetchGroupInvites = useCallback(async () => {
  if (!currentUser) return [];

  try {
    const res = await apiFetch(`/api/group-invites?user_id=${Number(currentUser.id)}`);
    return safeArray((res as any)?.invites ?? res);
  } catch (error) {
    console.error('Failed to fetch group invites:', error);
    return [];
  }
}, [currentUser]);

 const acceptGroupInvite = useCallback(async (inviteId: number, groupId: number) => {
  if (!requireAuth("Accepting group invites")) return;
  if (!currentUser) return;

  try {
    const validInviteId = Number(inviteId) || 0;
    const url = `/api/group-invites?id=${validInviteId}${groupId ? `&group_id=${Number(groupId)}` : ''}`;
    const res = await apiFetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'accepted',
        user_id: Number(currentUser.id),
        group_id: groupId ? Number(groupId) : undefined,
      }),
    });

    // Refresh group members to update UI
    if (groupId) {
      await refreshGroupMembers(groupId);
    }
    
    // Refresh other data to update groups list
    fetchOtherData().catch(() => {});
    
    return res;
  } catch (error) {
    console.error('Failed to accept group invite:', error);
    throw error;
  }
}, [currentUser, requireAuth, refreshGroupMembers, fetchOtherData]);   

const declineGroupInvite = useCallback(async (inviteId: number, groupId?: number) => {
  if (!requireAuth("Declining group invites")) return;
  if (!currentUser) return;

  try {
    const validInviteId = Number(inviteId) || 0;
    const url = `/api/group-invites?id=${validInviteId}${groupId ? `&group_id=${Number(groupId)}` : ''}`;
    const res = await apiFetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'declined',
        user_id: Number(currentUser.id),
        group_id: groupId ? Number(groupId) : undefined,
      }),
    });
    fetchOtherData().catch(() => {});
    return res;
  } catch (error) {
    console.error('Failed to decline group invite:', error);
    throw error;
  }
}, [currentUser, requireAuth, fetchOtherData]);

  const toggleGroupPostCommentLike = useCallback(async (commentId: number): Promise<any> => {
    if (!requireAuth('Liking comments')) return;
    if (!currentUser) return;

    try {
      return await apiFetch(`/api/group-post-comment-likes`, {
        method: 'POST',
        body: JSON.stringify({
          comment_id: Number(commentId),
          user_id: Number(currentUser.id),
        }),
      });
    } catch (error) {
      console.error('Failed to like group post comment:', error);
      throw error;
    }
  }, [currentUser, requireAuth]);

  const handleLikeComment = useCallback(async (commentId: number): Promise<any> => {
    if (!requireAuth('Liking comments')) return;
    if (!currentUser) return;

    try {
      return await apiFetch(`/api/post-comments/${commentId}/like`, {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id }),
      });
    } catch (error) {
      console.error('Failed to like comment:', error);
      throw error;
    }
  }, [currentUser, requireAuth]);

  const inviteToGroup = useCallback(async (groupId: number, userIds: number[]) => {
  if (!requireAuth("Inviting to groups")) return;
  if (!currentUser) return;

  try {
    const result = await apiFetch("/api/group-invites", {
      method: "POST",
      body: JSON.stringify({
        group_id: Number(groupId),
        inviter_id: Number(currentUser.id),
        invitee_ids: userIds,
      }),
    });
    console.log('Invite API response:', result); 
    return result;
  } catch (error) {
    console.error('Failed to invite to group:', error);
    throw error;  
  }
}, [currentUser, requireAuth]);




  const fetchData = useCallback(
    async (viewer: User | null) => {
      await Promise.all([
        fetchUsersList(), 
        fetchPostsForHome(viewer), 
        fetchOtherData(), 
        fetchReels(),
        fetchSongs(),
        fetchStories(),
      ]);
    },
    [fetchUsersList, fetchPostsForHome, fetchOtherData, fetchReels, fetchSongs, fetchStories]
  );

  // Handle physical back button
  useEffect(() => {
    const handleBackButton = (e: PopStateEvent) => {
      e.preventDefault();
      goBack();
    };

    window.addEventListener('popstate', handleBackButton);
    
    window.history.pushState(null, '', window.location.pathname);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [goBack]);

  // Load ads
  useEffect(() => {
    if (currentUser) {
      fetchMyAds();
    } else {
      setAdCampaigns([]);
    }
  }, [currentUser, fetchMyAds]);

  // Initial data load
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      let viewer: User | null = null;

      try {
        const raw = localStorage.getItem(LS_USER_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          const normalized = normalizeUser(saved);
          if (normalized?.id) {
            viewer = normalized;
            setCurrentUser(normalized);
            setSelectedUserId(Number(normalized.id));

            setUsers((prev) => {
              const arr = safeArray(prev);
              const exists = arr.some((x) => Number(x.id) === Number(normalized.id));
              if (exists) return arr.map((x) => (Number(x.id) === Number(normalized.id) ? normalized : x));
              return [normalized, ...arr];
            });

            // Fetch fresh profile from API to ensure role (admin/moderator) is up-to-date
            apiFetch(`/api/users?id=${normalized.id}`)
              .then((fresh) => {
                if (fresh && fresh.id && mounted) {
                  const updated = normalizeUser({ ...normalized, ...fresh });
                  setCurrentUser(updated);
                  localStorage.setItem(LS_USER_KEY, JSON.stringify(updated));
                }
              })
              .catch(() => {});
          }
        }
      } catch {
      }

      if (!mounted) return;
      
      await Promise.all([
        fetchUsersList(),
        fetchPostsForHome(viewer),
        fetchOtherData(),
        fetchReels(),
        fetchSongs(),
        fetchStories(),
      ]);
      
      if (!mounted) return;
      setAuthHydrated(true);
    };

    init();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Feed session management
  useEffect(() => {
    const markActive = () => {
      try {
        localStorage.setItem(FEED_LAST_ACTIVE_KEY, String(nowMs()));
      } catch {}
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markActive();
        return;
      }

      const last = Number(localStorage.getItem(FEED_LAST_ACTIVE_KEY) || '0') || 0;
      const away = nowMs() - last;

      if (away > FEED_RETURN_THRESHOLD_MS) {
        try {
          sessionStorage.removeItem(FEED_SESSION_KEY);
        } catch {}
        fetchPostsForHome(currentUser).catch(() => {});
        fetchReels().catch(() => {});
      }
    };

    const events = ['click', 'scroll', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true } as any));
    document.addEventListener('visibilitychange', onVisibility);

    markActive();

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive as any));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser, fetchPostsForHome, fetchReels]);

  // Background refresh
  useEffect(() => {
    if (activeCommentsIdentity != null) return;
    if (document.visibilityState !== 'visible') return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      if (activeCommentsIdentity != null) return;
      await fetchPostsForHome(currentUser).catch(() => {});
      await fetchReels().catch(() => {});
    };

    const t = setInterval(tick, 30000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [currentUser, fetchPostsForHome, fetchReels, activeCommentsIdentity]);
    
    useEffect(() => {
  fetchGroupsForViewer();
}, [fetchGroupsForViewer]);

//==NATIVE UPLOAD ===
useEffect(() => {
  const handleNativeUpload = (event: any) => {
    const media = event.detail;
    if (!media || media.type !== 'video') return;

    console.log('📱 App: Native reel video uploaded:', media);

    const videoUrl = media.full || media.feed || media.url;
    if (!videoUrl) return;

    const music = media.music || media.sound || {};

    const audioUrl =
      media.audioUrl ||
      media.audio_url ||
      music.audioUrl ||
      music.audio_url ||
      music.url ||
      music.originalUrl ||
      music.original_url ||
      '';

    const songName =
      media.songName ||
      media.song_name ||
      music.songName ||
      music.song_name ||
      music.title ||
      music.name ||
      'Original Sound';

    const soundPayload = audioUrl
      ? {
          songName,
          audioUrl,
          originalUrl: audioUrl,
          audioStart:
            media.audioStart ??
            media.audio_start ??
            music.audioStart ??
            music.audio_start ??
            music.start ??
            0,
          audioEnd:
            media.audioEnd ??
            media.audio_end ??
            music.audioEnd ??
            music.audio_end ??
            music.end ??
            0,
          songId:
            media.songId ??
            media.song_id ??
            music.songId ??
            music.song_id ??
            music.id,
          soundKey:
            media.soundKey ||
            media.sound_key ||
            music.soundKey ||
            music.sound_key ||
            undefined,
          isTrimmedAudio: false,
        }
      : null;

    setPendingReelFile(null);

    setNativeReelVideoUrl(videoUrl);

    const mediaMeta = {
      thumb:
        media.thumb ||
        media.thumbnail_url ||
        media.thumbnailUrl ||
        media.nativeVideoMeta?.thumb ||
        videoUrl,
      thumbnail_url:
        media.thumbnail_url ||
        media.thumbnailUrl ||
        media.thumb ||
        media.nativeVideoMeta?.thumbnail_url ||
        '',
      feed: media.feed || videoUrl,
      full: media.full || videoUrl,
      url: videoUrl,
      type: 'video',
    };

    setNativeReelMediaMeta(mediaMeta);

    // ✅ IMPORTANT: preserve selected sound before Recorder opens
    if (soundPayload) {
      setSelectedReelSound(soundPayload);
    }

    setView('recorder');
    setRecorderActiveTab('preview');

    // ✅ IMPORTANT: dispatch FULL payload, not stripped payload
    window.dispatchEvent(
      new CustomEvent('uneraNativeReelVideo', {
        detail: {
          ...media,
          videoUrl,
          mediaMeta,
          nativeVideoUrl: videoUrl,
          nativeVideoMeta: mediaMeta,
          music: soundPayload || media.music || media.sound || null,
          sound: soundPayload || media.music || media.sound || null,
          audioUrl: soundPayload?.audioUrl || '',
          songName: soundPayload?.songName || 'Original Sound',
          songId: soundPayload?.songId,
          soundKey: soundPayload?.soundKey,
          audioStart: soundPayload?.audioStart ?? 0,
          audioEnd: soundPayload?.audioEnd ?? 0,
        },
      })
    );
  };

  window.addEventListener('uneraNativeUpload', handleNativeUpload);
  return () => {
    window.removeEventListener('uneraNativeUpload', handleNativeUpload);
  };
}, [
  setPendingReelFile,
  setNativeReelVideoUrl,
  setNativeReelMediaMeta,
  setSelectedReelSound,
  setView,
  setRecorderActiveTab,
]);
                                                                                                                                                                                     

   useEffect(() => {
  console.log('[Platform] Detection results:', {
    isNative: isUneraNativeApp(),
    hasUNERA_IS_NATIVE_APP: (window as any).UNERA_IS_NATIVE_APP === true,
    hasUneraNative: !!(window as any).UneraNative?.postMessage,
    hasFlutterWebView: !!(window as any).flutter_inappwebview?.callHandler,
    userAgentIncludesUneraApp: navigator.userAgent.toLowerCase().includes('uneraapp'),
    url: window.location.hostname
  });
}, []);
    
  // ===== ADMIN FUNCTIONS ====
  const verifyUser = useCallback(
    async (userId: number, forceAction?: 'verify' | 'unverify') => {
      if (!requireAdmin('Verify user')) return;
      const targetUser = users.find((u) => Number(u.id) === Number(userId));
      const action = forceAction || (targetUser?.is_verified ? 'unverify' : 'verify');

      try {
        const res = await moderateUser(Number(currentUser?.id), Number(userId), action);
        if (res.success) {
          setUsers((prev) =>
            prev.map((u: any) =>
              Number(u.id) === Number(userId)
                ? { ...u, is_verified: res.is_verified ?? (action === 'verify' ? 1 : 0) }
                : u
            )
          );
          await fetchUsersList();
          return res;
        } else {
          setLoginError(res.error || 'Verification failed');
        }
      } catch (e: any) {
        await fetchUsersList();
        setLoginError(e?.message || 'Verify failed');
      }
    },
    [requireAdmin, currentUser, users, fetchUsersList]
  );

  const suspendUser = useCallback(
    async (
      userId: number,
      duration: 'week' | 'month' | 'until_unsuspend' | '24h' | '5d' | '30d' | 'manual' = 'week',
      reason?: string
    ) => {
      if (!requireModOrAdmin('Suspend user')) return;

      const mappedDuration: 'week' | 'month' | 'until_unsuspend' =
        duration === 'month' || duration === '30d'
          ? 'month'
          : duration === 'until_unsuspend' || duration === 'manual'
          ? 'until_unsuspend'
          : 'week';

      try {
        const res = await moderateUser(Number(currentUser?.id), Number(userId), 'suspend', {
          duration: mappedDuration,
          reason: reason || 'Suspended by admin',
        });

        if (res.success) {
          setUsers((prev) =>
            prev.map((u: any) =>
              Number(u.id) === Number(userId)
                ? {
                    ...u,
                    suspended_until: res.suspended_until,
                    suspension_reason: res.reason,
                    posting_disabled: true,
                  }
                : u
            )
          );
          await fetchUsersList();
          return res;
        } else {
          setLoginError(res.error || 'Suspend failed');
        }
      } catch (e: any) {
        setLoginError(e?.message || 'Suspend failed');
      }
    },
    [requireModOrAdmin, currentUser, fetchUsersList]
  );

  const deleteUserAccount = useCallback(
    async (userId: number) => {
      if (!requireAdmin('Delete account')) return;

      try {
        const res = await moderateUser(Number(currentUser?.id), Number(userId), 'delete');
        if (res.success) {
          setUsers((prev) => prev.filter((u: any) => Number(u.id) !== Number(userId)));
          await fetchUsersList();
          fetchPostsForHome(currentUser).catch(() => {});
          return res;
        } else {
          setLoginError(res.error || 'Delete failed');
        }
      } catch (e: any) {
        await fetchUsersList();
        setLoginError(e?.message || 'Delete failed');
      }
    },
    [requireAdmin, currentUser, fetchUsersList, fetchPostsForHome]
  );

  const setModeratorRole = useCallback(
    async (userId: number, role: 'moderator' | 'user') => {
      if (!requireAdmin('Change user role')) return;

      try {
        const action = role === 'moderator' ? 'make_moderator' : 'remove_moderator';
        const res = await moderateUser(Number(currentUser?.id), Number(userId), action);
        if (res.success) {
          setUsers((prev) =>
            prev.map((u: any) =>
              Number(u.id) === Number(userId) ? { ...u, role: res.role || role } : u
            )
          );
          await fetchUsersList();
          return res;
        } else {
          setLoginError(res.error || 'Role change failed');
        }
      } catch (e: any) {
        setLoginError(e?.message || 'Role change failed');
      }
    },
    [requireAdmin, currentUser, fetchUsersList]
  );

  const handleHashtagClick = useCallback((tag: string) => {
    const cleanedTag = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
    setActiveHashtag(cleanedTag);
    navigateTo('home');
    window.scrollTo(0, 0);
  }, [navigateTo]);

  const clearHashtag = useCallback(() => {
    setActiveHashtag(null);
  }, []);

  const filteredPosts = useMemo(() => {
    if (!activeHashtag) return posts;
    
    const tagWithoutHash = activeHashtag.replace('#', '').toLowerCase();
    return posts.filter((p: any) => {
      const content = String(p.content || '').toLowerCase();
      return content.includes(`#${tagWithoutHash}`) || content.includes(` ${tagWithoutHash} `);
    });
  }, [posts, activeHashtag]);

  const rankedPosts = useMemo(() => {
    const feedToRank = stableFeedRef.current.length > 0 ? stableFeedRef.current : 
                     activeHashtag ? filteredPosts : posts;
    return Array.isArray(feedToRank) ? feedToRank : [];
  }, [posts, filteredPosts, activeHashtag]);

  // PYMK Insert Indices
  const peopleYouMayKnowInsertIndex1 = useMemo(() => {
    const total = safeArray(rankedPosts).length;

    if (total < 6) return -1;
    if (total <= 10) return total - 1;

    return 7;
  }, [rankedPosts]);

  const peopleYouMayKnowInsertIndex2 = useMemo(() => {
    const total = safeArray(rankedPosts).length;

    if (total < 22) return -1;

    return 21;
  }, [rankedPosts]);

  // Groups You May Join Insert Index
  const groupsYouMayJoinInsertIndex = useMemo(() => {
    const total = safeArray(rankedPosts).length;
    if (total < 4) return -1;
    return Math.min(3, total - 1);
  }, [rankedPosts]);

  // Transform feed items
  const feedItems = useMemo<FeedItem[]>(() => {
    const postItems = safeArray(rankedPosts)
      .filter(post => !(post.group_id && (post.type === 'event' || post.item_type === 'event' || post.source === 'event' || post.is_group_event)))
      .map(post => ({
        ...post,
        type: 'post' as const,
        id: post.id,
        created_at: post.created_at,
      }));

    const reelItems = safeArray(reels).map(reel => ({
      id: `reel-${reel.id}`,
      type: 'reel' as const,
      created_at: reel.created_at,
      reel: {
        id: reel.id,
        user_id: reel.userId || reel.user_id,
        author: reel.author || reel.author_name || 'User',
        avatar: reel.avatar || reel.author_image,
        verified: reel.verified || false,
        video: reel.videoUrl || reel.video_url,
        thumbnail: reel.thumbnail_url || reel.cover_url,
        caption: reel.caption,
        views: reel.views || reel.views_count || 0,
        likes: reel.likes || reel.reactions?.length || 0,
        comments: reel.comments?.length || 0,
        shares: reel.shares || 0,
        created_at: reel.created_at,
      }
    }));

    const adItems = safeArray(ads).map(ad => {
      const originalPost = ad.post_id ? posts.find(p => Number(p.id) === Number(ad.post_id)) : null;
      const originalProduct = (ad.product_id || ad.source_id)
        ? products.find(p => Number(p.id) === Number(ad.product_id || ad.source_id))
        : (ad.post_id ? products.find(p => Number(p.id) === Number(ad.post_id)) : null);

      const isProductAd = Boolean(originalProduct || ad.source_type === 'product' || ad.product_id);
      const prod: any = originalProduct || {};

      return {
        ...(originalPost || {}),
        ...(isProductAd ? prod : {}),
        ...ad,
        is_sponsored: true,
        sponsored: true,
        is_ad: true,
        ad_id: Number(ad.id),
        user_id: ad.advertiser_id || (originalPost ? originalPost.user_id : (prod.seller_id || null)),
        seller_id: prod.seller_id || ad.advertiser_id || null,
        product_id: isProductAd ? (prod.id || ad.product_id || ad.source_id) : undefined,
        title: prod.title || ad.title || (originalPost ? (originalPost.title || originalPost.content) : ''),
        description: prod.description || ad.description || (originalPost ? (originalPost.description || originalPost.content) : ''),
        main_price: prod.main_price ?? ad.main_price,
        discount_price: prod.discount_price ?? ad.discount_price,
        price: prod.discount_price || prod.main_price || ad.price,
        currency: prod.currency || ad.currency || 'TZS',
        location: prod.address || prod.location || ad.target_location || '',
        address: prod.address || ad.target_location || '',
        media_url: ad.media_url || (prod.images?.[0] || (originalPost ? originalPost.media_url : null)),
        media_urls: (Array.isArray(ad.media_urls) && ad.media_urls.length > 0)
          ? ad.media_urls
          : (prod.images?.length ? prod.images : (originalPost?.media_urls || (ad.media_url ? [ad.media_url] : []))),
        images: prod.images || (Array.isArray(ad.media_urls) && ad.media_urls.length > 0 ? ad.media_urls : (ad.media_url ? [ad.media_url] : [])),
        image_variants: prod.image_variants || [],
        media_types: (Array.isArray(ad.media_types) && ad.media_types.length > 0) ? ad.media_types : (originalPost?.media_types || []),
        media_type: ad.media_type || (originalPost ? originalPost.media_type : 'image'),
        content: isProductAd ? (prod.title || ad.description || '') : (ad.description || (originalPost ? originalPost.content : '') || ad.title || ''),
        caption: ad.description || (originalPost ? originalPost.caption : '') || '',
        sponsored_meta: {
          ad_id: Number(ad.id),
          advertiser_id: Number(ad.advertiser_id),
          campaign_name: ad.campaign_name || ad.title,
          headline: ad.title || ad.campaign_name,
          cta_text: ad.cta_button || (isProductAd ? 'Shop Now' : 'Learn More'),
          cta_url: ad.destination_url,
          contact_type: ad.contact_type || 'link',
          phone_number: ad.phone_number,
          email_address: ad.email_address,
        },
        type: (isProductAd ? 'product' : 'sponsored') as any,
        item_type: (isProductAd ? 'product' : 'sponsored') as any,
        post_type: (isProductAd ? 'product' : 'post') as any,
        source: (isProductAd ? 'product' : 'sponsored') as any,
        id: `ad-${ad.id}`,
      };
    });

    // Combine posts only, no reel videos in Feed
    let combinedItems = [...postItems];

    // Shuffle combined items using the same session seed as posts
    const seed = getOrCreateSessionSeed(currentUser?.id ?? null);
    combinedItems = seededShuffle(combinedItems, seed);

    // Insert ads every 5 items
    const merged: FeedItem[] = [];
    let adIndex = 0;

    for (let i = 0; i < combinedItems.length; i++) {
      merged.push(combinedItems[i]);

      if ((i + 1) % 5 === 0 && adIndex < adItems.length) {
        merged.push(adItems[adIndex]);
        adIndex++;
      }
    }

    while (adIndex < adItems.length) {
      merged.push(adItems[adIndex]);
      adIndex++;
    }

    return merged;
  }, [rankedPosts, reels, ads, currentUser]);

  
  const profileUser = useMemo(() => {
    if (selectedUserId && (!currentUser || Number(currentUser.id) !== Number(selectedUserId))) {
      const foundInUsers = users.find((u) => Number(u.id) === Number(selectedUserId));
      if (foundInUsers) return foundInUsers;
      const foundInPymk = peopleYouMayKnow.find((u) => Number(u.id) === Number(selectedUserId));
      if (foundInPymk) {
        return {
          id: foundInPymk.id,
          name: foundInPymk.name,
          username: foundInPymk.username,
          profile_image_url: foundInPymk.profile_image_url,
          is_verified: foundInPymk.is_verified,
          role: (foundInPymk.role as any) || 'user',
          bio: '',
          work: '',
          location: '',
          education: '',
          website: '',
          followers: [],
          following: [],
          is_online: false,
        } as User;
      }
      return null;
    }
    return currentUser || null;
  }, [selectedUserId, users, currentUser, peopleYouMayKnow]);

  const handleRegister = useCallback(async (userData: any) => {
    try {
      setLoginError('');

      const res = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Registration failed');
      if (!data?.user) throw new Error('Registration failed: user missing');

      const normalized = normalizeUser(data.user);
      if (!normalized?.id) throw new Error('Registration failed: invalid user id');

      localStorage.setItem(LS_USER_KEY, JSON.stringify(normalized));

      setCurrentUser(normalized);
      setSelectedUserId(Number(normalized.id));

      setUsers((prev) => {
        const arr = safeArray(prev);
        const exists = arr.some((x) => Number(x.id) === Number(normalized.id));
        if (exists) return arr.map((x) => (Number(x.id) === Number(normalized.id) ? normalized : x));
        return [normalized, ...arr];
      });

      try {
        sessionStorage.removeItem(FEED_SESSION_KEY);
      } catch {}

      navigateTo('home');
      await fetchPostsForHome(normalized);
      await fetchReels();

    } catch (error: any) {
      setLoginError(error?.message || 'Registration failed');
    }
  }, [fetchPostsForHome, fetchReels, navigateTo]);

  const handleLogin = async (email: string, password: string) => {
    try {
      setLoginError('');

      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      if (!data?.user) throw new Error('Login failed: user missing');

      const normalized = normalizeUser(data.user);
      if (!normalized?.id) throw new Error('Login failed: invalid user id');

      let finalUser = normalized;
      try {
        const fresh = await apiFetch(`/api/users?id=${normalized.id}`);
        finalUser = normalizeUser({ ...normalized, ...fresh });
      } catch {}

      setCurrentUser(finalUser);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(finalUser));

      try {
        sessionStorage.removeItem(FEED_SESSION_KEY);
      } catch {}

      setUsers((prev) => {
        const arr = safeArray(prev);
        const exists = arr.some((x) => Number(x.id) === Number(finalUser.id));
        if (exists) return arr.map((x) => (Number(x.id) === Number(finalUser.id) ? finalUser : x));
        return [finalUser, ...arr];
      });

      setSelectedUserId(Number(finalUser.id));
      navigateTo('home');

      await fetchPostsForHome(finalUser);
      await fetchReels();
    } catch (error: any) {
      setLoginError(error?.message || 'Login failed');
    }
  };

  // followUser
  const followUser = useCallback(
    async (targetUserId: number) => {
      if (!requireAuth('Following')) return;
      if (!currentUser) return;

      const meId = Number(currentUser.id);
      const targetId = Number(targetUserId);

      if (!targetId || targetId === meId) return;

      const myFollowing = new Set<number>(safeArray<number>((currentUser as any).following));
      const isFollowingNow = myFollowing.has(targetId);

      setFollowLoading(prev => ({ ...prev, [targetId]: true }));

      const originalUsers = [...users];
      const originalCurrentUser = { ...currentUser };

      setUsers((prev) => {
        const arr = safeArray(prev).map(normalizeUser);

        return arr.map((u) => {
          const uid = Number(u.id);

          if (uid === meId) {
            const following = new Set<number>(safeArray<number>((u as any).following));
            if (isFollowingNow) following.delete(targetId);
            else following.add(targetId);
            return normalizeUser({ ...u, following: Array.from(following) });
          }

          if (uid === targetId) {
            const followers = new Set<number>(safeArray<number>((u as any).followers));
            if (isFollowingNow) followers.delete(meId);
            else followers.add(meId);
            return normalizeUser({ ...u, followers: Array.from(followers) });
          }

          return u;
        });
      });

      setCurrentUser((prev) => {
        if (!prev) return prev;
        const following = new Set<number>(safeArray<number>((prev as any).following));
        if (isFollowingNow) following.delete(targetId);
        else following.add(targetId);
        const next = normalizeUser({ ...prev, following: Array.from(following) });
        localStorage.setItem(LS_USER_KEY, JSON.stringify(next));
        return next;
      });

      try {
        if (isFollowingNow) {
          await apiFetch(`/api/user-follows?follower_id=${meId}&following_id=${targetId}`, {
            method: 'DELETE',
          });
        } else {
          await apiFetch('/api/user-follows', {
            method: 'POST',
            body: JSON.stringify({ follower_id: meId, following_id: targetId }),
          });
        }

        fetchUserFollowDataForUI(targetId).catch(() => {});
        fetchUserFollowDataForUI(meId).catch(() => {});

        scheduleSilentRefresh();
      } catch (e: any) {
        console.error('Follow toggle failed:', e);

        setUsers(originalUsers);
        setCurrentUser(originalCurrentUser);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(originalCurrentUser));
        
        fetchUserFollowDataForUI(targetId).catch(() => {});
        fetchUserFollowDataForUI(meId).catch(() => {});
        
        setLoginError(`Failed to ${isFollowingNow ? 'unfollow' : 'follow'}: ${e.message || 'Unknown error'}`);
      } finally {
        setFollowLoading(prev => ({ ...prev, [targetId]: false }));
      }
    },
    [requireAuth, currentUser, users, scheduleSilentRefresh, fetchUserFollowDataForUI]
  );

  // followFromPymk
  const followFromPymk = useCallback(async (targetUserId: number) => {
    const id = Number(targetUserId);
    if (!id) return;

    setPeopleYouMayKnow(prev =>
      prev.map(u =>
        Number(u.id) === id ? { ...u, is_following: !u.is_following } : u
      )
    );

    try {
      await followUser(id);
    } catch (error) {
      console.error('Failed to follow from People You May Know:', error);
      setPeopleYouMayKnow(prev =>
        prev.map(u =>
          Number(u.id) === id ? { ...u, is_following: !u.is_following } : u
        )
      );
      fetchPeopleYouMayKnow().catch(() => {});
    }
  }, [followUser, fetchPeopleYouMayKnow]);

    const checkIsFollowing = useCallback((targetUserId: number): boolean => {
  if (!currentUser || !targetUserId) return false;
  const myFollowing = safeArray<number>((currentUser as any).following);
  return myFollowing.includes(Number(targetUserId));
}, [currentUser]);


  const handleLogout = () => {
    localStorage.removeItem(LS_USER_KEY);
    localStorage.removeItem(STORY_SEEN_KEY);
    localStorage.removeItem(STORIES_CACHE_KEY);
    localStorage.removeItem(PYMK_HIDDEN_KEY);
    localStorage.removeItem(GROUPS_YOU_MAY_JOIN_HIDDEN_KEY);
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(STORY_VIEWERS_CACHE_KEY)) {
        localStorage.removeItem(key);
      }
    });

    try {
      sessionStorage.removeItem(FEED_SESSION_KEY);
    } catch {}

    setCurrentUser(null);
    setSelectedUserId(null);
    setProfilePosts([]);
    setReels([]);
    setStories([]);
    setActiveStoryId(null);
    setSeenStoryIds(new Set());
    setStoryMuted(true);
    setActiveHashtag(null);
    setLikedTracks([]);
    setMyTotalPlays(0);
    setPlayHistory([]);
    setTrackPlays({});
    setCurrentAudioTrack(null);
    setIsAudioPlaying(false);
    setSelectedReelSound(null);
    setSongs([]);
    setEvents([]);
    setActiveChatUser(null);
    setIsChatOpen(false);
    setIsChatsListOpen(false);
    setIncomingCall(null);
    setPeopleYouMayKnow([]);
    setPymkHiddenIds([]);
    setGroupsYouMayJoin([]);
    setGymjHiddenIds([]);
    setSelectedReelId(null);
    setNavigationHistory(['home']);
    setView('home');
    fetchPostsForHome(null).catch(() => {});
    fetchReels().catch(() => {});
  };

  // handleNavigate
  const handleNavigate = useCallback((target: View) => {
    if (['settings', 'memories', 'notifications', 'ads'].includes(target) && !currentUser) {
      setLoginError(`Please login to view ${target}.`);
      return setView('login');
    }

    if (target === 'profile') {
      if (!currentUser) {
        setLoginError('Please login to view your profile.');
        return setView('login');
      }
      openProfile(currentUser.id);
      return;
    }

    if (target === 'groups') {
      setActiveGroupId(null);
    }

    navigateTo(target);
  }, [currentUser, navigateTo, openProfile]);

  // ============================================================================
  // ✅ UPDATED CREATE POST - With image compression for thumb/feed/full URLs
  // ============================================================================
const createPost = useCallback(
  async (
    text: string,
    files: File[] | File | null,
    meta?: {
      type?: 'text' | 'image' | 'video';
      visibility?: string;
      location?: string;
      feeling?: string;
      taggedUsers?: number[];
      background?: string;
      linkPreview?: any;
      // ✅ Native Flutter upload fields
      nativeMediaMeta?: any[];
      nativeMediaUrls?: string[];
      nativeMediaTypes?: string[];
      // ✅ High quality extracted video thumbnail file
      thumbnailFile?: File | null;
      compressedVideosPromise?: Promise<CompressedVideoResult | null> | null;
      compressedVideos?: CompressedVideoResult | null;
    }
  ) => {
    if (!requireAuth('Creating posts')) return;

    const trimmed = (text || '').trim();
    if (!trimmed && !files && !meta?.background && !meta?.nativeMediaMeta?.length) return;

    const list: File[] = Array.isArray(files) ? files : (files ? [files] : []);

    let media_urls: string[] = [];
    let media_types: string[] = [];
    let media_meta: any[] = [];
    let media_url: string | null = null;
    let media_type: string | null = null;

    const metaAny = meta as any;
    const hasPhotos = meta?.type === 'image' || (list.length > 0 && list.some(f => f.type.startsWith('image/')));
    let previewUrl: string | undefined;
    if (list.length > 0 && list[0].type.startsWith('image/')) {
      try {
        previewUrl = URL.createObjectURL(list[0]);
      } catch (e) {
        // ignore
      }
    } else if (meta?.nativeMediaUrls?.[0]) {
      previewUrl = meta.nativeMediaUrls[0];
    }

    setPostUploadState({
      isUploading: true,
      progress: 15,
      title: 'Uploading your post…',
      secondaryStatus: hasPhotos
        ? 'Please wait while your photos are being uploaded.'
        : 'Publishing post to your timeline...',
      previewUrl,
      isSuccess: false,
    });

    try {
      // ✅ CHECK FOR NATIVE UPLOAD FIRST
      if (meta?.nativeMediaMeta && meta.nativeMediaMeta.length > 0) {
        console.log("📱 Using native uploaded media:", meta.nativeMediaMeta);
        
        media_urls = meta.nativeMediaUrls || [];
        media_types = meta.nativeMediaTypes || [];
        media_meta = meta.nativeMediaMeta;
        media_url = media_urls[0] || null;
        media_type = media_types[0] || null;

        setPostUploadState((prev) => prev ? ({
          ...prev,
          progress: 65,
          secondaryStatus: 'Processing media attachments...',
        }) : null);
      }
      // IMAGE POSTS - compress in browser
      else if (meta?.type === 'image' && list.length) {
        setPostUploadState((prev) => prev ? ({
          ...prev,
          progress: 30,
          secondaryStatus: 'Preparing and optimizing photos...',
        }) : null);

        let completedFiles = 0;
        const uploadedItems = await Promise.all(
          list.map(async (file, idx) => {
            const bundle = await buildImageUploadBundle(file);
            const form = new FormData();
            form.append('thumbnail', bundle.thumb);
            form.append('feed', bundle.feed);
            form.append('original', bundle.full);

            const data = await apiFetch('/api/upload', {
              method: 'POST',
              body: form,
            });

            const thumb = data?.uploaded?.thumbnail?.url || data?.media_urls?.thumb || '';
            const feed = data?.uploaded?.feed?.url || data?.media_urls?.feed || '';

            if (!feed) {
              throw new Error('Image upload failed: missing feed URL');
            }

            completedFiles++;
            const pct = Math.min(85, 30 + Math.round((completedFiles / list.length) * 55));
            setPostUploadState((prev) => prev ? ({
              ...prev,
              progress: pct,
              secondaryStatus: list.length > 1
                ? `Uploaded photo ${completedFiles} of ${list.length}...`
                : 'Please wait while your photos are being uploaded.',
            }) : null);

            return {
              thumb,
              feed,
              full: feed,
              type: 'image',
            };
          })
        );

        media_urls = uploadedItems.map((item) => item.feed).filter(Boolean);
        media_meta = uploadedItems.map((item) => ({
          thumb: item.thumb,
          feed: item.feed,
          full: item.feed,
          type: 'image',
        }));
        media_types = uploadedItems.map(() => 'image');
        media_url = uploadedItems[0]?.feed || null;
        media_type = 'image';
      }
      // NON-IMAGE POSTS (videos, audio, etc.)
      else if (list.length) {
        const isVideoFile = (f: File) => {
          if (!f) return false;
          const t = String(f.type || '').toLowerCase();
          const n = String(f.name || '').toLowerCase();
          return t.startsWith('video/') || /\.(mp4|webm|mov|m4v|m3u8|3gp|avi|mkv)$/i.test(n);
        };
        const isVideo = meta?.type === 'video' || list.some(isVideoFile);
        setPostUploadState((prev) => prev ? ({
          ...prev,
          progress: 40,
          secondaryStatus: isVideo ? 'Uploading and processing video...' : 'Uploading media files...',
        }) : null);

        if (isVideo) {
          const videoFile = list.find(isVideoFile) || list[0];
          let thumbFile: File | null = meta?.thumbnailFile || null;

          // Dual browser-side video compression (1080p high quality & 720p lower quality)
          let compressed: CompressedVideoResult | null = meta?.compressedVideos || null;
          if (!compressed && meta?.compressedVideosPromise) {
            try {
              compressed = await meta.compressedVideosPromise;
            } catch (e) {
              console.warn('Background video compression promise warning:', e);
            }
          }
          if (!compressed && videoFile) {
            try {
              compressed = await compressVideoDual(videoFile);
            } catch (err) {
              console.warn('Dual video compression error:', err);
            }
          }

          // If thumbnail was not pre-extracted in Feed.tsx, use compressed thumbnail or extract now
          if (!thumbFile && compressed?.thumbnailFile) {
            thumbFile = compressed.thumbnailFile;
          }
          if (!thumbFile && videoFile) {
            try {
              const res = await generateVideoThumbnail(videoFile);
              thumbFile = res.file;
            } catch (err) {
              console.warn('Video thumbnail extraction fallback in createPost:', err);
            }
          }

          const file1080 = compressed?.high1080pFile || videoFile;
          const file720 = compressed?.low720pFile || videoFile;

          // Upload all 4 assets concurrently:
          // 1. Original untouched video
          // 2. 1080p high quality MP4
          // 3. 720p lower quality MP4
          // 4. WebP thumbnail image
          const [origUp, high1080Up, low720Up, thumbUp] = await Promise.all([
            uploadToCloudflareR2(videoFile, 'posts/videos/original'),
            uploadToCloudflareR2(file1080, 'posts/videos/1080p'),
            uploadToCloudflareR2(file720, 'posts/videos/720p'),
            thumbFile
              ? uploadToCloudflareR2(thumbFile, 'posts/thumbnails')
              : Promise.resolve(null),
          ]);

          const origUrl = origUp.url;
          const high1080Url = high1080Up.url;
          const low720Url = low720Up.url;
          let thumbUrl = thumbUp?.url || null;

          // Safety check: ensure thumbnail is uploaded and is a valid image URL, NEVER an MP4 video URL
          if (!thumbUrl && thumbFile) {
            try {
              const retryUp = await uploadToCloudflareR2(thumbFile, 'posts/thumbnails');
              thumbUrl = retryUp?.url || null;
            } catch (e) {}
          }

          const isInvalidThumb = !thumbUrl || thumbUrl.match(/\.(mp4|webm|mov|m4v|3gp|avi|mkv)(\?|$)/i);
          if (isInvalidThumb && videoFile) {
            try {
              const res = await generateVideoThumbnail(videoFile);
              if (res?.file) {
                const freshUp = await uploadToCloudflareR2(res.file, 'posts/thumbnails');
                thumbUrl = freshUp?.url || null;
              }
            } catch (e) {}
          }

          // Primary streaming URL for feed playback is the optimized 720p MP4
          const primaryPlaybackUrl = low720Url || origUrl;

          media_url = primaryPlaybackUrl;
          media_type = 'video';

          // Exactly the 4 URLs expected in database: [Original, 1080, 720, thumbnail_url]
          media_urls = thumbUrl
            ? [origUrl, high1080Url, low720Url, thumbUrl]
            : [origUrl, high1080Url, low720Url];
          media_types = thumbUrl
            ? ['video', 'video', 'video', 'image']
            : ['video', 'video', 'video'];

          // Exactly the 4 URLs expected in media_meta:
          // Original, 1080, 720, and thumbnail_url (plus thumb/feed/full aliases for player compatibility)
          media_meta = [{
            original: origUrl,
            '1080': high1080Url,
            '720': low720Url,
            thumbnail_url: thumbUrl,
            thumb: thumbUrl,
            feed: low720Url,
            full: high1080Url,
            type: 'video',
            width: compressed?.highWidth || undefined,
            height: compressed?.highHeight || undefined,
            duration: compressed?.duration || undefined,
          }];
        } else {
          const ups = await Promise.all(list.map((f) => uploadToCloudflareR2(f)));
          media_urls = ups.map((u) => u.url).filter(Boolean);
          media_types = ups.map((u) => u.type).filter(Boolean);
          media_url = media_urls[0] ?? null;
          media_type = media_types[0] ?? null;
        }
      }
    } catch (error: any) {
      setPostUploadState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: false,
        error: error?.message || 'Upload error',
        title: 'Upload failed',
        secondaryStatus: error?.message || 'Failed to upload files. Please try again.',
      }) : null);
      setTimeout(() => {
        setPostUploadState(null);
        if (previewUrl) {
          try { URL.revokeObjectURL(previewUrl); } catch (e) {}
        }
      }, 4000);
      setLoginError(`Failed to upload files: ${error?.message || 'Upload error'}`);
      return;
    }

    const isVideoPost = media_type === 'video' || meta?.type === 'video' || (list.length > 0 && list.some((f) => f.type.startsWith('video/')));
    let attachedReelId: number | null = null;

    // Attach Reels endpoints for video posting
    if (isVideoPost && media_url && currentUser) {
      setPostUploadState((prev) => prev ? ({
        ...prev,
        progress: 75,
        secondaryStatus: 'Attaching reel endpoints & interactions...',
      }) : null);

      try {
        const reelFormData = new FormData();
        reelFormData.append('caption', trimmed);
        reelFormData.append('video_url', media_url);
        reelFormData.append('thumbnail_url', media_meta[0]?.thumb || media_url);
        reelFormData.append('user_id', String(currentUser.id));
        if (meta?.visibility) reelFormData.append('visibility', meta.visibility);
        if (metaAny?.song_name || metaAny?.sound?.title) reelFormData.append('song_name', metaAny?.song_name || metaAny?.sound?.title);
        if (metaAny?.song_id || metaAny?.sound?.id) reelFormData.append('song_id', String(metaAny?.song_id || metaAny?.sound?.id));
        if (metaAny?.audio_url || metaAny?.sound?.audioUrl) reelFormData.append('audio_url', metaAny?.audio_url || metaAny?.sound?.audioUrl);

        const reelRes = await apiFetch('/api/reels', {
          method: 'POST',
          body: reelFormData,
        });

        const rId = reelRes?.reel?.id || reelRes?.id;
        if (rId) {
          attachedReelId = Number(rId);
          if (reelRes?.reel) {
            setReels((prev) => [reelRes.reel, ...safeArray(prev)]);
          }
        }
      } catch (reelErr) {
        console.warn('Reels endpoint attachment:', reelErr);
      }
    }

    setPostUploadState((prev) => prev ? ({
      ...prev,
      progress: 90,
      secondaryStatus: 'Publishing post to your timeline...',
    }) : null);

    const payload: any = {
      user_id: currentUser!.id,
      content: trimmed,
      media_url,
      media_type: isVideoPost ? 'video' : media_type,
      reel_id: attachedReelId || undefined,
      media_urls: media_urls.length ? media_urls : undefined,
      media_types: media_types.length ? media_types : undefined,
      media_meta: media_meta.length ? media_meta : undefined,
      visibility: meta?.visibility ?? 'public',
      song_name: metaAny?.song_name || metaAny?.sound?.title || undefined,
      song_id: metaAny?.song_id || metaAny?.sound?.id || undefined,
      audio_url: metaAny?.audio_url || metaAny?.sound?.audioUrl || undefined,
      location: meta?.location,
      feeling: meta?.feeling,
      tagged_users: meta?.taggedUsers,
      background: meta?.background || metaAny?.colours || undefined,
      colours: meta?.background || metaAny?.colours || undefined,
      background_style: meta?.background || metaAny?.colours || undefined,
      link_preview: meta?.linkPreview,
      feed_key: `post:${Date.now()}`,
      type: isVideoPost ? 'video' : (() => {
        const t = media_type || media_types[0] || null;
        if (!t) return meta?.type || 'text';
        if (typeof t === 'string' && t.startsWith('image')) return 'image';
        if (typeof t === 'string' && t.startsWith('video')) return 'video';
        if (typeof t === 'string' && t.startsWith('audio')) return 'audio';
        return meta?.type || 'text';
      })(),
    };

    const data = await apiFetch('/api/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const newPostRaw = data?.post ?? {
      ...payload,
      colours: meta?.background || metaAny?.colours || undefined,
      background: meta?.background || metaAny?.colours || undefined,
      background_style: meta?.background || metaAny?.colours || undefined,
      post_id: data?.post_id ?? data?.id ?? Date.now(),
      created_at: new Date().toISOString(),
    };

    // Safety normalize: force every image full -> feed
    if (Array.isArray((newPostRaw as any).media_meta)) {
      (newPostRaw as any).media_meta = (newPostRaw as any).media_meta.map((m: any) => ({
        ...m,
        thumb: m?.thumb || '',
        feed: m?.feed || m?.full || m?.thumb || '',
        full: m?.feed || m?.full || m?.thumb || '',
        type: m?.type || 'image',
      }));
    }

    const normalized = normalizePost(newPostRaw);

    setPosts((prev) => {
      const next = [normalized, ...safeArray(prev)];
      lastGoodPostsRef.current = next;
      stableFeedRef.current = next;
      return next;
    });

    setProfilePosts((prev) => {
      if (!currentUser) return prev;
      const isMyProfile = Number(selectedUserId) === Number(currentUser.id);
      if (!isMyProfile) return prev;
      const next = [normalized, ...safeArray(prev)];
      return next;
    });

    pushSeenIds([Number((normalized as any).id)]);

    setShowCreatePostModal(false);
    scheduleSilentRefresh();

    // Show clear success state with smooth completion
    setPostUploadState((prev) => prev ? ({
      ...prev,
      isUploading: false,
      isSuccess: true,
      progress: 100,
      title: 'Post uploaded successfully!',
      secondaryStatus: 'Your post is now visible on your timeline.',
    }) : null);

    setTimeout(() => {
      setPostUploadState(null);
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      }
    }, 2800);
  },
  [currentUser, requireAuth, scheduleSilentRefresh, selectedUserId]
);

  // Update user details
  const updateUserDetails = useCallback(
    async (data: Partial<User>) => {
      if (!requireAuth('Updating profile')) return;
      if (!currentUser) return;

      await apiFetch(`/api/users`, {
        method: 'PUT',
        body: JSON.stringify({ id: currentUser.id, ...data }),
      });

      const merged = normalizeUser({ ...currentUser, ...data });
      setCurrentUser(merged);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(merged));

      setUsers((prev) => safeArray(prev).map((u) => (Number(u.id) === Number(merged.id) ? merged : u)));
    },
    [requireAuth, currentUser]
  );

  // Update profile image with instant optimistic display & automatic compression
  const updateProfileImage = useCallback(
    async (file: File) => {
      if (!requireAuth('Updating profile')) return;
      if (!currentUser) return;

      if (!file.type || !file.type.startsWith('image/')) {
        setLoginError('Only image files are allowed.');
        return;
      }

      // 1. INSTANT optimistic preview (0ms delay):
      // Synchronously generate a local blob URL so that layout header, create story,
      // home composer, profile header, sidebar, etc. IMMEDIATELY show the newly uploaded avatar.
      const instantBlobUrl = URL.createObjectURL(file);
      const instantUser = normalizeUser({ ...currentUser, profile_image_url: instantBlobUrl });
      setCurrentUser(instantUser);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(instantUser));
      setUsers((prev) => safeArray(prev).map((u) => (Number(u.id) === Number(currentUser.id) ? instantUser : u)));

      let compressedBlobUrl = '';
      try {
        // 2. High-fidelity bicubic compression (center-cropped square 720px, high quality, < 150KB)
        const compressedFile = await compressProfileImage(file);
        compressedBlobUrl = URL.createObjectURL(compressedFile);

        // Update optimistic preview to the pristine compressed version
        const compressedUser = normalizeUser({ ...currentUser, profile_image_url: compressedBlobUrl });
        setCurrentUser(compressedUser);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(compressedUser));
        setUsers((prev) => safeArray(prev).map((u) => (Number(u.id) === Number(currentUser.id) ? compressedUser : u)));

        // 3. Upload lightweight compressed file to Cloudflare R2
        const uploadResult = await uploadToCloudflareR2(compressedFile, 'profiles');
        const finalUrl = `${uploadResult.url}?t=${Date.now()}`;

        // 4. Preload remote final URL in the background before applying it to state
        // This ensures the image is already decoded and cached in memory, preventing any flash or fallback to initials
        try {
          const preloader = new Image();
          preloader.src = finalUrl;
          await new Promise<void>((resolve) => {
            preloader.onload = () => resolve();
            preloader.onerror = () => resolve();
            setTimeout(resolve, 800);
          });
        } catch {}

        await updateUserDetails({ profile_image_url: finalUrl } as any);
      } catch (error: any) {
        setLoginError(`Failed to upload profile image: ${error.message}`);
      } finally {
        // Keep optimistic blob URLs alive for 60 seconds so image never breaks during transition
        setTimeout(() => {
          try { URL.revokeObjectURL(instantBlobUrl); } catch (e) {}
          if (compressedBlobUrl) {
            try { URL.revokeObjectURL(compressedBlobUrl); } catch (e) {}
          }
        }, 60000);
      }
    },
    [requireAuth, currentUser, updateUserDetails]
  );

  // Update cover image with instant optimistic display & automatic compression
  const updateCoverImage = useCallback(
    async (file: File) => {
      if (!requireAuth('Updating profile')) return;
      if (!currentUser) return;

      if (!file.type || !file.type.startsWith('image/')) {
        setLoginError('Only image files are allowed.');
        return;
      }

      // 1. Instant optimistic preview for cover
      const instantBlobUrl = URL.createObjectURL(file);
      const instantUser = normalizeUser({ ...currentUser, cover_image_url: instantBlobUrl });
      setCurrentUser(instantUser);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(instantUser));
      setUsers((prev) => safeArray(prev).map((u) => (Number(u.id) === Number(currentUser.id) ? instantUser : u)));

      let compressedBlobUrl = '';
      try {
        const compressedFile = await compressCoverImage(file);
        compressedBlobUrl = URL.createObjectURL(compressedFile);

        const compressedUser = normalizeUser({ ...currentUser, cover_image_url: compressedBlobUrl });
        setCurrentUser(compressedUser);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(compressedUser));
        setUsers((prev) => safeArray(prev).map((u) => (Number(u.id) === Number(currentUser.id) ? compressedUser : u)));

        const uploadResult = await uploadToCloudflareR2(compressedFile, 'covers');
        const finalUrl = `${uploadResult.url}?t=${Date.now()}`;

        try {
          const preloader = new Image();
          preloader.src = finalUrl;
          await new Promise<void>((resolve) => {
            preloader.onload = () => resolve();
            preloader.onerror = () => resolve();
            setTimeout(resolve, 800);
          });
        } catch {}

        await updateUserDetails({ cover_image_url: finalUrl } as any);
      } catch (error: any) {
        setLoginError(`Failed to upload cover image: ${error.message}`);
      } finally {
        setTimeout(() => {
          try { URL.revokeObjectURL(instantBlobUrl); } catch (e) {}
          if (compressedBlobUrl) {
            try { URL.revokeObjectURL(compressedBlobUrl); } catch (e) {}
          }
        }, 60000);
      }
    },
    [requireAuth, currentUser, updateUserDetails]
  );

  // Get post author
  const getPostAuthor = useCallback(
    (post: PostType) => {
      const author = users.find((u) => Number(u.id) === Number((post as any).user_id));
      if (author) return author;
      return createFallbackUser();
    },
    [users]
  );

  // Create story from profile
  const handleCreateStoryFromProfile = useCallback(() => {
    if (!requireAuth('Creating stories')) return;
    setShowCreateStoryModal(true);
  }, [requireAuth]);

  // All known posts
  const allKnownPosts = useMemo(() => {
    const map = new Map<number, PostType>();
    [...safeArray(posts), ...safeArray(profilePosts)].forEach(p => {
      if (p?.id) {
        map.set(Number(p.id), p);
      }
    });
    return Array.from(map.values());
  }, [posts, profilePosts]);

  // Open product from post
  const openProductFromPost = useCallback(
    (productId: number) => {
      const p = (products || []).find((x: any) => Number(x.id) === Number(productId));
      if (!p) {
        navigateTo('marketplace');
        return;
      }
      navigateTo('marketplace');
      setActiveProduct(p);
    },
    [products, navigateTo]
  );

  const isLoading = false;
  if (isLoading) return <ProfessionalLoader />;

  // Get product data
  const getProductData = useCallback((productId: number) => {
    const product = products.find(p => Number(p.id) === Number(productId));
    if (!product) return null;
    return {
      price: product.discount_price ?? product.main_price,
      location: product.address || 'Marketplace',
      currency: product.currency_symbol || product.currency || 'TZS',
      title: product.title,
      description: product.description,
      images: product.images,
      image_variants: product.image_variants,
      is_sponsored: Boolean(
        product.is_sponsored ||
        product.sponsored ||
        product.is_ad ||
        product.ad_id ||
        (ads && ads.some((a: any) => (a.product_id && Number(a.product_id) === Number(productId)) || (a.source_id && Number(a.source_id) === Number(productId)) || (a.post_id && Number(a.post_id) === Number(productId))))
      ),
    };
  }, [products, ads]);

  // Handle video click
  const handleVideoClick = useCallback((item: any) => {
    const videoId = resolveVideoId(item);
    if (!videoId) {
      console.warn('Could not resolve video ID for item:', item);
      return;
    }
    
    setSelectedReelId(videoId);
    navigateTo('reels');
  }, [navigateTo]);

  // Handle photo click - directly triggers phone gallery file picker
  const handlePhotoClick = useCallback(() => {
    if (!requireAuth('Creating posts')) return;
    if (phonePhotoInputRef.current) {
      phonePhotoInputRef.current.value = '';
      phonePhotoInputRef.current.click();
    }
  }, [requireAuth]);

  // Handle video click - directly triggers phone gallery video picker
  const handleVideoClickFromCreate = useCallback(() => {
    if (!requireAuth('Creating videos')) return;
    if (phoneVideoInputRef.current) {
      phoneVideoInputRef.current.value = '';
      phoneVideoInputRef.current.click();
    }
  }, [requireAuth]);

  // When photos are picked directly from phone gallery
  const handlePhonePhotoSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from<File>(e.target.files || []);
    if (!list.length) return;
    const previews = list.map((f: File) => URL.createObjectURL(f));
    setPendingPostMedia({
      files: list,
      previews,
      mediaUrls: previews,
      mediaType: 'image',
    });
    setShowCreatePostModal(true);
  }, []);

  // When video is picked directly from phone gallery
  const handlePhoneVideoSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPendingPostMedia({
      files: [file],
      previews: [preview],
      mediaUrls: [preview],
      mediaType: 'video',
    });
    setShowCreatePostModal(true);
  }, []);

const handleReelVideoSelected = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    // If in native app, use native picker instead
    if (isUneraNativeApp()) {
      const opened = openNativeVideoPicker();
      if (opened) {
        e.target.value = '';
        return;
      }
    }
    
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a video file');
      return;
    }

    setPendingReelFile(file);
    setView('recorder');
  },
  []
);
    
//====OPEN RECORDER FROM REEL=====

  
// For Native App: Opens Flutter gallery (kept exactly as is)
const openReelRecorderFromReels = useCallback((sound?: UseSoundPayload) => {
  // ✅ Open gallery first, NOT camera and NOT direct file picker
  setSelectedReelSoundForGallery(sound || undefined);
  setShowReelGallery(true);
}, []);

// For Web Browser: Direct file picker (kept exactly as is for web fallback)
const openDirectFilePicker = useCallback((sound?: UseSoundPayload) => {
  if (sound) {
    setSelectedReelSound({
      songName: sound.songName || 'Original Sound',
      audioUrl: sound.audioUrl || '',
      originalUrl: sound.originalUrl || sound.audioUrl || '',
      audioStart: sound.audioStart || 0,
      audioEnd: sound.audioEnd || 0,
      songId: sound.songId,
      soundKey:
        sound.soundKey ||
        (sound.songId ? `song:${sound.songId}` : `original:${Date.now()}`),
      isTrimmedAudio: !!sound.isTrimmedAudio,
    });
  } else {
    setSelectedReelSound(null);
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';

  input.onchange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingReelFile(file);
    setView('recorder');
  };

  input.click();
}, []);
                                            

  // Event Detail Modal
  const EventDetailModal = useCallback(({ eventId, onClose }: { eventId: number; onClose: () => void }) => {
    const event = events.find(e => e.id === eventId);
    
    if (!event) return null;
    
    return (
      <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="relative h-64">
            <img 
              src={event.cover_url || DEFAULT_EVENT_COVER} 
              alt={event.title}
              className="w-full h-full object-cover"
            />
            <button 
              onClick={onClose} 
              className="absolute top-4 right-4 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"
            >
              <i className="fas fa-times text-white"></i>
            </button>
          </div>
          <div className="p-6">
            <h2 className="text-2xl font-black text-white mb-2">{event.title}</h2>
            <p className="text-[#94A3B8] mb-4">{event.description}</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-[#94A3B8]">
                <i className="fas fa-calendar-alt w-5 text-[#1877F2]"></i>
                <span>{new Date(event.event_date).toLocaleDateString()} at {event.time}</span>
              </div>
              {event.location && (
                <div className="flex items-center gap-3 text-[#94A3B8]">
                  <i className="fas fa-map-marker-alt w-5 text-[#F02849]"></i>
                  <span>{event.location}</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onRSVPEvent(event.id, event.user_rsvp_status === 'going' ? 'not_going' : 'going');
                  onClose();
                }}
                className={`flex-1 py-3 rounded-lg font-bold ${
                  event.user_rsvp_status === 'going'
                    ? 'bg-[#45BD62] text-white'
                    : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                }`}
              >
                {event.user_rsvp_status === 'going' ? '✓ Going' : 'Going'}
              </button>
              <button
                onClick={() => {
                  onRSVPEvent(event.id, event.user_rsvp_status === 'interested' ? 'not_going' : 'interested');
                  onClose();
                }}
                className={`flex-1 py-3 rounded-lg font-bold ${
                  event.user_rsvp_status === 'interested'
                    ? 'bg-[#F7B928] text-black'
                    : 'bg-[#1E293B] text-white hover:bg-[#334155]'
                }`}
              >
                {event.user_rsvp_status === 'interested' ? '✓ Interested' : 'Interested'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [events, onRSVPEvent]);

    
// ============================================================================
// ✅ HYBRID REACT HANDLER - Supports both numeric ID and full object
// ============================================================================
const reactToFeedItem = useCallback(async (item: any, type: ReactionType) => {
  if (!requireAuth('Reacting')) return;
  if (!currentUser || !item) return;

  // Get identity and ID safely
  let identity = '';
  let itemId = 0;
  let itemType = 'post';
  
  try {
    identity = getFeedKey(item);
    itemId = getFeedItemId(item);
    itemType = getFeedItemType(item);
  } catch (error) {
    console.error('Failed to get feed identity:', error);
    // Fallback to treating as post with ID
    if (typeof item === 'number') {
      itemId = item;
      identity = `post:${item}`;
    } else if (item?.id) {
      itemId = Number(item.id);
      identity = `post:${itemId}`;
    } else {
      return;
    }
    itemType = 'post';
  }
  
  const meId = currentUser.id;

  // Prevent multiple taps
  if (reactingMap[identity]) return;

  // Get current item from appropriate source
  const sourceList = view === 'profile' ? profilePosts : posts;
  const previousItem = safeArray(sourceList).find((p: any) => {
    try {
      return getFeedKey(p) === identity;
    } catch {
      return Number(p?.id) === itemId;
    }
  }) || item;
  
  if (!previousItem) return;

  // Helper to replace item by identity or ID
  const replaceItem = (list: any[], replacement: any) => 
    safeArray(list).map(p => {
      try {
        if (getFeedKey(p) === identity) return replacement;
      } catch {
        if (Number(p?.id) === itemId) return replacement;
      }
      return p;
    });

  // Set reacting lock
  setReacting(identity, true);

  // Apply optimistic update
  const optimisticItem = applyOptimisticReaction(previousItem, identity, type, meId);
  setPosts(prev => replaceItem(prev, optimisticItem));
  setProfilePosts(prev => replaceItem(prev, optimisticItem));
  
  if (activeCommentsIdentity === identity) {
    setCommentPostSnapshot(optimisticItem);
  }

  try {
    let endpoint = '';
    let bodyPayload: any = { type, user_id: meId };

    const isGroupItem = itemType === 'group_post' || Boolean(item?.group_id || item?.group_post_id || item?.source === 'group_post' || item?.meta?.group_id);

    if (isGroupItem) {
      endpoint = '/api/group-post-likes';
      const targetPostId = Number(item?.post_id || item?.group_post_id || item?.id || itemId);
      bodyPayload = {
        user_id: meId,
        post_id: targetPostId,
        type,
      };
    } else {
      switch (itemType) {
        case 'story':
          endpoint = `/api/stories/${itemId}/react`;
          break;
        case 'event':
          endpoint = `/api/events/${itemId}/react`;
          break;
        case 'product':
          endpoint = `/api/products/${itemId}/react`;
          break;
        case 'reel':
          endpoint = `/api/posts/${itemId}/react`;
          break;
        case 'music':
        case 'song':
          endpoint = `/api/songs/${itemId}/react`;
          break;
        case 'podcast':
          endpoint = `/api/podcasts/${itemId}/react`;
          break;
        default:
          endpoint = `/api/posts/${itemId}/react`;
      }
    }

    const data = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(bodyPayload),
    });

    if (data?.success && ('reactions_count' in data || 'my_reaction' in data)) {
      const serverMy = data.my_reaction ?? null;
      const serverCount = safeNumber(data.reactions_count, 0);

      const applyServerTruth = (p: any) => {
        let isMatch = false;
        try {
          if (getFeedKey(p) === identity) isMatch = true;
        } catch {}
        if (!isMatch) {
          const pid = Number(p?.id);
          const peid = Number((p as any)?.event_id);
          const psid = Number((p as any)?.song_id || (p as any)?.song_id2);
          if ((itemId && pid === itemId) || (itemId && peid === itemId) || (itemId && psid === itemId)) isMatch = true;
        }
        if (!isMatch) return p;

        const prevArr = safeArray<any>(p?.reactions);
        const withoutMe = prevArr.filter((r: any) => Number(r?.user_id) !== meId);
        const nextArr = serverMy ? [...withoutMe, { user_id: meId, type: serverMy }] : withoutMe;

        return {
          ...p,
          reactions: nextArr,
          my_reaction: serverMy,
          myReaction: serverMy,
          reactions_count: serverCount,
          reactionsCount: serverCount,
          likesCount: serverCount,
          shares: data?.shares ?? p?.shares,
          shares_count: data?.shares_count ?? p?.shares_count,
        };
      };

      setPosts(prev => safeArray(prev).map(applyServerTruth));
      setProfilePosts(prev => safeArray(prev).map(applyServerTruth));
      setCommentPostSnapshot(prev => prev ? applyServerTruth(prev) : prev);
    }
  } catch (error) {
    console.error('Failed to react:', error);
    // Restore previous state on failure
    setPosts(prev => replaceItem(prev, previousItem));
    setProfilePosts(prev => replaceItem(prev, previousItem));
    setCommentPostSnapshot(prev => prev && getFeedKey(prev) === identity ? previousItem : prev);
  } finally {
    setReacting(identity, false);
  }
}, [currentUser, requireAuth, reactingMap, view, posts, profilePosts, activeCommentsIdentity, setReacting]);





// ============================================================================
// ✅ HYBRID COMMENT HANDLERS
// ============================================================================
const fetchComments = useCallback(async (item: any) => {
  if (!requireAuth('Viewing comments')) return [];
  if (!item) return [];
  
  let type = 'post';
  let id = 0;
  
  try {
    type = getFeedItemType(item);
    id = getFeedItemId(item);
  } catch {
    type = 'post';
    id = Number(item?.id ?? 0);
  }
  
  try {
    let endpoint = '';
    switch (type) {
      case 'story': {
        const userId = currentUser?.id ? String(currentUser.id) : '0';
        const res = await fetch(`/api/stories/${id}/comments?viewerId=${userId}`, {
          method: 'GET',
          headers: { 'x-user-id': String(userId) },
        });
        const data = await res.json().catch(() => null);
        return safeArray(data?.comments ?? data);
      }
      case 'event':
        endpoint = `/api/events/${id}/comments?viewerId=${currentUser?.id || 0}`;
        break;
      case 'group_post':
        endpoint = `/api/group-post-comments?post_id=${id}&viewerId=${currentUser?.id || 0}`;
        break;
      case 'product':
        endpoint = `/api/products/${id}/reviews?viewerId=${currentUser?.id || 0}`;
        break;
      case 'reel':
        endpoint = `/api/posts/${id}/comments?viewerId=${currentUser?.id || 0}`;
        break;
      case 'music':
      case 'song': {
        const songId = Number(
          id ||
          (item as any)?.song_id ||
          (item as any)?.song_id2 ||
          (item as any)?.meta?.song?.id ||
          (item as any)?.meta?.original_song_id ||
          (item as any)?.shared_song?.id ||
          0
        );
        const userId = currentUser?.id ? String(currentUser.id) : '0';
        const res = await fetch(`/api/songs/${songId}/comments?viewerId=${userId}`, {
          method: 'GET',
          headers: { 'x-user-id': String(userId) },
        });
        const data = await res.json().catch(() => null);
        return safeArray(data?.comments ?? data);
      }
      case 'podcast':
        endpoint = `/api/podcasts/${id}/comments?viewerId=${currentUser?.id || 0}`;
        break;
      default:
        endpoint = `/api/posts/${id}/comments?viewerId=${currentUser?.id || 0}`;
    }
    
    const data = await apiFetch(endpoint);
    return safeArray(data?.comments ?? data);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return [];
  }
}, [currentUser, requireAuth]);

const handleOpenComments = useCallback((post: PostType) => {
  if (!requireAuth('Viewing comments')) return;
  if (!post) return;
  
  let postType: 'feed_post' | 'group_post' | 'marketplace_post' | 'event_post' | 'reel_post' | 'music_post' = 'feed_post';
  
  if ((post as any).group_id || (post as any).group) {
    postType = 'group_post';
  } else if ((post as any).product_id || (post as any).marketplace || (post as any).type === 'product') {
    postType = 'marketplace_post';
  } else if ((post as any).event_id || (post as any).type === 'event' || (post as any).item_type === 'event') {
    postType = 'event_post';
  } else if ((post as any).reel_id || (post as any).type === 'reel') {
    postType = 'reel_post';
  } else if (
    (post as any).song_id ||
    (post as any).song_id2 ||
    (post as any).type === 'music' ||
    (post as any).type === 'song' ||
    (post as any).item_type === 'music' ||
    (post as any).item_type === 'song' ||
    (post as any).source === 'song' ||
    (post as any).source === 'music' ||
    (post as any).song_title ||
    ((post as any).audio_url && !(post as any).podcast_id)
  ) {
    postType = 'music_post';
  }
  
  setCommentPostSnapshot(post);
  setActiveCommentsIdentity({ type: postType, id: post.id });
}, [requireAuth]);
          


const handleCloseComments = useCallback(() => {
  setActiveCommentsIdentity(null);
  setCommentPostSnapshot(null);
}, []);

const createComment = useCallback(async (
  item: any,
  text: string,
  parentCommentId: number | null = null,
  imageFile?: File | null
) => {
  if (!requireAuth('Commenting')) return null;
  if (!currentUser) return null;
  if (!text?.trim() && !imageFile) {
    setLoginError('Comment cannot be empty');
    return null;
  }

  let targetItem = item;
  if (typeof item === 'number' || typeof item === 'string') {
    const numId = Number(item);
    targetItem = 
      (commentPostSnapshot && (Number(commentPostSnapshot.id) === numId || Number((commentPostSnapshot as any).event_id) === numId) ? commentPostSnapshot : null) ||
      safeArray(posts).find(p => Number(p.id) === numId || Number((p as any).event_id) === numId) ||
      safeArray(profilePosts).find(p => Number(p.id) === numId || Number((p as any).event_id) === numId) ||
      { id: numId };
  } else if (!item && commentPostSnapshot) {
    targetItem = commentPostSnapshot;
  }

  let identity = '';
  let type = 'post';
  let id = 0;
  
  try {
    identity = getFeedKey(targetItem);
    type = getFeedItemType(targetItem);
    id = getFeedItemId(targetItem);
  } catch {
    identity = `post:${targetItem?.id}`;
    type = 'post';
    id = Number(targetItem?.id ?? 0);
  }

  try {
    let image_url = '';

    if (imageFile) {
      image_url = await ensureR2Url(
        imageFile,
        'comments',
        `comment-${Date.now()}.jpg`
      );
    }

    let endpoint = '';
    let payload: any = {};

    switch (type) {
      case 'story':
        endpoint = `/api/stories/${id}/comments`;
        payload = {
          user_id: currentUser.id,
          content: text || '',
          parent_id: parentCommentId ?? null,
          image_url: image_url || null,
        };
        break;
      case 'event':
        endpoint = `/api/events/${id}/comment`;
        payload = {
          user_id: currentUser.id,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || '',
        };
        break;
      case 'group_post':
        endpoint = `/api/group-post-comments`;
        payload = {
          user_id: currentUser.id,
          post_id: id,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || null,
        };
        break;
      case 'product':
        endpoint = `/api/products/${id}/review`;
        payload = {
          user_id: currentUser.id,
          rating: null,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || '',
        };
        break;
      case 'reel':
        endpoint = `/api/posts/${id}/comments`;
        payload = {
          user_id: currentUser.id,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || '',
        };
        break;
      case 'music':
      case 'song': {
        const songId = Number(
          id ||
          (targetItem as any)?.song_id ||
          (targetItem as any)?.song_id2 ||
          (targetItem as any)?.meta?.song?.id ||
          (targetItem as any)?.meta?.original_song_id ||
          (targetItem as any)?.shared_song?.id ||
          0
        );
        endpoint = `/api/songs/${songId}/comment`;
        payload = {
          user_id: currentUser.id,
          text: text || '',
          image_url: image_url || null,
          parent_comment_id: parentCommentId ?? null,
        };
        break;
      }
      case 'podcast':
        endpoint = `/api/podcasts/${id}/comments`;
        payload = {
          user_id: currentUser.id,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || '',
        };
        break;
      default:
        endpoint = `/api/posts/${id}/comments`;
        payload = {
          user_id: currentUser.id,
          text: text || '',
          parent_comment_id: parentCommentId ?? null,
          image_url: image_url || '',
        };
    }

    let data: any = null;
    if (type === 'story' || type === 'music' || type === 'song') {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(() => null);
    } else {
      data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    const newComment: any = {
      id: safeNumber(data?.comment?.id ?? 0),
      user_id: currentUser.id,
      parent_comment_id: parentCommentId ?? null,
      text: text || '',
      image_url: image_url || '',
      created_at: data?.comment?.created_at ?? new Date().toISOString(),
      user: {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        profile_image_url: currentUser.profile_image_url,
        is_verified: currentUser.is_verified,
      },
      likes_count: 0,
      liked_by_me: false,
      replies: [],
      replies_count: 0,
    };

    // Add type-specific ID field
    switch (type) {
      case 'event':
        newComment.event_id = id;
        break;
      case 'product':
        newComment.product_id = id;
        break;
      case 'reel':
        newComment.reel_id = id;
        break;
      case 'music':
      case 'song':
        newComment.song_id = id;
        break;
      default:
        newComment.post_id = id;
    }

    // Update posts state with new comment using identity
    const updatePostsWithComment = (postsList: any[]) => {
      return postsList.map(post => {
        let isMatch = false;
        try {
          if (getFeedKey(post) === identity) isMatch = true;
        } catch {}
        if (!isMatch) {
          const pid = Number(post?.id);
          const peid = Number((post as any)?.event_id);
          const psid = Number((post as any)?.song_id || (post as any)?.song_id2);
          if ((id && pid === id) || (id && peid === id) || (id && psid === id)) isMatch = true;
        }
        if (!isMatch) return post;
        
        const existingComments = safeArray((post as any).comments);
        const alreadyExists = existingComments.some((c: any) => String(c?.id) === String(newComment.id));
        if (alreadyExists) return post;
        const nextCount = data?.comments_count != null ? safeNumber(data.comments_count) : safeNumber((post as any).comments_count) + 1;
        return {
          ...post,
          comments: [newComment, ...existingComments],
          comments_count: nextCount,
          comment_count: nextCount,
        };
      });
    };

    setPosts(prev => updatePostsWithComment(safeArray(prev)));
    
    if (view === 'profile' && selectedUserId) {
      setProfilePosts(prev => updatePostsWithComment(safeArray(prev)));
    }

    if (activeCommentsIdentity && commentPostSnapshot) {
      setCommentPostSnapshot(prev => {
        if (!prev) return prev;
        const existingComments = safeArray((prev as any).comments);
        const alreadyExists = existingComments.some((c: any) => String(c?.id) === String(newComment.id));
        if (alreadyExists) return prev;
        return {
          ...prev,
          comments: [newComment, ...existingComments],
          comments_count: safeNumber((prev as any).comments_count) + 1,
        } as any;
      });
    }

    return newComment;
  } catch (error) {
    console.error('Failed to create comment:', error);
    setLoginError('Failed to post comment');
    return null;
  }
}, [currentUser, requireAuth, view, selectedUserId, activeCommentsIdentity, commentPostSnapshot]);

const editComment = useCallback(async (
  commentId: number,
  text: string,
  imageFile?: File | null,
  existingImageUrl?: string
) => {
  if (!requireAuth('Editing comments')) return null;
  if (!currentUser) return null;

  try {
    let image_url = existingImageUrl || '';

    if (imageFile) {
      image_url = await ensureR2Url(
        imageFile,
        'comments',
        `comment-edit-${Date.now()}.jpg`
      );
    }

    const data = await apiFetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        user_id: currentUser.id,
        text: text || '',
        image_url,
      }),
    });

    const updatedComment = data?.comment || {};

    const updateCommentInPosts = (postsList: any[]) => {
      return postsList.map(post => ({
        ...post,
        comments: safeArray(post.comments).map((comment: any) => {
          if (Number(comment.id) !== Number(commentId)) return comment;
          return {
            ...comment,
            text: updatedComment.text ?? text ?? comment.text,
            image_url: updatedComment.image_url ?? image_url ?? comment.image_url,
          };
        }),
      }));
    };

    setPosts(prev => updateCommentInPosts(safeArray(prev)));
    
    if (view === 'profile') {
      setProfilePosts(prev => updateCommentInPosts(safeArray(prev)));
    }

    if (activeCommentsIdentity && commentPostSnapshot) {
      setCommentPostSnapshot(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          comments: safeArray((prev as any).comments).map((comment: any) => {
            if (Number(comment.id) !== Number(commentId)) return comment;
            return {
              ...comment,
              text: updatedComment.text ?? text ?? comment.text,
              image_url: updatedComment.image_url ?? image_url ?? comment.image_url,
            };
          }),
        } as any;
      });
    }

    return updatedComment;
  } catch (error) {
    console.error('Failed to edit comment:', error);
    setLoginError('Failed to edit comment');
    return null;
  }
}, [currentUser, requireAuth, view, activeCommentsIdentity, commentPostSnapshot]);

const deleteComment = useCallback(async (commentId: number, itemOrSongId?: any) => {
  if (!requireAuth('Deleting comments')) return false;
  if (!currentUser) return false;

  try {
    const isSong =
      (itemOrSongId && (itemOrSongId?.item_type === 'music' || itemOrSongId?.item_type === 'song' || itemOrSongId?.type === 'music' || itemOrSongId?.type === 'song' || itemOrSongId?.song_id || itemOrSongId?.song_id2)) ||
      (activeCommentsIdentity?.type === 'music_post');
    const songId = Number(
      itemOrSongId?.song_id ??
      itemOrSongId?.song_id2 ??
      (typeof itemOrSongId === 'number' ? itemOrSongId : null) ??
      (commentPostSnapshot as any)?.song_id ??
      (commentPostSnapshot as any)?.song_id2 ??
      (commentPostSnapshot as any)?.meta?.song?.id ??
      (commentPostSnapshot as any)?.meta?.original_song_id ??
      (commentPostSnapshot as any)?.id ??
      0
    );

    const isStory =
      (itemOrSongId && (itemOrSongId?.item_type === 'story' || itemOrSongId?.type === 'story' || itemOrSongId?.story_id)) ||
      (activeCommentsIdentity?.type === 'story_post');
    const storyId = Number(
      itemOrSongId?.story_id ??
      (itemOrSongId?.item_type === 'story' || itemOrSongId?.type === 'story' ? itemOrSongId?.id : null) ??
      (commentPostSnapshot as any)?.story_id ??
      ((commentPostSnapshot as any)?.type === 'story' ? (commentPostSnapshot as any)?.id : null) ??
      0
    );

    if (isStory && storyId) {
      await fetch(`/api/stories/${storyId}/comments?comment_id=${commentId}&user_id=${currentUser.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(currentUser.id) },
      });
    } else if (isSong && songId) {
      await fetch(`/api/songs/${songId}/comments?comment_id=${commentId}&user_id=${currentUser.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(currentUser.id) },
      });
    } else {
      await apiFetch(`/api/post-comments/${commentId}/delete?user_id=${currentUser.id}`, {
        method: 'DELETE',
      });
    }

    const removeCommentFromPosts = (postsList: any[]) => {
      return postsList.map(post => {
        const before = safeArray(post.comments);
        
        const filtered = before.filter((comment: any) => {
          const commentIdNum = Number(comment.id);
          const parentId = Number(comment.parent_comment_id);
          return commentIdNum !== Number(commentId) && parentId !== Number(commentId);
        });
        
        const removedCount = before.length - filtered.length;
        
        if (removedCount === 0) return post;
        
        return {
          ...post,
          comments: filtered,
          comments_count: Math.max(0, safeNumber(post.comments_count) - removedCount),
        };
      });
    };

    setPosts(prev => removeCommentFromPosts(safeArray(prev)));
    
    if (view === 'profile') {
      setProfilePosts(prev => removeCommentFromPosts(safeArray(prev)));
    }

    if (activeCommentsIdentity && commentPostSnapshot) {
      setCommentPostSnapshot(prev => {
        if (!prev) return prev;
        const before = safeArray((prev as any).comments);
        const filtered = before.filter((comment: any) => {
          const commentIdNum = Number(comment.id);
          const parentId = Number(comment.parent_comment_id);
          return commentIdNum !== Number(commentId) && parentId !== Number(commentId);
        });
        
        return {
          ...prev,
          comments: filtered,
          comments_count: filtered.length,
        } as any;
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to delete comment:', error);
    setLoginError('Failed to delete comment');
    return false;
  }
}, [currentUser, requireAuth, view, activeCommentsIdentity, commentPostSnapshot]);

const likeComment = useCallback(async (commentId: number) => {
  if (!requireAuth('Liking comments')) return null;
  if (!currentUser) return null;

  const updateCommentLike = (comment: any) => {
    const currentlyLiked = comment.liked_by_me;
    return {
      ...comment,
      liked_by_me: !currentlyLiked,
      likes_count: currentlyLiked 
        ? Math.max(0, (comment.likes_count || 0) - 1)
        : (comment.likes_count || 0) + 1,
    };
  };

  const updateLikesInPosts = (postsList: any[]) => {
    return postsList.map(post => ({
      ...post,
      comments: safeArray(post.comments).map((comment: any) => {
        if (Number(comment.id) !== Number(commentId)) return comment;
        return updateCommentLike(comment);
      }),
    }));
  };

  setPosts(prev => updateLikesInPosts(safeArray(prev)));
  
  if (view === 'profile') {
    setProfilePosts(prev => updateLikesInPosts(safeArray(prev)));
  }

  if (activeCommentsIdentity && commentPostSnapshot) {
    setCommentPostSnapshot(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        comments: safeArray((prev as any).comments).map((comment: any) => {
          if (Number(comment.id) !== Number(commentId)) return comment;
          return updateCommentLike(comment);
        }),
      } as any;
    });
  }

  try {
    const isGroup =
      activeCommentsIdentity?.type === 'group_post' ||
      (commentPostSnapshot as any)?.group_id ||
      (commentPostSnapshot as any)?.source === 'group_post' ||
      (commentPostSnapshot as any)?.item_type === 'group_post' ||
      (commentPostSnapshot as any)?.type === 'group_post';
    const isSong =
      activeCommentsIdentity?.type === 'music_post' ||
      (commentPostSnapshot as any)?.item_type === 'music' ||
      (commentPostSnapshot as any)?.item_type === 'song' ||
      (commentPostSnapshot as any)?.type === 'music' ||
      (commentPostSnapshot as any)?.type === 'song' ||
      (commentPostSnapshot as any)?.song_id ||
      (commentPostSnapshot as any)?.song_id2;

    let likeEndpoint = `/api/post-comments/${commentId}/like`;
    let likeBody: any = { user_id: currentUser.id };

    if (isGroup) {
      likeEndpoint = `/api/group-post-comment-likes`;
      likeBody = {
        comment_id: Number(commentId),
        user_id: Number(currentUser.id),
      };
    } else if (isSong) {
      likeEndpoint = `/api/song-comments/${commentId}/like`;
    }

    const data = await apiFetch(likeEndpoint, {
      method: 'POST',
      body: JSON.stringify(likeBody),
    });
    
    return data;
  } catch (error) {
    console.error('Failed to like comment:', error);
    if (commentPostSnapshot) {
      refreshComments(commentPostSnapshot).catch(() => {});
    }
    return null;
  }
}, [currentUser, requireAuth, view, activeCommentsIdentity, commentPostSnapshot]);

const fetchCommentReplies = useCallback(async (commentId: number) => {
  if (!requireAuth('Viewing replies')) return [];
  
  try {
    const data = await apiFetch(`/api/comments/${commentId}/replies`);
    return safeArray(data?.replies ?? data);
  } catch (error) {
    console.error('Failed to fetch replies:', error);
    return [];
  }
}, [requireAuth]);

const getCommentAuthor = useCallback((userId: number) => {
  return users.find(u => Number(u.id) === Number(userId)) || null;
}, [users]);

const refreshComments = useCallback(async (item: any) => {
  if (!item) return [];
  
  let identity = '';
  let id = 0;
  
  try {
    identity = getFeedKey(item);
    id = getFeedItemId(item);
  } catch {
    identity = `post:${item?.id}`;
    id = Number(item?.id ?? 0);
  }
  
  const freshComments = await fetchComments(item);
  
  const updateCommentsInPosts = (postsList: any[]) => {
    return postsList.map(post => {
      try {
        if (getFeedKey(post) !== identity) return post;
      } catch {
        if (Number(post?.id) !== id) return post;
      }
      return {
        ...post,
        comments: freshComments,
        comments_count: freshComments.length,
      };
    });
  };
  
  setPosts(prev => updateCommentsInPosts(safeArray(prev)));
  
  if (view === 'profile') {
    setProfilePosts(prev => updateCommentsInPosts(safeArray(prev)));
  }
  
  if (activeCommentsIdentity && commentPostSnapshot) {
    setCommentPostSnapshot(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        comments: freshComments,
        comments_count: freshComments.length,
      } as any;
    });
  }
  
  return freshComments;
}, [fetchComments, view, activeCommentsIdentity, commentPostSnapshot]);


// ============================================================================
// ✅ ORIGINAL FUNCTIONS (Preserved)
// ============================================================================
const onReactPost = useCallback((postOrId: any, type: ReactionType) => {
  const post = typeof postOrId === 'object' && postOrId !== null
    ? postOrId
    : (posts.find(p => Number(p.id) === Number(postOrId)) || profilePosts.find(p => Number(p.id) === Number(postOrId)));
  if (post) {
    reactToFeedItem(post, type);
  } else if (postOrId) {
    reactToFeedItem(postOrId, type);
  }
}, [posts, profilePosts, reactToFeedItem]);

const handleOpenShareSheet = useCallback(
  (post: any) => {
    if (!currentUser) {
      setLoginError('Please login to share posts.');
      setView('login');
      return;
    }
    setActiveSharePost(post);
    setShowShareSheet(true);
  },
  [currentUser]
);

const handleShareComplete = useCallback(
  async (destination: string, data?: any, sourcePost?: any) => {
    const targetPost =
      sourcePost ||
      activeSharePost ||
      data?.post?.shared_post ||
      data?.shared_post ||
      (data?.post?.shared_post_id
        ? posts.find((p: any) => Number(p.id) === Number(data.post.shared_post_id))
        : null);

    const targetPostId = Number(
      targetPost?.id || targetPost?.post_id || data?.post?.shared_post_id || 0
    );

    if (data?.success || targetPost) {
      if (targetPostId) {
        const matchesTarget = (p: any) =>
          Number(p.id) === targetPostId ||
          Number(p.product_id) === targetPostId ||
          Number(p?.meta?.marketplace?.id) === targetPostId ||
          p.feed_key === `product:${targetPostId}` ||
          p.feed_key === `post:${targetPostId}`;

        const nextSharesCount = safeNumber(data?.shares) || (safeNumber(targetPost?.shares_count ?? targetPost?.shares) + 1);

        setPosts((prev) => {
          const next = safeArray(prev).map((p: any) =>
            matchesTarget(p)
              ? normalizePost({
                  ...p,
                  shares: Math.max(safeNumber(p.shares) + 1, nextSharesCount),
                  shares_count: Math.max(safeNumber(p.shares_count ?? p.shares) + 1, nextSharesCount),
                })
              : p
          );
          lastGoodPostsRef.current = next;
          stableFeedRef.current = next;
          return next;
        });

        setProfilePosts((prev) => {
          return safeArray(prev).map((p: any) =>
            matchesTarget(p)
              ? normalizePost({
                  ...p,
                  shares: Math.max(safeNumber(p.shares) + 1, nextSharesCount),
                  shares_count: Math.max(safeNumber(p.shares_count ?? p.shares) + 1, nextSharesCount),
                })
              : p
          );
        });

        const isStory = !!(targetPost?.story_id || targetPost?.item_type === 'story' || targetPost?.type === 'story' || targetPost?.kind === 'story');
        if (isStory) {
          setStories((prev) =>
            safeArray(prev).map((s: any) =>
              Number(s.id) === targetPostId || Number(s.story_id) === targetPostId
                ? {
                    ...s,
                    shares: Math.max(safeNumber(s.shares) + 1, nextSharesCount),
                    shares_count: Math.max(safeNumber(s.shares_count ?? s.shares) + 1, nextSharesCount),
                  }
                : s
            )
          );
          if (frozenStoriesRef.current) {
            frozenStoriesRef.current = frozenStoriesRef.current.map((s: any) =>
              Number(s.id) === targetPostId || Number(s.story_id) === targetPostId
                ? {
                    ...s,
                    shares: Math.max(safeNumber(s.shares) + 1, nextSharesCount),
                    shares_count: Math.max(safeNumber(s.shares_count ?? s.shares) + 1, nextSharesCount),
                  }
                : s
            );
          }
        }
      }

      // If shared to Feed or Profile, immediately insert the new shared post card
      if (destination === 'feed' || destination === 'profile') {
        const rawNewPost = data?.post || data?.data?.post || {
          id: Date.now(),
          post_id: Date.now(),
          user_id: currentUser?.id,
          author: currentUser,
          content: data?.message || data?.data?.message || '',
          shared_post_id: targetPostId || targetPost?.id,
          shared_post: targetPost,
          created_at: new Date().toISOString(),
          shares: 0,
          shares_count: 0,
          likes_count: 0,
          reactions_count: 0,
          reactions: [],
          comments: [],
        };

        const isTargetStory = !!(targetPost?.story_id || targetPost?.item_type === 'story' || targetPost?.type === 'story' || targetPost?.kind === 'story');

        const rawShared = rawNewPost.shared_post || data?.shared_post || data?.data?.shared_post || targetPost;
        const resolvedSharedPost = rawShared ? {
          ...rawShared,
          video_url: rawShared.video_url || rawShared.video_url_medium || rawShared.video_url_hd || rawShared.video || targetPost?.video_url || targetPost?.video,
          media_url: rawShared.media_url || rawShared.video_url || targetPost?.media_url || targetPost?.video_url,
          thumbnail_url: rawShared.thumbnail_url || targetPost?.thumbnail_url,
          caption: rawShared.caption || rawShared.content || targetPost?.caption || targetPost?.content || '',
          author: rawShared.author || targetPost?.author,
        } : null;

        const newSharedItem = normalizePost({
          ...rawNewPost,
          author: rawNewPost.author || currentUser,
          user: rawNewPost.user || currentUser,
          shared_post: resolvedSharedPost,
          shared_story: isTargetStory ? (rawNewPost.shared_story || resolvedSharedPost) : undefined,
          shared_post_id: rawNewPost.shared_post_id || targetPostId,
          item_type: isTargetStory ? 'story_share' : (rawNewPost.item_type || 'share'),
          source: isTargetStory ? 'story_share' : (rawNewPost.source || 'share'),
          feed_key: isTargetStory ? `story_share:${rawNewPost.id}` : (rawNewPost.feed_key || `share:${rawNewPost.id}`),
        });

        setPosts((prev) => {
          const next = [
            newSharedItem,
            ...safeArray(prev).filter((p: any) => Number(p.id) !== Number(newSharedItem.id)),
          ];
          lastGoodPostsRef.current = next;
          stableFeedRef.current = next;
          return next;
        });

        setProfilePosts((prev) => [
          newSharedItem,
          ...safeArray(prev).filter((p: any) => Number(p.id) !== Number(newSharedItem.id)),
        ]);
      } else if (destination === 'group') {
        const targetGid = Number(data?.target_group_id || data?.data?.target_group_id || data?.post?.group_id || 0);
        if (targetGid && typeof fetchGroupPosts === 'function') {
          fetchGroupPosts(targetGid).catch(() => {});
        }
      }

      // If ShareBottomSheet did not already execute the network call, record it
      if (!data?.data && targetPostId) {
        try {
          let shareEndpoint = `/api/posts/${targetPostId}/share`;
          let shareBody: any = { destination, user_id: currentUser?.id, message: data?.message };

          const isGroupPost = !!(targetPost?.group_id || targetPost?.item_type === 'group_post');
          const isStory = !!(targetPost?.story_id || targetPost?.item_type === 'story' || targetPost?.type === 'story');
          const isSong = !!(targetPost?.song_id || targetPost?.song_id2 || targetPost?.item_type === 'song' || targetPost?.item_type === 'music');
          const isProduct = !!(targetPost?.product_id || targetPost?.item_type === 'product');
          const isEvent = !!(targetPost?.event_id || targetPost?.item_type === 'event');

          if (isStory) {
            const storyId = targetPost.story_id || targetPostId;
            shareEndpoint = `/api/stories/${storyId}/share`;
            shareBody = { user_id: currentUser?.id, destination, message: data?.message };
          } else if (isGroupPost) {
            shareEndpoint = `/api/groups/posts/share`;
            shareBody = { destination, post_id: targetPostId, group_id: targetPost.group_id, user_id: currentUser?.id };
          } else if (isSong) {
            const songId = targetPost.song_id || targetPost.song_id2 || targetPostId;
            shareEndpoint = `/api/songs/${songId}/share`;
            shareBody = { destination, song_id: songId, user_id: currentUser?.id };
          } else if (isProduct) {
            const prodId = targetPost.product_id || targetPostId;
            shareEndpoint = `/api/products/${prodId}/share`;
            shareBody = { destination, product_id: prodId, user_id: currentUser?.id };
          } else if (isEvent) {
            const evId = targetPost.event_id || targetPostId;
            shareEndpoint = `/api/events/${evId}/share`;
            shareBody = { destination, event_id: evId, user_id: currentUser?.id };
          }

          await apiFetch(shareEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': String(currentUser?.id || shareBody.user_id || ''),
            },
            body: JSON.stringify(shareBody),
          });
        } catch (error) {
          console.error('Failed to record share:', error);
        }
      }
    }

    setShareInProgress(false);
    setActiveSharePost(null);
    setShowShareSheet(false);
    scheduleSilentRefresh();
  },
  [activeSharePost, currentUser, posts, scheduleSilentRefresh]
);

const deletePost = useCallback(
  async (postId: number) => {
    if (!requireAuth('Deleting posts')) return;

    const prev = posts;
    const prevProfilePosts = profilePosts;
    
    setPosts((p) => {
      const next = safeArray(p).filter((x: any) => Number(x.id) !== Number(postId));
      lastGoodPostsRef.current = next;
      stableFeedRef.current = next;
      return next;
    });

    setProfilePosts((prev) => safeArray(prev).filter((x: any) => Number(x.id) !== Number(postId)));

    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    } catch {
      setPosts(prev);
      lastGoodPostsRef.current = prev;
      stableFeedRef.current = prev;
      
      setProfilePosts(prevProfilePosts);
      if (view === 'profile' && selectedUserId) fetchProfilePosts(Number(selectedUserId)).catch(() => {});
    }
  },
  [requireAuth, posts, profilePosts, view, selectedUserId, fetchProfilePosts]
);

const editPost = useCallback(
  async (postId: number, content: string) => {
    if (!requireAuth('Editing posts')) return;
    const trimmed = (content || '').trim();
    if (!trimmed) return;

    const prev = posts;
    const prevProfilePosts = profilePosts;
    
    setPosts((p) => {
      const next = safeArray(p).map((x: any) =>
        Number(x.id) === Number(postId) ? normalizePost({ ...x, content: trimmed }) : x
      );
      lastGoodPostsRef.current = next;
      stableFeedRef.current = next;
      return next;
    });

    setProfilePosts((prev) =>
      safeArray(prev).map((x: any) => (Number(x.id) === Number(postId) ? normalizePost({ ...x, content: trimmed }) : x))
    );

    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ content: trimmed }) });
    } catch {
      setPosts(prev);
      lastGoodPostsRef.current = prev;
      stableFeedRef.current = prev;
      
      setProfilePosts(prevProfilePosts);
      if (view === 'profile' && selectedUserId) fetchProfilePosts(Number(selectedUserId)).catch(() => {});
    }
  },
  [requireAuth, posts, profilePosts, view, selectedUserId, fetchProfilePosts]
);

useEffect(() => {
  const handlePostDeleted = (e: any) => {
    const id = Number(e?.detail?.id);
    if (id) {
      setPosts((p) => {
        const next = safeArray(p).filter((x: any) => Number(x.id) !== id);
        lastGoodPostsRef.current = next;
        stableFeedRef.current = next;
        return next;
      });
      setProfilePosts((prev) => safeArray(prev).filter((x: any) => Number(x.id) !== id));
    }
  };
  const handlePostUpdated = (e: any) => {
    const updated = e?.detail;
    if (updated?.id) {
      setPosts((p) => {
        const next = safeArray(p).map((x: any) =>
          Number(x.id) === Number(updated.id) ? normalizePost({ ...x, ...updated }) : x
        );
        lastGoodPostsRef.current = next;
        stableFeedRef.current = next;
        return next;
      });
      setProfilePosts((prev) =>
        safeArray(prev).map((x: any) =>
          Number(x.id) === Number(updated.id) ? normalizePost({ ...x, ...updated }) : x
        )
      );
    }
  };
  window.addEventListener('post-deleted', handlePostDeleted);
  window.addEventListener('post-updated', handlePostUpdated);
  return () => {
    window.removeEventListener('post-deleted', handlePostDeleted);
    window.removeEventListener('post-updated', handlePostUpdated);
  };
}, []);

// Add this with your other navigation functions
const openPost = useCallback((postId: number) => {
  // Find the post in your posts state
  const post = posts.find(p => p.id === postId) || profilePosts.find(p => p.id === postId);
  if (post) {
    // Open comments sheet for this post
    handleOpenComments(post);
  } else {
    // If post not found, try to fetch it or just navigate home
    navigateTo('home');
  }
}, [posts, profilePosts, handleOpenComments, navigateTo]);

const openReel = useCallback((reelId: number) => {
  setSelectedReelId(reelId);
  navigateTo('reels');
}, [navigateTo]);

const openProduct = useCallback((productId: string | number) => {
  const product = products.find(p => Number(p.id) === Number(productId));
  if (product) {
    setActiveProduct(product);
    navigateTo('marketplace');
  }
}, [products, navigateTo]);

const openGroup = useCallback((groupId: string | number) => {
  const gid = Number(groupId);
  if (!gid) {
    setActiveGroupId(null);
    navigateTo('groups');
    return;
  }
  setActiveGroupId(gid);
  navigateTo('groups');
}, [navigateTo]);

const openGroupPost = useCallback((postId: string | number) => {
  // Navigate to groups and highlight the specific post
  navigateTo('groups');
  // You can add a selectedPostId state if needed
}, [navigateTo]);

const openEvent = useCallback((eventId: string | number) => {
  setActiveEventId(Number(eventId));
  navigateTo('events');
}, [navigateTo]);          

  const activePost = useMemo(() => {
    if (!activeCommentsIdentity) return null;
    const targetId = String(activeCommentsIdentity.id);
    return (
      commentPostSnapshot || 
      posts.find((p) => String(p.id) === targetId || String((p as any).event_id) === targetId) ||
      profilePosts.find((p) => String(p.id) === targetId || String((p as any).event_id) === targetId) ||
      null
    );
  }, [activeCommentsIdentity, commentPostSnapshot, posts, profilePosts]);        


  
   //====NOTIFICATION DELETE ===     
const deleteNotification = useCallback(async (notificationId: number) => {
  const token = localStorage.getItem("unera_token");
  try {
    const res = await fetch(`/api/notifications?id=${notificationId}`, {
      method: "DELETE",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(currentUser?.id ? { "x-user-id": String(currentUser.id) } : {}),
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Failed to delete notification");
    }
    setNotifications((prev) =>
      Array.isArray(prev) ? prev.filter((n: any) => Number(n.id) !== Number(notificationId)) : prev
    );
  } catch (error) {
    console.error('Failed to delete notification:', error);
    setLoginError('Failed to delete notification');
  }
}, [currentUser]);
          
//=======MARK AS READ NOTIFICATION ===
          
const markAllNotificationsAsRead = useCallback(async () => {
  const token = localStorage.getItem("unera_token");
  try {
    const res = await fetch(`/api/notifications`, {
      method: "PATCH",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(currentUser?.id ? { "x-user-id": String(currentUser.id) } : {}),
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Failed to mark notifications as read");
    }
    setNotifications((prev) =>
      Array.isArray(prev)
        ? prev.map((n: any) => ({
            ...n,
            is_read: 1,
          }))
        : prev
    );
  } catch (error) {
    console.error('Failed to mark notifications as read:', error);
    setLoginError('Failed to mark notifications as read');
  }
}, [currentUser]);
          


  
    //=======NOTIFICATION TARGET ===          
 
 const openNotificationTarget = useCallback((notification: any) => {
  // Use target_type and target_id from enriched notification (priority)
  const targetType = String(notification?.target_type || notification?.entity_type || "").toLowerCase();
  const targetId = Number(notification?.target_id ?? notification?.entity_id ?? 0);
  const actorId = Number(notification?.actor_id || 0);
  const type = String(notification?.type || "").toLowerCase();

  // Mark this notification as read
  const markAsRead = async () => {
    try {
      await fetch(`/api/notifications/${notification.id}/read`, {
        method: 'POST',
        headers: {
          ...(currentUser?.id ? { "x-user-id": String(currentUser.id) } : {}),
        },
      });
      setNotifications(prev =>
        prev.map(n =>
          Number(n.id) === Number(notification.id) ? { ...n, is_read: 1 } : n
        )
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // ============================================================================
  // ✅ ROUTE BY target_type + target_id (NOT entity_id only!)
  // ============================================================================
  
  // Handle POST
  if ((targetType === "post" || targetType === "discuss") && targetId) {
    markAsRead();
    openPost(targetId);
    return;
  }

  // Handle REEL
  if (targetType === "reel" && targetId) {
    markAsRead();
    openReel(targetId);
    return;
  }

  // Handle STORY
  if (targetType === "story" && targetId) {
    markAsRead();
    const story = stories.find(s => Number(s.id) === targetId);
    if (story) {
      openStoryViewer(story);
    } else {
      // Fallback to profile if story not found
      openProfile(actorId);
    }
    return;
  }

  // Handle SONG
  if (targetType === "song" && targetId) {
    markAsRead();
    navigateTo('music');
    const song = songs.find(s => Number(s.id) === targetId);
    if (song) {
      onPlayTrack(song as any);
    } else {
      openProfile(actorId);
    }
    return;
  }

  // Handle PODCAST
  if (targetType === "podcast" && targetId) {
    markAsRead();
    navigateTo('music');
    // Find podcast episode and play
    const podcast = songs.find(s => Number(s.id) === targetId && s.type === 'podcast');
    if (podcast) {
      onPlayTrack(podcast as any);
    } else {
      openProfile(actorId);
    }
    return;
  }

  // Handle PRODUCT
  if (targetType === "product" && targetId) {
    markAsRead();
    openProduct(targetId);
    return;
  }

  // Handle EVENT
  if (targetType === "event" && targetId) {
    markAsRead();
    openEvent(targetId);
    return;
  }

  // Handle GROUP POST
  if (targetType === "group_post" && targetId) {
    markAsRead();
    openGroupPost(targetId);
    return;
  }

  // Handle GROUP (join/invite)
  if (targetType === "group" && targetId) {
    markAsRead();
    openGroup(targetId);
    return;
  }

  // Handle FOLLOW
  if (type === "follow" && actorId) {
    markAsRead();
    openProfile(actorId);
    return;
  }

  // Handle MENTION
  if (type === "mention" && actorId) {
    markAsRead();
    openProfile(actorId);
    return;
  }

  // Handle TAG
  if (type === "tag" && actorId) {
    markAsRead();
    openProfile(actorId);
    return;
  }

  // Handle REACTION
  if ((type === "react" || type === "reaction" || type === "like") && targetId) {
    markAsRead();
    // For reactions, open the target content
    if (targetType === "post") {
      openPost(targetId);
    } else if (targetType === "reel") {
      openReel(targetId);
    } else if (targetType === "story") {
      const story = stories.find(s => Number(s.id) === targetId);
      if (story) openStoryViewer(story);
    } else if (targetType === "song") {
      navigateTo('music');
      const song = songs.find(s => Number(s.id) === targetId);
      if (song) onPlayTrack(song as any);
    } else if (targetType === "event") {
      openEvent(targetId);
    } else if (targetType === "product") {
      openProduct(targetId);
    } else {
      openProfile(actorId);
    }
    return;
  }

  // Handle SHARE
  if (type === "share" && targetId) {
    markAsRead();
    if (targetType === "post") {
      openPost(targetId);
    } else if (targetType === "reel") {
      openReel(targetId);
    } else if (targetType === "event") {
      openEvent(targetId);
    } else {
      openProfile(actorId);
    }
    return;
  }

  // Handle DISCUSS/COMMENT/REPLY
  if ((type === "discuss" || type === "comment" || type === "reply") && targetId) {
    markAsRead();
    if (targetType === "post") {
      openPost(targetId);
    } else if (targetType === "reel") {
      openReel(targetId);
    } else if (targetType === "event") {
      openEvent(targetId);
    } else if (targetType === "group_post") {
      openGroupPost(targetId);
    } else {
      openProfile(actorId);
    }
    return;
  }

  // Fallback to actor's profile if nothing else matches
  if (actorId) {
    markAsRead();
    openProfile(actorId);
    return;
  }
  
  // Last resort: just mark as read and close
  markAsRead();
}, [currentUser, openPost, openReel, openProduct, openGroupPost, openEvent, openProfile, openStoryViewer, navigateTo, onPlayTrack, songs, stories]);         

  
// ============================================================================
// ✅ RENDER
// ============================================================================
return (
  <div className="bg-[#050B18] min-h-screen flex flex-col font-sans text-[#F8FAFC]">
    <Header
      onHomeClick={() => handleNavigate('home')}
      onProfileClick={(id: number) => openProfile(id)}
      onReelsClick={() => navigateTo('reels')}
      onMarketplaceClick={() => navigateTo('marketplace')}
      onGroupsClick={() => navigateTo('groups')}
      onOpenGroup={(groupId) => openGroup(groupId)}
      groups={groups}
      onAdsClick={() => {
        if (!currentUser) {
          setLoginError('Please login to access ads dashboard.');
          setView('login');
          return;
        }
        navigateTo('ads');
        setActiveAdTab('dashboard');
      }}
      currentUser={currentUser}
      notifications={notifications}
      users={users}
      onLogout={handleLogout}
      onLoginClick={() => setView('login')}
      onMarkNotificationsRead={() => {}}
      activeTab={activeTab}
      onNavigate={(v: any) => handleNavigate(v)}
      unreadNotifications={unreadNotifications}
      onNotificationClick={() => {
        navigateTo('notifications');
        markNotificationsRead();
      }}
      showBackButton={view !== 'home'}
      onBack={goBack}
      currentView={view}
      onOpenChatsList={() => setIsChatsListOpen(prev => !prev)}
      isChatsListOpen={isChatsListOpen}
      badgeCounts={badgeCounts}
      onCreatePostClick={() => {
        if (!requireAuth('Creating posts')) return;
        setShowCreatePostModal(true);
      }}
      onSearchClick={() => navigateTo('search')}
    />

    <div className="flex justify-center w-full max-w-[1920px] mx-auto relative flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
      {currentUser && (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] h-[calc(100vh-3.5rem-env(safe-area-inset-top,0px))] z-20 hidden lg:block">
          <Sidebar
            currentUser={currentUser}
            onProfileClick={(id) => openProfile(id)}
            onReelsClick={() => navigateTo('reels')}
            onMarketplaceClick={() => navigateTo('marketplace')}
            onGroupsClick={() => navigateTo('groups')}
            onSavedPostsClick={() => navigateTo('saved-posts')}
            onStoryFeedClick={() => navigateTo('story-feed')}
          />
        </div>
      )}

      <div className="w-full lg:w-[740px] xl:w-[700px] min-h-screen">
        <input
          ref={reelVideoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleReelVideoSelected}
        />
{view === 'home' && (
  <div className="w-full pt-0 sm:pt-2 md:px-0 pb-12">
    {activeHashtag && (
      <div className="mb-3 px-4">
        {/* ... hashtag UI ... */}
      </div>
    )}

    {currentUser && !postUploadState?.isUploading && (
      <CreatePost
        currentUser={currentUser}
        onProfileClick={(id) => openProfile(id)}
        onClick={() => {
          if (!requireAuth('Creating posts')) return;
          setShowCreatePostModal(true);
        }}
        onPhotoClick={handlePhotoClick}
        onVideoClick={handleVideoClickFromCreate}
        onCreateEventClick={() => {
          if (!requireAuth('Creating events')) return;
          setShowCreateEventModal(true);
        }}
      />
    )}

    <StoryReel
      stories={orderedStories}
      onProfileClick={(id) => openProfile(id)}
      onCreateStory={() => {
        if (!requireAuth('Creating stories')) return;
        setShowCreateStoryModal(true);
      }}
      onViewStory={openStoryViewer}
      currentUser={currentUser}
      onRequestLogin={() => setView('login')}
      onFollow={followUser}
      checkIsFollowing={checkIsFollowing}
      followLoading={followLoading}
      onFetchViewers={fetchStoryViewers}
      onReaction={reactToStory}
      onReply={replyToStory}
      onToggleMute={() => setStoryMuted(!storyMuted)}
      muted={storyMuted}
      storyCreateLoading={storyCreateLoading}
    />

    {postUploadState && (
      <PostUploadProgressBanner
        uploadState={postUploadState}
        onDismiss={() => setPostUploadState(null)}
      />
    )}

    <div className="w-full">
      <MarketplaceContext.Provider value={{
        onViewProduct: async (productId) => {
          let product = products.find(p => Number(p.id) === Number(productId));
          if (!product) {
            try {
              const res = await apiFetch(`/api/products?id=${productId}`);
              if (res?.product) {
                product = normalizeProduct(res.product);
                setProducts(prev => [product, ...safeArray(prev)]);
              }
            } catch (e) {
              console.error('Failed to fetch product on view:', e);
            }
          }
          if (product) {
            navigateTo('marketplace');
            setActiveProduct(product);
          }
        },
        getProductData
      }}>

<Feed
  onOpenStory={handleOpenStoryFromFeed}
  feedItems={[]}
  currentUser={currentUser}
  users={users}
  onProfileClick={openProfile}
  onReact={(post, type) => reactToFeedItem(post, type)}
  onShare={(id, newShareCount, data, sourcePost) => {
    const dest = data?.destination || 'feed';
    handleShareComplete(dest, data || { success: true, shares: newShareCount }, sourcePost);
  }}
  onOpenComments={handleOpenComments}
  onViewImage={setFullScreenImage}
  onVideoClick={handleVideoClick}
  onPlayAudioTrack={onPlayTrack}
  onHashtagClick={handleHashtagClick}
  onFollow={followUser}
  followLoading={followLoading}
  checkIsFollowing={checkIsFollowing}
  groups={groups}
  brands={brands}
  chats={chats}
  onViewProductFromPost={openProductFromPost}
  onRSVPEvent={onRSVPEvent}
  getPostAuthor={getPostAuthor}
  onDeletePost={(postId: number) => deletePost(postId)}
  onEditPost={(postId: number, content: string) => editPost(postId, content)}
  onPushMore={pushMore}
  pushedPosts={pushedPosts}
  //group react  
  onToggleGroupPostLike={toggleGroupPostLike}
  onApplyToJob={async (postId: number, applicationData?: any) => {
    console.log('Apply to job from Feed:', postId, applicationData);
  }}
  
  // ✅ MUSIC REACTION PROPS
  musicReactions={feedMusicReactions}
  onMusicReact={handleFeedMusicReact}
  
  // =========================
  // Reels
  // =========================
  onOpenReel={(reelId) => {
    setSelectedReelId(reelId);
    navigateTo("reels");
  }}

  // =========================
  // People You May Know
  // =========================
  peopleYouMayKnow={peopleYouMayKnow}
  peopleYouMayKnowInsertIndex1={peopleYouMayKnowInsertIndex1}
  peopleYouMayKnowInsertIndex2={peopleYouMayKnowInsertIndex2}
  onFollowFromPymk={followFromPymk}
  pymkLoading={pymkLoading}

  // =========================
  // Groups You May Join
  // =========================
  groupsYouMayJoin={groupsYouMayJoin}
  groupsYouMayJoinInsertIndex={groupsYouMayJoinInsertIndex}
  onJoinGroupSuggestion={joinFromSuggestion}
  gymjLoading={gymjLoading}

  onOpenGroup={(groupId) => openGroup(groupId)}

  // =========================
  // Login
  // =========================
  onLoginClick={() => setView("login")}

  // =========================
  // ✅ INFINITE SCROLL
  // =========================
  stories={safeArray(orderedStories)}
  items={[...mixedFeedItems, ...extraFeedItems]}
  onLoadMoreFeed={loadMoreFeed}
  hasMoreFeed={hasMoreFeed}
  feedLoadingMore={feedLoadingMore}
/>
      </MarketplaceContext.Provider>
    </div>
  </div>
)}   
     
{view === 'reels' && (
  <VideosPage
    posts={safeArray(posts)}
    reels={safeArray(reels)}
    users={safeArray(users)}
    stories={safeArray(orderedStories)}
    ads={ads}
    currentUser={currentUser}
    initialVideoId={selectedReelId}
    onInitialScrolled={() => setSelectedReelId(null)}
    onPostVideoClick={handleVideoClickFromCreate}
    onProfileClick={(id) => openProfile(id)}
    onStoryClick={(id) => openProfile(id)}
    onReact={(postOrId, type) => {
      const pid = Number(typeof postOrId === 'object' ? (postOrId.post_id || postOrId.id || postOrId.reel_id) : postOrId);
      const targetPost = typeof postOrId === 'object'
        ? postOrId
        : posts.find((p) => Number(p.id) === pid) || reels.find((r) => Number(r.id) === pid) || { id: pid };
      reactToFeedItem(targetPost, type as ReactionType);
    }}
    onShare={(postId, count) => {
      const pid = Number(postId);
      const targetPost = posts.find((p) => Number(p.id) === pid) || reels.find((r) => Number(r.id) === pid) || { id: pid, shares: count, shares_count: count };
      handleOpenShareSheet(targetPost);
    }}
    onOpenComments={(post) => {
      handleOpenComments(post);
    }}
    onFollow={followUser}
    checkIsFollowing={checkIsFollowing}
    onBack={goBack}
  />
)}
  
        
        {view === 'marketplace' && (() => {
          const sponsoredProductIds = new Set<number>();
          safeArray(ads).forEach((ad: any) => {
            if (ad.status !== 'inactive' && ad.status !== 'paused') {
              if (ad.product_id) sponsoredProductIds.add(Number(ad.product_id));
              if (ad.source_id && (ad.source_type === 'product' || !ad.source_type)) sponsoredProductIds.add(Number(ad.source_id));
              if (ad.post_id) sponsoredProductIds.add(Number(ad.post_id));
            }
          });
          const enrichedProducts = safeArray(products).map((p: any) => {
            const isSpon = Boolean(
              p.is_sponsored ||
              p.sponsored ||
              p.is_ad ||
              sponsoredProductIds.has(Number(p.id)) ||
              (p.meta as any)?.is_sponsored
            );
            return isSpon ? { ...p, is_sponsored: true, sponsored: true, is_ad: true } : p;
          });

          return (
            <MarketplacePage
              currentUser={currentUser}
              products={enrichedProducts}
              uploadState={postUploadState}
              onDismissUpload={() => setPostUploadState(null)}
              onUploadStateChange={setPostUploadState}
              onNavigateHome={() => handleNavigate('home')}
              onCreateProduct={createProduct}
              onViewProduct={setActiveProduct}
            />
          );
        })()}

        {view === 'groups' && (
          <ErrorBoundary>
            <GroupsPage
              currentUser={currentUser}
              groups={groups}
              users={users}
              uploadState={postUploadState}
              onDismissUpload={() => setPostUploadState(null)}
              onCreateGroup={createGroup}
              onJoinGroup={joinGroup}
              onLeaveGroup={leaveGroup}
              onDeleteGroup={deleteGroup}
              onUpdateGroupImage={updateGroupImage}
              onPostToGroup={createGroupPost}
              onCreateGroupEvent={createGroupEvent}
              onInviteToGroup={inviteToGroup}
              onProfileClick={openProfile}
              onLikePost={toggleGroupPostLike}
              onSharePost={(postId: number, newShareCount: number) => {
                setPosts(prev => prev.map(p => 
                  p.id === postId ? { ...p, shares: newShareCount } as any : p
                ));
              }}
              onDeleteGroupPost={deleteGroupPost}
              onEditGroupPost={editGroupPost}
              onRemoveMember={removeGroupMember}
              onUpdateGroupSettings={updateGroupSettings}
              onEventRSVP={handleEventRSVP}
              fetchGroupPosts={fetchGroupPosts}
              fetchGroupDetails={fetchGroupDetails}
              fetchGroupEvents={fetchGroupEvents}
              fetchComments={fetchGroupPostComments}
              fetchGroupInvites={fetchGroupInvites}
              onComment={createGroupPostComment}
              onLikeComment={toggleGroupPostCommentLike}
              onPlayAudioTrack={onPlayTrack}
              onFollow={followUser}
              checkIsFollowing={checkIsFollowing}
              onHashtagClick={handleHashtagClick}
              onViewImage={setFullScreenImage}
              onVideoClick={handleVideoClick}
              onAcceptGroupInvite={acceptGroupInvite}
              onMakeModerator={makeModerator}
              onToggleMemberPosting={toggleMemberPosting}
              onDisableAllMembers={disableAllMembers}
              onEnableAllMembers={enableAllMembers}
              onMakeAdmin={makeAdmin}
              onRemoveAdmin={removeAdmin}
              onDeclineGroupInvite={declineGroupInvite}
              initialGroupId={activeGroupId ? String(activeGroupId) : null}
              onApplyToJob={async (postId: number, applicationData?: any) => {
                console.log('Apply to job:', postId, applicationData);
              }}
              onPlayVideo={(postId: number, url: string) => {
                console.log('Play video:', postId, url);
              }}
            />
          </ErrorBoundary>
        )}

        {view === 'brands' && (
          <BrandsPage
            currentUser={currentUser}
            brands={brands}
            posts={posts}
            users={users}
            onCreateBrand={() => requireAuth('Creating brands')}
            onFollowBrand={(id: number) => followUser(id)}
            onProfileClick={(id) => openProfile(id)}
            onPostAsBrand={() => requireAuth('Posting')}
            onReact={() => requireAuth('Reacting')}
            onShare={(post: any) => handleOpenShareSheet(post)}
            onOpenComments={(id: any) => {
              if (!requireAuth('Commenting')) return;
              const post = posts.find(p => p.id === id);
              if (post) handleOpenComments(post);
            }}
            onDeleteBrand={() => requireAuth('Deleting brands')}
            onPlayAudioTrack={onPlayTrack}
            checkIsFollowing={checkIsFollowing}
            followLoading={followLoading}
          />
        )}


  
    {view === 'music' && (
  <MusicSystem
    currentUser={currentUser}
    uploadState={postUploadState}
    onDismissUpload={() => setPostUploadState(null)}
    onUploadStateChange={setPostUploadState}
    onPlayTrack={onPlayTrack}
    onProfileClick={(id) => openProfile(id)}
    likedTracks={likedTracks}
    onToggleLike={handleMusicSystemLikeSync}
    playHistory={playHistory}
    onFollow={followUser}
    checkIsFollowing={checkIsFollowing}
    users={users}
    currentTrack={currentAudioTrack}
    isPlaying={isAudioPlaying}
    myTotalPlays={currentUser?.id ? myTotalPlays : 0}
    playsLoading={playsLoading}
    trackPlays={trackPlays}
    // ✅ Music reaction props - Single source of truth
    reactionCounts={trackReactions}
    commentCounts={trackComments}
    shareCounts={trackShares}
    onReact={handleMusicReact}
    onOpenComments={handleOpenMusicComments}
    onShare={handleMusicShare}
    onBack={goBack}
  />
)}                   
  
  
      

        {view === 'tools' && <ToolsPage onBack={goBack} />}

        {view === 'profiles' && (
          <SuggestedProfilesPage
            currentUser={currentUser as any}
            users={users}
            onFollow={(id: number) => followUser(id)}
            onProfileClick={(id) => openProfile(id)}
            checkIsFollowing={checkIsFollowing}
            followLoading={followLoading}
            onBack={goBack}
          />
        )}

        {view === 'events' && (
          <ErrorBoundary>
            <AllEvents
              currentUser={currentUser ?? null}
              users={users}
              uploadState={postUploadState}
              onDismissUpload={() => setPostUploadState(null)}
              onProfileClick={(id) => openProfile(id)}
              onEventClick={(eventId) => {
                setActiveEventId(eventId);
              }}
              onCreateEventClick={() => {
                if (!requireAuth('Creating events')) return;
                setShowCreateEventModal(true);
              }}
              onNavigateBack={goBack}
            />
          </ErrorBoundary>
        )}

        {view === 'birthdays' && (
          <BirthdaysPage
            currentUser={currentUser as any}
            users={users}
            onMessage={(id) => {
              if (!requireAuth('Messaging')) return;
              setActiveChatUser(users.find((u) => u.id === id) || null);
              setIsChatOpen(true);
            }}
            onProfileClick={(id) => openProfile(id)}
            onFollow={followUser}
            checkIsFollowing={checkIsFollowing}
            onBack={goBack}
          />
        )}

        {view === 'memories' && currentUser && (
          <MemoriesPage
            currentUser={currentUser}
            posts={allKnownPosts}
            users={users}
            onProfileClick={(id: number) => openProfile(id)}
            onReact={(postId: number, type: ReactionType) => onReactPost(postId, type)}
            onShare={(post: any) => handleOpenShareSheet(post)}
            onViewImage={setFullScreenImage}
            onOpenComments={(target: any) => {
              if (target && typeof target === 'object') {
                handleOpenComments(target);
              } else if (target) {
                const targetId = Number(target);
                const post = allKnownPosts.find((p: any) => Number(p.id) === targetId) ||
                             posts.find((p: any) => Number(p.id) === targetId);
                if (post) {
                  handleOpenComments(post);
                } else {
                  handleOpenComments({ id: targetId } as any);
                }
              }
            }}
            onVideoClick={handleVideoClick}
            onPlayAudioTrack={onPlayTrack}
            onHashtagClick={handleHashtagClick}
            onFollow={followUser}
            checkIsFollowing={checkIsFollowing}
            followLoading={followLoading}
            groups={groups}
            brands={brands}
            chats={chats}
            onBack={goBack}
          />
        )}

        {(view === 'saved-posts' || view === 'saved') && (
          <SavedPostsPage
            currentUser={currentUser}
            users={users}
            onProfileClick={(id: number) => openProfile(id)}
            onReact={(postId: number, type: ReactionType) => onReactPost(postId, type)}
            onShare={(post: any) => handleOpenShareSheet(post)}
            onViewImage={setFullScreenImage}
            onOpenComments={handleOpenComments}
            onVideoClick={handleVideoClick}
            onBack={goBack}
          />
        )}

        {view === 'story-feed' && (
          <StoryFeeds
            currentUser={currentUser}
            users={users}
            stories={orderedStories}
            ads={ads}
            focusedStoryId={focusedStoryId}
            onCreateStory={() => {
              if (!requireAuth('Creating stories')) return;
              setShowCreateStoryModal(true);
            }}
            onViewStory={openStoryViewer}
            onProfileClick={(id) => openProfile(id)}
            onReact={(storyId, type) => reactToStory(storyId, type)}
            onReply={(storyId, text) => replyToStory(storyId, text)}
            onComment={(storyId) => handleStoryComment(storyId)}
            onOpenComments={handleOpenComments}
            onShare={(story) => handleStoryShare(story)}
            onDeleteStory={(storyId) => deleteStory(storyId)}
            onFollow={followUser}
            checkIsFollowing={checkIsFollowing}
            followLoading={followLoading}
            onBack={goBack}
            onLoginClick={() => setView('login')}
          />
        )}
{view === 'settings' && currentUser && (
  <SettingsPage 
    currentUser={currentUser} 
    onClose={() => setView('home')}
    onLogout={handleLogout}
    onUpdateUserDetails={(data) => {
      setCurrentUser(prev => prev ? { ...prev, ...data } : null);
    }}
    onChangePassword={async (currentPw, newPw) => {
      const token = localStorage.getItem('unera_token');
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          current_password: currentPw, 
          new_password: newPw 
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to change password');
      }
    }}
    // ✅ ADD THIS:
    onDeleteAccount={async () => {
      const token = localStorage.getItem('unera_token');
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          user_id: currentUser.id,
          // password is already sent from the modal in the request
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete account');
      }
      
      // Log out the user after successful deletion
      handleLogout();
      setView('home');
    }}
  />
)}
        

        


        {view === 'privacy' && <PrivacyPolicyPage onNavigateHome={() => setView('home')} />}
        {view === 'terms' && <TermsOfServicePage onNavigateHome={() => setView('home')} />}
        {view === 'help' && <HelpSupportPage onNavigateHome={() => setView('home')} />}

        {view === 'profile' && (
          profileUser ? (
            <UserProfile
              user={profileUser}
              currentUser={currentUser}
              users={users}
              posts={profilePosts}
              reels={reels}
              onProfileClick={(id) => openProfile(id)}
              onFollow={(id: number) => followUser(id)}
              onReact={(postOrId: any, type: ReactionType) => onReactPost(postOrId, type)}
              onComment={createComment}
              onShare={(post: any) => handleOpenShareSheet(post)}
              onMessage={(id) => {
                if (!requireAuth('Messaging')) return;
                const recipient = users.find((u) => u.id === id);
                if (recipient) {
                  handleOpenChat(recipient);
                }
              }}
              onCreatePost={createPost as any}
              onUpdateProfileImage={updateProfileImage as any}
              onUpdateCoverImage={updateCoverImage as any}
              onUpdateUserDetails={updateUserDetails as any}
              onDeletePost={(postId: number) => deletePost(postId)}
              onEditPost={(postId: number, content: string) => editPost(postId, content)}
              getCommentAuthor={(id) => users.find((u) => u.id === id)}
              onViewImage={setFullScreenImage}
              onOpenComments={(postOrId: any) => {
                let targetPost: PostType | undefined;
                if (postOrId && typeof postOrId === 'object' && postOrId.id) {
                  targetPost = postOrId;
                } else {
                  const id = Number(postOrId);
                  targetPost = posts.find(p => Number(p.id) === id) || profilePosts.find(p => Number(p.id) === id);
                }
                if (targetPost) {
                  handleOpenComments(targetPost);
                }
              }}
              onVideoClick={handleVideoClick}
              onPlayAudioTrack={onPlayTrack}
              onCreateStoryClick={handleCreateStoryFromProfile}
              onVerifyUser={(id) => verifyUser(id)}
              onRestrictUser={(id, duration) => suspendUser(id, duration)}
              onDeleteUser={(id) => deleteUserAccount(id)}
              onMakeModerator={(id, make) => setModeratorRole(id, make ? 'moderator' : 'user')}
              isFollowing={checkIsFollowing(Number(profileUser.id))}
              followLoading={followLoading[Number(profileUser.id)] || false}
              onOpenChat={handleOpenChat}
              isChatOpen={isChatOpen}
              activeChatRecipient={activeChatUser}
              onOpenChatsList={handleOpenChatsList}
              isChatsListOpen={isChatsListOpen}
              onBack={goBack}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-center">
              <div className="w-10 h-10 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#94A3B8] font-medium text-base">Loading profile...</p>
            </div>
          )
        )}

        {view === 'login' && (
          <Login
            onLogin={handleLogin}
            onNavigateToRegister={() => setView('register')}
            onNavigateToForgotPassword={() => setView('login')}
            onClose={() => setView('home')}
            error={loginError}
          />
        )}

        {view === 'register' && (
          <Register 
            onRegister={handleRegister} 
            onBackToLogin={() => setView('login')} 
            error={loginError}
          />
        )}

        
  {view === 'recorder' && (
  <Recorder
    currentUser={currentUser}
    selectedSound={selectedReelSound}
    sounds={songs.map((song: any) => ({
      id: song.id,
      name: song.title || song.name || 'Song',
      url: song.audio_fetch_url || song.audio_url || song.url || '',
      originalUrl: song.audio_fetch_url || song.audio_url || song.url || '',
      duration: song.duration || 30,
      start: 0,
      end: song.duration || 30,
      coverImage: song.cover_url || song.cover || '',
      creatorName: song.artist || '',
      creatorImage: song.artist_image || song.cover_url || '',
      playCount: song.playCount || song.plays || 0,
      creationCount: song.creationCount || song.uses || 0,
      soundKey: `song:${song.id}`,
    }))}
    onSelectSound={setSelectedReelSound}
    initialVideoFile={pendingReelFile}
    initialThumbnailFile={pendingReelThumbnailFile}
    initialVideoUrl={nativeReelVideoUrl}
    initialNativeMediaMeta={nativeReelMediaMeta}
    initialEffectId={pendingReelEffectId}
    startInPreview={!!pendingReelFile || !!nativeReelVideoUrl}
    onBack={() => {
      setPendingReelFile(null);
      setPendingReelThumbnailFile(null);
      setNativeReelVideoUrl('');
      setNativeReelMediaMeta(null);
      setPendingReelEffectId('none');
      setSelectedReelSound(null);
      setShowRecorder(false);
      // Reset any recording state if needed
      if (mediaRecorderRef?.current) {
        mediaRecorderRef.current = null;
      }
      if (streamRef?.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (recordingTimerRef?.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }}
    onSubmit={async (reelData) => {
      // ✅ Start publishing state
      setReelPublishing(true);
      setReelPublishingProgress(5);
      setReelPublishingText('Preparing your reel...');
      
      // ✅ Close Recorder and navigate to Reels immediately
      setShowRecorder(false);
      setView('reels');
      
      try {
        await createReel({
          ...reelData,
          videoFile: reelData.videoFile || pendingReelFile || undefined,
          thumbnailFile: reelData.thumbnailFile || pendingReelThumbnailFile || undefined,
          audioUrl:
            reelData.audioUrl ||
            (selectedReelSound?.songId &&
              songs.find((s: any) => s.id === selectedReelSound.songId)?.audio_fetch_url) ||
            selectedReelSound?.audioUrl ||
            '',
          originalSoundId: reelData.originalSoundId ?? selectedReelSound?.songId,
          songName: reelData.songName || selectedReelSound?.songName || 'Original Sound',
          audioStart: reelData.audioStart ?? selectedReelSound?.audioStart ?? 0,
          audioEnd: reelData.audioEnd ?? selectedReelSound?.audioEnd ?? 0,
          effectId: reelData.effectId || pendingReelEffectId,
          nativeVideoUrl: reelData.nativeVideoUrl,
          nativeVideoMeta: reelData.nativeVideoMeta,
        });
        
        // Success - progress already at 100% from createReel
        setTimeout(() => {
          setReelPublishing(false);
          setReelPublishingProgress(0);
          setReelPublishingText('');
        }, 1200);
        
      } catch (e: any) {
        // ✅ Error handling
        setReelPublishingText(e?.message || 'Publishing failed');
        setTimeout(() => {
          setReelPublishing(false);
          setReelPublishingProgress(0);
          setReelPublishingText('');
        }, 2500);
      } finally {
        // Clear all pending states after submission attempt
        setPendingReelFile(null);
        setPendingReelThumbnailFile(null);
        setNativeReelVideoUrl('');
        setNativeReelMediaMeta(null);
        setPendingReelEffectId('none');
        setSelectedReelSound(null);
      }
    }}
  />
)}
        
 {view === 'notifications' && (
  <NotificationsPage
    notifications={enrichedNotifications}
    users={users}
    groups={groups}
    currentUser={currentUser}
    onBack={() => navigateTo('home')}
    onProfileClick={(id) => openProfile(id)}
    onOpenNotification={openNotificationTarget}
    onDeleteNotification={deleteNotification}
    onMarkAllAsRead={markAllNotificationsAsRead}
    onLoadMore={loadMoreNotifications}
    onAcceptGroupInvite={acceptGroupInvite}
    onDeclineGroupInvite={declineGroupInvite}
    hasMore={hasMoreNotifications}
    stickyHeader
  />
)}

        {view === 'search' && (
          <SearchPage
            currentUser={currentUser}
            users={users}
            posts={posts}
            reels={reels}
            groups={groups}
            marketplaceItems={products}
            onProfileClick={(id) => openProfile(id)}
            onOpenGroup={(groupId) => openGroup(groupId)}
            onBack={() => navigateTo('home')}
            onFollow={followUser}
            onVideoClick={(reel) => {
              setSelectedReelId(reel.id);
              navigateTo('reels');
            }}
            onPostClick={() => {
              navigateTo('home');
            }}
            onViewProduct={(productId) => {
              const prod = products.find((p) => p.id === productId);
              if (prod) setActiveProduct(prod);
              navigateTo('marketplace');
            }}
          />
        )}

        {view === 'ads' && currentUser && (
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
            <div className="flex gap-2 mb-6 border-b border-[#1E293B] pb-2 overflow-x-auto">
              <button
                onClick={() => setActiveAdTab('analytics')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeAdTab === 'analytics'
                    ? 'bg-[#1877F2] text-white'
                    : 'text-[#94A3B8] hover:bg-[#1E293B]'
                }`}
              >
                <FontAwesomeIcon icon={faChartLine} className="w-4 h-4" />
                Analytics
              </button>
              <button
                onClick={() => setActiveAdTab('create')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeAdTab === 'create'
                    ? 'bg-[#1877F2] text-white'
                    : 'text-[#94A3B8] hover:bg-[#1E293B]'
                }`}
              >
                <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
                Create Campaign
              </button>
              <button
                onClick={() => setActiveAdTab('ads')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeAdTab === 'ads'
                    ? 'bg-[#1877F2] text-white'
                    : 'text-[#94A3B8] hover:bg-[#1E293B]'
                }`}
              >
                <FontAwesomeIcon icon={faBullhorn} className="w-4 h-4" />
                My Campaigns
              </button>
            </div>

            {activeAdTab === 'analytics' && (
              <Dashboard campaigns={adCampaigns} loading={adsLoading} />
            )}
            
            {activeAdTab === 'create' && (
              <AdCreator 
                onSuccess={() => {
                  setActiveAdTab('ads');
                  fetchMyAds();
                  if (selectedPostForAd) {
                    setPushedPosts(prev => ({
                      ...prev,
                      [selectedPostForAd.id]: true
                    }));
                  }
                  setSelectedPostForAd(null);
                }}
                onBack={() => {
                  setActiveAdTab('analytics');
                  setSelectedPostForAd(null);
                }}
                userPosts={posts.filter(p => Number(p.user_id) === Number(currentUser?.id))}
                onCreateCampaign={createAdCampaign}
                currentUser={currentUser}
                initialPost={selectedPostForAd}
              />
            )}
            
            {activeAdTab === 'ads' && (
              <AdsManager 
                campaigns={adCampaigns} 
                onUpdate={fetchMyAds}
                onPause={pauseCampaign}
                onResume={resumeCampaign}
                onDelete={deleteCampaign}
                loading={adsLoading}
              />
            )}
          </div>
        )}
      </div>

      {currentUser && (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] h-[calc(100vh-3.5rem-env(safe-area-inset-top,0px))] z-20 hidden xl:block pl-4">
          <RightSidebar
            contacts={users.filter((u) => u.id !== currentUser.id)}
            onProfileClick={(id) => openProfile(id)}
            onFollow={followUser}
            checkIsFollowing={checkIsFollowing}
            followLoading={followLoading}
          />
        </div>
      )}
    </div>

    {view !== 'home' && (
      <button
        onClick={goBack}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-[#1877F2] rounded-full shadow-lg flex items-center justify-center hover:bg-[#166FE5] transition-colors md:hidden"
        aria-label="Go back"
      >
        <i className="fas fa-arrow-left text-white text-2xl"></i>
      </button>
    )}

    {activeProduct && (
      <ProductDetailModal
        product={{
          ...activeProduct,
          is_sponsored: Boolean(
            (activeProduct as any)?.is_sponsored ||
            (activeProduct as any)?.sponsored ||
            (activeProduct as any)?.is_ad ||
            (activeProduct as any)?.ad_id ||
            (ads && ads.some((a: any) => (a.product_id && Number(a.product_id) === Number(activeProduct.id)) || (a.source_id && Number(a.source_id) === Number(activeProduct.id)) || (a.post_id && Number(a.post_id) === Number(activeProduct.id))))
          ),
        }}
        currentUser={currentUser}
        users={users}
        onClose={() => setActiveProduct(null)}
        onProfileClick={(sellerId) => {
          setActiveProduct(null);
          openProfile(sellerId);
        }}
        onMessage={(id, prod) => {
          if (!requireAuth('Messaging')) return;
          const targetProduct = prod || activeProduct;
          const recipient = users.find((u) => Number(u.id) === Number(id)) || ({
            id: Number(id),
            name: (targetProduct as any)?.seller_name || 'Seller',
            username: (targetProduct as any)?.seller_username || 'seller',
            profile_image_url: (targetProduct as any)?.seller_avatar || '',
            is_verified: Boolean((targetProduct as any)?.seller_is_verified),
          } as User);
          handleOpenChatWithProduct(recipient, targetProduct);
        }}
      />
    )}

    {activeEventId && (
      <EventDetailModal
        eventId={activeEventId}
        onClose={() => setActiveEventId(null)}
      />
    )}

    {showCreateEventModal && currentUser && (
      <CreateEventModal
        currentUser={currentUser}
        onClose={() => setShowCreateEventModal(false)}
        onCreate={(eventData) => {
          // Immediately close modal so user can continue exploring while event is created in background
          setShowCreateEventModal(false);
          createEvent(eventData).catch((error) => {
            console.error('Failed to create event in background:', error);
          });
        }}
      />
    )}

    {showCreatePostModal && currentUser && (
      <CreatePostModal
        currentUser={currentUser}
        users={users}
        initialMedia={pendingPostMedia}
        onClose={() => {
          setShowCreatePostModal(false);
          setPendingPostMedia(null);
        }}
        onCreatePost={(text: string, files: File[] | File | null, meta?: any) => {
          setPendingPostMedia(null);
          createPost(text, files as any, meta);
        }}
        onCreateEventClick={() => {
          setShowCreatePostModal(false);
          setShowCreateEventModal(true);
        }}
      />
    )}

    {/* Hidden inputs for direct phone gallery access */}
    <input
      type="file"
      ref={phonePhotoInputRef}
      className="hidden"
      accept="image/*"
      multiple
      onChange={handlePhonePhotoSelected}
    />
    <input
      type="file"
      ref={phoneVideoInputRef}
      className="hidden"
      accept="video/*"
      onChange={handlePhoneVideoSelected}
    />

    {showRecorder && currentUser && (
      <Recorder
        currentUser={currentUser}
        selectedSound={selectedReelSound}
        sounds={songs.map((song: any) => ({
          id: song.id,
          name: song.title || song.name || 'Song',
          url: song.audio_fetch_url || song.audio_url || song.url || '',
          originalUrl: song.audio_fetch_url || song.audio_url || song.url || '',
          duration: song.duration || 30,
          start: 0,
          end: song.duration || 30,
          coverImage: song.cover_url || song.cover || '',
          creatorName: song.artist || '',
          creatorImage: song.artist_image || song.cover_url || '',
          playCount: song.playCount || song.plays || 0,
          creationCount: song.creationCount || song.uses || 0,
          soundKey: `song:${song.id}`,
        }))}
        onSelectSound={setSelectedReelSound}
        onBack={() => setShowRecorder(false)}
        onSubmit={async (reelData) => {
          await createReel({
            ...reelData,
            audioUrl:
              reelData.audioUrl ||
              (selectedReelSound?.songId &&
                songs.find((s: any) => s.id === selectedReelSound.songId)?.audio_fetch_url) ||
              selectedReelSound?.audioUrl ||
              '',
            originalSoundId: reelData.originalSoundId ?? selectedReelSound?.songId,
            songName: reelData.songName || selectedReelSound?.songName || 'Original Sound',
            audioStart: reelData.audioStart ?? selectedReelSound?.audioStart ?? 0,
            audioEnd: reelData.audioEnd ?? selectedReelSound?.audioEnd ?? 0,
          });

          setShowRecorder(false);
        }}
      />
    )}
                                                 
 {activePost && currentUser && (
  <CommentsSheet
    post={activePost}
    currentUser={currentUser}
    users={users}
    onClose={() => {
      setActiveCommentsIdentity(null);
      setCommentPostSnapshot(null);
    }}
    onComment={createComment}  // Use createComment, not createGroupPostComment
    onLikeComment={likeComment}  // Use likeComment, not handleLikeComment
    getCommentAuthor={(id) => users.find((u) => u.id === id)}
    onProfileClick={(id) => openProfile(id)}
    onHashtagClick={handleHashtagClick}
    onFollow={followUser}
    checkIsFollowing={checkIsFollowing}
    onReact={(post, type) => reactToFeedItem(post, type)}
    onShare={(id, newShareCount) => {
      setPosts(prev => prev.map(p => 
        (Number(p.id) === id || Number((p as any).event_id) === id) ? { ...p, shares: newShareCount, shares_count: newShareCount } as any : p
      ));
    }}
    onVideoClick={handleVideoClick}
    onOpenAudio={onPlayTrack}
    groups={groups}
    brands={brands}
    chats={chats}
    onOpenGroup={(groupId) => {
      setActiveCommentsIdentity(null);
      setCommentPostSnapshot(null);
      openGroup(groupId);
    }}
    onRSVP={onRSVPEvent}
    onEventClick={(eventId) => {
      setActiveEventId(eventId);
      navigateTo('events');
    }}
  />
)} 

    {/* MUSIC COMMENTS SHEET */}
    {showMusicComments && selectedMusicTrack && (
  <MusicCommentsSheet
    isOpen={showMusicComments}
    onClose={() => {
      setShowMusicComments(false);
    }}
    track={selectedMusicTrack}
    currentUser={currentUser}
    users={users}
    onProfileClick={openProfile}
    onCommentAdded={(trackKey) => {
      setTrackComments((prev) => ({
        ...prev,
        [trackKey]: (prev[trackKey] || 0) + 1,
      }));
    }}
  />
)}

    {activeSharePost && (
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => {
          setShowShareSheet(false);
          setActiveSharePost(null);
        }}
        post={activeSharePost}
        currentUser={currentUser}
        users={users}
        groups={groups}
        brands={brands}
        chats={chats}
        onShareComplete={(destination, data) => {
          handleShareComplete(destination, data);
          if (activeSharePost?.type === 'music' || activeSharePost?.type === 'podcast') {
            handleMusicShareComplete(destination, data, activeSharePost as AudioTrack);
          }
        }}
        onFollow={followUser}
        checkIsFollowing={checkIsFollowing}
      />
    )}
 {/* Story Viewer Modal */}
{activeStoryId && activeStory && (
  <StoryViewerModal
    story={activeStory}
    onClose={closeStoryViewer}
    onProfileClick={(id) => {
      closeStoryViewer();
      openProfile(id);
    }}
    currentUser={currentUser}
    onFollow={followUser}
    checkIsFollowing={checkIsFollowing}
    followLoading={followLoading}
    allStories={orderedStories}
    onFetchViewers={fetchStoryViewers}
    onFetchReactions={fetchStoryReactions}
    onReply={replyToStory}
    onLike={likeStory}
    onReaction={reactToStory}
    onShare={handleStoryShare}
    onComment={handleStoryComment}
    onNext={handleStoryNext}
    onPrev={handleStoryPrev}
    muted={storyMuted}
    onToggleMute={() => setStoryMuted(!storyMuted)}
    onDeleteStory={deleteStory}
    deleteLoading={deleteStoryLoading}
  />
)}
    
{/* Story Comments Sheet */}
{showStoryComments && activeStoryCommentId && (
  <StoryCommentsSheet
    isOpen={showStoryComments}
    onClose={() => {
      setShowStoryComments(false);
      setActiveStoryCommentId(null);
    }}
    storyId={activeStoryCommentId}
    currentUser={currentUser}
    users={users}
    onProfileClick={openProfile}
    onHashtagClick={handleHashtagClick}
    onFollow={followUser}
    checkIsFollowing={checkIsFollowing}
    followLoading={followLoading}
    onCountChange={(count) => {
      setStories(prev =>
        prev.map(s => Number(s.id) === Number(activeStoryCommentId) ? { ...s, comments_count: count } : s)
      );
      if (frozenStoriesRef.current) {
        frozenStoriesRef.current = frozenStoriesRef.current.map((s: any) =>
          Number(s.id) === Number(activeStoryCommentId) ? { ...s, comments_count: count } : s
        );
      }
    }}
  />
)}
  
    {showCreateStoryModal && currentUser && (
      <CreateStoryModal
        currentUser={currentUser}
        songs={songs}
        onClose={() => setShowCreateStoryModal(false)}
        onCreate={createStory}
      />
    )}

     {currentAudioTrack && (
<GlobalAudioPlayer
  currentTrack={currentAudioTrack}
  isPlaying={isAudioPlaying}
  onTogglePlay={onTogglePlay}
  onNext={onNext}
  onPrevious={onPrevious}
  onClose={onClosePlayer}
  onDownload={(id) => {
    console.log('Download track:', id);
  }}
  onLike={(id, type) => {
    const k = `${type}:${String(id)}`;
    const nextLiked = !likedTracks.includes(k);
    handleMusicSystemLikeSync(k, nextLiked);
  }}
  onArtistClick={(uploaderId) => uploaderId && openProfile(uploaderId)}
  isLiked={isPlayerLiked}
  ownerUser={resolveTrackOwner(currentAudioTrack)}
  currentUser={currentUser}
  users={users}
  totalPlays={currentAudioTrack ? (trackPlays[`${currentAudioTrack.type}:${String(currentAudioTrack.id)}`] || 0) : 0}
  totalPlaysLoading={playsLoading}
  onStarted={onStarted}
  
  // ✅ FIXED: Use consistent key format with type prefix
  reactionCount={
    currentAudioTrack 
      ? (trackReactions[`${currentAudioTrack.type}:${currentAudioTrack.id}`]?.count || 0)
      : 0
  }
  
  // ✅ FIXED: Use consistent key format with type prefix
  myReaction={
    currentAudioTrack 
      ? trackReactions[`${currentAudioTrack.type}:${currentAudioTrack.id}`]?.myReaction
      : undefined
  }
  
  commentCount={
    currentAudioTrack 
      ? (trackComments[`${currentAudioTrack.type}:${currentAudioTrack.id}`] || 0)
      : 0
  }
  
  shareCount={
    currentAudioTrack 
      ? (trackShares[`${currentAudioTrack.type}:${currentAudioTrack.id}`] || 0)
      : 0
  }
  
  // ✅ Use the correct handler
  onReact={(track, type) => {
    if (currentAudioTrack && track.id === currentAudioTrack.id) {
      handleMusicReact(track, type);
    }
  }}
  
  onOpenComments={(track) => handleOpenMusicComments(track)}
  onShare={(track) => handleMusicShare(track)}
/>

)}

    {fullScreenImage && <ImageViewer imageUrl={fullScreenImage} onClose={() => setFullScreenImage(null)} />}

    {incomingCall && currentUser && (
      <CallScreen
        open={true}
        mode={incomingCall.call_type === "video" ? "video" : "voice"}
        phase="incoming"
        peerName={incomingCall.caller_name || "User"}
        peerAvatar={incomingCall.caller_avatar || null}
        micOn={true}
        camOn={true}
        speakerOn={true}
        onAccept={() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          openChatWith(incomingCall.caller_id);
          setIncomingCall(null);
        }}
        onDecline={() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          apiFetch(
            "/api/calls/signal",
            {
              method: "POST",
              body: JSON.stringify({
                call_id: incomingCall.id,
                to_user_id: incomingCall.caller_id,
                type: "decline",
              }),
            },
          ).catch(err => console.error('Failed to decline call:', err));
          setIncomingCall(null);
        }}
        onHangup={() => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setIncomingCall(null);
        }}
        onToggleMic={() => {}}
        onToggleCam={() => {}}
        onToggleSpeaker={() => {}}
      />
    )}

    {isChatOpen && activeChatUser && currentUser && (
      <ChatWindow
        currentUser={currentUser}
        recipient={activeChatUser}
        onClose={handleCloseChat}
        onSendMessage={handleSendMessage}
        onViewProduct={handleOpenProductById}
      />
    )}

    {isChatsListOpen && currentUser && (
  <ChatsList
    currentUser={currentUser}
    onOpenChat={handleOpenChat}
    onClose={handleCloseChatsList}
    onOpenRequests={() => {
      console.log('Open message requests');
    }}
    onNewChat={() => {
      console.log('Create new chat');
    }}
  />
)}
    {/* Reel Gallery Creator */}
{showReelGallery && (
  <ReelGalleryCreator
    sound={selectedReelSoundForGallery}
    onClose={() => {
      setShowReelGallery(false);
      setSelectedReelSoundForGallery(undefined);
    }}
    onDone={(payload) => {
      setShowReelGallery(false);
      setSelectedReelSoundForGallery(undefined);
      setSelectedReelSound(payload.sound || null);
      setPendingReelFile(payload.file);
      setPendingReelThumbnailFile(payload.thumbnailFile);
      setNativeReelVideoUrl(payload.nativeVideoUrl || '');
      setNativeReelMediaMeta(payload.nativeVideoMeta || null);
      setPendingReelEffectId(payload.effectId || 'none');
      setShowRecorder(true);
    }}
  />
)}

      {showAdAnalytics && adAnalyticsId && (() => {
        const targetAd = adCampaigns.find(a => Number(a.id) === Number(adAnalyticsId));
        const impr = targetAd?.analytics?.impressions ?? targetAd?.impressions ?? 0;
        const views = targetAd?.analytics?.views ?? targetAd?.views ?? 0;
        const clicks = targetAd?.analytics?.clicks ?? targetAd?.clicks ?? 0;
        const ctr = targetAd ? (impr > 0 ? ((clicks / impr) * 100).toFixed(1) : '0.0') : '0.0';

        return (
          <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B]">
                <div>
                  <h2 className="text-xl font-bold text-white">Campaign Analytics</h2>
                  <p className="text-sm text-[#94A3B8]">{targetAd?.name || `Ad #${adAnalyticsId}`}</p>
                </div>
                <button
                  onClick={() => setShowAdAnalytics(false)}
                  className="text-[#94A3B8] hover:text-white p-2 rounded-lg hover:bg-[#1E293B] transition-colors"
                >
                  <i className="fas fa-times text-lg" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-3.5 text-center">
                  <span className="text-xs text-[#94A3B8] font-medium block mb-1">Impressions</span>
                  <span className="text-xl font-bold text-white">{impr.toLocaleString()}</span>
                </div>
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-3.5 text-center">
                  <span className="text-xs text-[#94A3B8] font-medium block mb-1">Views</span>
                  <span className="text-xl font-bold text-blue-400">{views.toLocaleString()}</span>
                </div>
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-3.5 text-center">
                  <span className="text-xs text-[#94A3B8] font-medium block mb-1">Clicks</span>
                  <span className="text-xl font-bold text-emerald-400">{clicks.toLocaleString()}</span>
                </div>
                <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-3.5 text-center">
                  <span className="text-xs text-[#94A3B8] font-medium block mb-1">CTR</span>
                  <span className="text-xl font-bold text-amber-400">{ctr}%</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 text-sm text-[#94A3B8]">
                <div className="flex justify-between py-1.5 border-b border-[#1E293B]/60">
                  <span>Status</span>
                  <span className="font-semibold text-white capitalize">{targetAd?.status || 'Active'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#1E293B]/60">
                  <span>Cost</span>
                  <span className="font-semibold text-emerald-400">FREE ($0)</span>
                </div>
                {targetAd?.target_location && (
                  <div className="flex justify-between py-1.5 border-b border-[#1E293B]/60">
                    <span>Target Location</span>
                    <span className="font-semibold text-white">{targetAd.target_location}</span>
                  </div>
                )}
                {targetAd?.start_date && (
                  <div className="flex justify-between py-1.5">
                    <span>Date Started</span>
                    <span className="font-semibold text-white">{new Date(targetAd.start_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Upload Progress Pill */}
      {postUploadState && (
        <PostUploadBottomPill uploadState={postUploadState} />
      )}
    </div>
  );
}    
