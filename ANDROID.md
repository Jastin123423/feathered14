# UNERA Android APK & AAB Build System

This repository contains both the **UNERA web application** and the **UNERA Android native wrapper** (built with Capacitor).

The existing web application remains the primary, unchanged project. The Android wrapper packages the production web build (`dist/`) into a native Android application producing:
1. **Debug APK** (`UNERA-debug-*.apk`) - For direct testing and sideloading onto any Android device.
2. **Release APK** (`UNERA-release-*.apk`) - Signed production APK.
3. **Google Play Bundle (AAB)** (`UNERA-GooglePlay-AAB-*.aab`) - For uploading to Google Play Console.

---

## 🚀 Quick Start: Building APK via GitHub Actions (No Android Studio Required)

You do **NOT** need Android Studio installed on your computer. You can build and download APKs directly through GitHub Actions:

1. **Push your code to GitHub** on the `main` or `master` branch (or create a tag like `v1.0.0`).
2. Open your repository on GitHub and click the **Actions** tab.
3. Select the **Android Build (APK & AAB)** workflow.
4. (Optional) Click **Run workflow** to choose whether to build Debug APK, Release APK, or Google Play AAB, and specify a custom version name.
5. Once the build completes (usually 2–3 minutes), scroll down to the **Artifacts** section at the bottom of the run page.
6. Click on **`UNERA-Debug-APK-*`** to download your APK zip, extract it, and install `UNERA-debug.apk` directly on your Android phone!

---

## 🔑 Setting Up Release Signing Secrets (For Google Play / Release APK)

For production signed builds, add the following secrets in **GitHub Repository Settings → Secrets and variables → Actions**:

| Secret Name | Description | Example / Notes |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` or `.keystore` file | `cat my-release-key.jks \| base64 -w 0` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | `YourKeystorePassword` |
| `ANDROID_KEY_ALIAS` | Key alias in the keystore | `unera` |
| `ANDROID_KEY_PASSWORD` | Key password | `YourKeyPassword` |

> *Note:* If no keystore secret is provided, the GitHub Actions workflow will still generate a fully functional **Debug APK** that can be installed on any Android device without signing keys.

---

## 🛠️ Local Development & Build Commands

All standard web commands continue working without any changes:

- `npm run dev` - Start Vite web development server
- `npm run build` - Build the production web app into `dist/`
- `npm run lint` - Type-check TypeScript codebase
- `npm run preview` - Preview the built web app locally

### Android Helper Commands:

- `npm run build:android` - Builds the web application and synchronizes assets to `android/`
- `npm run android:sync` - Syncs web build and plugins into the Android project (`npx cap sync android`)
- `npm run android:copy` - Copies web assets into Android without re-evaluating plugins

If you have Android Studio installed locally and wish to run in an emulator:
```bash
npx cap open android
```

---

## 📱 Native Features & Permissions

The Android application is configured with modern Android best practices:

- **Hardware Back Button**: Intelligently closes open modals/menus first; if none, navigates web history; if at root, cleanly exits the app.
- **Splash Screen & Status Bar**: Native splash screen in `#050B18` transitioning into the dark navy UI, with custom dark-themed status bar and navigation bar.
- **Offline Notification**: Real-time network detection displaying a friendly notification if connection drops.
- **File Downloads**: Uses Android's `DownloadManager` for saving files directly to the user's Downloads folder.
- **External Links**: Links leading to third-party domains open safely in the system browser rather than breaking the application view.
- **Permissions Declared**:
  - `INTERNET` & `ACCESS_NETWORK_STATE`: For online social network connectivity.
  - `CAMERA` & `RECORD_AUDIO`: For reel recording, stories, and voice messaging (optional hardware flags).
  - `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION`: For Marketplace and Events location tagging.
  - `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`: For uploading photos, videos, and music.
  - `POST_NOTIFICATIONS`: For push notifications on Android 13+.
