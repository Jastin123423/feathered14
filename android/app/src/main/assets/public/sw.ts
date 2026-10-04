// public/sw.ts - UPDATED VERSION
const CACHE_NAME = 'unera-feed-v1';
const MEDIA_CACHE = 'unera-media-v1';
const API_CACHE = 'unera-api-v1';

// Install - don't fail if offline.html missing
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Try to cache offline.html but don't fail if it doesn't exist
      return cache.addAll([
        '/manifest.json'
        // Remove offline.html from here or handle gracefully
      ]).catch(err => {
        console.log('Non-critical cache warmup failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== MEDIA_CACHE && key !== API_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  
  // 1. MEDIA FILES - Cache first, forever
  if (url.hostname === 'media.unera.social') {
    event.respondWith(handleMediaRequest(event.request));
    return;
  }
  
  // 2. API REQUESTS - Network first, then cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }
  
  // 3. STATIC ASSETS - Cache first
  if (url.pathname.match(/\.(js|css|woff2?|svg)$/)) {
    event.respondWith(handleStaticRequest(event.request));
    return;
  }
  
  // 4. NAVIGATION - Network first, fallback to simple offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }
});

// Media: Cache first, never network
async function handleMediaRequest(request: Request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch (error) {
    return new Response('Media unavailable offline', { status: 408 });
  }
}

// API: Network first, fallback to cache
async function handleApiRequest(request: Request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Static: Cache first
async function handleStaticRequest(request: Request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) return cached;
  
  const response = await fetch(request);
  if (response.ok) {
    event.waitUntil(cache.put(request, response.clone()));
  }
  return response;
}

// Navigation: Network first, fallback to inline HTML
async function handleNavigationRequest(request: Request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Return a simple offline page without requiring offline.html
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Offline - Unera</title>
        <style>
          body{background:#050B18;color:#F8FAFC;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}
          .icon{font-size:4rem;margin-bottom:1rem;color:#1877F2;}
          button{background:#1877F2;color:white;border:none;padding:0.8rem 2rem;border-radius:8px;font-size:1rem;font-weight:bold;cursor:pointer;margin-top:1rem;}
        </style>
      </head>
      <body>
        <div>
          <div class="icon">📡</div>
          <h1>You're offline</h1>
          <p>Your cached posts are still available</p>
          <button onclick="window.location.reload()">Try Again</button>
        </div>
      </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
