import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import AppRouter from './AppRouter';  // ✅ Changed from App to AppRouter

import { LanguageProvider } from './contexts/LanguageContext';
import { setupUneraPush } from './firebase';
import { initAndroidBridge, isNativeApp } from './utils/androidBridge';

// Initialize native bridge features when on Android
initAndroidBridge();

const rootElement =
  document.getElementById('root');

if (!rootElement) {

  throw new Error(
    'Could not find root element to mount to'
  );
}

const root =
  ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <BrowserRouter>  {/* ✅ Added BrowserRouter */}
      <LanguageProvider>
        <AppRouter />  {/* ✅ Changed from App to AppRouter */}
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);

/* =========================================
   UNERA SERVICE WORKER
========================================= */

if (!isNativeApp() && 'serviceWorker' in navigator) {

  window.addEventListener(
    'load',
    async () => {

      try {

        /* =========================================
           MAIN PWA SERVICE WORKER
        ========================================= */

        const registration =
          await navigator
            .serviceWorker
            .register('/sw.js');

        console.log(
          '✅ UNERA SW registered:',
          registration.scope
        );

        /* =========================================
           FIREBASE MESSAGING SW
        ========================================= */

        await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );

        console.log(
          '🔥 Firebase Messaging SW registered'
        );

        /* =========================================
           SETUP PUSH NOTIFICATIONS
        ========================================= */

        await setupUneraPush();

        /* =========================================
           FORCE WAITING SW TO ACTIVATE
        ========================================= */

        if (registration.waiting) {

          registration.waiting.postMessage({
            type: 'SKIP_WAITING',
          });
        }

        /* =========================================
           LISTEN FOR NEW SW
        ========================================= */

        registration.addEventListener(
          'updatefound',
          () => {

            const newWorker =
              registration.installing;

            if (!newWorker) return;

            console.log(
              '⬇️ New UNERA update found'
            );

            newWorker.addEventListener(
              'statechange',
              () => {

                console.log(
                  'SW STATE:',
                  newWorker.state
                );

                if (
                  newWorker.state ===
                    'installed' &&
                  navigator
                    .serviceWorker
                    .controller
                ) {

                  console.log(
                    '🔄 UNERA updated'
                  );

                  /* =========================================
                     UPDATE EVENT
                  ========================================= */

                  window.dispatchEvent(
                    new CustomEvent(
                      'uneraUpdateAvailable'
                    )
                  );

                  /* =========================================
                     AUTO REFRESH
                  ========================================= */

                  window.location.reload();
                }
              }
            );
          }
        );

        /* =========================================
           SW MESSAGE CHANNEL
        ========================================= */

        navigator.serviceWorker.addEventListener(
          'message',
          (event) => {

            console.log(
              '📩 SW MESSAGE:',
              event.data
            );

            window.dispatchEvent(
              new CustomEvent(
                'uneraSWMessage',
                {
                  detail: event.data,
                }
              )
            );
          }
        );

        /* =========================================
           ONLINE EVENT
        ========================================= */

        window.addEventListener(
          'online',
          () => {

            console.log(
              '🌐 UNERA back online'
            );

            window.dispatchEvent(
              new CustomEvent(
                'uneraOnline'
              )
            );
          }
        );

        /* =========================================
           OFFLINE EVENT
        ========================================= */

        window.addEventListener(
          'offline',
          () => {

            console.log(
              '📴 UNERA offline'
            );

            window.dispatchEvent(
              new CustomEvent(
                'uneraOffline'
              )
            );
          }
        );

        /* =========================================
           PWA INSTALL READY
        ========================================= */

        window.addEventListener(
          'beforeinstallprompt',
          (event: any) => {

            console.log(
              '📲 UNERA install available'
            );

            event.preventDefault();

            (window as any)
              .deferredPrompt = event;

            window.dispatchEvent(
              new CustomEvent(
                'uneraInstallReady'
              )
            );
          }
        );

        /* =========================================
           PWA INSTALLED
        ========================================= */

        window.addEventListener(
          'appinstalled',
          () => {

            console.log(
              '🎉 UNERA installed'
            );

            window.dispatchEvent(
              new CustomEvent(
                'uneraInstalled'
              )
            );
          }
        );

      } catch (err) {

        console.error(
          '❌ UNERA SW registration failed:',
          err
        );
      }
    }
  );
}
