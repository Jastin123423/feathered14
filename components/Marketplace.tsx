// Marketplace.tsx - Complete file with native app integration

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, Product } from '../types';
import { MARKETPLACE_CATEGORIES, MARKETPLACE_COUNTRIES } from '../constants';
import { imageCache, observeForThumbnail, observeForFeed } from '../utils/imageCache';
import { PostUploadProgressBanner, PostUploadState } from './PostUploadProgress';
import { PostMenu } from './Post/PostMenu';
import { VerifiedBadge } from './VerifiedBadge';

// ==================== OPTIMIZED DATA-SAVING MARKETPLACE IMAGE ====================

const OptimizedMarketplaceImage: React.FC<{
  thumbUrl?: string;
  feedUrl?: string;
  alt: string;
  className?: string;
}> = ({ thumbUrl, feedUrl, alt, className = "w-full h-full object-cover" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetFeed = feedUrl || thumbUrl || '';
  const targetThumb = thumbUrl || feedUrl || '';

  const isPreCached = imageCache.isCached(targetFeed) || imageCache.isCached(targetThumb);

  const [activeSrc, setActiveSrc] = useState<string>(() => {
    if (imageCache.isCached(targetFeed)) return targetFeed;
    if (imageCache.isCached(targetThumb)) return targetThumb;
    return '';
  });
  const [isLoaded, setIsLoaded] = useState<boolean>(isPreCached);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (imageCache.isCached(targetFeed)) {
      setActiveSrc(targetFeed);
      setIsLoaded(true);
      return;
    }

    // Stage 1: Load thumbnail when within 1500px (~3 rows ahead)
    const cleanupThumb = observeForThumbnail(el, () => {
      if (!activeSrc && targetThumb) {
        setActiveSrc(targetThumb);
        imageCache.markCached(targetThumb);
      }
    });

    // Stage 2: Upgrade to feed resolution when within 500px (~1 row ahead)
    const cleanupFeed = observeForFeed(el, () => {
      if (targetFeed) {
        setActiveSrc(targetFeed);
        imageCache.markCached(targetFeed);
      }
    });

    return () => {
      cleanupThumb();
      cleanupFeed();
    };
  }, [targetThumb, targetFeed, activeSrc]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0F172A] relative overflow-hidden flex items-center justify-center">
      {activeSrc ? (
        <img
          src={activeSrc}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => {
            setIsLoaded(true);
            if (activeSrc) imageCache.markCached(activeSrc);
          }}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#0F172A] to-[#1E293B] flex items-center justify-center">
          <i className="fas fa-bag-shopping text-[#334155] text-2xl"></i>
        </div>
      )}
    </div>
  );
};

// ==================== NATIVE APP DETECTION ====================

const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative || 
    (window as any).UNERA_IS_NATIVE_APP
  );
};

const openNativeImagePicker = (): boolean => {
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ action: 'pick_image' })
    );
    return true;
  }
  return false;
};

// ==================== MARKETPLACE IMAGE BUNDLE HELPERS ====================

type ProductImageVariant = {
  thumb: string;
  feed: string;
  full: string;
  type: 'image';
};

interface ImageItem {
  id: number;
  data: string;
  file: File | null;
  isNative?: boolean;
  nativeUrl?: string;
  nativeMeta?: {
    thumb: string;
    feed: string;
    full: string;
  };
}

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

const calcContainSize = (w: number, h: number, max: number) => {
  if (!w || !h) return { width: max, height: max };
  if (Math.max(w, h) <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
};

const buildMarketplaceImageBundle = async (file: File) => {
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
    const thumb = new File([thumbBlob], `${ts}-thumbnail.webp`, { type: 'image/webp' });
    const feed = new File([feedBlob], `${ts}-feed.webp`, { type: 'image/webp' });

    return { thumb, feed };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const uploadMarketplaceImageBundle = async (file: File): Promise<ProductImageVariant> => {
  const bundle = await buildMarketplaceImageBundle(file);
  const formData = new FormData();
  formData.append('thumbnail', bundle.thumb);
  formData.append('feed', bundle.feed);
  formData.append('original', bundle.feed);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Upload failed: ${response.status}`);
  }

  const result = await response.json();
  const thumb = result?.uploaded?.thumbnail?.url || result?.media_urls?.thumb || '';
  const feed = result?.uploaded?.feed?.url || result?.media_urls?.feed || result?.url || '';

  if (!feed) {
    throw new Error('Marketplace upload failed: missing feed URL');
  }

  return {
    thumb: thumb || feed,
    feed,
    full: feed,
    type: 'image',
  };
};

// ==================== MARKETPLACE IMAGE WARM CACHE ====================

const warmedMarketplaceImages = new Set<string>();
const marketplaceWarmPromises = new Map<string, Promise<void>>();

const warmMarketplaceImage = (src?: string): Promise<void> => {
  const url = String(src || '').trim();
  if (!url) return Promise.resolve();
  if (warmedMarketplaceImages.has(url)) return Promise.resolve();
  if (marketplaceWarmPromises.has(url)) return marketplaceWarmPromises.get(url)!;

  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      warmedMarketplaceImages.add(url);
      marketplaceWarmPromises.delete(url);
      resolve();
    };
    img.onerror = () => {
      marketplaceWarmPromises.delete(url);
      resolve();
    };
    img.src = url;
  });

  marketplaceWarmPromises.set(url, promise);
  return promise;
};

// ==================== BASIC HELPERS ====================

const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);
const safeNumber = (v: any, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const safeString = (v: any) => String(v || '').trim();

const seededRand01 = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
};

const hashString = (input: string) => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h;
};

const safeImageVariants = (value: any): ProductImageVariant[] => {
  if (Array.isArray(value)) {
    return value
      .map((v) => ({
        thumb: String(v?.thumb || '').trim(),
        feed: String(v?.feed || v?.full || '').trim(),
        full: String(v?.feed || v?.full || '').trim(),
        type: 'image' as const,
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
          type: 'image' as const,
        }))
        .filter((v: any) => v.feed);
    } catch {}
  }

  return [];
};

const safeImages = (imgs: any): string[] => {
  if (Array.isArray(imgs)) return imgs.filter(Boolean);
  if (typeof imgs === 'string') {
    try {
      const p = JSON.parse(imgs);
      return Array.isArray(p) ? p.filter(Boolean) : [];
    } catch {}
  }
  return [];
};

// ==================== COUNTRY / CURRENCY ====================

type CountryMeta = {
  id?: string;
  code: string;
  name: string;
  symbol: string;
  flag?: string;
};

const getCountryMetaByCode = (countryCode: string): CountryMeta => {
  return (
    MARKETPLACE_COUNTRIES.find((c: any) => String(c.code).toUpperCase() === String(countryCode).toUpperCase()) ||
    MARKETPLACE_COUNTRIES.find((c: any) => c.code === 'US') ||
    MARKETPLACE_COUNTRIES[0]
  );
};

const normCountry = (v: any): string => {
  const str = String(v || '').trim();
  if (!str) return '';
  for (const country of MARKETPLACE_COUNTRIES as any[]) {
    if (country.id === 'all') continue;
    if (str.toUpperCase() === String(country.code).toUpperCase()) {
      return String(country.code).toUpperCase();
    }
    if (str.toLowerCase().includes(String(country.name).toLowerCase())) {
      return String(country.code).toUpperCase();
    }
  }
  return str.toUpperCase();
};

const detectCountryFromText = (text: string): string | null => {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return null;

  for (const country of MARKETPLACE_COUNTRIES as any[]) {
    if (country.id === 'all') continue;
    const name = String(country.name || '').toLowerCase();
    const code = String(country.code || '').toLowerCase();
    if (raw.includes(name) || raw.includes(code)) {
      return String(country.code).toUpperCase();
    }
  }

  return null;
};

const detectCountryFromUser = (user: User | null): string => {
  if (!user) return 'all';

  const fromNationality = detectCountryFromText(safeString((user as any).nationality));
  if (fromNationality) return fromNationality;

  const fromLocation = detectCountryFromText(safeString((user as any).location));
  if (fromLocation) return fromLocation;

  return 'all';
};

const getCurrencyLabelForCountry = (countryCode: string): string => {
  const code = String(countryCode || '').toUpperCase();
  if (['TZ', 'TZS'].includes(code)) return 'TSh';
  if (['KE', 'KES'].includes(code)) return 'KSh';
  if (['UG', 'UGX'].includes(code)) return 'USh';
  if (['RW', 'RWF'].includes(code)) return 'RWF';
  if (['BI', 'BIF'].includes(code)) return 'BIF';
  if (['US', 'USD'].includes(code)) return '$';
  if (['GB', 'GBP'].includes(code)) return '£';
  if (['EU', 'EUR'].includes(code)) return '€';

  return getCountryMetaByCode(countryCode).symbol || '$';
};

const getCurrencyDecimals = (countryCode: string): number => {
  const code = String(countryCode || '').toUpperCase();
  if (['TZ', 'TZS', 'KE', 'KES', 'UG', 'UGX', 'RW', 'RWF', 'BI', 'BIF'].includes(code)) return 0;
  return 2;
};

const formatPriceValue = (value: any, countryCode: string): string => {
  const n = safeNumber(value, 0);
  const decimals = getCurrencyDecimals(countryCode);

  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    return decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
  }
};

const formatPriceWithCurrency = (value: any, countryCode: string): string => {
  return `${getCurrencyLabelForCountry(countryCode)}${formatPriceValue(value, countryCode)}`;
};

const sanitizePriceInput = (raw: string, countryCode: string): string => {
  const decimals = getCurrencyDecimals(countryCode);
  let cleaned = String(raw || '').replace(/[^\d.]/g, '');

  if (decimals === 0) {
    return cleaned.replace(/\./g, '');
  }

  const firstDot = cleaned.indexOf('.');
  if (firstDot >= 0) {
    const intPart = cleaned.slice(0, firstDot).replace(/\./g, '');
    const fracPart = cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    return fracPart ? `${intPart}.${fracPart}` : `${intPart}.`;
  }

  return cleaned;
};

const formatPriceInputForDisplay = (raw: string, countryCode: string): string => {
  const value = String(raw || '');
  if (!value) return '';

  const decimals = getCurrencyDecimals(countryCode);
  if (decimals === 0) {
    const digitsOnly = value.replace(/\D/g, '');
    if (!digitsOnly) return '';
    return Number(digitsOnly).toLocaleString();
  }

  const parts = value.split('.');
  const intPart = parts[0].replace(/\D/g, '');
  const fracPart = parts[1]?.replace(/\D/g, '') || '';
  const formattedInt = intPart ? Number(intPart).toLocaleString() : '0';

  if (value.endsWith('.') && parts.length === 2) return `${formattedInt}.`;
  if (parts.length > 1) return `${formattedInt}.${fracPart}`;
  return formattedInt;
};

const parseStoredPrice = (raw: string, countryCode: string): number => {
  const cleaned = sanitizePriceInput(raw, countryCode);
  if (!cleaned) return 0;
  if (getCurrencyDecimals(countryCode) === 0) return safeNumber(cleaned.replace(/\D/g, ''), 0);
  return safeNumber(cleaned, 0);
};

const resolveListingCountry = ({
  manualCountry,
  selectedAddress,
  typedAddress,
  currentUser,
}: {
  manualCountry?: string;
  selectedAddress?: string;
  typedAddress?: string;
  currentUser: User | null;
}): string => {
  const fromManual = normCountry(manualCountry);
  if (fromManual && fromManual !== 'ALL') return fromManual;

  const fromSelected = detectCountryFromText(selectedAddress || '');
  if (fromSelected) return fromSelected;

  const fromTyped = detectCountryFromText(typedAddress || '');
  if (fromTyped) return fromTyped;

  const fromUser = detectCountryFromUser(currentUser);
  if (fromUser && fromUser !== 'all') return fromUser;

  return 'US';
};

// ==================== RANKING ====================

type MarketMode = 'for_you' | 'local' | 'worldwide';

const getProductCountryCode = (product: any): string => {
  const fromCountry = normCountry(product?.country);
  if (fromCountry) return fromCountry;

  const fromAddress = detectCountryFromText(product?.address || '');
  if (fromAddress) return fromAddress;

  return '';
};

const getProductSellerId = (product: any): number | string => {
  return product?.seller_id ?? product?.user_id ?? product?.owner_id ?? product?.id ?? 0;
};

const getProductAgeHours = (product: any): number => {
  const ts = new Date(product?.created_at || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 999999;
  return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
};

const isFreshProduct = (product: any) => getProductAgeHours(product) <= 24 * 7;

const scoreMarketplaceProduct = (
  product: any,
  viewerCountry: string,
  localCountry: string,
  seed: number
): number => {
  const ageHours = getProductAgeHours(product);
  const ageDays = ageHours / 24;
  const productCountry = getProductCountryCode(product);

  let freshness = 0;
  if (ageDays <= 2) freshness = 70;
  else if (ageDays <= 7) freshness = 55;
  else if (ageDays <= 14) freshness = 30;
  else if (ageDays <= 30) freshness = 18;
  else if (ageDays <= 90) freshness = 8;
  else freshness = 2;

  let locality = 0;
  if (localCountry && productCountry === localCountry) locality = 34;
  else if (viewerCountry && productCountry === viewerCountry) locality = 26;
  else if (productCountry) locality = 8;

  const variants = safeImageVariants(product?.image_variants);
  const legacyImages = safeImages(product?.images);
  const imagesCount = Math.max(variants.length, legacyImages.length);

  let quality = 0;
  if (imagesCount >= 1) quality += 12;
  if (imagesCount >= 3) quality += 5;
  if (safeString(product?.address).length >= 5) quality += 8;
  if (safeString(product?.description).length >= 20) quality += 8;
  if (safeNumber(product?.main_price, 0) > 0) quality += 8;
  if (safeNumber(product?.quantity, 0) > 0) quality += 4;

  const engagement =
    Math.min(12, safeNumber(product?.views, 0) * 0.05) +
    Math.min(8, safeNumber(product?.shares, 0) * 0.6);

  const sellerKey = String(getProductSellerId(product));
  const randomJitter = seededRand01(seed + hashString(`${product?.id}:${sellerKey}`)) * 6;

  return freshness + locality + quality + engagement + randomJitter;
};

const shuffleCloseScoreBucket = (items: any[], seed: number) => {
  return [...items]
    .map((item, index) => ({
      item,
      key: seededRand01(seed + index + hashString(String(item?.id || index))),
    }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
};

const rotateScoredProducts = (items: any[], seed: number) => {
  if (!items.length) return items;
  const buckets: any[][] = [];
  let current: any[] = [];
  let previousScore: number | null = null;

  items.forEach((item) => {
    const score = safeNumber(item?.__score, 0);
    if (previousScore === null) {
      current.push(item);
      previousScore = score;
      return;
    }

    if (Math.abs(previousScore - score) <= 6) {
      current.push(item);
    } else {
      buckets.push(shuffleCloseScoreBucket(current, seed + buckets.length));
      current = [item];
    }
    previousScore = score;
  });

  if (current.length) buckets.push(shuffleCloseScoreBucket(current, seed + buckets.length));
  return buckets.flat();
};

const interleaveMarketplacePools = (
  localFresh: any[],
  localOlder: any[],
  worldFresh: any[],
  worldOlder: any[]
) => {
  const result: any[] = [];
  const recentSellerUses = new Map<string, number>();

  const takeFromPool = (pool: any[]) => {
    if (!pool.length) return null;

    let bestIndex = 0;
    let bestPenalty = Number.POSITIVE_INFINITY;

    for (let i = 0; i < pool.length; i++) {
      const sellerKey = String(getProductSellerId(pool[i]));
      const penalty = recentSellerUses.get(sellerKey) || 0;
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestIndex = i;
      }
      if (penalty === 0) break;
    }

    const [picked] = pool.splice(bestIndex, 1);
    const sellerKey = String(getProductSellerId(picked));
    recentSellerUses.set(sellerKey, (recentSellerUses.get(sellerKey) || 0) + 1);

    if (result.length > 10) {
      const recent = result.slice(-8);
      const counts = new Map<string, number>();
      recent.forEach((item: any) => {
        const key = String(getProductSellerId(item));
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      recentSellerUses.clear();
      counts.forEach((v, k) => recentSellerUses.set(k, v));
    }

    return picked;
  };

  const pattern = [
    'localFresh',
    'localFresh',
    'localOlder',
    'localFresh',
    'worldFresh',
    'localFresh',
    'localOlder',
    'localFresh',
    'worldOlder',
    'localFresh',
  ] as const;

  while (localFresh.length || localOlder.length || worldFresh.length || worldOlder.length) {
    let pushed = false;

    for (const slot of pattern) {
      let picked: any = null;

      if (slot === 'localFresh') picked = takeFromPool(localFresh);
      if (slot === 'localOlder') picked = takeFromPool(localOlder);
      if (slot === 'worldFresh') picked = takeFromPool(worldFresh);
      if (slot === 'worldOlder') picked = takeFromPool(worldOlder);

      if (!picked) {
        picked =
          takeFromPool(localFresh) ||
          takeFromPool(localOlder) ||
          takeFromPool(worldFresh) ||
          takeFromPool(worldOlder);
      }

      if (picked) {
        result.push(picked);
        pushed = true;
      }

      if (!(localFresh.length || localOlder.length || worldFresh.length || worldOlder.length)) {
        break;
      }
    }

    if (!pushed) break;
  }

  return result;
};

const rankMarketplaceProducts = (
  items: Product[],
  currentUser: User | null,
  selectedCountry: string,
  mode: MarketMode,
  sessionSeed: number
): Product[] => {
  const viewerCountry = detectCountryFromUser(currentUser);
  const localCountry = selectedCountry !== 'all' ? normCountry(selectedCountry) : viewerCountry;

  const scored = safeArray<Product>(items)
    .map((product: any) => ({
      ...product,
      __score: scoreMarketplaceProduct(product, viewerCountry, localCountry, sessionSeed),
    }))
    .sort((a: any, b: any) => safeNumber(b.__score, 0) - safeNumber(a.__score, 0));

  const rotated = rotateScoredProducts(scored, sessionSeed);

  if (mode === 'local') {
    return rotated.filter((p: any) => {
      const pCountry = getProductCountryCode(p);
      return !!localCountry && !!pCountry && pCountry.toUpperCase() === localCountry.toUpperCase();
    });
  }

  if (mode === 'worldwide') {
    const local: any[] = [];
    const outside: any[] = [];
    rotated.forEach((p: any) => {
      const pCountry = getProductCountryCode(p);
      if (localCountry && pCountry && pCountry.toUpperCase() === localCountry.toUpperCase()) local.push(p);
      else outside.push(p);
    });

    const result: any[] = [];
    while (local.length || outside.length) {
      if (local.length) result.push(local.shift());
      if (local.length) result.push(local.shift());
      if (outside.length) result.push(outside.shift());
    }
    return result;
  }

  const localFresh: any[] = [];
  const localOlder: any[] = [];
  const worldFresh: any[] = [];
  const worldOlder: any[] = [];

  rotated.forEach((product: any) => {
    const pCountry = getProductCountryCode(product);
    const isLocal =
      localCountry && localCountry !== 'ALL' && pCountry && pCountry.toUpperCase() === localCountry.toUpperCase();
    const fresh = isFreshProduct(product);

    if (isLocal && fresh) localFresh.push(product);
    else if (isLocal && !fresh) localOlder.push(product);
    else if (!isLocal && fresh) worldFresh.push(product);
    else worldOlder.push(product);
  });

  return interleaveMarketplacePools(localFresh, localOlder, worldFresh, worldOlder);
};

// ==================== LOCATION SEARCH ====================

interface LocationSearchProps {
  value: string;
  onChangeText: (val: string) => void;
  onSelect: (val: string) => void;
  onCountryDetected?: (countryCode: string) => void;
  userFallbackCountry?: string;
}

const LocationSearch: React.FC<LocationSearchProps> = ({
  value,
  onChangeText,
  onSelect,
  onCountryDetected,
  userFallbackCountry = 'all',
}) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<any>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleSearch = async (q: string) => {
    const trimmed = String(q || '').trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&addressdetails=1&limit=5`
      );

      if (!res.ok) throw new Error(`Location search failed: ${res.status}`);

      const data = await res.json().catch(() => []);
      setResults(Array.isArray(data) ? data : []);

      const typedDetected = detectCountryFromText(trimmed);
      if (typedDetected && onCountryDetected) onCountryDetected(typedDetected);
    } catch (err) {
      console.error('Location search failed', err);
      setResults([]);

      const typedDetected = detectCountryFromText(trimmed);
      if (typedDetected && onCountryDetected) onCountryDetected(typedDetected);
      else if (userFallbackCountry && userFallbackCountry !== 'all' && onCountryDetected) {
        onCountryDetected(userFallbackCountry);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChangeText(val);
    setShowResults(true);

    const typedDetected = detectCountryFromText(val);
    if (typedDetected && onCountryDetected) onCountryDetected(typedDetected);
    else if (userFallbackCountry && userFallbackCountry !== 'all' && onCountryDetected) {
      onCountryDetected(userFallbackCountry);
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(val), 450);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 text-[#F8FAFC] outline-none focus:border-[#1877F2] text-[15px] pl-11 pr-10"
          placeholder="Search city, street or region..."
          value={query}
          onChange={handleChange}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 180)}
        />
        <i className="fas fa-map-marker-alt absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
        {loading && <i className="fas fa-spinner fa-spin absolute right-4 top-1/2 -translate-y-1/2 text-[#1877F2]"></i>}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[#0B1120] border border-[#1E293B] rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map((res, i) => (
            <div
              key={i}
              className="p-3 hover:bg-[#1E293B] cursor-pointer text-[#F8FAFC] text-sm border-b border-[#1E293B] last:border-0 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const locationName = String(res?.display_name || '').trim();
                onSelect(locationName);
                setQuery(locationName);
                setShowResults(false);

                const detectedCountryCode = detectCountryFromText(locationName);
                if (detectedCountryCode && onCountryDetected) onCountryDetected(detectedCountryCode);
                else if (userFallbackCountry && userFallbackCountry !== 'all' && onCountryDetected) {
                  onCountryDetected(userFallbackCountry);
                }
              }}
            >
              <i className="fas fa-location-dot mr-2 text-[#94A3B8]"></i>
              {res.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== PRODUCT DETAIL MODAL ====================

interface ProductDetailModalProps {
  product: Product;
  currentUser: User | null;
  users?: User[];
  onClose: () => void;
  onMessage: (sellerId: number, product?: Product) => void;
  onProfileClick?: (userId: number) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product: initialProduct,
  currentUser,
  users,
  onClose,
  onMessage,
  onProfileClick,
}) => {
  const [product, setProduct] = useState<Product>(initialProduct);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mainSrc, setMainSrc] = useState('');

  const sellerUser = useMemo(() => {
    const sid = Number((product as any).seller_id);
    if (!sid) return null;
    return users?.find((u) => Number(u.id) === sid) || null;
  }, [product, users]);

  const sellerIsVerified = Boolean(
    (product as any).seller_is_verified ||
    (product as any).is_verified ||
    sellerUser?.is_verified ||
    (currentUser && Number(currentUser.id) === Number((product as any).seller_id) && currentUser.is_verified)
  );

  const sellerName =
    sellerUser?.name ||
    (product as any).seller_name ||
    sellerUser?.username ||
    (product as any).seller_username ||
    'User';
  const sellerAvatar =
    sellerUser?.profile_image_url ||
    (product as any).seller_avatar ||
    '';

  useEffect(() => {
    setProduct(initialProduct);
  }, [initialProduct]);

  useEffect(() => {
    const handleProductUpdated = (e: any) => {
      if (e.detail && (e.detail.id === product.id || e.detail.product_id === product.id)) {
        setProduct((prev) => ({ ...prev, ...e.detail }));
      }
    };
    const handleProductDeleted = (e: any) => {
      if (e.detail && (e.detail.id === product.id || e.detail.product_id === product.id)) {
        onClose();
      }
    };
    window.addEventListener('product-updated', handleProductUpdated);
    window.addEventListener('product-deleted', handleProductDeleted);
    return () => {
      window.removeEventListener('product-updated', handleProductUpdated);
      window.removeEventListener('product-deleted', handleProductDeleted);
    };
  }, [product.id, onClose]);

  const productImages = useMemo(() => {
    const productVariants = safeImageVariants((product as any).image_variants);
    const legacyImages = safeImages((product as any).images);

    if (productVariants.length > 0) {
      return productVariants.map((x) => ({
        thumb: x.thumb,
        feed: x.feed,
        full: x.full || x.feed,
      }));
    }
    return legacyImages.map((url) => ({
      thumb: url,
      feed: url,
      full: url,
    }));
  }, [product]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.id]);

  useEffect(() => {
    const current = productImages[activeImageIndex];
    const nextSrc = current?.feed || current?.full || current?.thumb || '';
    setMainSrc(nextSrc || '');
  }, [activeImageIndex, productImages]);

  useEffect(() => {
    if (!productImages.length) return;
    productImages.forEach((img) => {
      void warmMarketplaceImage(img.feed || img.full || img.thumb);
      void warmMarketplaceImage(img.thumb || img.feed || img.full);
    });
  }, [productImages]);

  const goPrev = useCallback(() => {
    setActiveImageIndex((prev) => (prev === 0 ? productImages.length - 1 : prev - 1));
  }, [productImages.length]);

  const goNext = useCallback(() => {
    setActiveImageIndex((prev) => (prev === productImages.length - 1 ? 0 : prev + 1));
  }, [productImages.length]);

  const productCountryCode =
    getProductCountryCode(product as any) ||
    detectCountryFromText((product as any)?.address || '') ||
    'US';

  const countryData = getCountryMetaByCode(productCountryCode);
  const hasDiscount = !!(product as any).discount_price;
  const displayPrice = hasDiscount ? (product as any).discount_price : (product as any).main_price;
  const isSponsored = Boolean(
    (product as any)?.is_sponsored ||
    (product as any)?.sponsored ||
    (product as any)?.is_ad ||
    (product as any)?.ad_id ||
    (product as any)?.meta?.is_sponsored
  );

  return (
    <div className="fixed inset-0 z-[150] bg-[#050B18] flex flex-col font-sans">
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#1E293B] bg-[#0B1120]">
        <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center">
          <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
        </button>
        <div className="text-[#F8FAFC] font-bold text-lg truncate px-3">MarketPoint</div>
        <div className="flex items-center gap-2">
          <PostMenu
            item={{
              ...product,
              id: (product as any).id,
              product_id: (product as any).id,
              user_id: (product as any).seller_id,
              seller_id: (product as any).seller_id,
              type: 'product',
              title: (product as any).title,
              description: (product as any).description,
              main_price: (product as any).main_price,
              discount_price: (product as any).discount_price,
              category: (product as any).category,
              address: (product as any).address,
              country: (product as any).country,
              images: (product as any).images,
              image_variants: (product as any).image_variants,
            }}
            currentUser={currentUser}
            onDeleteSuccess={() => {
              onClose();
            }}
            onEditSuccess={(updatedItem) => {
              setProduct((prev) => ({ ...prev, ...updatedItem }));
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#050B18]">
        <div className="relative bg-[#0B1120]">
          <div className="w-full aspect-square flex items-center justify-center overflow-hidden">
            {productImages.length > 0 ? (
               <img
                src={mainSrc || productImages[activeImageIndex]?.thumb || ''}
                alt={(product as any).title}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <i className="fas fa-image text-5xl text-[#1E293B]"></i>
              </div>
            )}
          </div>

          {isSponsored && (
            <div className="absolute top-3 left-3 bg-[#F97316] text-white text-[11px] font-bold px-2.5 py-0.5 rounded shadow-md z-10 flex items-center gap-1">
              <span>Ad</span>
            </div>
          )}

          {productImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 rounded-full text-white flex items-center justify-center"
                onClick={goPrev}
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 rounded-full text-white flex items-center justify-center"
                onClick={goNext}
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </>
          )}
        </div>

        {productImages.length > 1 && (
          <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide bg-[#0B1120] border-b border-[#1E293B]">
            {productImages.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveImageIndex(idx)}
                className={`h-14 w-14 rounded-xl overflow-hidden border-2 flex-shrink-0 ${
                  activeImageIndex === idx ? 'border-[#1877F2]' : 'border-transparent'
                }`}
              >
                <img
                  src={img.thumb || img.feed || img.full}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-4 bg-[#0B1120]">
          {isSponsored && (
            <div className="mb-2">
              <span className="bg-[#F97316]/20 border border-[#F97316]/40 text-[#FB923C] text-[12px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <span>Ad</span>
                <span className="text-xs opacity-75">· Sponsored</span>
              </span>
            </div>
          )}

          <h2 className="text-[#F8FAFC] font-bold text-2xl mb-2 leading-snug">
            {(product as any).title}
          </h2>

          <div className="text-[#F8FAFC] font-bold text-[28px] leading-tight">
            {formatPriceWithCurrency(displayPrice, productCountryCode)}
          </div>

          {hasDiscount && (
            <div className="text-[#94A3B8] text-base line-through mt-1">
              {formatPriceWithCurrency((product as any).main_price, productCountryCode)}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[#94A3B8] text-sm">
            <i className="fas fa-location-dot"></i>
            <span>{(product as any).address || countryData.name}</span>
          </div>
        </div>

        <div className="bg-[#0B1120] border-t border-[#1E293B] px-4 py-4">
          <div className="flex items-center gap-3">
            {sellerAvatar ? (
              <img
                src={sellerAvatar}
                alt={sellerName}
                onClick={() => {
                  const sid = Number((product as any).seller_id);
                  if (sid && onProfileClick) {
                    onClose();
                    onProfileClick(sid);
                  }
                }}
                className={`w-12 h-12 rounded-full object-cover bg-[#1E293B] shrink-0 ${onProfileClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
              />
            ) : (
              <div
                onClick={() => {
                  const sid = Number((product as any).seller_id);
                  if (sid && onProfileClick) {
                    onClose();
                    onProfileClick(sid);
                  }
                }}
                className={`w-12 h-12 rounded-full bg-[#1E293B] text-[#94A3B8] flex items-center justify-center font-bold text-lg shrink-0 ${onProfileClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
              >
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  style={{ fontSize: '21px' }}
                  onClick={() => {
                    const sid = Number((product as any).seller_id);
                    if (sid && onProfileClick) {
                      onClose();
                      onProfileClick(sid);
                    }
                  }}
                  className={`text-[#F8FAFC] font-bold text-[21px] leading-tight truncate max-w-[240px] sm:max-w-[320px] ${onProfileClick ? 'cursor-pointer hover:underline' : ''}`}
                >
                  {sellerName}
                </span>
                {sellerIsVerified && (
                  <VerifiedBadge size={21} className="shrink-0" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onMessage(Number((product as any).seller_id), product)}
                className="w-10 h-10 rounded-full bg-[#1877F2]/15 text-[#1877F2] hover:bg-[#1877F2]/25 active:scale-95 flex items-center justify-center transition-all cursor-pointer"
                title="Message seller"
                aria-label="Message seller"
              >
                <i className="fab fa-facebook-messenger text-[18px]"></i>
              </button>
              {(product as any).phone_number && (
                <a
                  href={`tel:${(product as any).phone_number}`}
                  className="w-10 h-10 rounded-full bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155] active:scale-95 flex items-center justify-center no-underline transition-all"
                  title="Call seller"
                  aria-label="Call seller"
                >
                  <i className="fas fa-phone-alt text-[15px]"></i>
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#0B1120] border-t border-[#1E293B] px-4 py-4">
          <div className="text-[#F8FAFC] font-semibold mb-2">Description</div>
          <div className="text-[#94A3B8] whitespace-pre-wrap leading-relaxed">
            {(product as any).description}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN PAGE ====================

interface MarketplacePageProps {
  currentUser: User | null;
  products: Product[];
  uploadState?: PostUploadState | null;
  onDismissUpload?: () => void;
  onUploadStateChange?: (state: PostUploadState | null | ((prev: PostUploadState | null) => PostUploadState | null)) => void;
  onNavigateHome: () => void;
  onCreateProduct: (productData: Partial<Product>) => void;
  onViewProduct: (product: Product) => void;
}

export const MarketplacePage: React.FC<MarketplacePageProps> = ({
  currentUser,
  products,
  uploadState,
  onDismissUpload,
  onUploadStateChange,
  onNavigateHome,
  onCreateProduct,
  onViewProduct,
}) => {
  const [localUploadState, setLocalUploadState] = useState<PostUploadState | null>(null);
  const activeUploadState = uploadState !== undefined ? uploadState : localUploadState;
  const dismissUpload = onDismissUpload || (() => setLocalUploadState(null));
  const setUploadProgressState = onUploadStateChange || setLocalUploadState;
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [marketMode, setMarketMode] = useState<MarketMode>('for_you');
  const [showSellModal, setShowSellModal] = useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [address, setAddress] = useState('');
  const [mainPriceRaw, setMainPriceRaw] = useState('');
  const [discountPriceRaw, setDiscountPriceRaw] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [phone, setPhone] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [userCountry, setUserCountry] = useState<string>('all');
  const [detectedCountry, setDetectedCountry] = useState<string>('all');
  const [manualCountry, setManualCountry] = useState<string>('all');
  const [currencyLabel, setCurrencyLabel] = useState<string>('$');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionSeedRef = useRef<number>(Date.now() + Math.floor(Math.random() * 100000));

  useEffect(() => {
    if (currentUser) {
      const detected = detectCountryFromUser(currentUser);
      setUserCountry(detected);
      const baseCountry = detected && detected !== 'all' ? detected : 'US';
      setCurrencyLabel(getCurrencyLabelForCountry(baseCountry));

      if ((currentUser as any).phone) {
        setPhone((currentUser as any).phone);
      }
    } else {
      setUserCountry('all');
      setCurrencyLabel('$');
    }
  }, [currentUser]);

  // ✅ Listen for native image uploads
  useEffect(() => {
    const handleNativeUpload = (event: any) => {
      const media = event.detail;
      if (!media || media.type !== 'image') return;
      
      const imageUrl = media.full || media.feed || media.url;
      if (!imageUrl) return;
      
      console.log('📱 Marketplace: Native image uploaded:', imageUrl);
      
      // Store native image info directly (no re-fetching needed)
      setImages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          data: imageUrl, // URL directly for preview
          file: null, // No file for native uploads
          isNative: true,
          nativeUrl: imageUrl,
          nativeMeta: {
            thumb: media.thumb || imageUrl,
            feed: media.feed || imageUrl,
            full: media.full || imageUrl,
          }
        },
      ]);
    };

    window.addEventListener('uneraNativeUpload', handleNativeUpload);
    return () => {
      window.removeEventListener('uneraNativeUpload', handleNativeUpload);
    };
  }, []);

  const effectiveListingCountry = useMemo(() => {
    return resolveListingCountry({
      manualCountry,
      selectedAddress: address,
      typedAddress: address,
      currentUser,
    });
  }, [manualCountry, address, currentUser]);

  useEffect(() => {
    const countryCode =
      manualCountry !== 'all'
        ? manualCountry
        : detectedCountry !== 'all'
        ? detectedCountry
        : userCountry !== 'all'
        ? userCountry
        : 'US';

    setCurrencyLabel(getCurrencyLabelForCountry(countryCode));
  }, [manualCountry, detectedCountry, userCountry]);

  const handleSellClick = () => {
    if (!currentUser) {
      alert('Please log in to sell products.');
      return;
    }
    setShowSellModal(true);
  };

  // ✅ handleFileChange - works in app and web
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (images.length + e.target.files.length > 10) {
        alert('Maximum 10 images allowed for a professional listing');
        return;
      }

      Array.from(e.target.files).forEach((file: File) => {
        const previewUrl = URL.createObjectURL(file);
        setImages((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            data: previewUrl,
            file,
            isNative: false,
          },
        ]);
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (id: number) => {
    setImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id);
      if (imageToRemove && !imageToRemove.isNative && imageToRemove.data.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.data);
      }
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedMainPrice = parseStoredPrice(mainPriceRaw, effectiveListingCountry);
    const parsedDiscountPrice = discountPriceRaw
      ? parseStoredPrice(discountPriceRaw, effectiveListingCountry)
      : 0;

    if (!title || !category || !desc || !address || !parsedMainPrice || !phone || images.length === 0) {
      alert('Please fill all required fields and upload at least one image.');
      return;
    }

    // Capture all values into closure for background task
    const pTitle = title.trim();
    const pCategory = category;
    const pDesc = desc.trim();
    const pAddress = address.trim();
    const pMainPrice = parsedMainPrice;
    const pDiscountPrice = parsedDiscountPrice;
    const pQty = parseInt(quantity || '1', 10) || 1;
    const pPhone = phone.trim();
    const imgsToUpload = [...images];
    const previewUrl = imgsToUpload[0]?.data || '';
    const countryFromResolved = resolveListingCountry({
      manualCountry,
      selectedAddress: address,
      typedAddress: address,
      currentUser,
    });

    // Immediately close modal & reset form fields so user can continue exploring!
    setShowSellModal(false);
    setTitle('');
    setCategory('');
    setDesc('');
    setAddress('');
    setMainPriceRaw('');
    setDiscountPriceRaw('');
    setQuantity('1');
    setImages([]);
    setDetectedCountry('all');
    setManualCountry('all');

    // Start upload progress banner with percentage
    setUploadProgressState({
      isUploading: true,
      progress: 15,
      title: `Listing "${pTitle}" on MarketPoint…`,
      secondaryStatus: imgsToUpload.length > 1
        ? `Preparing ${imgsToUpload.length} photos...`
        : 'Preparing listing details...',
      previewUrl,
      isSuccess: false,
    });

    try {
      const uploadedVariants: ProductImageVariant[] = [];
      const totalImages = imgsToUpload.length;

      for (let i = 0; i < totalImages; i++) {
        const img = imgsToUpload[i];
        const stepProgress = 20 + Math.round(((i + 1) / (totalImages + 1)) * 60);

        setUploadProgressState((prev) => prev ? ({
          ...prev,
          progress: stepProgress,
          secondaryStatus: `Optimizing photo ${i + 1} of ${totalImages} (high-efficiency compression)...`,
        }) : null);

        if (img.isNative && img.nativeMeta) {
          uploadedVariants.push({
            thumb: img.nativeMeta.thumb,
            feed: img.nativeMeta.feed,
            full: img.nativeMeta.full,
            type: 'image',
          });
        } else if (img.file) {
          const variant = await uploadMarketplaceImageBundle(img.file);
          uploadedVariants.push(variant);
        }
      }

      setUploadProgressState((prev) => prev ? ({
        ...prev,
        progress: 88,
        secondaryStatus: 'Publishing listing to MarketPoint catalog...',
      }) : null);

      const uploadedUrls = uploadedVariants.map((x) => x.feed).filter(Boolean);

      const newProduct: Partial<Product> = {
        title: pTitle,
        category: pCategory,
        description: pDesc,
        country: countryFromResolved,
        address: pAddress,
        main_price: pMainPrice,
        discount_price: pDiscountPrice > 0 ? pDiscountPrice : null,
        quantity: pQty,
        phone_number: pPhone,
        images: uploadedUrls,
        image_variants: uploadedVariants,
        status: 'active',
        views: 0,
        ratings: [],
        comments: [],
        created_at: new Date().toISOString(),
      };

      await onCreateProduct(newProduct);

      // Cleanup blob URLs
      imgsToUpload.forEach((img) => {
        if (!img.isNative && img.data.startsWith('blob:')) {
          URL.revokeObjectURL(img.data);
        }
      });

      setUploadProgressState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: true,
        progress: 100,
        title: 'Item listed successfully!',
        secondaryStatus: 'Your product is now live on MarketPoint.',
      }) : null);

      setTimeout(() => {
        setUploadProgressState(null);
      }, 2800);
    } catch (error: any) {
      console.error('Failed to upload product:', error);
      setUploadProgressState((prev) => prev ? ({
        ...prev,
        isUploading: false,
        isSuccess: false,
        progress: 0,
        title: 'Failed to list item',
        secondaryStatus: error?.message || 'Something went wrong while listing your item',
        error: error?.message,
      }) : null);

      setTimeout(() => {
        setUploadProgressState(null);
      }, 4000);
    }
  };

  // Filtered products based on country + category
  const filteredProducts = useMemo(() => {
    const base = safeArray<any>(products).filter((p: any) => {
      const pCountry = getProductCountryCode(p);
      const sel = normCountry(selectedCountry);

      if (selectedCountry !== 'all' && pCountry !== sel) return false;
      if (selectedCategory !== 'all' && String(p.category) !== String(selectedCategory)) return false;
      return true;
    });

    return rankMarketplaceProducts(
      base,
      currentUser,
      selectedCountry,
      marketMode,
      sessionSeedRef.current
    );
  }, [products, selectedCountry, selectedCategory, currentUser, marketMode]);

  // Search filter
  const searchFilteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredProducts;
    return filteredProducts.filter((product: any) => {
      return (
        String(product?.title || '').toLowerCase().includes(q) ||
        String(product?.description || '').toLowerCase().includes(q) ||
        String(product?.address || '').toLowerCase().includes(q)
      );
    });
  }, [filteredProducts, searchQuery]);

  useEffect(() => {
    const items = filteredProducts.slice(0, 24);
    items.forEach((product: any) => {
      const variants = safeImageVariants(product?.image_variants);
      const legacy = safeImages(product?.images);
      const cover = variants[0]?.feed || variants[0]?.thumb || legacy[0] || '';
      if (cover) void warmMarketplaceImage(cover);
      variants.forEach((v) => {
        void warmMarketplaceImage(v.thumb);
        void warmMarketplaceImage(v.feed);
        void warmMarketplaceImage(v.full);
      });
    });
  }, [filteredProducts]);

  const activeCountry =
    (MARKETPLACE_COUNTRIES as any[]).find((c) => c.code === selectedCountry) || MARKETPLACE_COUNTRIES[0];

  return (
    <div className="min-h-screen bg-[#050B18] font-sans pb-20 overflow-x-hidden">
      {/* Top header */}
      <div className="sticky top-0 z-40 bg-[#0B1120] border-b border-[#1E293B]">
        <div className="h-14 px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onNavigateHome}
              className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center flex-shrink-0"
            >
              <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
            </button>
            <h1 className="text-[20px] font-bold text-[#F8FAFC] truncate">MarketPoint</h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search button - opens overlay */}
            <button
              className="w-10 h-10 rounded-full bg-[#1E293B] text-[#F8FAFC] flex items-center justify-center hover:bg-[#334155] transition-colors"
              aria-label="Search"
              onClick={() => setShowSearchOverlay(true)}
            >
              <i className="fas fa-search text-lg"></i>
            </button>

            <button
              onClick={() => {
                const countryList = ['all', ...(MARKETPLACE_COUNTRIES as any[])
                  .filter((c) => c.id !== 'all')
                  .map((c) => c.code)];
                const currentIndex = countryList.indexOf(selectedCountry);
                const nextIndex = (currentIndex + 1) % countryList.length;
                setSelectedCountry(countryList[nextIndex]);
              }}
              className="h-10 min-w-[44px] px-3 rounded-full bg-[#1E293B] text-[#F8FAFC] flex items-center justify-center hover:bg-[#334155] transition-colors"
              aria-label="Country filter"
            >
              <span className="text-lg">{(activeCountry as any).flag || '🌍'}</span>
            </button>

            <button
              onClick={handleSellClick}
              className="h-10 px-4 rounded-full bg-[#1877F2] text-white font-semibold text-sm hover:bg-[#166FE5] transition-colors"
            >
              Sell
            </button>
          </div>
        </div>

        {/* Mode switch */}
        <div className="px-3 pb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {[
              { id: 'for_you', label: 'For You' },
              { id: 'local', label: 'Local' },
              { id: 'worldwide', label: 'Worldwide' },
            ].map((item) => {
              const active = marketMode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setMarketMode(item.id as MarketMode)}
                  className={`px-4 h-9 rounded-full whitespace-nowrap text-sm font-semibold transition-colors ${
                    active ? 'bg-[#E7F3FF] text-[#1877F2]' : 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky categories row */}
      <div className="sticky top-[104px] z-30 bg-[#0B1120] border-b border-[#1E293B]">
        <div className="px-3 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {(MARKETPLACE_CATEGORIES as any[]).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 h-9 rounded-full whitespace-nowrap text-sm font-semibold transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upload progress banner */}
      {activeUploadState && (
        <div className="px-3 pt-3">
          <PostUploadProgressBanner
            uploadState={activeUploadState}
            onDismiss={dismissUpload}
          />
        </div>
      )}

      {/* Grid */}
      <div className="px-[2px] pt-[2px]">
        {searchFilteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-[2px]">
            {searchFilteredProducts.map((product: any) => {
              const productVariants = safeImageVariants(product.image_variants);
              const legacyImages = safeImages(product.images);
              const cover =
                productVariants[0]?.feed ||
                productVariants[0]?.thumb ||
                legacyImages[0] ||
                'https://via.placeholder.com/600x600?text=No+Image';

              const productCountryCode = getProductCountryCode(product) || 'US';
              const displayPrice = product.discount_price || product.main_price;
              const isSponsored = Boolean(
                product.is_sponsored ||
                product.sponsored ||
                product.is_ad ||
                product.ad_id ||
                product.meta?.is_sponsored ||
                product.meta?.sponsored_meta
              );

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onViewProduct(product)}
                  className="relative aspect-[0.86] bg-[#0F172A] overflow-hidden text-left"
                >
                  <OptimizedMarketplaceImage
                    thumbUrl={productVariants[0]?.thumb}
                    feedUrl={productVariants[0]?.feed || productVariants[0]?.full || legacyImages[0] || cover}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />

                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 via-black/20 to-transparent z-10">
                    <div className="text-white font-bold text-[15px] leading-tight drop-shadow">
                      {formatPriceWithCurrency(displayPrice, productCountryCode)}
                    </div>
                  </div>

                  {isSponsored && (
                    <div className="absolute top-2 left-2 bg-[#F97316] text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-md z-10 flex items-center gap-1">
                      <span>Ad</span>
                    </div>
                  )}

                  {isFreshProduct(product) && !isSponsored && (
                    <div className="absolute top-2 right-2 bg-[#1877F2] text-white text-[10px] font-bold px-2 py-1 rounded-full z-10">
                      New
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="w-20 h-20 bg-[#0F172A] border border-[#1E293B] rounded-full flex items-center justify-center mb-5">
              <i className="fas fa-store-slash text-3xl text-[#94A3B8]"></i>
            </div>
            <h3 className="text-[#F8FAFC] font-bold text-xl mb-2">No items found</h3>
            <p className="text-[#94A3B8] max-w-xs mb-6">
              Try changing your category, market view, or search.
            </p>
            <button
              onClick={() => {
                setSelectedCountry('all');
                setSelectedCategory('all');
                setMarketMode('for_you');
                setSearchQuery('');
              }}
              className="px-6 py-3 bg-[#1877F2] text-white rounded-xl font-semibold hover:bg-[#166FE5] transition-colors"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Search Overlay */}
      {showSearchOverlay && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0B1120] border-b border-[#1E293B] px-3 pt-3 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSearchOverlay(false)}
                className="w-10 h-10 rounded-full bg-[#1E293B] text-[#F8FAFC] flex items-center justify-center hover:bg-[#334155] transition-colors"
              >
                <i className="fas fa-arrow-left"></i>
              </button>
              <div className="relative flex-1">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search MarketPoint..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#1E293B] rounded-full py-3 pl-11 pr-11 text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC]"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 text-xs text-[#94A3B8] px-2">
              {searchQuery.trim()
                ? `${searchFilteredProducts.length} result${searchFilteredProducts.length === 1 ? '' : 's'}`
                : 'Type to search products'}
            </div>
          </div>
          <button
            type="button"
            className="absolute inset-0 -z-10 cursor-default"
            onClick={() => setShowSearchOverlay(false)}
            aria-label="Close search overlay"
          />
        </div>
      )}

      {/* Create listing panel */}
      {showSellModal && (
        <div className="fixed inset-0 z-[120] bg-[#050B18] flex flex-col">
          <div className="h-14 px-3 flex items-center justify-between border-b border-[#1E293B] bg-[#0B1120]">
            <button
              onClick={() => setShowSellModal(false)}
              className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center"
            >
              <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
            </button>
            <div className="text-[#F8FAFC] font-bold text-[20px]">New listing</div>
            <button
              onClick={handleSubmit as any}
              disabled={isUploading}
              className={`text-[17px] font-semibold ${isUploading ? 'text-[#64748B]' : 'text-[#1877F2]'}`}
            >
              Publish
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto bg-[#050B18]">
            <div className="px-4 py-4 space-y-6">
              {/* Photos */}
              <section>
                <div className="text-[#E4E6EB] font-semibold text-[17px] mb-3">Photos</div>
                <div
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="bg-[#0F172A] rounded-2xl border border-[#1E293B] p-5 text-center cursor-pointer hover:bg-[#1E293B] transition-colors"
                >
                  <i className="fas fa-images text-3xl text-[#94A3B8] mb-3"></i>
                  <div className="text-[#F8FAFC] font-medium">
                    Add photos
                  </div>
                  <div className="text-[#94A3B8] text-xs mt-1">Up to 10 images</div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                />

                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {images.map((img) => (
                      <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden">
                        <img src={img.data} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Category */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Category</label>
                <select
                  className="w-full h-12 px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  <option value="">Select</option>
                  {(MARKETPLACE_CATEGORIES as any[]).filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </section>

              {/* Title */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">What are you selling?</label>
                <input
                  type="text"
                  className="w-full h-12 px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </section>

              {/* Price */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Price</label>
                <div className="flex rounded-xl overflow-hidden border border-[#1E293B] bg-[#0F172A]">
                  <div className="min-w-[72px] px-4 flex items-center justify-center text-[#F8FAFC] font-semibold border-r border-[#1E293B]">
                    {currencyLabel}
                  </div>
                  <input
                    type="text"
                    inputMode={getCurrencyDecimals(effectiveListingCountry) === 0 ? 'numeric' : 'decimal'}
                    className="flex-1 h-12 px-4 bg-transparent text-[#F8FAFC] outline-none"
                    value={formatPriceInputForDisplay(mainPriceRaw, effectiveListingCountry)}
                    onChange={(e) => setMainPriceRaw(sanitizePriceInput(e.target.value, effectiveListingCountry))}
                    required
                  />
                </div>
              </section>

              {/* Discount */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Discount price</label>
                <div className="flex rounded-xl overflow-hidden border border-[#1E293B] bg-[#0F172A]">
                  <div className="min-w-[72px] px-4 flex items-center justify-center text-[#F8FAFC] font-semibold border-r border-[#1E293B]">
                    {currencyLabel}
                  </div>
                  <input
                    type="text"
                    inputMode={getCurrencyDecimals(effectiveListingCountry) === 0 ? 'numeric' : 'decimal'}
                    className="flex-1 h-12 px-4 bg-transparent text-[#F8FAFC] outline-none"
                    value={formatPriceInputForDisplay(discountPriceRaw, effectiveListingCountry)}
                    onChange={(e) => setDiscountPriceRaw(sanitizePriceInput(e.target.value, effectiveListingCountry))}
                  />
                </div>
              </section>

              {/* Location */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Location</label>
                <LocationSearch
                  value={address}
                  onChangeText={setAddress}
                  onSelect={setAddress}
                  userFallbackCountry={userCountry}
                  onCountryDetected={(countryCode) => setDetectedCountry(countryCode || 'all')}
                />
              </section>

              {/* Manual country */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Country</label>
                <select
                  className="w-full h-12 px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                  value={manualCountry}
                  onChange={(e) => setManualCountry(e.target.value)}
                >
                  <option value="all">Auto detect</option>
                  {(MARKETPLACE_COUNTRIES as any[])
                    .filter((c) => c.id !== 'all')
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </section>

              {/* Description */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Description</label>
                <textarea
                  className="w-full min-h-[140px] px-4 py-3 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none resize-none focus:border-[#1877F2]"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  required
                />
              </section>

              {/* Availability */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Availability</label>
                <select
                  className="w-full h-12 px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                >
                  <option value="1">List as In Stock</option>
                  <option value="0">Out of Stock</option>
                </select>
              </section>

              {/* Phone */}
              <section>
                <label className="block text-[#94A3B8] text-[15px] mb-2">Phone</label>
                <input
                  type="tel"
                  className="w-full h-12 px-4 rounded-xl bg-[#0F172A] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </section>

              <div className="pt-2 pb-6">
                <button
                  type="submit"
                  disabled={isUploading}
                  className={`w-full h-12 rounded-xl font-bold text-white ${
                    isUploading ? 'bg-[#1E293B] text-[#94A3B8]' : 'bg-[#1877F2] hover:bg-[#166FE5]'
                  } transition-colors`}
                >
                  {isUploading ? 'Uploading...' : 'Publish'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
