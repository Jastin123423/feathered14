/**
 * utils/adaptivePlayback.ts
 *
 * Professional client-side adaptive video source resolver & network quality evaluator.
 * Designed for minimum mobile-data consumption and smooth playback on mobile & low-end devices.
 *
 * Rules:
 * - Uses ONLY:
 *   1. "thumbnail_url" -> preview image
 *   2. "720" -> low-quality / fast playback
 *   3. "1080" -> high-quality playback
 * - NEVER downloads or streams the "original" video in frontend.
 * - Respects navigator.connection (Save-Data, effectiveType, downlink).
 * - Ensures 720p first, then migrates to 1080p only on fast, unconstrained connections.
 */

export interface AdaptiveVideoSources {
  thumbnailUrl: string;
  url720: string;
  url1080: string;
}

export interface NetworkCondition {
  isSaveData: boolean;
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  downlink: number; // in Mbps
  canUpgradeTo1080p: boolean;
}

/**
 * Safely parse JSON or return the array.
 */
const safeParseArray = (val: any): any[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {}
    }
  }
  return [];
};

const isVideoExtension = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  return /\.(mp4|webm|mov|m4v|3gp|avi|mkv)(\?|$)/i.test(url);
};

const isImageExtension = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  return /\.(webp|jpg|jpeg|png|avif|gif)(\?|$)/i.test(url) || url.includes('/thumbnails/');
};

/**
 * Resolves the 3 required media URLs from any post/reel record:
 * - thumbnailUrl: Preview WebP image (never a video file)
 * - url720: 720p compressed MP4
 * - url1080: 1080p compressed MP4
 *
 * Explicitly ignores "original" video URLs.
 */
export const resolveAdaptiveVideoUrls = (item: any): AdaptiveVideoSources => {
  if (!item) {
    return { thumbnailUrl: '', url720: '', url1080: '' };
  }

  const metaList = safeParseArray(item.media_meta);
  const meta0 = metaList[0] || {};
  const urlsList = safeParseArray(item.media_urls);

  // 1. Resolve Thumbnail URL (Must be an image, NEVER video)
  let rawThumb = '';
  if (meta0.thumbnail_url && !isVideoExtension(meta0.thumbnail_url)) {
    rawThumb = String(meta0.thumbnail_url).trim();
  } else if (meta0.thumb && !isVideoExtension(meta0.thumb)) {
    rawThumb = String(meta0.thumb).trim();
  } else if (item.thumbnail_url && !isVideoExtension(item.thumbnail_url)) {
    rawThumb = String(item.thumbnail_url).trim();
  } else if (item.thumb_url && !isVideoExtension(item.thumb_url)) {
    rawThumb = String(item.thumb_url).trim();
  } else if (item.thumbnail && !isVideoExtension(item.thumbnail)) {
    rawThumb = String(item.thumbnail).trim();
  } else if (item.cover_url && !isVideoExtension(item.cover_url)) {
    rawThumb = String(item.cover_url).trim();
  } else if (item.coverImage && !isVideoExtension(item.coverImage)) {
    rawThumb = String(item.coverImage).trim();
  }

  // Check urlsList if thumbnail still not found
  if (!rawThumb && urlsList.length >= 4 && isImageExtension(urlsList[3])) {
    rawThumb = String(urlsList[3]).trim();
  } else if (!rawThumb && urlsList.length === 2 && isImageExtension(urlsList[1])) {
    rawThumb = String(urlsList[1]).trim();
  }

  // 2. Resolve 720p URL
  let url720 = '';
  if (meta0['720'] && !meta0['720'].includes('/original/')) {
    url720 = String(meta0['720']).trim();
  } else if (meta0.sd && !meta0.sd.includes('/original/')) {
    url720 = String(meta0.sd).trim();
  } else if (meta0.feed && !meta0.feed.includes('/original/')) {
    url720 = String(meta0.feed).trim();
  } else if (item['720'] && !item['720'].includes('/original/')) {
    url720 = String(item['720']).trim();
  }

  if (!url720 && urlsList.length >= 3) {
    // urlsList: [original, 1080, 720, thumb]
    const u = String(urlsList[2] || '');
    if (u && (u.includes('/720p/') || u.includes('_720p') || !u.includes('/original/'))) {
      url720 = u.trim();
    }
  }

  if (!url720) {
    const found720 = urlsList.find((u: string) => typeof u === 'string' && (u.includes('/720p/') || u.includes('_720p')));
    if (found720) url720 = found720;
  }

  // Fallback for 720p: use media_url / video_url if it's NOT the original
  if (!url720) {
    const candidate = String(item.media_url || item.video_url || item.feed_url || '').trim();
    if (candidate && !candidate.includes('/original/') && isVideoExtension(candidate)) {
      url720 = candidate;
    }
  }

  // 3. Resolve 1080p URL
  let url1080 = '';
  if (meta0['1080'] && !meta0['1080'].includes('/original/')) {
    url1080 = String(meta0['1080']).trim();
  } else if (meta0.hd && !meta0.hd.includes('/original/')) {
    url1080 = String(meta0.hd).trim();
  } else if (meta0.full && !meta0.full.includes('/original/')) {
    url1080 = String(meta0.full).trim();
  } else if (item['1080'] && !item['1080'].includes('/original/')) {
    url1080 = String(item['1080']).trim();
  }

  if (!url1080 && urlsList.length >= 2) {
    const u = String(urlsList[1] || '');
    if (u && (u.includes('/1080p/') || u.includes('_1080p') || !u.includes('/original/'))) {
      url1080 = u.trim();
    }
  }

  if (!url1080) {
    const found1080 = urlsList.find((u: string) => typeof u === 'string' && (u.includes('/1080p/') || u.includes('_1080p')));
    if (found1080) url1080 = found1080;
  }

  // If 1080p is unavailable, 1080p gracefully falls back to 720p
  if (!url1080) {
    url1080 = url720;
  }

  // If 720p was unavailable, use 1080p
  if (!url720) {
    url720 = url1080;
  }

  return {
    thumbnailUrl: rawThumb,
    url720,
    url1080,
  };
};

/**
 * Evaluates current network condition using Network Information API.
 * Safely handles environments where the API is unavailable.
 */
export const getNetworkCondition = (): NetworkCondition => {
  if (typeof navigator === 'undefined') {
    return {
      isSaveData: false,
      effectiveType: 'unknown',
      downlink: 10,
      canUpgradeTo1080p: true,
    };
  }

  const conn: any =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (!conn) {
    // If Network Information API not available, assume stable connection
    return {
      isSaveData: false,
      effectiveType: 'unknown',
      downlink: 5,
      canUpgradeTo1080p: true,
    };
  }

  const isSaveData = Boolean(conn.saveData);
  const effectiveType = String(conn.effectiveType || '4g').toLowerCase() as NetworkCondition['effectiveType'];
  const downlink = typeof conn.downlink === 'number' ? conn.downlink : 5;

  // Strict data saving rules:
  // - If user has Save-Data enabled, NEVER upgrade to 1080p
  // - If network is 2G, slow-2g or 3G, NEVER upgrade to 1080p
  // - If downlink is less than 3.5 Mbps, keep 720p
  const canUpgrade =
    !isSaveData &&
    effectiveType === '4g' &&
    downlink >= 3.5;

  return {
    isSaveData,
    effectiveType,
    downlink,
    canUpgradeTo1080p: canUpgrade,
  };
};
