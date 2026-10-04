// utils/dataCache.ts
/**
 * Professional local caching layer for UNERA (Facebook-style offline-first & instant hydration).
 * Ensures instant UI rendering on startup, eliminates blinking/empty states,
 * and caches comments and feeds with stale-while-revalidate strategy.
 */

const MEMORY_CACHE = new Map<string, { data: any; timestamp: number }>();

// Cache key constants
export const CACHE_KEYS = {
  POSTS: 'unera_cache_posts_v2',
  REELS: 'unera_cache_reels_v2',
  STORIES: 'unera_cache_stories_v2',
  SONGS: 'unera_cache_songs_v2',
  PRODUCTS: 'unera_cache_products_v2',
  GROUPS: 'unera_cache_groups_v2',
  USERS: 'unera_cache_users_v2',
  COMMENTS_PREFIX: 'unera_cache_comments_',
} as const;

// Default TTLs (in milliseconds)
export const CACHE_TTL = {
  FEED: 10 * 60 * 1000,       // 10 minutes
  STORIES: 5 * 60 * 1000,     // 5 minutes
  COMMENTS: 5 * 60 * 1000,    // 5 minutes (cache comments so they don't reload on every sheet open)
  MEDIA: 15 * 60 * 1000,      // 15 minutes
  STATIC: 60 * 60 * 1000,     // 1 hour
} as const;

/**
 * Safely reads cached JSON from memory or localStorage.
 */
export function getLocalCache<T>(key: string, maxAgeMs?: number): T | null {
  try {
    // 1. Check memory cache first (fastest)
    const inMem = MEMORY_CACHE.get(key);
    if (inMem) {
      if (!maxAgeMs || Date.now() - inMem.timestamp <= maxAgeMs) {
        return inMem.data as T;
      }
    }

    // 2. Check localStorage
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const timestamp = parsed._cached_at || 0;
    const data = parsed.data !== undefined ? parsed.data : parsed;

    // Populate memory cache for future fast reads
    MEMORY_CACHE.set(key, { data, timestamp });

    if (maxAgeMs && timestamp > 0 && Date.now() - timestamp > maxAgeMs) {
      return data as T; // Return stale data for instant display while background fetch runs
    }

    return data as T;
  } catch (err) {
    console.debug('Failed to read from cache key:', key, err);
    return null;
  }
}

/**
 * Safely writes data to memory and localStorage with quota protection.
 */
export function setLocalCache<T>(key: string, data: T): void {
  try {
    const timestamp = Date.now();
    // 1. Update memory cache
    MEMORY_CACHE.set(key, { data, timestamp });

    // 2. Persist to localStorage
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload = JSON.stringify({
      _cached_at: timestamp,
      data,
    });

    try {
      window.localStorage.setItem(key, payload);
    } catch (quotaErr) {
      // Storage quota exceeded: prune older comment caches
      console.warn('localStorage quota exceeded, cleaning old cache entries...');
      pruneOldCaches();
      try {
        window.localStorage.setItem(key, payload);
      } catch {
        // Fallback: memory cache only
      }
    }
  } catch (err) {
    console.debug('Failed to write to cache key:', key, err);
  }
}

/**
 * Prunes older cached comments or feeds if localStorage gets full.
 */
function pruneOldCaches(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_KEYS.COMMENTS_PREFIX)) {
        toRemove.push(k);
      }
    }
    // Remove oldest half of comment caches
    toRemove.slice(0, Math.ceil(toRemove.length / 2)).forEach((k) => {
      window.localStorage.removeItem(k);
      MEMORY_CACHE.delete(k);
    });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Typed Cache Accessors
// ============================================================================

export function getCachedPosts(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.POSTS);
  return Array.isArray(res) ? res : [];
}

export function setCachedPosts(posts: any[]): void {
  if (!Array.isArray(posts)) return;
  // Cache the first 40 most recent posts to keep storage compact
  setLocalCache(CACHE_KEYS.POSTS, posts.slice(0, 40));
}

export function getCachedReels(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.REELS);
  return Array.isArray(res) ? res : [];
}

export function setCachedReels(reels: any[]): void {
  if (!Array.isArray(reels)) return;
  setLocalCache(CACHE_KEYS.REELS, reels.slice(0, 30));
}

export function getCachedStories(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.STORIES);
  return Array.isArray(res) ? res : [];
}

export function setCachedStories(stories: any[]): void {
  if (!Array.isArray(stories)) return;
  setLocalCache(CACHE_KEYS.STORIES, stories.slice(0, 30));
}

export function getCachedSongs(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.SONGS);
  return Array.isArray(res) ? res : [];
}

export function setCachedSongs(songs: any[]): void {
  if (!Array.isArray(songs)) return;
  setLocalCache(CACHE_KEYS.SONGS, songs.slice(0, 50));
}

export function getCachedProducts(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.PRODUCTS);
  return Array.isArray(res) ? res : [];
}

export function setCachedProducts(products: any[]): void {
  if (!Array.isArray(products)) return;
  setLocalCache(CACHE_KEYS.PRODUCTS, products.slice(0, 40));
}

export function getCachedUsers(): any[] {
  const res = getLocalCache<any[]>(CACHE_KEYS.USERS);
  return Array.isArray(res) ? res : [];
}

export function setCachedUsers(users: any[]): void {
  if (!Array.isArray(users)) return;
  setLocalCache(CACHE_KEYS.USERS, users.slice(0, 100));
}

// ============================================================================
// Comments Cache (Prevents fetching comments repeatedly on every click)
// ============================================================================

export function getCommentCacheKey(targetType: string, targetId: string | number): string {
  return `${CACHE_KEYS.COMMENTS_PREFIX}${targetType}_${targetId}`;
}

export function getCachedComments(targetType: string, targetId: string | number): { data: any[]; isFresh: boolean } | null {
  const key = getCommentCacheKey(targetType, targetId);
  const inMem = MEMORY_CACHE.get(key);
  if (inMem && Array.isArray(inMem.data)) {
    const isFresh = Date.now() - inMem.timestamp < CACHE_TTL.COMMENTS;
    return { data: inMem.data, isFresh };
  }

  const stored = getLocalCache<any[]>(key, CACHE_TTL.COMMENTS);
  if (Array.isArray(stored)) {
    const inMemAfter = MEMORY_CACHE.get(key);
    const isFresh = inMemAfter ? Date.now() - inMemAfter.timestamp < CACHE_TTL.COMMENTS : false;
    return { data: stored, isFresh };
  }

  return null;
}

export function setCachedComments(targetType: string, targetId: string | number, comments: any[]): void {
  if (!Array.isArray(comments)) return;
  const key = getCommentCacheKey(targetType, targetId);
  setLocalCache(key, comments);
}

export function addCachedComment(targetType: string, targetId: string | number, comment: any): void {
  const key = getCommentCacheKey(targetType, targetId);
  const existing = getCachedComments(targetType, targetId);
  const list = existing ? [...existing.data] : [];
  list.unshift(comment);
  setLocalCache(key, list);
}

export function updateCachedComment(
  targetType: string,
  targetId: string | number,
  commentId: number,
  updater: (c: any) => any
): void {
  const key = getCommentCacheKey(targetType, targetId);
  const existing = getCachedComments(targetType, targetId);
  if (!existing) return;
  const list = existing.data.map((c: any) => (Number(c.id) === Number(commentId) ? updater(c) : c));
  setLocalCache(key, list);
}

export function removeCachedComment(
  targetType: string,
  targetId: string | number,
  commentId: number | string
): void {
  const key = getCommentCacheKey(targetType, targetId);
  const existing = getCachedComments(targetType, targetId);
  if (!existing) return;
  const list = existing.data.filter(
    (c: any) => String(c.id) !== String(commentId) && String(c.parent_comment_id || c.parent_id) !== String(commentId)
  );
  setLocalCache(key, list);
}
