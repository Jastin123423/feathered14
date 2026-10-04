import { Reel, User } from '../types';

/**
 * ============================================================================
 * UNERA TIKTOK-STYLE VIDEO SERVING & ROTATION ENGINE
 * ============================================================================
 * 
 * Features:
 * 1. Professional engagement ranking: views (log-scaled), reactions, comments, shares.
 * 2. TikTok-Style Discovery Push for non-popular & underdog videos (exploration bucket).
 * 3. Dynamic visit-by-visit rotation: ensures user never sees the same videos every time.
 * 4. Strict spacing constraint: NEVER shows two videos at the same time (always interleaved
 *    with other content such as text posts, photo posts, stories).
 */

const SEEN_VIDEOS_STORAGE_KEY = 'unera_feed_seen_videos_v1';
const VISIT_COUNTER_STORAGE_KEY = 'unera_feed_visit_seq_v1';
const MAX_SEEN_HISTORY = 40;

const safeNumber = (v: any, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);

// Deterministic pseudo-random generator
const seededRand01 = (seed: number): number => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
};

// Check if an URL points to a video
export const isVideoUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i.test(url) || url.includes('/video/');
};

// Check if an arbitrary item (post, story, reel) contains video
export const isItemVideo = (kind: string, data: any): boolean => {
  if (!data) return false;
  if (kind === 'reel') return true;
  if (data.format === 'reel') return true;
  if (data.media_type === 'video' || data.type === 'video') return true;
  if (data.video || data.video_url || data.videoUrl) return true;

  if (Array.isArray(data.media_urls) && data.media_urls.some((u: string) => isVideoUrl(u))) {
    return true;
  }
  if (Array.isArray(data.media) && data.media.some((m: any) => m?.type === 'video' || isVideoUrl(m?.url))) {
    return true;
  }
  if (Array.isArray(data.images) && data.images.some((img: any) => {
    const u = typeof img === 'string' ? img : img?.url;
    return isVideoUrl(u);
  })) {
    return true;
  }

  return false;
};

// Get or increment visit counter across page visits
export const getVisitSequence = (): number => {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = sessionStorage.getItem(VISIT_COUNTER_STORAGE_KEY) || localStorage.getItem(VISIT_COUNTER_STORAGE_KEY);
    let seq = raw ? parseInt(raw, 10) : 0;
    if (isNaN(seq) || seq < 0) seq = 0;
    seq += 1;
    sessionStorage.setItem(VISIT_COUNTER_STORAGE_KEY, String(seq));
    localStorage.setItem(VISIT_COUNTER_STORAGE_KEY, String(seq));
    return seq;
  } catch {
    return 1;
  }
};

// Get set of recently seen video IDs
export const getRecentSeenVideoIds = (): Set<string | number> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_VIDEOS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

// Record newly presented video IDs into seen history
export const markVideosAsSeen = (ids: Array<string | number>): void => {
  if (typeof window === 'undefined' || !ids.length) return;
  try {
    const existing = Array.from(getRecentSeenVideoIds());
    const merged = Array.from(new Set([...ids, ...existing])).slice(0, MAX_SEEN_HISTORY);
    sessionStorage.setItem(SEEN_VIDEOS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }
};

/**
 * ============================================================================
 * TIKTOK-STYLE VIDEO RANKING & ROTATION ALGORITHM
 * ============================================================================
 * 
 * Balances:
 * - Popularity signals (views, reactions, comments, shares)
 * - TikTok-style exploration push for non-popular & smaller creators
 * - Freshness decay
 * - Dynamic session rotation so users see different videos on each visit
 * - Seen-fatigue suppression so top videos rotate
 */
export interface RankAndRotateOptions {
  currentUserId?: number | string | null;
  currentUser?: User | null;
  users?: User[];
  sessionSeed?: number;
  visitSequence?: number;
  explorationPushRatio?: number;
}

export const rankAndRotateVideos = (
  reels: Reel[],
  optionsOrUser?: User | null | RankAndRotateOptions,
  users: User[] = [],
  sessionSeed = Date.now(),
  visitSeq = 1
): Reel[] => {
  if (!Array.isArray(reels) || reels.length === 0) return [];

  let currentUser: User | null = null;
  let userList: User[] = users;
  let seed = sessionSeed;
  let vSeq = visitSeq;
  let customViewerId: number | null = null;

  if (optionsOrUser && typeof optionsOrUser === 'object' && ('currentUserId' in optionsOrUser || 'visitSequence' in optionsOrUser || 'currentUser' in optionsOrUser)) {
    const opts = optionsOrUser as RankAndRotateOptions;
    currentUser = (opts.currentUser ?? null) as User | null;
    if (opts.currentUserId != null) {
      customViewerId = safeNumber(opts.currentUserId);
    }
    userList = opts.users || [];
    seed = opts.sessionSeed ?? Date.now();
    vSeq = opts.visitSequence ?? 1;
  } else if (optionsOrUser) {
    currentUser = optionsOrUser as User;
  }

  const now = Date.now();
  const seenIds = getRecentSeenVideoIds();

  // Create fast user lookup
  const userMap = new Map<number, User>();
  safeArray(userList).forEach((u: any) => {
    const id = safeNumber(u?.id ?? u?.user_id);
    if (id) userMap.set(id, u);
  });

  const viewerId = customViewerId ?? safeNumber(currentUser?.id);
  const viewerFollowing = new Set<number>(safeArray<number>((currentUser as any)?.following));

  const scored = reels.map((reel, index) => {
    const reelId = reel.id;
    const authorId = safeNumber(reel.userId ?? reel.user_id ?? (reel as any).author_id);
    const author = userMap.get(authorId);

    // 1. Engagement metrics
    const views = safeNumber(reel.views ?? (reel as any).views_count);
    const reactions = safeArray((reel as any).reactions).length || safeNumber((reel as any).likes);
    const comments = safeArray((reel as any).comments).length || safeNumber((reel as any).comments_count);
    const shares = safeNumber(reel.shares);

    // Popularity score: log-scaled views prevent viral outliers from dominating
    const popularityScore =
      Math.log1p(views) * 1.4 +
      reactions * 2.6 +
      comments * 4.2 +
      shares * 5.0;

    // 2. Freshness score
    const createdAt = (reel as any).created_at || (reel as any).createdAt;
    const reelTime = createdAt ? new Date(createdAt).getTime() : now;
    const hoursSinceCreation = Math.max(0, (now - reelTime) / (1000 * 60 * 60));
    const freshnessScore = Math.exp(-0.035 * hoursSinceCreation) * 14.0;

    // 3. TIKTOK-STYLE DISCOVERY PUSH FOR NON-POPULAR VIDEOS
    // Give non-popular, underdog, or new videos an algorithmic exposure test bucket
    let discoveryPush = 0;
    const isUnderdog = views < 80 || reactions < 8;
    if (isUnderdog) {
      // Direct boost to give non-popular videos a fighting chance on the feed
      discoveryPush += 26.0;
    }

    // Small creator push
    const authorFollowers = safeArray<number>((author as any)?.followers).length;
    if (authorFollowers < 400) {
      discoveryPush += 14.0;
    }

    // Debut boost for fresh uploads (< 48h old) with low views
    if (hoursSinceCreation < 48 && views < 40) {
      discoveryPush += 20.0;
    }

    // 4. Affinity & Follower connection
    let affinityBonus = 0;
    if (viewerId && authorId) {
      if (authorId === viewerId) {
        affinityBonus = 6.0; // Show user's own reel nicely
      } else if (viewerFollowing.has(authorId)) {
        affinityBonus = 12.0; // Boost followed creators
      }
    }

    // 5. NOVELTY & VISIT ROTATION
    // If video was seen in recent session, apply a rotation fatigue penalty
    // If NOT seen recently, give it an "Unseen Discovery" boost
    let rotationScore = 0;
    const wasRecentlySeen = seenIds.has(reelId) || seenIds.has(String(reelId));
    if (wasRecentlySeen) {
      rotationScore -= 38.0; // Rotate down previously seen videos
    } else {
      rotationScore += 24.0; // Promote fresh, unviewed videos to the top
    }

    // Cyclic visit phase shift: offsets indices based on visit sequence
    // so every visit shuffles the priority slots smoothly
    const cyclePhase = ((index + visitSeq * 3) % Math.max(1, reels.length)) * 1.5;

    // Seeded pseudo-random organic jitter
    const jitter = seededRand01(sessionSeed + safeNumber(reelId) * 997 + visitSeq * 71) * 12.0;

    const totalScore =
      popularityScore +
      freshnessScore +
      discoveryPush +
      affinityBonus +
      rotationScore +
      cyclePhase +
      jitter;

    return {
      reel,
      score: totalScore,
      authorId,
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Apply diversity: no back-to-back same author, max 2 per author in top 10
  const result: Reel[] = [];
  const authorOccurrences = new Map<number, number>();

  for (const item of scored) {
    const authorId = item.authorId;
    const lastAuthorId = result.length
      ? safeNumber((result[result.length - 1] as any).userId ?? (result[result.length - 1] as any).user_id)
      : -1;

    const seenCount = authorOccurrences.get(authorId) || 0;
    if (result.length < 12 && seenCount >= 2) {
      continue;
    }
    if (result.length > 0 && authorId && authorId === lastAuthorId) {
      continue;
    }

    result.push(item.reel);
    authorOccurrences.set(authorId, seenCount + 1);
  }

  // Add any remaining skipped items at the tail to avoid dropping reels
  const resultSet = new Set(result.map((r) => r.id));
  for (const item of scored) {
    if (!resultSet.has(item.reel.id)) {
      result.push(item.reel);
      resultSet.add(item.reel.id);
    }
  }

  return result;
};

/**
 * ============================================================================
 * STRICT FEED INTERLEAVING ENGINE
 * ============================================================================
 * 
 * Strict Constraint:
 * "NEVER SHOW TWO VIDEOS AT THE SAME TIME; SHOULD BE OTHER CONTENTS THEN VIDEO"
 * 
 * Guarantees:
 * - At least 3 to 5 non-video items between ANY two video items (reels or video posts).
 * - Two video items can NEVER appear back-to-back under any circumstances.
 */
export interface MixedFeedEntry {
  kind: 'post' | 'story' | 'reel';
  data: any;
  created_at: string;
  isVideo?: boolean;
}

export interface MixFeedOptions {
  minItemsBetweenVideos?: number;
  minSpacing?: number;
  firstVideoSlot?: number;
}

export const mixFeedWithStrictVideoSpacing = (
  postItems: Array<{ kind: 'post'; data: any; created_at: string }>,
  storyItems: Array<{ kind: 'story'; data: any; created_at: string }>,
  reelItems: Array<{ kind: 'reel'; data: any; created_at: string }>,
  options: MixFeedOptions = {}
): MixedFeedEntry[] => {
  const minBetween = options.minSpacing ?? options.minItemsBetweenVideos ?? 3;

  // Classify all incoming items as video or non-video
  const nonVideoQueue: MixedFeedEntry[] = [];
  const videoQueue: MixedFeedEntry[] = [];

  // Stories (stories are always non-video cards in the feed stream)
  const storiesQueue: MixedFeedEntry[] = (storyItems || []).map((s) => ({
    kind: 'story' as const,
    data: s.data,
    created_at: s.created_at,
    isVideo: false,
  }));

  // Posts: separate video posts from non-video posts
  (postItems || []).forEach((p) => {
    const isVid = isItemVideo('post', p.data);
    if (isVid) {
      videoQueue.push({
        kind: 'post' as const,
        data: p.data,
        created_at: p.created_at,
        isVideo: true,
      });
    } else {
      nonVideoQueue.push({
        kind: 'post' as const,
        data: p.data,
        created_at: p.created_at,
        isVideo: false,
      });
    }
  });

  // Reels: all reels are video items
  (reelItems || []).forEach((r) => {
    videoQueue.push({
      kind: 'reel' as const,
      data: r.data,
      created_at: r.created_at,
      isVideo: true,
    });
  });

  const out: MixedFeedEntry[] = [];
  let nonVideoIndex = 0;
  let videoIndex = 0;
  let storyIndex = 0;
  let itemsSinceLastVideo = minBetween; // Allow first video after initial items

  // First slot target for video
  const firstVideoThreshold = 4;

  while (
    nonVideoIndex < nonVideoQueue.length ||
    storyIndex < storiesQueue.length ||
    videoIndex < videoQueue.length
  ) {
    const canPlaceVideo =
      videoIndex < videoQueue.length &&
      itemsSinceLastVideo >= minBetween &&
      out.length >= firstVideoThreshold;

    // Can place a story every ~6 items
    const canPlaceStory =
      storyIndex < storiesQueue.length &&
      out.length > 0 &&
      out.length % 6 === 0 &&
      out[out.length - 1].kind !== 'story';

    // 1. Place story if scheduled
    if (canPlaceStory) {
      out.push(storiesQueue[storyIndex++]);
      itemsSinceLastVideo++;
      continue;
    }

    // 2. Place video ONLY if strict spacing constraint is met
    if (canPlaceVideo) {
      const nextVideo = videoQueue[videoIndex++];
      out.push(nextVideo);
      itemsSinceLastVideo = 0; // Reset counter: next video cannot be placed until minBetween
      continue;
    }

    // 3. Place non-video content
    if (nonVideoIndex < nonVideoQueue.length) {
      out.push(nonVideoQueue[nonVideoIndex++]);
      itemsSinceLastVideo++;
      continue;
    }

    // 4. If non-video posts run out, use any remaining stories
    if (storyIndex < storiesQueue.length) {
      out.push(storiesQueue[storyIndex++]);
      itemsSinceLastVideo++;
      continue;
    }

    // 5. If ONLY videos remain, NEVER place them consecutively!
    // If itemsSinceLastVideo < minBetween, we must NOT output another video immediately!
    // Break or only output if itemsSinceLastVideo >= minBetween
    if (videoIndex < videoQueue.length && itemsSinceLastVideo >= minBetween) {
      out.push(videoQueue[videoIndex++]);
      itemsSinceLastVideo = 0;
    } else {
      // Remaining videos cannot be safely placed without violating "never show two videos at same time"
      break;
    }
  }

  return out;
};
