

/* =========================================
   UNERA FIREBASE MESSAGING SERVICE WORKER
   File: /firebase-messaging-sw.js
========================================= */

importScripts(
  'https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js'
);

/* =========================================
   FIREBASE CONFIG
========================================= */

firebase.initializeApp({
  apiKey: 'AIzaSyChcgu2yOmsugrh2rjc9KhZWe6sD2yZqqI',
  authDomain: 'unera-50aae.firebaseapp.com',
  projectId: 'unera-50aae',
  storageBucket: 'unera-50aae.firebasestorage.app',
  messagingSenderId: '649631105841',
  appId: '1:649631105841:web:861869624fdfec132ca610'
});

/* =========================================
   FIREBASE MESSAGING
========================================= */

const messaging = firebase.messaging();

/* =========================================
   BACKGROUND PUSH HANDLER
========================================= */

messaging.onBackgroundMessage((payload) => {

  console.log(
    '[UNERA] Background push received:',
    payload
  );

  const notification =
    payload.notification || {};

  const data =
    payload.data || {};

  const title =
    notification.title ||
    data.title ||
    'UNERA';

  const body =
    notification.body ||
    data.body ||
    'You have a new notification';

  const icon =
    data.icon ||
    notification.icon ||
    'https://media.unera.social/unera_icon_192x192.png';

  const image =
    data.image ||
    notification.image ||
    '';

  const badge =
    data.badge ||
    'https://media.unera.social/unera_icon_192x192.png';

  const clickUrl =
    data.url ||
    data.link ||
    data.click_action ||
    '/';

  const notificationOptions = {

    body,

    icon,

    badge,

    image,

    vibrate: [200, 100, 200],

    requireInteraction: false,

    renotify: true,

    tag:
      data.tag ||
      'unera-notification',

    data: {
      ...data,
      url: clickUrl
    },

    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  self.registration.showNotification(
    title,
    notificationOptions
  );
});

/* =========================================
   NOTIFICATION CLICK
========================================= */

self.addEventListener(
  'notificationclick',
  (event) => {

    event.notification.close();

    if (event.action === 'dismiss') {
      return;
    }

    const targetUrl =
      event.notification.data?.url || '/';

    event.waitUntil(

      (async () => {

        const allClients =
          await clients.matchAll({
            type: 'window',
            includeUncontrolled: true
          });

        for (const client of allClients) {

          if (
            client.url.includes(
              self.location.origin
            )
          ) {

            client.focus();

            client.postMessage({
              type: 'UNERA_PUSH_OPEN',
              url: targetUrl,
              notification:
                event.notification.data || {}
            });

            return;
          }
        }

        await clients.openWindow(targetUrl);

      })()
    );
  }
);

/* =========================================
   NOTIFICATION CLOSE
========================================= */

self.addEventListener(
  'notificationclose',
  (event) => {

    console.log(
      '[UNERA] Notification closed',
      event.notification
    );
  }
);

/* =========================================
   PUSH EVENT (fallback)
========================================= */

self.addEventListener(
  'push',
  (event) => {

    console.log(
      '[UNERA] Raw push event:',
      event
    );
  }
);

/* =========================================
   INSTALL
========================================= */

self.addEventListener(
  'install',
  () => {

    console.log(
      '[UNERA] Firebase Messaging SW installed'
    );

    self.skipWaiting();
  }
);

/* =========================================
   ACTIVATE
========================================= */

self.addEventListener(
  'activate',
  (event) => {

    console.log(
      '[UNERA] Firebase Messaging SW activated'
    );

    event.waitUntil(
      self.clients.claim()
    );
  }
);

/* =========================================
   MESSAGE FROM APP
========================================= */

self.addEventListener(
  'message',
  (event) => {

    const data = event.data || {};

    if (
      data.type === 'SKIP_WAITING'
    ) {

      self.skipWaiting();
    }
  }
);
