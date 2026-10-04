import { Capacitor } from '@capacitor/core';

/**
 * Detect if running inside a native mobile wrapper (Android APK / Capacitor).
 */
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  if (Capacitor.isNativePlatform()) return true;
  if ((window as any).UNERA_IS_NATIVE_APP || (window as any).UneraNative) return true;

  // Capacitor WebView on Android typically runs at https://localhost or capacitor://localhost (no port :3000)
  const isCapacitorLocalhost =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port !== '3000';
  const isCapacitorScheme = window.location.protocol === 'capacitor:';

  return isCapacitorLocalhost || isCapacitorScheme;
};

/**
 * Primary production backend for the application.
 * Connects directly to the active live database on https://featheredsocial.site.
 */
export const LIVE_BACKEND_URL = 'https://featheredsocial.site';

/**
 * Resolves the active base URL for API requests.
 * In Android APK / Native runtime, automatically connects to the current production database at https://featheredsocial.site.
 * On web, defaults to same-origin relative requests so it always uses the current database.
 */
export const getApiBaseUrl = (): string => {
  // 1. Explicit build/env variable override
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '');
  if (envUrl) {
    return envUrl;
  }

  // 2. Client-side stored backend preference if available
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved =
        localStorage.getItem('feathered_api_base') ||
        localStorage.getItem('unera_api_base');
      if (
        saved &&
        saved.startsWith('http') &&
        !saved.includes('unera.social') &&
        !saved.includes('feathered.social')
      ) {
        return saved.replace(/\/$/, '');
      }
    } catch {
      // ignore localStorage errors
    }
  }

  // 3. Android APK / Native runtime:
  if (isNativeApp()) {
    // If the webview is pointing to a live remote origin, use that same origin so it matches web exactly
    if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1' &&
      !window.location.protocol.startsWith('capacitor')
    ) {
      return window.location.origin;
    }
    return LIVE_BACKEND_URL;
  }

  // 4. Default web runtime uses same-origin relative endpoints
  return '';
};

/**
 * Resolves any URL or endpoint to its absolute target if needed.
 */
export const resolveApiUrl = (url: string): string => {
  if (!url) return url;
  
  const base = getApiBaseUrl();
  if (!base) return url;

  // Relative API routes
  if (url.startsWith('/api/') || url.startsWith('/api?') || url === '/api' || url.startsWith('/uploads/')) {
    return `${base}${url}`;
  }

  // Localhost accidentally prepended by webview
  if (
    url.startsWith('https://localhost/api/') ||
    url.startsWith('http://localhost/api/') ||
    url.startsWith('capacitor://localhost/api/')
  ) {
    return url.replace(/^(https?|capacitor):\/\/localhost/, base);
  }

  return url;
};

/**
 * Robust API fetch wrapper supporting both web and native capacitor runtimes.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<any> => {
  const targetUrl = resolveApiUrl(url);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('unera_token') : null;

  let currentUserId: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const uStr = localStorage.getItem('social_platform_current_user') || localStorage.getItem('unera_user');
      if (uStr) {
        const parsed = JSON.parse(uStr);
        if (parsed?.id) currentUserId = String(parsed.id);
      }
    } catch (_) {}
  }

  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(currentUserId ? { 'x-user-id': currentUserId } : {}),
    ...(options.headers || {}),
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData) {
    headers['Content-Type'] = (headers['Content-Type'] as string) || 'application/json';
  }

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

/**
 * Share a post to feed or profile. Calls POST /api/posts/:id/share with x-user-id header.
 */
export async function sharePost(
  postId: number,
  userId: number,
  options: {
    destination?: string;
    message?: string;
    content?: string;
    feeling?: string;
    location?: string;
    audience?: string;
    shared_post?: any;
    post?: any;
  } = {}
) {
  const targetUrl = resolveApiUrl(`/api/posts/${postId}/share`);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('unera_token') : null;
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-user-id": String(userId),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      user_id: userId,
      destination: options.destination || "feed",
      message: options.message || options.content || "",
      feeling: options.feeling,
      location: options.location,
      audience: options.audience,
      post: options.post,
      shared_post: options.shared_post,
    }),
  });

  return res.json();
}

/**
 * Share a product to feed, story, message, copy_link, group, or external. Calls POST /api/products/:id/share.
 */
export async function shareProduct(
  productId: number,
  userId: number,
  destination: "feed" | "story" | "message" | "copy_link" | "group" | "external" = "feed",
  message?: string
) {
  const targetUrl = resolveApiUrl(`/api/products/${productId}/share`);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('unera_token') : null;
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-user-id": String(userId),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      user_id: userId,
      destination,
      ...(message ? { message } : {}),
    }),
  });

  return res.json();
}

/**
 * Share a song to feed, story, message, copy_link, group, or external. Calls POST /api/songs/:id/share.
 */
export async function shareSong(
  songId: number,
  userId: number,
  destination: "feed" | "story" | "message" | "copy_link" | "group" | "external" = "feed",
  message?: string
) {
  const res = await fetch(`/api/songs/${songId}/share`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(userId),
    },
    body: JSON.stringify({
      user_id: userId,
      destination,
      ...(message ? { message } : {}),
    }),
  });
  return res.json();
}

