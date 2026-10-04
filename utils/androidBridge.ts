import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Network } from '@capacitor/network';
import { Browser } from '@capacitor/browser';
import { getApiBaseUrl, resolveApiUrl, isNativeApp } from './api';

export { getApiBaseUrl, resolveApiUrl, isNativeApp };

/**
 * Intercepts browser network requests in native Android WebView
 * so relative '/api/...' calls reach the live backend (https://feathered.social)
 * instead of failing against 'https://localhost'.
 */
function setupNativeNetworkInterceptor(): void {
  if (typeof window === 'undefined') return;

  const base = getApiBaseUrl();
  if (!base) return;

  console.log('🌐 Feathered Native: API base configured to', base);

  // 1. Monkey-patch window.fetch
  if (typeof window.fetch === 'function' && !(window as any).__uneraFetchPatched) {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      try {
        let urlStr = '';
        if (typeof input === 'string') {
          urlStr = input;
        } else if (input instanceof URL) {
          urlStr = input.toString();
        } else if (typeof Request !== 'undefined' && input instanceof Request) {
          urlStr = input.url;
        } else {
          urlStr = String(input);
        }

        const resolvedUrl = resolveApiUrl(urlStr);

        if (typeof input === 'string' || input instanceof URL) {
          return await originalFetch(resolvedUrl, init);
        }

        if (typeof Request !== 'undefined' && input instanceof Request) {
          const reqInit: RequestInit = {
            method: input.method,
            headers: input.headers,
            body: init?.body !== undefined ? init.body : (input.method !== 'GET' && input.method !== 'HEAD' ? (input as any).body : undefined),
            mode: 'cors',
            credentials: input.credentials || 'same-origin',
            cache: input.cache,
            redirect: input.redirect,
            referrer: input.referrer,
            integrity: input.integrity,
            signal: init?.signal || input.signal,
          };
          const newRequest = new Request(resolvedUrl, reqInit);
          return await originalFetch(newRequest, init);
        }

        return await originalFetch(resolvedUrl, init);
      } catch (err) {
        console.warn('Network request failed in native interceptor:', err);
        throw err;
      }
    };

    (window as any).__uneraFetchPatched = true;
  }

  // 2. Monkey-patch XMLHttpRequest
  if (typeof XMLHttpRequest !== 'undefined' && !(window as any).__uneraXhrPatched) {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null
    ) {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const resolvedUrl = resolveApiUrl(urlStr);
      return originalOpen.call(this, method, resolvedUrl, async, username, password);
    };
    (window as any).__uneraXhrPatched = true;
  }
}

/**
 * Android and Native Bridge integration for UNERA.
 * Safely initializes device features when running inside the Android APK/AAB,
 * while being a completely safe no-op on desktop and mobile web browsers.
 */
export function initAndroidBridge(): void {
  // Flag native environment if detected
  const native = isNativeApp();

  if (typeof window !== 'undefined') {
    if (native) {
      (window as any).UNERA_IS_NATIVE_APP = true;
    }
  }

  // Always configure network interceptor if running in native app
  if (native) {
    setupNativeNetworkInterceptor();
  }

  // Ensure we are running inside native Capacitor environment
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  console.log('📱 Initializing UNERA Android Native Bridge');

  // 1. Configure Status Bar - Explicitly visible, Dark Navy theme, Light text/icons, Edge-to-edge overlay
  try {
    StatusBar.show().catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#050B18' }).catch(() => {});
  } catch (err) {
    console.debug('StatusBar configuration not available:', err);
  }

  // 2. Hide Splash Screen after UI is ready
  try {
    setTimeout(() => {
      SplashScreen.hide().catch(() => {});
    }, 800);
  } catch (err) {
    console.debug('SplashScreen hide error:', err);
  }

  // 3. Android Back Button Handling
  try {
    App.addListener('backButton', ({ canGoBack }) => {
      // 1. Check if React registered a global modal/back handler
      if (typeof (window as any).__uneraHandleBack === 'function') {
        try {
          const handled = (window as any).__uneraHandleBack();
          if (handled) return;
        } catch (err) {
          console.debug('Error in __uneraHandleBack:', err);
        }
      }

      // 2. Check if any open modal exists that can be closed
      const activeCloseButton = document.querySelector<HTMLElement>(
        '[data-modal-close], button[aria-label="Close"], button.modal-close, button[aria-label="Back"]'
      );
      if (activeCloseButton) {
        activeCloseButton.click();
        return;
      }

      // 3. Navigate back in web history if available
      if (canGoBack || (typeof window !== 'undefined' && window.history.length > 1)) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch (err) {
    console.debug('Back button listener setup failed:', err);
  }

  // 4. Network Offline / Online handling
  try {
    Network.addListener('networkStatusChange', (status) => {
      const existingOfflineNotice = document.getElementById('unera-offline-toast');
      if (!status.connected) {
        if (!existingOfflineNotice) {
          const toast = document.createElement('div');
          toast.id = 'unera-offline-toast';
          toast.className = 'fixed bottom-4 left-4 right-4 z-50 bg-[#0F172A] border border-red-500/50 text-[#F8FAFC] px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between transition-all';
          toast.innerHTML = `
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <span class="text-sm font-medium">No internet connection. Please check your network and try again.</span>
            </div>
            <button onclick="this.parentElement.remove()" class="text-xs text-gray-400 hover:text-white px-2 py-1">✕</button>
          `;
          document.body.appendChild(toast);
        }
      } else {
        if (existingOfflineNotice) {
          existingOfflineNotice.remove();
        }
      }
    });
  } catch (err) {
    console.debug('Network status listener error:', err);
  }

  // 5. External Link Handling
  try {
    document.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target || !target.href) return;

      const href = target.href;
      if (
        href.startsWith('http') &&
        !href.includes(window.location.host) &&
        !href.includes('featheredsocial.site') &&
        !href.includes('feathered.social') &&
        !href.includes('unera.social')
      ) {
        e.preventDefault();
        Browser.open({ url: href }).catch(() => {
          window.open(href, '_system');
        });
      }
    }, true);
  } catch (err) {
    console.debug('External link handler error:', err);
  }
}
