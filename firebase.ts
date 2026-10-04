import {
  initializeApp
} from 'firebase/app';

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from 'firebase/messaging';

/* =========================================
   FIREBASE CONFIG
========================================= */

const firebaseConfig = {
  apiKey: 'AIzaSyChcgu2yOmsugrh2rjc9KhZWe6sD2yZqqI',
  authDomain: 'unera-50aae.firebaseapp.com',
  projectId: 'unera-50aae',
  storageBucket: 'unera-50aae.firebasestorage.app',
  messagingSenderId: '649631105841',
  appId: '1:649631105841:web:861869624fdfec132ca610'
};

/* =========================================
   INIT FIREBASE
========================================= */

export const firebaseApp =
  initializeApp(firebaseConfig);

/* =========================================
   FIREBASE MESSAGING
========================================= */

let messagingInstance: any = null;

export async function getUNERAMessaging() {

  const supported =
    await isSupported();

  if (!supported) {

    console.log(
      '❌ Firebase messaging not supported'
    );

    return null;
  }

  if (!messagingInstance) {

    messagingInstance =
      getMessaging(firebaseApp);
  }

  return messagingInstance;
}

/* =========================================
   REQUEST PUSH PERMISSION
========================================= */

export async function requestUNERAPermission() {

  try {

    if (
      !('Notification' in window)
    ) {

      console.log(
        '❌ Notifications not supported'
      );

      return null;
    }

    const permission =
      await Notification.requestPermission();

    if (permission !== 'granted') {

      console.log(
        '❌ Notification permission denied'
      );

      return null;
    }

    const messaging =
      await getUNERAMessaging();

    if (!messaging) {
      return null;
    }

    const registration =
      await navigator.serviceWorker.ready;

    const token =
      await getToken(
        messaging,
        {
          vapidKey:
            'BIuB4LE6eDkmgFQyt55TuMmDz0Kq5XtoDBdW70mOW99QB2-BQiYen-ZwoWQC_d2NerHpNwgaM-hxRGu6uBN84hA',

          serviceWorkerRegistration:
            registration
        }
      );

    if (!token) {

      console.log(
        '❌ Failed to get push token'
      );

      return null;
    }

    console.log(
      '🔥 UNERA WEB TOKEN:',
      token
    );

    return token;

  } catch (err) {

    console.error(
      '❌ UNERA notification error:',
      err
    );

    return null;
  }
}

/* =========================================
   REGISTER TOKEN TO BACKEND
========================================= */

export async function registerUNERAToken(
  token: string
) {

  try {

    const rawUser =
      localStorage.getItem(
        'unera_user'
      );

    const rawUserId =
      localStorage.getItem(
        'unera_user_id'
      );

    let userId = 0;

    if (rawUserId) {

      userId =
        Number(rawUserId);
    }

    if (!userId && rawUser) {

      try {

        const parsed =
          JSON.parse(rawUser);

        userId =
          Number(
            parsed?.id || 0
          );

      } catch {}
    }

    if (!userId) {

      console.log(
        '⚠️ Push ready but user not logged in'
      );

      return false;
    }

    const response =
      await fetch(
        '/api/push/register-token',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            user_id: userId,
            token,
            fcm_token: token,
            platform: 'web'
          })
        }
      );

    const result =
      await response.json();

    console.log(
      '✅ Push token registered:',
      result
    );

    return true;

  } catch (err) {

    console.error(
      '❌ Failed to register token',
      err
    );

    return false;
  }
}

/* =========================================
   MAIN PUSH SETUP
========================================= */

export async function setupUneraPush() {

  try {

    const token =
      await requestUNERAPermission();

    if (!token) {
      return null;
    }

    await registerUNERAToken(
      token
    );

    return token;

  } catch (err) {

    console.error(
      '❌ setupUneraPush failed',
      err
    );

    return null;
  }
}

/* =========================================
   FOREGROUND PUSH LISTENER
========================================= */

(async () => {

  try {

    const messaging =
      await getUNERAMessaging();

    if (!messaging) return;

    onMessage(
      messaging,
      (payload) => {

        console.log(
          '📩 UNERA foreground push:',
          payload
        );

        /* =========================================
           SEND EVENT TO APP
        ========================================== */

        window.dispatchEvent(
          new CustomEvent(
            'uneraPushMessage',
            {
              detail: payload
            }
          )
        );

        /* =========================================
           OPTIONAL LOCAL NOTIFICATION
        ========================================== */

        if (
          Notification.permission ===
          'granted'
        ) {

          const title =
            payload?.notification?.title ||
            'UNERA';

          const body =
            payload?.notification?.body ||
            'New notification';

          new Notification(
            title,
            {
              body,
              icon:
                'https://media.unera.social/unera_icon_192x192.png',

              badge:
                'https://media.unera.social/unera_icon_192x192.png'
            }
          );
        }
      }
    );

  } catch (err) {

    console.error(
      '❌ Foreground push listener failed',
      err
    );
  }
})();
