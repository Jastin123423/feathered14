// utils/imageCache.ts
// UNERA Professional Image Caching & Lazy Loading Engine
// Data-saving optimization: 0kb downloaded until 3 posts away, cache-first persistence

const CACHE_NAME = 'unera-images-v1';
const CACHE_DURATION = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds

// High-speed in-memory set of already downloaded/cached URLs
const memoryCachedUrls = new Set<string>();

// Asynchronously warm up the memory cache with keys already stored in CacheStorage
if (typeof window !== 'undefined' && 'caches' in window) {
  try {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      for (const req of keys) {
        memoryCachedUrls.add(req.url);
      }
    }).catch(() => {});

    // Also check service worker media cache if present
    caches.open('media-unera-sw-v3').then(async (cache) => {
      const keys = await cache.keys();
      for (const req of keys) {
        memoryCachedUrls.add(req.url);
      }
    }).catch(() => {});
  } catch {
    // Ignore cache warmup errors in restricted sandbox
  }
}

export const imageCache = {
  // Synchronous check if URL is known to be cached
  isCached(url?: string): boolean {
    if (!url) return false;
    if (url.startsWith('data:') || url.startsWith('blob:')) return true;
    return memoryCachedUrls.has(url);
  },

  // Mark a URL as downloaded & cached
  markCached(url?: string) {
    if (!url) return;
    memoryCachedUrls.add(url);
  },

  // Save image response to CacheStorage
  async save(url: string, response: Response) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
    this.markCached(url);
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, response);
      }
    } catch (error) {
      console.warn('Failed to cache image:', error);
    }
  },

  // Get image from cache
  async get(url: string): Promise<Response | undefined> {
    if (!url) return undefined;
    if (this.isCached(url)) {
      // Memory hit confirmed
    }
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(url);
        if (response) {
          this.markCached(url);
          return response;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  },

  // Preload and cache image with priority
  async preload(url: string, priority: 'low' | 'high' = 'high'): Promise<void> {
    if (!url || this.isCached(url)) return;

    try {
      // Check CacheStorage first
      const cached = await this.get(url);
      if (cached) return;

      const fetchOptions: RequestInit = {
        mode: 'cors',
        cache: 'force-cache',
      };
      
      // Use Fetch Priority API if available
      if ('priority' in Request.prototype) {
        (fetchOptions as any).priority = priority;
      }

      const response = await fetch(url, fetchOptions);
      if (response && response.ok) {
        await this.save(url, response.clone());
      }
    } catch (error) {
      // Ignore background preload failures gracefully
    }
  },

  // Clear old cached items exceeding duration
  async clearOld() {
    try {
      if (typeof window === 'undefined' || !('caches' in window)) return;
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      for (const request of keys) {
        const response = await cache.match(request);
        const dateHeader = response?.headers.get('date');
        if (dateHeader) {
          const cacheDate = new Date(dateHeader).getTime();
          if (Date.now() - cacheDate > CACHE_DURATION) {
            await cache.delete(request);
            memoryCachedUrls.delete(request.url);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
};

/* =========================================================================
   SINGLETON INTERSECTION OBSERVERS FOR DATA-SAVING LAZY LOADING
   - Stage 1: ~3 posts before view screen (~1500px threshold) -> download thumbnail
   - Stage 2: ~1 post before view screen (~500px threshold)  -> download feed image
   ========================================================================= */

type ObserverCallback = () => void;

const thumbCallbacks = new WeakMap<Element, ObserverCallback>();
const feedCallbacks = new WeakMap<Element, ObserverCallback>();

let thumbObserver: IntersectionObserver | null = null;
let feedObserver: IntersectionObserver | null = null;

function getThumbObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = thumbCallbacks.get(entry.target);
            if (cb) {
              thumbCallbacks.delete(entry.target);
              thumbObserver?.unobserve(entry.target);
              cb();
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '1500px 0px 1500px 0px', // ~3 posts ahead
        threshold: 0,
      }
    );
  }
  return thumbObserver;
}

function getFeedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;
  if (!feedObserver) {
    feedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = feedCallbacks.get(entry.target);
            if (cb) {
              feedCallbacks.delete(entry.target);
              feedObserver?.unobserve(entry.target);
              cb();
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '1500px 0px 1500px 0px', // ~3 posts ahead: feed image loads when 3 posts before view screen, 0kb outside
        threshold: 0,
      }
    );
  }
  return feedObserver;
}

export function observeForThumbnail(el: Element, cb: ObserverCallback): () => void {
  const obs = getThumbObserver();
  if (!obs) {
    // If no observer support, trigger immediately
    cb();
    return () => {};
  }
  thumbCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    thumbCallbacks.delete(el);
    obs.unobserve(el);
  };
}

export function observeForFeed(el: Element, cb: ObserverCallback): () => void {
  const obs = getFeedObserver();
  if (!obs) {
    // If no observer support, trigger immediately
    cb();
    return () => {};
  }
  feedCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    feedCallbacks.delete(el);
    obs.unobserve(el);
  };
}
