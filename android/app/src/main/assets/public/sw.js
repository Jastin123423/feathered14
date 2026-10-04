const SW_VERSION = 'unera-sw-v4';

const STATIC_CACHE = `static-${SW_VERSION}`;
const MEDIA_CACHE = `media-${SW_VERSION}`;
const API_CACHE = `api-${SW_VERSION}`;

const MAX_MEDIA_ITEMS = 1000;
const MAX_API_ITEMS = 50;

/* =========================
   OFFLINE PAGE
========================= */

const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
/>

<title>UNERA Offline</title>

<style>

html,
body{
    margin:0;
    padding:0;

    width:100%;
    height:100%;

    background:#050B18;
    color:#FFFFFF;

    font-family:
        Inter,
        Segoe UI,
        Arial,
        sans-serif;
}

body{
    display:flex;
    align-items:center;
    justify-content:center;

    text-align:center;

    overflow:hidden;
}

.container{
    width:100%;
    max-width:340px;

    padding:32px;
}

.logo{
    width:90px;
    height:90px;

    border-radius:24px;

    margin-bottom:22px;

    box-shadow:
        0 10px 40px rgba(24,119,242,0.35);
}

.title{
    font-size:30px;
    font-weight:800;

    margin-bottom:12px;

    letter-spacing:-0.5px;
}

.text{
    font-size:16px;
    line-height:1.6;

    opacity:0.8;
}

.button{
    margin-top:28px;

    width:100%;
    height:54px;

    border:none;
    border-radius:18px;

    background:#1877F2;

    color:#FFFFFF;

    font-size:17px;
    font-weight:700;

    cursor:pointer;

    transition:transform 0.15s ease;
}

.button:active{
    transform:scale(0.98);
}

.small{
    margin-top:18px;

    font-size:13px;
    opacity:0.5;
}

</style>
</head>

<body>

<div class="container">

    <img
        class="logo"
        src="https://media.unera.social/unera_icon_192x192.png"
    />

    <div class="title">
        You're Offline
    </div>

    <div class="text">
        UNERA cannot connect right now.
        Please check your internet connection
        and try again.
    </div>

    <button
        class="button"
        onclick="location.reload()"
    >
        Retry Connection
    </button>

    <div class="small">
        Cached content may still be available.
    </div>

</div>

</body>
</html>
`;

const OFFLINE_RESPONSE = new Response(
  OFFLINE_HTML,
  {
    headers: {
      'Content-Type': 'text/html',
    },
  }
);

/* =========================
   INSTALL
========================= */

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {

      const cache =
        await caches.open(STATIC_CACHE);

      await cache.addAll([
        '/',
      ]);

    })()
  );
});

/* =========================
   ACTIVATE
========================= */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {

      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {

          if (
            key !== STATIC_CACHE &&
            key !== MEDIA_CACHE &&
            key !== API_CACHE
          ) {
            return caches.delete(key);
          }

        })
      );

      await self.clients.claim();

    })()
  );
});

/* =========================
   HELPERS
========================= */

function isMediaRequest(request) {
  if (
    request.destination === 'image' ||
    request.destination === 'video' ||
    request.destination === 'audio'
  ) {
    return true;
  }

  const url = new URL(request.url);
  const pathname = url.pathname.toLowerCase();

  return (
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.webm') ||
    pathname.endsWith('.mov') ||
    pathname.endsWith('.mkv') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.avif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.mp3') ||
    pathname.endsWith('.wav') ||
    pathname.endsWith('.ogg') ||
    pathname.endsWith('.m4a')
  );
}

function isApiRequest(request) {

  const url = new URL(request.url);

  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/')
  );
}

async function trimCache(
  cacheName,
  maxItems
) {

  const cache =
    await caches.open(cacheName);

  const keys =
    await cache.keys();

  if (keys.length <= maxItems) {
    return;
  }

  const deleteCount =
    keys.length - maxItems;

  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i]);
  }
}

/* =========================
   MEDIA
========================= */

async function cacheFirstMedia(
  request
) {

  const cache =
    await caches.open(MEDIA_CACHE);

  const cached =
    await cache.match(request);

  if (cached) {
    return cached;
  }

  try {

    const response =
      await fetch(request);

    if (
      response &&
      response.ok
    ) {

      cache.put(
        request,
        response.clone()
      );

      trimCache(
        MEDIA_CACHE,
        MAX_MEDIA_ITEMS
      );
    }

    return response;

  } catch (e) {

    if (cached) {
      return cached;
    }

    throw e;
  }
}

async function staleWhileRevalidateMedia(
  request
) {

  const cache =
    await caches.open(MEDIA_CACHE);

  const cached =
    await cache.match(request);

  const networkPromise =
    fetch(request)

      .then((response) => {

        if (
          response &&
          response.ok
        ) {

          cache.put(
            request,
            response.clone()
          );

          trimCache(
            MEDIA_CACHE,
            MAX_MEDIA_ITEMS
          );
        }

        return response;
      })

      .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse =
    await networkPromise;

  if (networkResponse) {
    return networkResponse;
  }

  throw new Error(
    'Media fetch failed'
  );
}

/* =========================
   API
========================= */

async function networkFirstApi(
  request
) {

  const cache =
    await caches.open(API_CACHE);

  try {

    const response =
      await fetch(request);

    if (
      response &&
      response.ok &&
      request.method === 'GET'
    ) {

      cache.put(
        request,
        response.clone()
      );

      trimCache(
        API_CACHE,
        MAX_API_ITEMS
      );
    }

    return response;

  } catch (error) {

    const cached =
      await cache.match(request);

    if (cached) {
      return cached;
    }

    return new Response(
      JSON.stringify({
        offline: true,
        message:
          'No internet connection',
      }),
      {
        headers: {
          'Content-Type':
            'application/json',
        },
        status: 503,
      }
    );
  }
}

/* =========================
   APP SHELL
========================= */

async function networkFirstPage(
  request
) {

  const cache =
    await caches.open(STATIC_CACHE);

  try {

    const response =
      await fetch(request);

    if (
      response &&
      response.ok
    ) {

      cache.put(
        request,
        response.clone()
      );
    }

    return response;

  } catch (e) {

    const cached =
      await cache.match(request);

    if (cached) {
      return cached;
    }

    const root =
      await cache.match('/');

    if (root) {
      return root;
    }

    return OFFLINE_RESPONSE;
  }
}

/* =========================
   FETCH
========================= */

self.addEventListener(
  'fetch',
  (event) => {

    const { request } = event;

    if (request.method !== 'GET') {
      return;
    }

    /* =========================
       PAGE NAVIGATION
    ========================= */

    if (
      request.mode === 'navigate'
    ) {

      event.respondWith(
        networkFirstPage(request)
      );

      return;
    }

    /* =========================
       MEDIA
    ========================= */

    if (
      isMediaRequest(request)
    ) {

      const destination =
        request.destination;

      if (
        destination === 'video'
      ) {

        event.respondWith(
          cacheFirstMedia(request)
        );

        return;
      }

      if (
        destination === 'image' ||
        !destination ||
        destination === ''
      ) {

        event.respondWith(
          cacheFirstMedia(
            request
          )
        );

        return;
      }

      event.respondWith(
        cacheFirstMedia(
          request
        )
      );

      return;
    }

    /* =========================
       API
    ========================= */

    if (
      isApiRequest(request)
    ) {

      event.respondWith(
        networkFirstApi(request)
      );

      return;
    }

  }
);

/* =========================
   PUSH NOTIFICATIONS
========================= */

self.addEventListener(
  'push',
  (event) => {

    if (!event.data) return;

    let data = {};

    try {

      data =
        event.data.json();

    } catch (e) {

      data = {
        title: 'UNERA',
        body:
          event.data.text(),
      };
    }

    const title =
      data.title || 'UNERA';

    const options = {

      body:
        data.body ||
        'You have a new notification',

      icon:
        'https://media.unera.social/unera_icon_192x192.png',

      badge:
        'https://media.unera.social/unera_icon_192x192.png',

      image:
        data.image || undefined,

      vibrate: [
        200,
        100,
        200
      ],

      tag:
        data.tag ||
        'unera-notification',

      renotify: true,

      requireInteraction: false,

      data: {
        url:
          data.url || '/',
        ...data,
      },

      actions: [
        {
          action: 'open',
          title: 'Open',
        },
        {
          action: 'close',
          title: 'Dismiss',
        },
      ],
    };

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);

/* =========================
   NOTIFICATION CLICK
========================= */

self.addEventListener(
  'notificationclick',
  (event) => {

    event.notification.close();

    const targetUrl =
      event.notification
        .data?.url || '/';

    event.waitUntil(

      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })

        .then((clientList) => {

          for (const client of clientList) {

            if ('focus' in client) {

              client.navigate(
                targetUrl
              );

              return client.focus();
            }
          }

          if (
            clients.openWindow
          ) {

            return clients.openWindow(
              targetUrl
            );
          }
        })
    );
  }
);

/* =========================
   MESSAGE CHANNEL
========================= */

self.addEventListener(
  'message',
  (event) => {

    console.log(
      '[UNERA SW MESSAGE]',
      event.data
    );
  }
);
