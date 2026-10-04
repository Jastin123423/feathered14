// IndexedDB Persistent Store for Real Device Media in UNERA
export interface StoredGalleryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  blob?: Blob;
  file?: File;
  thumbnailUrl?: string;
  duration?: string;
  durationSeconds?: number;
  name: string;
  size: number;
  timestamp: number;
}

const DB_NAME = 'unera_native_gallery_db';
const STORE_NAME = 'device_media';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Process a real live file selected from phone gallery/camera.
 * Extracts real duration, real dimensions, and live video thumbnail frame via Canvas.
 */
export function processLiveMediaFile(file: File): Promise<StoredGalleryItem> {
  return new Promise((resolve) => {
    const isVideo =
      file.type.startsWith('video/') ||
      /\.(mp4|webm|ogg|mov|m4v|3gp|mkv)$/i.test(file.name);
    const objectUrl = URL.createObjectURL(file);
    const id = `phone_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    if (!isVideo) {
      resolve({
        id,
        type: 'image',
        url: objectUrl,
        blob: file,
        file,
        name: file.name,
        size: file.size,
        timestamp: file.lastModified || Date.now(),
      });
      return;
    }

    // Video handling: extract real video duration & real frame thumbnail
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.src = objectUrl;

    const timeout = setTimeout(() => {
      resolve({
        id,
        type: 'video',
        url: objectUrl,
        blob: file,
        file,
        name: file.name,
        size: file.size,
        duration: '0:30',
        durationSeconds: 30,
        timestamp: file.lastModified || Date.now(),
      });
    }, 4500);

    videoEl.onloadedmetadata = () => {
      const durSec = Math.round(videoEl.duration || 0);
      const mins = Math.floor(durSec / 60);
      const secs = durSec % 60;
      const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      // Seek slightly into the video to capture a crisp representative thumbnail frame
      videoEl.currentTime = Math.min(1, Math.max(0.1, videoEl.duration / 4));
    };

    videoEl.onseeked = () => {
      clearTimeout(timeout);
      let thumbnailUrl: string | undefined = undefined;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(640, videoEl.videoWidth || 320);
        canvas.height = Math.min(640, videoEl.videoHeight || 320);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.82);
        }
      } catch (e) {
        console.warn('Could not generate video thumbnail:', e);
      }

      const durSec = Math.round(videoEl.duration || 0);
      const mins = Math.floor(durSec / 60);
      const secs = durSec % 60;
      const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

      resolve({
        id,
        type: 'video',
        url: objectUrl,
        blob: file,
        file,
        name: file.name,
        size: file.size,
        duration: formattedDuration,
        durationSeconds: durSec,
        thumbnailUrl,
        timestamp: file.lastModified || Date.now(),
      });
    };

    videoEl.onerror = () => {
      clearTimeout(timeout);
      resolve({
        id,
        type: 'video',
        url: objectUrl,
        blob: file,
        file,
        name: file.name,
        size: file.size,
        duration: '0:30',
        durationSeconds: 30,
        timestamp: file.lastModified || Date.now(),
      });
    };
  });
}

export async function saveGalleryMediaItems(items: StoredGalleryItem[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const item of items) {
      // IndexedDB serializes Blob directly
      const toStore: any = {
        id: item.id,
        type: item.type,
        name: item.name,
        size: item.size,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
        thumbnailUrl: item.thumbnailUrl,
        timestamp: item.timestamp || Date.now(),
      };
      if (item.blob) {
        toStore.blob = item.blob;
      } else if (item.file) {
        toStore.blob = item.file;
      }
      store.put(toStore);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save media to IndexedDB:', err);
  }
}

export async function getAllStoredGalleryMedia(): Promise<StoredGalleryItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const rawResults = request.result || [];
        // Map stored items, reconstructing valid session URLs and File objects
        const results: StoredGalleryItem[] = rawResults.map((item: any) => {
          let url = item.url || '';
          let file: File | undefined = undefined;

          if (item.blob) {
            url = URL.createObjectURL(item.blob);
            try {
              file = new File([item.blob], item.name || 'phone_media', {
                type: item.blob.type || (item.type === 'video' ? 'video/mp4' : 'image/jpeg'),
              });
            } catch (e) {
              file = undefined;
            }
          }

          return {
            id: item.id,
            type: item.type,
            url,
            blob: item.blob,
            file,
            thumbnailUrl: item.thumbnailUrl,
            duration: item.duration,
            durationSeconds: item.durationSeconds,
            name: item.name,
            size: item.size,
            timestamp: item.timestamp || 0,
          };
        });

        // Sort descending by timestamp (newest first)
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to read media from IndexedDB:', err);
    return [];
  }
}

export async function deleteStoredGalleryItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
  } catch (err) {
    console.warn('Failed to delete media from IndexedDB:', err);
  }
}

export async function clearAllStoredGalleryMedia(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }
}
