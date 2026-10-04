// Recorder.tsx – Upload-only Reel Creator (no camera, no drafts, trimming kept)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';

// ==================== NATIVE APP DETECTION ====================
const isUneraNativeApp = (): boolean => {
  return !!(
    (window as any).UneraNative ||
    (window as any).flutter_inappwebview ||
    navigator.userAgent.includes('UneraApp')
  );
};

// ==================== MEDIA FETCH & CACHE ====================
const mediaBlobCache = new Map<string, { blobUrl: string, timestamp: number }>(); 
const mediaWarmPromises = new Map<string, Promise<string>>();
const CACHE_MAX_SIZE = 20;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function fetchAsBlobUrl(url: string, type: 'video' | 'audio' = 'audio'): Promise<string> {
  if (!url) throw new Error("Missing media URL");

  const cached = mediaBlobCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.blobUrl;
  }

  if (mediaWarmPromises.has(url)) {
    return mediaWarmPromises.get(url)!;
  }

  if (type === 'video') {
    mediaWarmPromises.set(url, Promise.resolve(url));
    setTimeout(() => mediaWarmPromises.delete(url), 1000);
    return url;
  }

  const p = fetch(url, { 
    cache: "force-cache",
    headers: { "Accept": "audio/mpeg,*/*" }
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);
      
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      if (mediaBlobCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = Array.from(mediaBlobCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        const oldest = mediaBlobCache.get(oldestKey);
        if (oldest) URL.revokeObjectURL(oldest.blobUrl);
        mediaBlobCache.delete(oldestKey);
      }
      
      mediaBlobCache.set(url, { blobUrl, timestamp: Date.now() });
      return blobUrl;
    })
    .finally(() => {
      mediaWarmPromises.delete(url);
    });

  mediaWarmPromises.set(url, p);
  return p;
}

async function fetchAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  const localUrl = await fetchAsBlobUrl(url, 'audio').catch(() => url);
  const res = await fetch(localUrl);
  if (!res.ok) throw new Error("Failed to fetch audio");
  return await res.arrayBuffer();
}

// ==================== AUDIO TRIMMING UTILITIES ====================
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = buffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

async function trimAudioUrlToWavBlob(audioUrl: string, startSec: number, endSec: number) {
  if (!audioUrl) throw new Error("Missing audioUrl");
  if (!(endSec > startSec)) throw new Error("Invalid trim range");

  const arrayBuffer = await fetchAsArrayBuffer(audioUrl);

  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

  const sr = decoded.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(decoded.length, Math.floor(endSec * sr));
  const frameCount = Math.max(0, endSample - startSample);

  if (frameCount <= 0) throw new Error("Trim produced empty audio");

  const trimmed = ctx.createBuffer(decoded.numberOfChannels, frameCount, sr);

  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const channel = decoded.getChannelData(ch).slice(startSample, endSample);
    trimmed.copyToChannel(channel, ch, 0);
  }

  const wavBlob = audioBufferToWavBlob(trimmed);

  try { await ctx.close(); } catch {}
  return { blob: wavBlob };
}

// ==================== VIDEO THUMBNAIL GENERATION ====================
type VideoPrepareProgress = {
  stage: 'analyzing' | 'thumbnail' | 'done';
  percent: number;
  message: string;
};

const createVideoElementFromFile = (file: File): Promise<{
  video: HTMLVideoElement;
  url: string;
  width: number;
  height: number;
  duration: number;
}> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.load(); // ensure metadata loads

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve({
        video,
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration || 0,
      });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read selected video.'));
    };
  });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create thumbnail.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
};

const createThumbnailFromVideo = async (
  file: File,
  maxWidth = 720
): Promise<{ file: File; previewUrl: string }> => {
  const { video, url, width, height, duration } = await createVideoElementFromFile(file);
  
  const calculateContainSize = (srcW: number, srcH: number, maxW: number, maxH: number) => {
    if (!srcW || !srcH) {
      return { width: maxW, height: maxH };
    }
    const ratio = Math.min(maxW / srcW, maxH / srcH);
    return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) };
  };
  
  const { width: outW, height: outH } = calculateContainSize(width, height, maxWidth, maxWidth * 1.8);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error('Canvas is not supported for thumbnail generation.');
  }

  // Safe seek
  const captureAt = Math.max(0.2, Math.min(duration * 0.2 || 0.2, 2));
  if (duration <= 0) {
    video.currentTime = 0;
  } else {
    video.currentTime = captureAt;
  }

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('Failed to prepare thumbnail.'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
  });

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(video, 0, 0, outW, outH);

  const blob = await canvasToBlob(canvas, 'image/webp', 0.78);
  URL.revokeObjectURL(url);

  const blobToFile = (blob: Blob, name: string, fallbackType: string) => {
    const type = blob.type || fallbackType;
    const ext = type.includes('jpeg') ? 'jpg' : type.includes('png') ? 'png' : 'webp';
    return new File([blob], `${name}.${ext}`, { type });
  };

  const outFile = blobToFile(blob, `thumb-${Date.now()}`, 'image/webp');
  const previewUrl = URL.createObjectURL(outFile);

  return { file: outFile, previewUrl };
};

// ==================== SILENT AUDIO EXTRACTOR (NO UI, NO SPEAKER) ====================
async function extractAudioFromVideo(file: File): Promise<File | null> {
  let video: HTMLVideoElement | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let isStopped = false;
  
  try {
    const videoUrl = URL.createObjectURL(file);
    video = document.createElement('video');
video.src = videoUrl;
video.crossOrigin = 'anonymous';

// ✅ Important for audio extraction
video.muted = false;
video.volume = 0;
video.playsInline = true;

    
    // Wait for metadata to load
    await new Promise<void>((resolve, reject) => {
      if (!video) return reject(new Error('Video element not created'));
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video metadata'));
    });
    
    const duration = video.duration;
    if (!duration || duration <= 0) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    // Create audio context
audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
await audioContext.resume();
sourceNode = audioContext.createMediaElementSource(video);
    
    // Create destination stream for recording (DO NOT connect to speakers)
    const dest = audioContext.createMediaStreamDestination();
    sourceNode.connect(dest);
    // IMPORTANT: DO NOT connect sourceNode to audioContext.destination (that would output to speakers)
    
    stream = dest.stream;
    
    // Check if there are audio tracks
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    // Setup recorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
    
    if (!mimeType) {
      URL.revokeObjectURL(videoUrl);
      return null;
    }
    
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    // Start recording
    mediaRecorder.start(250);
    
    // Play video and record until video ends or max 60 seconds
    await video.play();
    
    // Wait for video to end or timeout (max 60 seconds)
    await new Promise<void>((resolve) => {
      const stopAt = Math.min(duration, 60);
      const timer = setTimeout(() => {
        if (!isStopped) {
          isStopped = true;
          resolve();
        }
      }, stopAt * 1000);
      
      if (video) {
        video.onended = () => {
          if (!isStopped) {
            isStopped = true;
            clearTimeout(timer);
            resolve();
          }
        };
      }
    });
    
    // Stop recording
    const recordingStopped = new Promise<Blob>((resolve) => {
      if (!mediaRecorder) return resolve(new Blob());
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      mediaRecorder.stop();
    });
    
    // Pause video
    if (video) video.pause();
    
    // Wait for recording to finish
    const recordedBlob = await recordingStopped;
    
    // Cleanup
    URL.revokeObjectURL(videoUrl);
    
    if (!recordedBlob.size) return null;
    
    // Create file from recorded audio
    return new File(
      [recordedBlob],
      `original-audio-${Date.now()}.webm`,
      { type: mimeType }
    );
    
  } catch (error) {
    console.warn('Audio extraction from video failed:', error);
    return null;
  } finally {
    // Clean up resources
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    if (sourceNode && audioContext) {
      try { sourceNode.disconnect(); } catch {}
    }
    if (audioContext) {
      try { await audioContext.close(); } catch {}
    }
    if (video) {
      try { video.pause(); } catch {}
      try { video.remove(); } catch {}
    }
    if (stream) {
      try { stream.getTracks().forEach(track => track.stop()); } catch {}
    }
  }
}

// ==================== AUDIO FOCUS MANAGER ====================
const useAudioFocus = () => {
  const stopAllAudio = useCallback(() => {
    document.querySelectorAll('audio').forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {
        console.warn('Failed to stop audio:', error);
      }
    });
    
    document.querySelectorAll('video').forEach(video => {
      try {
        video.pause();
        video.muted = true;
      } catch (error) {
        console.warn('Failed to stop video:', error);
      }
    });
  }, []);

  return { stopAllAudio };
};

// ==================== API HELPER ====================
const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('unera_token');
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, { 
      ...options, 
      headers,
      signal: controller.signal 
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    try {
      if (contentType.includes('application/json')) data = await res.json();
      else {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text };
        }
      }
    } catch (e: any) {
      data = { error: e?.message || 'Failed to parse response' };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ==================== FORMAT HELPERS ====================
const formatClock = (secs: number) => {
  const safe = Math.max(0, Math.floor(secs || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const safeRevoke = (url?: string | null) => {
  if (!url) return;
  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
};

// ==================== LINKIFY HELPER ====================
const linkifyText = (text: string) => {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  return escaped.replace(
    /(https?:\/\/[^\s]+|www\.[^\s]+)/g,
    (url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-[#1877F2] underline font-bold">${url}</a>`;
    }
  );
};

// =========================
// ENHANCED FILTER SYSTEM
// =========================
type FilterCategory = 'beauty' | 'bright' | 'mood' | 'vintage' | 'bw';

type FilterPreset = {
  id: string;
  name: string;
  category: FilterCategory;
  base: {
    brightness?: number;
    contrast?: number;
    saturate?: number;
    sepia?: number;
    grayscale?: number;
    hueRotate?: number;
  };
  hasBeautyOverlay?: boolean;
  description?: string;
};

const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: 'Original', category: 'bright', base: {} },
  { 
    id: 'softGlow', 
    name: 'Soft Glow', 
    category: 'beauty',
    base: { brightness: 1.06, contrast: 0.94, saturate: 1.06, sepia: 0.04 },
    hasBeautyOverlay: true,
    description: 'Softens skin, reduces harsh contrast'
  },
  { 
    id: 'smoothWarm', 
    name: 'Smooth Warm', 
    category: 'beauty',
    base: { brightness: 1.05, contrast: 0.95, saturate: 1.08, sepia: 0.08 },
    hasBeautyOverlay: true,
    description: 'Warms skin tones, gentle glow'
  },
  { 
    id: 'cleanSkin', 
    name: 'Clean Skin', 
    category: 'beauty',
    base: { brightness: 1.07, contrast: 0.93, saturate: 1.03 },
    hasBeautyOverlay: true,
    description: 'Brightens face, reduces shadows'
  },
  { 
    id: 'peach', 
    name: 'Peach', 
    category: 'beauty',
    base: { brightness: 1.06, contrast: 0.95, saturate: 1.08, sepia: 0.12, hueRotate: -4 },
    hasBeautyOverlay: true,
    description: 'Warm peach tone, flattering for skin'
  },
  { 
    id: 'vividPop', 
    name: 'Vivid Pop', 
    category: 'bright',
    base: { brightness: 1.04, contrast: 1.08, saturate: 1.18 },
    description: 'Punchy colors, vibrant look'
  },
  { 
    id: 'sunny', 
    name: 'Sunny', 
    category: 'bright',
    base: { brightness: 1.08, contrast: 1.02, saturate: 1.10, sepia: 0.06 },
    description: 'Bright and warm like sunlight'
  },
  { 
    id: 'fresh', 
    name: 'Fresh', 
    category: 'bright',
    base: { brightness: 1.05, contrast: 1.01, saturate: 1.12, hueRotate: -3 },
    description: 'Clean, slightly cool bright look'
  },
  { 
    id: 'clearDay', 
    name: 'Clear Day', 
    category: 'bright',
    base: { brightness: 1.06, contrast: 1.04, saturate: 1.08 },
    description: 'Crisp and clear like a perfect day'
  },
  { 
    id: 'coolBlue', 
    name: 'Cool Blue', 
    category: 'mood',
    base: { brightness: 1.02, contrast: 1.04, saturate: 0.95, hueRotate: 6 },
    description: 'Cool, calm aesthetic'
  },
  { 
    id: 'fade', 
    name: 'Fade', 
    category: 'mood',
    base: { brightness: 1.04, contrast: 0.88, saturate: 0.92 },
    description: 'Muted, faded film look'
  },
  { 
    id: 'cinema', 
    name: 'Cinema', 
    category: 'mood',
    base: { brightness: 0.98, contrast: 1.12, saturate: 0.92, sepia: 0.06 },
    description: 'Cinematic contrast and tone'
  },
  { 
    id: 'tokyo', 
    name: 'Tokyo', 
    category: 'mood',
    base: { brightness: 1.01, contrast: 1.06, saturate: 1.08, hueRotate: 2 },
    description: 'Neon-inspired cool tone'
  },
  { 
    id: 'cocoa', 
    name: 'Cocoa', 
    category: 'mood',
    base: { brightness: 0.96, contrast: 1.02, saturate: 0.94, sepia: 0.14 },
    description: 'Warm, rich brown tones'
  },
  { 
    id: 'retro', 
    name: 'Retro', 
    category: 'vintage',
    base: { brightness: 1.00, contrast: 0.92, saturate: 0.88, sepia: 0.20 },
    description: 'Classic vintage film look'
  },
  { 
    id: 'dust', 
    name: 'Dust', 
    category: 'vintage',
    base: { brightness: 1.03, contrast: 0.90, saturate: 0.86, sepia: 0.16 },
    description: 'Faded, dusty aesthetic'
  },
  { 
    id: 'goldenFilm', 
    name: 'Golden', 
    category: 'vintage',
    base: { brightness: 1.02, contrast: 0.94, saturate: 0.96, sepia: 0.24 },
    description: 'Warm golden vintage tone'
  },
  { 
    id: 'oldCam', 
    name: 'Old Cam', 
    category: 'vintage',
    base: { brightness: 1.00, contrast: 0.88, saturate: 0.84, sepia: 0.18 },
    description: 'Aged camera look'
  },
  { 
    id: 'monoSoft', 
    name: 'Mono Soft', 
    category: 'bw',
    base: { grayscale: 1, brightness: 1.04, contrast: 0.95 },
    description: 'Soft black and white'
  },
  { 
    id: 'monoBold', 
    name: 'Mono Bold', 
    category: 'bw',
    base: { grayscale: 1, contrast: 1.16 },
    description: 'High contrast black and white'
  },
  { 
    id: 'monoWarm', 
    name: 'Mono Warm', 
    category: 'bw',
    base: { grayscale: 1, sepia: 0.15, brightness: 1.02, contrast: 1.04 },
    description: 'Warm-toned black and white'
  },
];

const buildFilterString = (preset: FilterPreset, intensity: number): string => {
  if (intensity === 0 || preset.id === 'none') return 'none';

  const mix = (neutral: number, target?: number) => {
    if (target === undefined) return neutral;
    return neutral + (target - neutral) * intensity;
  };

  const brightness = mix(1, preset.base.brightness);
  const contrast = mix(1, preset.base.contrast);
  const saturate = mix(1, preset.base.saturate);
  const sepia = mix(0, preset.base.sepia);
  const grayscale = mix(0, preset.base.grayscale);
  const hueRotate = (preset.base.hueRotate || 0) * intensity;

  const filters: string[] = [];

  if (brightness !== 1) filters.push(`brightness(${brightness})`);
  if (contrast !== 1) filters.push(`contrast(${contrast})`);
  if (saturate !== 1) filters.push(`saturate(${saturate})`);
  if (sepia > 0) filters.push(`sepia(${sepia})`);
  if (grayscale > 0) filters.push(`grayscale(${grayscale})`);
  if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate}deg)`);

  return filters.length > 0 ? filters.join(' ') : 'none';
};

const FILTER_CATEGORIES: { id: FilterCategory; name: string; icon: string }[] = [
  { id: 'beauty', name: 'Beauty', icon: 'fa-spa' },
  { id: 'bright', name: 'Bright', icon: 'fa-sun' },
  { id: 'mood', name: 'Mood', icon: 'fa-moon' },
  { id: 'vintage', name: 'Vintage', icon: 'fa-camera-retro' },
  { id: 'bw', name: 'B&W', icon: 'fa-circle' },
];

// =========================
// TYPES
// =========================
export type Visibility = 'public' | 'friends' | 'private';

export type ReelSound = {
  songName: string;
  audioUrl: string;
  audioStart?: number;
  audioEnd?: number;
  songId?: string | number;
  soundKey?: string;
  originalUrl?: string;
  isTrimmedAudio?: boolean;
};

export type LyricThemeId =
  | 'classic'
  | 'neon'
  | 'cinema'
  | 'glass'
  | 'karaoke'
  | 'outline';

type LyricPreset = {
  id: LyricThemeId;
  name: string;
  className: string;
};

type EditorMode = 'choose' | 'preview';

// Sound type matching Reels.tsx exactly
export type Sound = {
  id: string | number;
  name: string;
  url: string;
  start?: number;
  end?: number;
  creator?: User;
  creationCount?: number;
  duration?: number;
  isOriginal?: boolean;
  playCount?: number;
  viewCount?: number;
  coverImage?: string;
  soundKey?: string;
  originalUrl?: string;
  file?: File; // For local uploads
};

export type RecorderSoundOption = {
  id: string | number;
  name: string;
  url: string;
  originalUrl?: string;
  duration?: number;
  start?: number;
  end?: number;
  coverImage?: string;
  creatorName?: string;
  creatorImage?: string;
  playCount?: number;
  creationCount?: number;
  soundKey?: string;
  isOriginal?: boolean;
  file?: File; // For local uploads
};

export interface RecorderSubmitPayload {
  caption: string;
  location?: string;
  visibility: Visibility;
  videoFile?: File;
  thumbnailFile?: File;
  audioFile?: File;
  songName?: string;
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  soundKey?: string;
  songId?: string | number;
  originalSoundId?: string | number;
  lyricsText?: string;
  lyricsTheme?: LyricThemeId;
  lyricsEnabled?: boolean;
  filterId?: string;
  filterIntensity?: number;
  // ✅ Native Flutter upload fields
  nativeVideoUrl?: string;
  nativeVideoMeta?: any;
  // ✅ NEW: Description with HTML links
  descriptionHtml?: string;
}

// Updated RecorderProps interface with new props
interface RecorderProps {
  currentUser: User;
  selectedSound?: ReelSound | null;
  sounds?: RecorderSoundOption[];
  onSelectSound?: (sound: ReelSound | null) => void;
  onBack: () => void;
  onSubmit: (payload: RecorderSubmitPayload) => Promise<void> | void;
  maxDurationSec?: number;
  brandName?: string;
  initialVideoFile?: File | null;
  initialVideoUrl?: string;
  initialNativeMediaMeta?: any;
  startInPreview?: boolean;
  // ✅ ADDED THIS - Publishing state (not used internally, just passed through)
  reelPublishing?: boolean;
  reelPublishingProgress?: number;
  reelPublishingText?: string;
}

const LYRIC_PRESETS: LyricPreset[] = [
  { id: 'classic', name: 'Classic', className: 'lyric-classic' },
  { id: 'neon', name: 'Neon', className: 'lyric-neon' },
  { id: 'cinema', name: 'Cinema', className: 'lyric-cinema' },
  { id: 'glass', name: 'Glass', className: 'lyric-glass' },
  { id: 'karaoke', name: 'Karaoke', className: 'lyric-karaoke' },
  { id: 'outline', name: 'Outline', className: 'lyric-outline' },
];

// ==================== ENHANCED AUDIO TRIMMER ====================
const AudioTrimmer: React.FC<{ 
  url: string, 
  onClose: () => void, 
  onConfirm: (start: number, end: number, trimmedFile?: File) => void,
  initialStart: number,
  initialEnd: number,
  soundId?: string | number;
  soundName?: string;
  onMountStopAll?: () => void;
  onStopVideo?: () => void;
  isOriginal?: boolean;
}> = ({ url, onClose, onConfirm, initialStart, initialEnd, soundId, soundName, onMountStopAll, onStopVideo, isOriginal }) => {
  const { stopAllAudio } = useAudioFocus();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd > 0 ? initialEnd : Math.min(60, initialStart + 15));
  const [duration, setDuration] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeThumb, setActiveThumb] = useState<'start' | 'end'>('start');
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimStatus, setTrimStatus] = useState<'idle' | 'trimming' | 'success' | 'error'>('idle');
  const [trimError, setTrimError] = useState<string>('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const trimAudioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<any>(null);
  
  const MIN_WINDOW = 1;
  const MAX_WINDOW = 60;

  useEffect(() => {
    onStopVideo?.();
    onMountStopAll?.();
    stopAllAudio();
    
    if (trimAudioRef.current) {
      trimAudioRef.current.src = url;
      trimAudioRef.current.currentTime = start;
    }
    
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (trimAudioRef.current) {
        trimAudioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    const handleTimeUpdate = () => {
      if (!isPlaying) return;
      
      setCurrentTime(trimAudioRef.current?.currentTime || 0);
      
      if (trimAudioRef.current && (trimAudioRef.current.currentTime < start || trimAudioRef.current.currentTime >= end)) {
        trimAudioRef.current.currentTime = start;
      }
    };

    const audio = trimAudioRef.current;
    if (audio) {
      audio.addEventListener('timeupdate', handleTimeUpdate);
      return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, [isPlaying, start, end]);

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        if (trimAudioRef.current) {
          setCurrentTime(trimAudioRef.current.currentTime);
        }
      }, 100);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      setDuration(d);
      if (initialEnd === 0 || initialEnd > d) {
        const newEnd = Math.min(d, start + 15);
        setEnd(newEnd);
      }
    }
  };

  const togglePlay = () => {
    if (!trimAudioRef.current) return;

    stopAllAudio();

    if (isPlaying) {
      trimAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      trimAudioRef.current.currentTime = start;
      trimAudioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleStartChange = (value: number) => {
    const newStart = Math.min(value, end - MIN_WINDOW);
    setStart(newStart);
    if (trimAudioRef.current) {
      trimAudioRef.current.currentTime = newStart;
    }
  };

  const handleEndChange = (value: number) => {
    const newEnd = Math.max(value, start + MIN_WINDOW);
    setEnd(Math.min(newEnd, start + MAX_WINDOW));
    if (trimAudioRef.current) {
      trimAudioRef.current.currentTime = newEnd;
    }
  };

  const handleTrackInteraction = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const clickTime = clickPercent * duration;

    const distStart = Math.abs(clickTime - start);
    const distEnd = Math.abs(clickTime - end);
    setActiveThumb(distStart < distEnd ? 'start' : 'end');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleConfirm = async () => {
    setIsTrimming(true);
    setTrimStatus('trimming');
    setTrimProgress(0);
    setTrimError('');
    
    try {
      setTrimProgress(10);
      
      const { blob } = await trimAudioUrlToWavBlob(url, start, end);
      
      setTrimProgress(80);
      
      const trimmedFile = new File([blob], `trimmed-${Date.now()}.wav`, { 
        type: "audio/wav" 
      });
      
      setTrimProgress(95);
      setTrimStatus('success');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      onConfirm(start, end, trimmedFile);
      
    } catch (error: any) {
      console.error('Audio trimming failed:', error);
      setTrimStatus('error');
      setTrimError(error?.message || 'Failed to trim audio');
      setIsTrimming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[800] bg-black/98 flex flex-col justify-end animate-fade-in font-sans">
      <style>{`
        .precision-slider {
          pointer-events: none;
          appearance: none;
          background: transparent;
          width: 100%;
          position: absolute;
          left: 0;
          z-index: 40;
        }
        .precision-slider::-webkit-slider-thumb {
          pointer-events: auto;
          appearance: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          border: 4px solid currentColor;
        }
        .slider-active { z-index: 50; }
        .slider-blue::-webkit-slider-thumb { color: #1877F2; }
        .slider-red::-webkit-slider-thumb { color: #F3425F; }
      `}</style>

      {(isTrimming || trimStatus === 'trimming' || trimStatus === 'error') && (
        <div className="absolute inset-0 z-[900] bg-black/95 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-gradient-to-b from-[#1A1A1A] to-[#0A0A0A] rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl">
            <div className="flex flex-col items-center justify-center gap-6">
              {trimStatus === 'trimming' ? (
                <>
                  <div className="w-24 h-24 relative">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.1)"
                        strokeWidth="8"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="#1877F2"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${trimProgress * 2.83} 283`}
                        strokeDashoffset="0"
                        className="transition-all duration-300 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
                        <i className="fas fa-scissors text-2xl text-[#1877F2] animate-pulse"></i>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-2">Trimming Audio</h3>
                    <p className="text-[#B0B3B8] text-sm">
                      Creating trimmed audio file ({Math.round(trimProgress)}%)
                    </p>
                    <div className="w-full bg-white/10 rounded-full h-2 mt-4 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#1877F2] to-[#2D8CFF] rounded-full transition-all duration-300"
                        style={{ width: `${trimProgress}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : trimStatus === 'error' ? (
                <>
                  <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <i className="fas fa-exclamation-triangle text-3xl text-red-500"></i>
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-2">Trimming Failed</h3>
                    <p className="text-[#B0B3B8] text-sm mb-6">{trimError || 'Failed to trim audio'}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setTrimStatus('idle');
                          setTrimError('');
                          setIsTrimming(false);
                        }}
                        className="flex-1 bg-gradient-to-r from-[#1877F2] to-[#2D8CFF] text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={onClose}
                        className="flex-1 bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#121212] w-full rounded-t-[40px] p-8 pb-14 border-t border-white/10 animate-slide-up shadow-2xl relative">
        <div className="flex justify-between items-center mb-10">
          <button 
            onClick={onClose} 
            disabled={isTrimming}
            className="text-[#B0B3B8] font-black uppercase text-[10px] tracking-widest px-4 py-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="text-center">
            <h3 className="font-black text-white uppercase tracking-[4px] text-xs">Precision Sync</h3>
            <p className="text-[9px] text-[#1877F2] font-black mt-1 uppercase tracking-tighter">Trim & Export Audio</p>
            {soundName && (
              <p className="text-[8px] text-white/60 font-bold mt-0.5 uppercase tracking-tight truncate max-w-[200px]">
                {soundName}
              </p>
            )}
          </div>
          <button 
            onClick={handleConfirm} 
            disabled={isTrimming || trimStatus === 'trimming'}
            className="text-[#1877F2] font-black uppercase text-[10px] tracking-widest px-4 py-2 disabled:opacity-50"
          >
            {isTrimming ? 'Processing...' : 'Done'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 mb-8">
          <button 
            onClick={togglePlay}
            disabled={isTrimming}
            className="w-16 h-16 rounded-full bg-white/5 border-2 border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-white text-xl`}></i>
          </button>
          <div className="flex flex-col items-center">
            <span className="text-white text-sm font-bold">
              {formatDuration(currentTime - start)}
            </span>
            <span className="text-white/40 text-[9px] uppercase tracking-widest">Current</span>
          </div>
        </div>

        <div 
          ref={containerRef}
          onMouseDown={(e) => !isTrimming && handleTrackInteraction(e.clientX)}
          onTouchStart={(e) => !isTrimming && handleTrackInteraction(e.touches[0].clientX)}
          className="relative h-28 w-full bg-white/5 rounded-3xl overflow-hidden px-8 border border-white/5 shadow-inner flex flex-col justify-center"
        >
          <div className="absolute inset-0 flex items-center gap-[2px] opacity-10 px-8 pointer-events-none">
            {Array.from({ length: 100 }).map((_, i) => (
              <div key={i} className="flex-1 bg-white rounded-full" style={{ height: `${15 + Math.random() * 70}%` }} />
            ))}
          </div>

          <div 
            className="absolute h-16 bg-[#1877F2]/10 border-x-2 border-white/30 pointer-events-none transition-all duration-75 z-10" 
            style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }} 
          />

          <div className="relative w-full h-1 flex items-center bg-white/10 rounded-full">
            <input 
              type="range" 
              min="0" 
              max={duration} 
              step="0.1" 
              value={start} 
              onMouseDown={() => { if (!isTrimming) { setActiveThumb('start'); } }}
              onMouseUp={() => {}}
              onChange={(e) => !isTrimming && handleStartChange(parseFloat(e.target.value))}
              className={`precision-slider slider-blue ${activeThumb === 'start' ? 'slider-active' : ''}`}
              disabled={isTrimming}
            />
            <input 
              type="range" 
              min="0" 
              max={duration} 
              step="0.1" 
              value={end} 
              onMouseDown={() => { if (!isTrimming) { setActiveThumb('end'); } }}
              onMouseUp={() => {}}
              onChange={(e) => !isTrimming && handleEndChange(parseFloat(e.target.value))}
              className={`precision-slider slider-red ${activeThumb === 'end' ? 'slider-active' : ''}`}
              disabled={isTrimming}
            />
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10 flex flex-col items-center">
            <span className="text-[8px] font-black text-[#1877F2] uppercase tracking-widest">In</span>
            <p className="text-white text-xs font-black">{start.toFixed(1)}s</p>
          </div>
          <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10 flex flex-col items-center">
            <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Out</span>
            <p className="text-white text-xs font-black">{end.toFixed(1)}s</p>
          </div>
          <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10 flex flex-col items-center">
            <span className="text-[8px] font-black text-[#45BD62] uppercase tracking-widest">Length</span>
            <p className="text-white text-xs font-black">{(end - start).toFixed(1)}s</p>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-white/50 text-xs mb-2">
            <i className="fas fa-info-circle text-[#1877F2] mr-2"></i>
            Trimmed audio will be exported as a new file
          </p>
          <p className="text-white/30 text-[10px]">
            Original: {formatDuration(duration)} → Trimmed: {formatDuration(end - start)}
          </p>
        </div>

        <audio 
          ref={audioRef} 
          src={url} 
          hidden 
          onLoadedMetadata={handleLoadedMetadata}
        />
        <audio 
          ref={trimAudioRef} 
          src={url} 
          hidden 
        />
      </div>
    </div>
  );
};

// =========================
// MAIN COMPONENT
// =========================
const Recorder: React.FC<RecorderProps> = ({
  currentUser,
  selectedSound,
  sounds = [],
  onSelectSound,
  onBack,
  onSubmit,
  maxDurationSec = 60,
  brandName = 'UNERA',
  initialVideoFile = null,
  initialVideoUrl = '',
  initialNativeMediaMeta = null,
  startInPreview = false,
  // ✅ ADD THESE (not used internally, just to accept props)
  reelPublishing = false,
  reelPublishingProgress = 0,
  reelPublishingText = '',
}) => {
  const [mode, setMode] = useState<EditorMode>(
    startInPreview && (initialVideoFile || initialVideoUrl) ? 'preview' : 'choose'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [submitProgress, setSubmitProgress] = useState(0);
  const [videoPrepareMessage, setVideoPrepareMessage] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const thumbnailPreviewRef = useRef<string | null>(null);
const [recorderActiveTab, setRecorderActiveTab] = useState<'record' | 'upload' | 'sound' | 'preview'>('preview');

  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');

  const [lyricsEnabled, setLyricsEnabled] = useState(true);
  const [lyricsText, setLyricsText] = useState('Your words here\nMake them sing on screen');
  const [lyricsTheme, setLyricsTheme] = useState<LyricThemeId>('karaoke');
  const [lyricsScale, setLyricsScale] = useState(1);
  const [lyricsBottomOffset, setLyricsBottomOffset] = useState(18);

  const [selectedFilterId, setSelectedFilterId] = useState<string>('none');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('beauty');
  const [filterIntensity, setFilterIntensity] = useState(0.75);
  const [isEffectsOpen, setIsEffectsOpen] = useState(false);

  // ✅ Native upload states
  const [nativeVideoUrl, setNativeVideoUrl] = useState<string>(initialVideoUrl);
  const [nativeVideoMeta, setNativeVideoMeta] = useState<any | null>(initialNativeMediaMeta);
  const [isNativePickerActive, setIsNativePickerActive] = useState(false);
  const [nativeUploadProgress, setNativeUploadProgress] = useState(0);

  const activeFilter = useMemo(
    () => FILTER_PRESETS.find((f) => f.id === selectedFilterId) || FILTER_PRESETS[0],
    [selectedFilterId]
  );

  const activeFilterString = useMemo(
    () => buildFilterString(activeFilter, filterIntensity),
    [activeFilter, filterIntensity]
  );

  const isBeautyEffect = useMemo(
    () => activeFilter.hasBeautyOverlay || false,
    [activeFilter]
  );

  const filteredFilters = useMemo(() => {
    const categoryFilters = FILTER_PRESETS.filter(f => f.category === filterCategory && f.id !== 'none');
    const original = FILTER_PRESETS.find(f => f.id === 'none');
    return original ? [original, ...categoryFilters] : categoryFilters;
  }, [filterCategory]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(initialVideoUrl || null);
  const [soundPreviewEnabled, setSoundPreviewEnabled] = useState(true);
  const [playPreview, setPlayPreview] = useState(true);
  const [previewFillMode, setPreviewFillMode] = useState<'cover' | 'contain'>('cover');

  const [isSoundPickerOpen, setIsSoundPickerOpen] = useState(false);
  const [soundSearch, setSoundSearch] = useState('');
  const [previewingSoundId, setPreviewingSoundId] = useState<string | number | null>(null);
  const [trimStart, setTrimStart] = useState<number>(selectedSound?.audioStart || 0);
  const [trimEnd, setTrimEnd] = useState<number>(selectedSound?.audioEnd || 0);

  const [availableSounds, setAvailableSounds] = useState<RecorderSoundOption[]>(sounds);
  const [popularSounds, setPopularSounds] = useState<RecorderSoundOption[]>([]);
  const [localUploadedSounds, setLocalUploadedSounds] = useState<Sound[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [loadingPopularSounds, setLoadingPopularSounds] = useState(false);

  const [trimmedAudioFile, setTrimmedAudioFile] = useState<File | null>(null);
  const [selectedUploadedSound, setSelectedUploadedSound] = useState<Sound | null>(null);
  const [extractedVideoAudioFile, setExtractedVideoAudioFile] = useState<File | null>(null);
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);

  // Refs for file inputs and video preview
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);

  const hasSelectedSound = useMemo(() => {
    return !!( 
      (selectedSound?.audioUrl && String(selectedSound.audioUrl).trim()) ||
      (selectedUploadedSound?.url && String(selectedUploadedSound.url).trim())
    );
  }, [selectedSound, selectedUploadedSound]);

  // ===NATIVE UPLOAD ===
useEffect(() => {
  const handleNativeReelVideo = (event: any) => {
    const media = event.detail || {};
    const videoUrl = media.videoUrl || media.nativeVideoUrl || media.full || media.feed || media.url;
    const mediaMeta = media.mediaMeta || media.nativeVideoMeta;

    console.log("📱 Recorder: Native reel video received:", media);

    if (!videoUrl) return;

    setNativeVideoUrl(videoUrl);
    setNativeVideoMeta(mediaMeta || null);
    setVideoPreviewUrl(videoUrl);
    previewUrlRef.current = videoUrl;
    setMode('preview');

    const music = media.music || media.sound || {};
    const audioUrl =
      media.audioUrl ||
      media.audio_url ||
      music.audioUrl ||
      music.audio_url ||
      music.url ||
      music.originalUrl ||
      music.original_url ||
      selectedSound?.audioUrl ||
      selectedSound?.originalUrl ||
      '';

    if (audioUrl) {
      const nativeSound: ReelSound = {
        songName:
          media.songName ||
          media.song_name ||
          music.songName ||
          music.song_name ||
          music.title ||
          music.name ||
          selectedSound?.songName ||
          'Original Sound',
        audioUrl,
        originalUrl: audioUrl,
        audioStart:
          media.audioStart ??
          media.audio_start ??
          music.audioStart ??
          music.audio_start ??
          selectedSound?.audioStart ??
          0,
        audioEnd:
          media.audioEnd ??
          media.audio_end ??
          music.audioEnd ??
          music.audio_end ??
          selectedSound?.audioEnd ??
          0,
        songId:
          media.songId ??
          media.song_id ??
          music.songId ??
          music.song_id ??
          music.id ??
          selectedSound?.songId,
        soundKey:
          media.soundKey ||
          media.sound_key ||
          music.soundKey ||
          music.sound_key ||
          selectedSound?.soundKey,
        isTrimmedAudio: false,
      };

      onSelectSound?.(nativeSound);
      setTrimStart(nativeSound.audioStart || 0);
      setTrimEnd(nativeSound.audioEnd || 0);
      setSelectedUploadedSound(null);
      setExtractedVideoAudioFile(null);
      setTrimmedAudioFile(null);
    }
  };

  window.addEventListener('uneraNativeReelVideo', handleNativeReelVideo);
  return () => {
    window.removeEventListener('uneraNativeReelVideo', handleNativeReelVideo);
  };
}, [onSelectSound, selectedSound]);



  // ✅ Listen for native reel video from App.tsx
  useEffect(() => {
    const handleNativeReelVideo = (event: any) => {
      const { videoUrl, mediaMeta } = event.detail;
      console.log("📱 Recorder: Native reel video received:", videoUrl);
      
      if (!videoUrl) return;
      
      setNativeVideoUrl(videoUrl);
      setNativeVideoMeta(mediaMeta);
      setNextPreviewUrl(videoUrl);
      setMode('preview');
    };

    window.addEventListener('uneraNativeReelVideo', handleNativeReelVideo);
    return () => {
      window.removeEventListener('uneraNativeReelVideo', handleNativeReelVideo);
    };
  }, []);

  // Fetch popular sounds
  useEffect(() => {
    const fetchPopularSounds = async () => {
      setLoadingPopularSounds(true);
      try {
        const data = await apiFetch('/api/sounds/popular?limit=20');
        if (data?.success && data.sounds) {
          const sounds = data.sounds.map((sound: any) => ({
            id: sound.id,
            name: sound.name,
            url: sound.url,
            originalUrl: sound.originalUrl || sound.url,
            duration: sound.duration,
            start: sound.start || 0,
            end: sound.end || sound.duration || 60,
            coverImage: sound.coverImage,
            creatorName: sound.creatorName,
            creatorImage: sound.creatorImage,
            playCount: sound.playCount,
            creationCount: sound.creationCount,
            soundKey: sound.soundKey || `sound:${sound.id}`
          }));
          setPopularSounds(sounds);
          
          sounds.slice(0, 5).forEach((sound: any) => {
            if (sound.url) {
              fetchAsBlobUrl(sound.url, 'audio').catch(() => {});
            }
            if (sound.coverImage) {
              fetch(sound.coverImage, { cache: 'force-cache' }).catch(() => {});
            }
          });
        }
      } catch (error) {
        console.error('Failed to fetch popular sounds:', error);
      } finally {
        setLoadingPopularSounds(false);
      }
    };

    fetchPopularSounds();
  }, []);

  // Fetch songs from library
  useEffect(() => {
    const fetchSongs = async () => {
      setLoadingSongs(true);
      try {
        const data = await apiFetch('/api/songs');
        if (data?.success && data.songs) {
          const songSounds = data.songs.map((song: any) => ({
            id: `song:${song.id}`,
            name: song.title,
            url: song.audio_url,
            originalUrl: song.audio_url,
            duration: song.duration,
            start: 0,
            end: song.duration || 60,
            coverImage: song.cover_url,
            creatorName: song.artist,
            creatorImage: song.cover_url,
            playCount: song.playCount || 0,
            soundKey: `song:${song.id}`
          }));
          setAvailableSounds(songSounds);
        }
      } catch (error) {
        console.error('Failed to fetch songs:', error);
      } finally {
        setLoadingSongs(false);
      }
    };

    fetchSongs();
  }, []);

  const [isTrimmerOpen, setIsTrimmerOpen] = useState(false);
  const [trimmingSound, setTrimmingSound] = useState<RecorderSoundOption | null>(null);

  const currentSelectedSound = selectedSound || null;
  const soundLabel = currentSelectedSound?.songName || (selectedUploadedSound?.name || 'Original Sound');
  const soundStart = trimStart;
  const soundEnd = trimEnd;

  const lyricPreset = useMemo(
    () => LYRIC_PRESETS.find((p) => p.id === lyricsTheme) || LYRIC_PRESETS[0],
    [lyricsTheme]
  );

  // Filter sounds for display - include local uploaded sounds first (no duplicates)
  const filteredSounds = useMemo(() => {
    const q = soundSearch.trim().toLowerCase();
    
    const localSounds = localUploadedSounds.map(sound => ({
      id: sound.id,
      name: sound.name,
      url: sound.url,
      originalUrl: sound.originalUrl || sound.url,
      duration: sound.duration,
      start: sound.start || 0,
      end: sound.end || sound.duration || 60,
      coverImage: sound.coverImage,
      creatorName: sound.creator?.name || 'My Upload',
      creatorImage: sound.creator?.profile_image_url,
      playCount: sound.playCount,
      creationCount: sound.creationCount,
      soundKey: sound.soundKey || `upload:${sound.id}`,
      isOriginal: true,
      file: sound.file
    }));
    
    const allSounds = [...localSounds, ...popularSounds, ...availableSounds];
    
    if (!q) return allSounds;
    
    return allSounds.filter((sound) =>
      sound.name.toLowerCase().includes(q) ||
      String(sound.creatorName || '').toLowerCase().includes(q)
    );
  }, [soundSearch, availableSounds, popularSounds, localUploadedSounds]);

  const cleanupPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      safeRevoke(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stopSoundPreview = useCallback(() => {
    if (soundAudioRef.current) {
      try {
        soundAudioRef.current.pause();
      } catch {}
    }
    setPreviewingSoundId(null);
  }, []);

  const playSoundPreview = useCallback(async (sound: RecorderSoundOption) => {
    if (!sound.url) return;

    if (!soundAudioRef.current) {
      soundAudioRef.current = new Audio();
    }

    const audio = soundAudioRef.current;
    const start = sound.start || 0;
    const end = sound.end || sound.duration || 0;

    if (previewingSoundId === sound.id && !audio.paused) {
      audio.pause();
      setPreviewingSoundId(null);
      return;
    }

    audio.pause();
    
    let playableUrl = sound.url;
    if (!sound.isOriginal && !sound.url.startsWith('blob:')) {
      playableUrl = await fetchAsBlobUrl(sound.url, 'audio').catch(() => sound.url);
    }
    
    audio.src = playableUrl;
    audio.currentTime = start;
    audio.onended = () => setPreviewingSoundId(null);
    audio.ontimeupdate = () => {
      if (end > start && audio.currentTime >= end) {
        audio.pause();
        audio.currentTime = start;
        setPreviewingSoundId(null);
      }
    };

    audio.play().then(() => {
      setPreviewingSoundId(sound.id);
    }).catch(() => {
      setPreviewingSoundId(null);
    });
  }, [previewingSoundId]);

  const setNextPreviewUrl = useCallback(
    (url: string | null) => {
      cleanupPreviewUrl();
      previewUrlRef.current = url;
      setVideoPreviewUrl(url);
    },
    [cleanupPreviewUrl]
  );

  // Handle initial video file from Reels.tsx (when coming from "Use this sound")
  useEffect(() => {
    if (!initialVideoFile) return;
    
    let cancelled = false;
    const objectUrl = URL.createObjectURL(initialVideoFile);
    
    const run = async () => {
      setVideoFile(initialVideoFile);
      setNextPreviewUrl(objectUrl);
      setMode('preview');
      setSubmitState('idle');
      setSubmitError('');
      setSubmitProgress(0);
      
      // Only extract audio if there's no selected sound (coming from "Use this sound" or manual upload)
      if (!hasSelectedSound) {
        setIsExtractingAudio(true);
        try {
          // Revoke old extracted audio if exists
          if (selectedUploadedSound?.url?.startsWith('blob:')) {
            safeRevoke(selectedUploadedSound.url);
          }
          
          const extracted = await extractAudioFromVideo(initialVideoFile);
          if (cancelled) return;
          
          if (extracted) {
            const extractedUrl = URL.createObjectURL(extracted);
            const generatedSoundKey = `original:extracted:${Date.now()}`;
            const autoSound: ReelSound = {
              songName: 'Original Sound',
              audioUrl: extractedUrl,
              originalUrl: extractedUrl,
              audioStart: 0,
              audioEnd: 0,
              soundKey: generatedSoundKey,
              isTrimmedAudio: false,
            };
            setExtractedVideoAudioFile(extracted);
            setSelectedUploadedSound({
              id: generatedSoundKey,
              name: 'Original Sound',
              url: extractedUrl,
              originalUrl: extractedUrl,
              duration: 0,
              start: 0,
              end: 0,
              isOriginal: true,
              creator: currentUser,
              soundKey: generatedSoundKey,
              file: extracted,
            });
            setTrimStart(0);
            setTrimEnd(0);
            onSelectSound?.(autoSound);
          }
        } catch (error) {
          console.warn('Silent audio extraction failed:', error);
        } finally {
          if (!cancelled) setIsExtractingAudio(false);
        }
      }
    };
    
    run();
    
    return () => {
      cancelled = true;
      safeRevoke(objectUrl);
    };
  }, [initialVideoFile, setNextPreviewUrl, hasSelectedSound, selectedUploadedSound, currentUser, onSelectSound]);

  // Handle initial native video URL from App.tsx
  useEffect(() => {
    if (!initialVideoUrl) return;
    
    setNativeVideoUrl(initialVideoUrl);
    setNativeVideoMeta(initialNativeMediaMeta);
    setNextPreviewUrl(initialVideoUrl);
    setMode('preview');
    
    // Skip audio extraction for native videos
  }, [initialVideoUrl, initialNativeMediaMeta]);

  const resetAll = useCallback(() => {
    stopSoundPreview();
    setVideoFile(null);
    setNativeVideoUrl('');
    setNativeVideoMeta(null);
    setThumbnailFile(null);
    setTrimmedAudioFile(null);
    setExtractedVideoAudioFile(null);
    setSelectedUploadedSound(null);
    onSelectSound?.(null);
    setNextPreviewUrl(null);
    setMode('choose');
    setCaption('');
    setLocation('');
    setSubmitState('idle');
    setSubmitError('');
    setSubmitProgress(0);
    setPlayPreview(true);
    setSelectedFilterId('none');
    setFilterIntensity(0.75);
    setVideoPrepareMessage('');
    if (thumbnailPreviewRef.current) {
      safeRevoke(thumbnailPreviewRef.current);
      thumbnailPreviewRef.current = null;
    }
  }, [setNextPreviewUrl, stopSoundPreview, onSelectSound]);

  // Process selected video (only for web picker)
  const processSelectedVideo = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      setSubmitState('error');
      setSubmitError('Please choose a video file.');
      return;
    }

    // Clear native video states
    setNativeVideoUrl('');
    setNativeVideoMeta(null);
    
    setSubmitState('idle');
    setSubmitError('');
    setSubmitProgress(0);
    setVideoFile(file);
    setNextPreviewUrl(URL.createObjectURL(file));
    setMode('preview');
    
    // Silent auto extraction logic (only for web uploaded videos)
    if (!hasSelectedSound) {
      setIsExtractingAudio(true);
      // Revoke old extracted audio if exists
      if (selectedUploadedSound?.url?.startsWith('blob:')) {
        safeRevoke(selectedUploadedSound.url);
      }
      
      extractAudioFromVideo(file).then(extracted => {
        if (extracted) {
          const extractedUrl = URL.createObjectURL(extracted);
          const generatedSoundKey = `original:extracted:${Date.now()}`;
          const autoSound: ReelSound = {
            songName: 'Original Sound',
            audioUrl: extractedUrl,
            originalUrl: extractedUrl,
            audioStart: 0,
            audioEnd: 0,
            soundKey: generatedSoundKey,
            isTrimmedAudio: false,
          };
          setExtractedVideoAudioFile(extracted);
          setSelectedUploadedSound({
            id: generatedSoundKey,
            name: 'Original Sound',
            url: extractedUrl,
            originalUrl: extractedUrl,
            duration: 0,
            start: 0,
            end: 0,
            isOriginal: true,
            creator: currentUser,
            soundKey: generatedSoundKey,
            file: extracted,
          });
          setTrimStart(0);
          setTrimEnd(0);
          onSelectSound?.(autoSound);
        } else {
          setSelectedUploadedSound(null);
          onSelectSound?.(null);
        }
        setIsExtractingAudio(false);
      }).catch(() => {
        setIsExtractingAudio(false);
        setSelectedUploadedSound(null);
        onSelectSound?.(null);
      });
    }
  }, [hasSelectedSound, selectedUploadedSound, currentUser, onSelectSound, setNextPreviewUrl]);

  // ✅ handlePickVideo - processes selected video reliably in both app and web
  const handlePickVideo = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processSelectedVideo(file);
    event.target.value = '';
  }, [processSelectedVideo]);

  const handlePickMusic = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      alert('Please select a valid audio file (MP3, WAV, M4A, etc.)');
      return;
    }
    
    // Revoke old extracted audio if exists
    if (selectedUploadedSound?.url?.startsWith('blob:')) {
      safeRevoke(selectedUploadedSound.url);
    }
    
    const url = URL.createObjectURL(file);
    
    const newSound: Sound = {
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ""),
      url: url,
      duration: 0,
      start: 0,
      end: 60,
      isOriginal: true,
      creator: currentUser,
      soundKey: `original:upload-${Date.now()}`,
      originalUrl: url,
      file: file
    };
    
    setLocalUploadedSounds(prev => [newSound, ...prev]);
    setSelectedUploadedSound(newSound);
    setExtractedVideoAudioFile(null);
    setTrimStart(0);
    setTrimEnd(60);
    
    const reelSound: ReelSound = {
      songName: newSound.name,
      audioUrl: url,
      originalUrl: url,
      audioStart: 0,
      audioEnd: 60,
      songId: newSound.id,
      soundKey: newSound.soundKey,
      isTrimmedAudio: false,
    };
    
    onSelectSound?.(reelSound);
    setIsSoundPickerOpen(false);
    
    setTrimmingSound({
      id: newSound.id,
      name: newSound.name,
      url: url,
      originalUrl: url,
      duration: 60,
      start: 0,
      end: 60,
      isOriginal: true,
      file: file
    });
    setIsTrimmerOpen(true);
    
    event.target.value = '';
  }, [currentUser, onSelectSound, selectedUploadedSound]);

  //====SOUND KEY GENERATOR =====
  
  const generateSoundKey = useCallback((): string => {
    if (trimmedAudioFile) return `trimmed:${Date.now()}`;
    if (selectedUploadedSound?.soundKey) return selectedUploadedSound.soundKey;
    if (currentSelectedSound?.soundKey) return currentSelectedSound.soundKey;
    if (currentSelectedSound?.songId) return `song:${currentSelectedSound.songId}`;
    if (extractedVideoAudioFile) return `original:extracted:${Date.now()}`;
    return 'original:none';
  }, [currentSelectedSound, trimmedAudioFile, selectedUploadedSound, extractedVideoAudioFile]);


   const isVideoLikeAudioUrl = (url?: string) => {
  const u = String(url || '')
    .toLowerCase()
    .split('?')[0]
    .split('#')[0];

  // ✅ REAL AUDIO FILES
  if (
    u.endsWith('.mp3') ||
    u.endsWith('.wav') ||
    u.endsWith('.m4a') ||
    u.endsWith('.aac') ||
    u.endsWith('.ogg') ||
    u.endsWith('.opus') ||
    u.endsWith('.flac')
  ) {
    return false;
  }

  // ✅ VIDEO FILES
  return (
    u.endsWith('.mp4') ||
    u.endsWith('.mov') ||
    u.endsWith('.webm') ||
    u.endsWith('.m4v') ||
    u.includes('/uploads/videos/')
  );
};

const remoteUrlToVideoFile = async (url: string): Promise<File> => {
  const res = await fetch(url, {
    cache: 'force-cache',
    headers: {
      Accept: 'video/*,*/*',
    },
  });

  if (!res.ok) {
    throw new Error('Failed to load original sound video');
  }

  const blob = await res.blob();

  const contentType =
    blob.type ||
    (url.toLowerCase().includes('.webm')
      ? 'video/webm'
      : url.toLowerCase().includes('.mov')
      ? 'video/quicktime'
      : 'video/mp4');

  const extension =
    contentType.includes('webm')
      ? 'webm'
      : contentType.includes('quicktime')
      ? 'mov'
      : 'mp4';

  return new File(
    [blob],
    `original-sound-video-${Date.now()}.${extension}`,
    {
      type: contentType,
    }
  );
};

//===HANDLE REEL SUBMIT ===

const handleSubmit = useCallback(async () => {
  if (!videoFile && !nativeVideoUrl) {
    setSubmitState('error');
    setSubmitError('Please select a video first.');
    return;
  }

  if (typeof onSubmit !== 'function') {
    setSubmitState('error');
    setSubmitError('Recorder submit handler is missing.');
    return;
  }

  setIsSubmitting(true);
  setSubmitState('uploading');
  setSubmitError('');
  setSubmitProgress(10);

  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue =
      'Your video is still uploading. Are you sure you want to leave?';
  };

  window.addEventListener('beforeunload', beforeUnloadHandler);

  try {
    const soundKey = generateSoundKey();

    const selectedSoundUrl =
      currentSelectedSound?.originalUrl ||
      currentSelectedSound?.audioUrl ||
      selectedUploadedSound?.originalUrl ||
      selectedUploadedSound?.url ||
      '';

    const isOriginalVideoSound = isVideoLikeAudioUrl(selectedSoundUrl);

    const isTrimmedAudio =
      !!currentSelectedSound?.isTrimmedAudio ||
      soundKey.startsWith('trimmed:');

    const audioStart = isTrimmedAudio ? 0 : trimStart || 0;
    const audioEnd = isTrimmedAudio ? 0 : trimEnd || 0;

    // ✅ Important:
    // If selected sound is an MP4/original video sound,
    // DO NOT send extractedVideoAudioFile.
    // Otherwise App.tsx receives audioFile and uploads .webm again.
    let audioFileToSend: File | undefined = isOriginalVideoSound
      ? undefined
      : trimmedAudioFile ||
        selectedUploadedSound?.file ||
        extractedVideoAudioFile ||
        undefined;

    const finalSongName =
      currentSelectedSound?.songName ||
      selectedUploadedSound?.name ||
      'Original Sound';

    const finalAudioUrl = selectedSoundUrl;

    setSubmitProgress(20);
    setVideoPrepareMessage('Preparing thumbnail...');

    let thumbnail: { file: File; previewUrl: string } | null = null;

    if (videoFile) {
      thumbnail = await createThumbnailFromVideo(videoFile, 720);
      setThumbnailFile(thumbnail.file);

      if (thumbnailPreviewRef.current) {
        safeRevoke(thumbnailPreviewRef.current);
      }

      thumbnailPreviewRef.current = thumbnail.previewUrl;
    } else {
      setVideoPrepareMessage('Using native video...');
      setSubmitProgress(50);
    }

    setSubmitProgress(70);
    setVideoPrepareMessage('Publishing...');

    await onSubmit({
      caption: caption.trim(),
      location: location.trim(),
      visibility,

      // ✅ NEW: HTML version with clickable links
      descriptionHtml: linkifyText(caption.trim()),

      videoFile: videoFile || undefined,
      thumbnailFile: thumbnail?.file,

      // undefined for original MP4 sound
      audioFile: audioFileToSend,

      // keeps MP4 URL
      audioUrl: finalAudioUrl,

      songName: finalSongName,
      audioStart,
      audioEnd,
      soundKey,

      songId: currentSelectedSound?.songId || selectedUploadedSound?.id,
      originalSoundId:
        currentSelectedSound?.songId || selectedUploadedSound?.id,

      lyricsText: lyricsText.trim(),
      lyricsTheme,
      lyricsEnabled,

      filterId: selectedFilterId,
      filterIntensity,

      nativeVideoUrl: nativeVideoUrl || undefined,
      nativeVideoMeta: nativeVideoMeta || undefined,
    });

    setSubmitProgress(100);
    setVideoPrepareMessage('Done');
    setSubmitState('success');

    window.removeEventListener('beforeunload', beforeUnloadHandler);

    await sleep(800);
    onBack();
  } catch (error: any) {
    console.error('Submit error:', error);
    setSubmitState('error');
    setSubmitError(error?.message || 'Failed to publish reel.');
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  } finally {
    setIsSubmitting(false);
  }
}, [
  videoFile,
  nativeVideoUrl,
  nativeVideoMeta,
  onSubmit,
  caption,
  location,
  visibility,
  currentSelectedSound,
  selectedUploadedSound,
  trimStart,
  trimEnd,
  lyricsText,
  lyricsTheme,
  lyricsEnabled,
  generateSoundKey,
  onBack,
  trimmedAudioFile,
  selectedFilterId,
  filterIntensity,
  extractedVideoAudioFile,
]);
  
 


  const handleSoundSelect = useCallback((sound: RecorderSoundOption) => {
    // Revoke old extracted audio if exists
    if (selectedUploadedSound?.url?.startsWith('blob:')) {
      safeRevoke(selectedUploadedSound.url);
    }
    
    setExtractedVideoAudioFile(null);
    if (sound.isOriginal && sound.file) {
      const uploadedSound: Sound = {
        id: sound.id,
        name: sound.name,
        url: sound.url,
        originalUrl: sound.originalUrl || sound.url,
        start: sound.start || 0,
        end: sound.end || sound.duration || 60,
        isOriginal: true,
        creator: currentUser,
        soundKey: sound.soundKey || `upload:${sound.id}`,
        file: sound.file
      };
      setSelectedUploadedSound(uploadedSound);
    }

    const normalized: ReelSound = {
      songName: sound.name,
      audioUrl: sound.url,
      originalUrl: sound.originalUrl || sound.url,
      audioStart: sound.start || 0,
      audioEnd: sound.end || sound.duration || 0,
      songId: sound.id,
      soundKey: sound.soundKey || `song:${sound.id}`,
      isTrimmedAudio: false,
    };

    setTrimmedAudioFile(null);
    setTrimStart(normalized.audioStart || 0);
    setTrimEnd(normalized.audioEnd || 0);
    setTrimmingSound(sound);

    onSelectSound?.(normalized);
    setIsSoundPickerOpen(false);
    setIsTrimmerOpen(true);
  }, [currentUser, onSelectSound, selectedUploadedSound]);

  const handleTrimConfirm = useCallback((start: number, end: number, trimmedFile?: File) => {
    setTrimStart(start);
    setTrimEnd(end);
    setIsTrimmerOpen(false);
    
    if (trimmedFile) {
      setTrimmedAudioFile(trimmedFile);
    } else {
      setTrimmedAudioFile(null);
    }
    
    if (selectedUploadedSound) {
      const updatedSound: ReelSound = {
        songName: selectedUploadedSound.name,
        audioUrl: selectedUploadedSound.url,
        originalUrl: selectedUploadedSound.originalUrl || selectedUploadedSound.url,
        audioStart: start,
        audioEnd: end,
        songId: selectedUploadedSound.id,
        soundKey: selectedUploadedSound.soundKey,
        isTrimmedAudio: !!trimmedFile,
      };
      onSelectSound?.(updatedSound);
    } else if (currentSelectedSound) {
      onSelectSound?.({
        ...currentSelectedSound,
        audioStart: start,
        audioEnd: end,
        isTrimmedAudio: !!trimmedFile,
      });
    }
  }, [currentSelectedSound, selectedUploadedSound, onSelectSound]);

  const handleFilterSelect = useCallback((filterId: string) => {
    setSelectedFilterId(filterId);
  }, []);

  useEffect(() => {
    setTrimStart(selectedSound?.audioStart || 0);
    setTrimEnd(selectedSound?.audioEnd || 0);
  }, [selectedSound]);

  useEffect(() => {
    return () => {
      cleanupPreviewUrl();
      stopSoundPreview();
      localUploadedSounds.forEach(sound => {
        if (sound.url.startsWith('blob:')) {
          URL.revokeObjectURL(sound.url);
        }
      });
      if (selectedUploadedSound?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedUploadedSound.url);
      }
      if (soundAudioRef.current) {
        try {
          soundAudioRef.current.pause();
        } catch {}
        soundAudioRef.current = null;
      }
      if (thumbnailPreviewRef.current) {
        safeRevoke(thumbnailPreviewRef.current);
        thumbnailPreviewRef.current = null;
      }
    };
  }, [cleanupPreviewUrl, stopSoundPreview, localUploadedSounds, selectedUploadedSound]);

  useEffect(() => {
    if (mode !== 'preview' || !previewVideoRef.current || !videoPreviewUrl) return;
    const video = previewVideoRef.current;
    video.play().catch(() => {});
  }, [mode, videoPreviewUrl]);

  const lyricStyle = useMemo<React.CSSProperties>(() => ({
    transform: `translateX(-50%) scale(${lyricsScale})`,
    bottom: `${lyricsBottomOffset}%`,
  }), [lyricsBottomOffset, lyricsScale]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden font-sans recorder-page"
      style={{ width: '100vw', height: '100dvh' }}
    >
      <style>{RECORDER_STYLES}</style>

      {submitState === 'uploading' && (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-[#1A1A1A] to-[#0A0A0A] rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="w-32 h-32 relative">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#1877F2"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${submitProgress * 2.83} 283`}
                    strokeDashoffset="0"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">
                    <i className="fas fa-cloud-upload-alt text-2xl text-[#1877F2] animate-pulse"></i>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2 animate-fade-in">
                  {videoPrepareMessage || 'Preparing video...'}
                </h3>
                <p className="text-[#B0B3B8] text-sm">
                  {submitProgress < 40
                    ? `Getting your video ready (${Math.round(submitProgress)}%)`
                    : submitProgress < 96
                    ? `Uploading your video (${Math.round(submitProgress)}%)`
                    : `Publishing your post (${Math.round(submitProgress)}%)`}
                </p>
                
                <div className="space-y-3 mt-4">
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#1877F2] to-[#2D8CFF] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${submitProgress}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-xs text-[#B0B3B8]">
                    <span>{submitProgress < 40 ? 'Processing' : submitProgress < 96 ? 'Uploading' : 'Publishing'}</span>
                    <span>≈ {submitProgress < 40 ? 'Please wait' : submitProgress < 96 ? 'Almost there' : 'Finalizing'}</span>
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-white/50 text-center mt-4 px-4 py-2 bg-white/5 rounded-lg">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                Please don't close this window or navigate away
              </div>
            </div>
          </div>
        </div>
      )}

      {submitState === 'success' && (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-[#1A1A1A] to-[#0A0A0A] rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="w-24 h-24 rounded-full bg-[#45BD62]/20 flex items-center justify-center">
                <i className="fas fa-check-circle text-4xl text-[#45BD62] animate-pulse"></i>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2">Posted successfully!</h3>
                <p className="text-[#B0B3B8] text-sm">Your reel is now live on UNERA</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {submitState === 'error' && (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-b from-[#1A1A1A] to-[#0A0A0A] rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2">Upload Failed</h3>
                <p className="text-[#B0B3B8] text-sm mb-4">{submitError || 'Failed to publish reel'}</p>
                <button
                  onClick={() => setSubmitState('idle')}
                  className="bg-[#1877F2] text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(24,119,242,0.18),transparent_28%),radial-gradient(circle_at_bottom,rgba(243,66,95,0.16),transparent_25%)] pointer-events-none" />

      <div className="absolute top-0 left-0 right-0 z-40 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-3 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between">
        <button
          onClick={() => {
            if (mode === 'preview' && !initialVideoFile && !initialVideoUrl) {
              setMode('choose');
              return;
            }
            onBack();
          }}
          className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-95 transition"
        >
          <i className="fas fa-arrow-left text-sm" />
        </button>

        <div className="text-center">
          <div className="text-[10px] tracking-[0.35em] uppercase text-[#7fb6ff] font-black">{brandName} Studio</div>
          <div className="text-[12px] font-black tracking-[0.2em] uppercase">
            {mode === 'choose' ? 'Create Reel' : 'Preview'}
          </div>
        </div>

        <button
          onClick={resetAll}
          className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-95 transition"
          aria-label="Reset recorder"
        >
          <i className="fas fa-rotate-left text-sm" />
        </button>
      </div>

      {mode === 'choose' && !initialVideoFile && !initialVideoUrl && (
        <div className="relative h-full flex flex-col items-center justify-center px-6 pb-12 pt-24 overflow-y-auto">
          <div className="w-full max-w-[420px] text-center mb-8">
            <div className="w-24 h-24 mx-auto rounded-[32px] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl mb-6">
              <i className="fas fa-video text-4xl text-[#1877F2]" />
            </div>
            <h1 className="text-3xl font-black tracking-tight mb-3">Create a Reel</h1>
          </div>

          <div className="w-full max-w-[420px] space-y-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-[32px] bg-white/5 border border-white/10 p-6 text-left active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center">
                  <i className="fas fa-cloud-upload-alt text-2xl text-[#7fb6ff]" />
                </div>
                <div>
                  <div className="text-lg font-black uppercase tracking-[0.18em]">Upload Video</div>
                  <div className="text-white/60 text-xs mt-1 uppercase tracking-[0.12em]">From your gallery or file picker</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setIsSoundPickerOpen(true)}
              className="w-full rounded-[32px] bg-white/5 border border-white/10 p-5 text-left active:scale-[0.98] transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-[#1877F2]/15 border border-[#1877F2]/30 flex items-center justify-center">
                  <i className="fas fa-music text-xl text-[#7fb6ff]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-[#7fb6ff]">Sound</div>
                  <div className="text-base font-bold truncate mt-1">{soundLabel}</div>
                  <div className="text-white/55 text-xs mt-1">Tap to browse, upload from your phone, or preview songs</div>
                </div>
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handlePickVideo}
            />
            
            <input
              ref={musicFileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              className="hidden"
              onChange={handlePickMusic}
            />
          </div>

          {(currentSelectedSound || selectedUploadedSound) && (
            <div className="w-full max-w-[420px] mt-5 rounded-[28px] bg-white/5 border border-white/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-[#7fb6ff]">Selected Sound</div>
                  <div className="text-sm font-bold mt-1 truncate">{soundLabel}</div>
                  {selectedUploadedSound && !extractedVideoAudioFile && (
                    <div className="text-[10px] text-green-500 mt-1">
                      <i className="fas fa-phone-alt mr-1"></i> Uploaded from device
                    </div>
                  )}
                  {extractedVideoAudioFile && !currentSelectedSound?.songId && (
                    <div className="text-[10px] text-green-400 mt-1">
                      <i className="fas fa-film mr-1"></i> Audio extracted from video
                    </div>
                  )}
                  {selectedSound && !selectedUploadedSound && !extractedVideoAudioFile && (
                    <div className="text-[10px] text-[#1877F2] mt-1">
                      <i className="fas fa-music mr-1"></i> Using sound from "Use this sound"
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsSoundPickerOpen(true)}
                  className="px-4 py-2 rounded-2xl bg-white/10 border border-white/10 text-xs font-black uppercase tracking-[0.14em] active:scale-95"
                >
                  Change
                </button>
              </div>

              <div className="mt-4 grid gap-4">
                <RangeRow
                  label="Trim start"
                  value={trimStart}
                  min={0}
                  max={Math.max(trimEnd > 0 ? trimEnd - 1 : 1, 1)}
                  step={0.1}
                  display={`${trimStart.toFixed(1)}s`}
                  onChange={(v) => setTrimStart(v)}
                />
                <RangeRow
                  label="Trim end"
                  value={trimEnd || 60}
                  min={trimStart + 0.5}
                  max={60}
                  step={0.1}
                  display={`${trimEnd.toFixed(1)}s`}
                  onChange={(v) => setTrimEnd(v)}
                />
              </div>

              <div className="mt-3 text-white/55 text-xs">
                Fast trim mode: only start/end metadata changes, so there is no fake trimming delay.
              </div>

              <button
                onClick={() => {
                  const sound = {
                    id: selectedUploadedSound?.id || currentSelectedSound?.songId || 'temp',
                    name: selectedUploadedSound?.name || currentSelectedSound?.songName || 'Sound',
                    url: selectedUploadedSound?.url || currentSelectedSound?.audioUrl || '',
                    originalUrl: selectedUploadedSound?.originalUrl || currentSelectedSound?.originalUrl || '',
                    duration: 60,
                    start: trimStart,
                    end: trimEnd,
                    isOriginal: !!selectedUploadedSound,
                    file: selectedUploadedSound?.file
                  };
                  setTrimmingSound(sound as RecorderSoundOption);
                  setIsTrimmerOpen(true);
                }}
                className="w-full mt-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-[0.14em] hover:bg-white/10 transition-colors"
              >
                <i className="fas fa-scissors mr-2"></i>
                Advanced Trim & Export
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'preview' && videoPreviewUrl && (
        <div className="absolute inset-0 bg-black overflow-y-auto pt-20 pb-28">
          <div className="px-4 pb-6 max-w-[720px] mx-auto">
            <div className="grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
              <div className="relative rounded-[34px] overflow-hidden border border-white/10 bg-[#0c0c0c] shadow-2xl w-full max-w-[420px] aspect-[9/16] mx-auto">
                <video
                  ref={previewVideoRef}
                  src={videoPreviewUrl}
                  className={`absolute inset-0 w-full h-full ${previewFillMode === 'cover' ? 'object-cover' : 'object-contain'} bg-black`}
                  style={{ filter: activeFilterString }}
                  playsInline
                  loop
                  controls={false}
                  muted={true} // Always mute preview video to avoid speaker output
                  autoPlay
                />

                {isBeautyEffect && (
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backdropFilter: 'blur(1.2px)',
                      background: 'rgba(255, 240, 240, 0.02)',
                      mixBlendMode: 'soft-light',
                    }}
                  />
                )}

                {/* Lyrics overlay */}
{lyricsEnabled && (
  <div className="absolute inset-0 pointer-events-none">
    <div className={`lyric-overlay ${lyricPreset.className}`} style={lyricStyle}>
      {lyricsText.split('\n').map((line, idx) => (
        <div key={idx}>{line || '\u00A0'}</div>
      ))}
    </div>
  </div>
)}

{/* ✅ NEW: Caption/description preview on video */}
{caption.trim() && (
  <div className="absolute left-4 right-4 bottom-5 z-20 pointer-events-auto">
    <div 
      className="text-white text-[15px] leading-snug font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] break-words"
      dangerouslySetInnerHTML={{ __html: linkifyText(caption.trim()) }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a') as HTMLAnchorElement | null;
        if (!link?.href) return;
        e.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
      }}
    />
  </div>
)}
                                                            
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-3">
                  <button
                    onClick={() =>
                      setPreviewFillMode((prev) => (prev === 'cover' ? 'contain' : 'cover'))
                    }
                    className="px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-[0.2em] font-black"
                  >
                    {previewFillMode === 'cover' ? 'Fill' : 'Fit'}
                  </button>
                  <button
                    onClick={() => {
                      const video = previewVideoRef.current;
                      if (!video) return;
                      if (video.paused) {
                        video.play().catch(() => {});
                        setPlayPreview(true);
                      } else {
                        video.pause();
                        setPlayPreview(false);
                      }
                    }}
                    className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md border border-white/10 flex items-center justify-center"
                  >
                    <i className={`fas ${playPreview ? 'fa-pause' : 'fa-play'} text-xs`} />
                  </button>
                </div>

                {selectedFilterId !== 'none' && (
                  <div className="absolute top-3 right-16 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[10px] uppercase tracking-[0.2em] font-black text-[#7fb6ff]">
                    {activeFilter.name} • {Math.round(filterIntensity * 100)}%
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <SectionCard title="Caption & publishing">
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption for your reel..."
                    className="w-full min-h-[120px] rounded-3xl bg-white/5 border border-white/10 p-4 text-white outline-none resize-none"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Add location"
                      className="rounded-2xl bg-white/5 border border-white/10 p-3 text-white outline-none"
                    />
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as Visibility)}
                      className="rounded-2xl bg-white/5 border border-white/10 p-3 text-white outline-none"
                    >
                      <option value="public">Public</option>
                      <option value="friends">Friends only</option>
                      <option value="private">Private</option>
                    </select>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={onBack}
                      className="rounded-2xl bg-white/8 border border-white/10 py-3 font-black uppercase tracking-[0.14em] active:scale-95"
                    >
                      Replace video
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="rounded-2xl bg-[#1877F2] py-3 font-black uppercase tracking-[0.14em] active:scale-95 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Publishing...' : 'Publish'}
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="Professional lyrics design">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-bold">Lyrics overlay</div>
                      <div className="text-white/50 text-xs">TikTok-style text for singing, quotes, subtitles, or hooks.</div>
                    </div>
                    <button
                      onClick={() => setLyricsEnabled((prev) => !prev)}
                      className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.14em] border ${lyricsEnabled ? 'bg-[#1877F2] border-[#1877F2]' : 'bg-white/5 border-white/10'}`}
                    >
                      {lyricsEnabled ? 'On' : 'Off'}
                    </button>
                  </div>

                  <textarea
                    value={lyricsText}
                    onChange={(e) => setLyricsText(e.target.value)}
                    placeholder="Type your lyrics or lines here..."
                    className="w-full min-h-[120px] rounded-3xl bg-white/5 border border-white/10 p-4 text-white outline-none resize-none"
                  />

                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-[0.16em] font-black text-[#7fb6ff] mb-3">Text style</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {LYRIC_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setLyricsTheme(preset.id)}
                          className={`rounded-2xl px-4 py-3 border text-xs font-black uppercase tracking-[0.14em] ${lyricsTheme === preset.id ? 'bg-[#1877F2] border-[#1877F2]' : 'bg-white/5 border-white/10'}`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <RangeRow
                      label="Text size"
                      value={lyricsScale}
                      min={0.8}
                      max={1.6}
                      step={0.05}
                      display={`${Math.round(lyricsScale * 100)}%`}
                      onChange={(v) => setLyricsScale(v)}
                    />
                    <RangeRow
                      label="Bottom position"
                      value={lyricsBottomOffset}
                      min={8}
                      max={32}
                      step={1}
                      display={`${lyricsBottomOffset}%`}
                      onChange={(v) => setLyricsBottomOffset(v)}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Sound">
                  {isExtractingAudio && (
                    <div className="mb-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white/80">
                      <i className="fas fa-wave-square mr-2 text-[#1877F2]" />
                      Extracting audio from video (silent)...
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{soundLabel}</div>
                      <div className="text-white/50 text-xs mt-1">
                        {currentSelectedSound || selectedUploadedSound ? 'Trim is instant and uses the same fields as Reels playback.' : 'No sound selected yet.'}
                      </div>
                      {selectedUploadedSound && !extractedVideoAudioFile && (
                        <div className="text-[10px] text-green-500 mt-1">
                          <i className="fas fa-phone-alt mr-1"></i> Uploaded from device
                        </div>
                      )}
                      {extractedVideoAudioFile && !currentSelectedSound?.songId && (
                        <div className="text-[10px] text-green-400 mt-1">
                          <i className="fas fa-film mr-1"></i> Audio extracted from video
                        </div>
                      )}
                      {selectedSound && !selectedUploadedSound && !extractedVideoAudioFile && (
                        <div className="text-[10px] text-[#1877F2] mt-1">
                          <i className="fas fa-music mr-1"></i> Using sound from "Use this sound"
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setIsSoundPickerOpen(true)}
                      className="px-4 py-2 rounded-2xl bg-white/10 border border-white/10 text-xs font-black uppercase tracking-[0.14em]"
                    >
                      {currentSelectedSound || selectedUploadedSound ? 'Change' : 'Pick'}
                    </button>
                  </div>

                  {(currentSelectedSound || selectedUploadedSound) && (
                    <div className="mt-4 grid gap-4">
                      <RangeRow
                        label="Start"
                        value={trimStart}
                        min={0}
                        max={Math.max(trimEnd - 0.5, 0.5)}
                        step={0.1}
                        display={`${trimStart.toFixed(1)}s`}
                        onChange={(v) => setTrimStart(v)}
                      />
                      <RangeRow
                        label="End"
                        value={trimEnd}
                        min={trimStart + 0.5}
                        max={60}
                        step={0.1}
                        display={`${trimEnd.toFixed(1)}s`}
                        onChange={(v) => setTrimEnd(v)}
                      />
                      <button
                        onClick={() => {
                          const sound = {
                            id: selectedUploadedSound?.id || currentSelectedSound?.songId || 'temp',
                            name: selectedUploadedSound?.name || currentSelectedSound?.songName || 'Sound',
                            url: selectedUploadedSound?.url || currentSelectedSound?.audioUrl || '',
                            originalUrl: selectedUploadedSound?.originalUrl || currentSelectedSound?.originalUrl || '',
                            duration: 60,
                            start: trimStart,
                            end: trimEnd,
                            isOriginal: !!selectedUploadedSound,
                            file: selectedUploadedSound?.file
                          };
                          setTrimmingSound(sound as RecorderSoundOption);
                          setIsTrimmerOpen(true);
                        }}
                        className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-[0.14em] hover:bg-white/10 transition-colors"
                      >
                        <i className="fas fa-scissors mr-2"></i>
                        Advanced Trim & Export
                      </button>
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEffectsOpen && (
        <div className="absolute inset-0 z-[10030] bg-black/70 backdrop-blur-sm flex items-end animate-fade-in">
          <div className="w-full max-h-[75vh] rounded-t-[32px] border-t border-white/10 bg-[#0e0e0e] overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <button
                onClick={() => setIsEffectsOpen(false)}
                className="px-4 py-2 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-[0.14em]"
              >
                Close
              </button>

              <div className="text-center">
                <div className="text-[10px] uppercase tracking-[0.24em] font-black text-[#7fb6ff]">Effects</div>
                <div className="text-sm font-black uppercase tracking-[0.14em]">Choose your style</div>
              </div>

              <button
                onClick={() => {
                  setSelectedFilterId('none');
                  setFilterIntensity(0.75);
                }}
                className="px-4 py-2 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-[0.14em]"
              >
                Reset
              </button>
            </div>

            <div className="p-4 border-b border-white/10 flex gap-2 overflow-x-auto scrollbar-hide">
              {FILTER_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-[0.14em] whitespace-nowrap ${
                    filterCategory === cat.id
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white/5 border border-white/10 text-white/70'
                  }`}
                >
                  <i className={`fas ${cat.icon} mr-1 text-[10px]`} />
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(75vh-150px)]">
              <div className="grid grid-cols-4 gap-3">
                {filteredFilters.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => handleFilterSelect(filter.id)}
                    className={`rounded-2xl p-3 border transition-all ${
                      selectedFilterId === filter.id
                        ? 'bg-[#1877F2]/12 border-[#1877F2] scale-105'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    title={filter.description}
                  >
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-2 bg-gradient-to-br from-[#1877F2] to-[#F3425F]"
                      style={{ filter: buildFilterString(filter, 1) }}
                    />
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-center">
                      {filter.name}
                    </div>
                  </button>
                ))}
              </div>

              {selectedFilterId !== 'none' && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">
                      Intensity
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7fb6ff]">
                      {Math.round(filterIntensity * 100)}%
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={filterIntensity}
                    onChange={(e) => setFilterIntensity(Number(e.target.value))}
                    className="w-full"
                    style={{ ['--value-percent' as any]: `${filterIntensity * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSoundPickerOpen && (
        <div className="absolute inset-0 z-[10020] bg-black/85 backdrop-blur-sm flex items-end">
          <div className="w-full max-h-[84vh] rounded-t-[32px] border-t border-white/10 bg-[#0e0e0e] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  stopSoundPreview();
                  setIsSoundPickerOpen(false);
                }}
                className="px-4 py-2 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-[0.14em]"
              >
                Close
              </button>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-[0.24em] font-black text-[#7fb6ff]">Sound Picker</div>
              </div>
              <button
                onClick={() => {
                  onSelectSound?.(null);
                  setSelectedUploadedSound(null);
                  setExtractedVideoAudioFile(null);
                  setTrimStart(0);
                  setTrimEnd(0);
                  setTrimmedAudioFile(null);
                }}
                className="px-4 py-2 rounded-2xl bg-white/8 border border-white/10 text-xs font-black uppercase tracking-[0.14em]"
              >
                Clear
              </button>
            </div>

            <div className="p-4 border-b border-white/10">
              <input
                value={soundSearch}
                onChange={(e) => setSoundSearch(e.target.value)}
                placeholder="Search songs or creators..."
                className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 text-white outline-none"
              />
            </div>

            <div className="overflow-y-auto max-h-[calc(84vh-132px)] p-4 space-y-3">
              <div 
                onClick={() => musicFileInputRef.current?.click()}
                className="bg-gradient-to-br from-[#1877F2]/30 to-[#1877F2]/10 border border-[#1877F2]/40 p-6 rounded-[32px] flex items-center gap-4 cursor-pointer hover:from-[#1877F2]/40 transition-all active:scale-95 shadow-2xl mb-4"
              >
                <div className="w-14 h-14 bg-[#1877F2] rounded-2xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-phone-alt text-white text-2xl"></i>
                </div>
                <div>
                  <p className="font-black text-white text-lg">Upload Music</p>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-1">From your device storage</p>
                </div>
              </div>

              {filteredSounds.length > 0 ? (
                <div className="space-y-3">
                  {filteredSounds.map((sound) => {
                    const selected = currentSelectedSound?.soundKey === sound.soundKey;
                    return (
                      <SoundItem
                        key={String(sound.id)}
                        sound={sound}
                        selected={selected}
                        previewingSoundId={previewingSoundId}
                        onPreview={playSoundPreview}
                        onSelect={handleSoundSelect}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-white/50">
                  <i className="fas fa-music text-4xl mb-4 opacity-50"></i>
                  <p>No sounds found.</p>
                  <p className="text-sm mt-2">Try uploading music from your phone</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isTrimmerOpen && trimmingSound && (
        <AudioTrimmer
          url={trimmingSound.originalUrl || trimmingSound.url}
          onClose={() => setIsTrimmerOpen(false)}
          onConfirm={handleTrimConfirm}
          initialStart={trimStart}
          initialEnd={trimEnd}
          soundId={trimmingSound.id}
          soundName={trimmingSound.name}
          onMountStopAll={() => {
            stopSoundPreview();
          }}
          isOriginal={trimmingSound.isOriginal}
        />
      )}
    </div>
  );
};

// =========================
// SOUND ITEM COMPONENT
// =========================
const SoundItem: React.FC<{
  sound: RecorderSoundOption;
  selected: boolean;
  previewingSoundId: string | number | null;
  onPreview: (sound: RecorderSoundOption) => void;
  onSelect: (sound: RecorderSoundOption) => void;
}> = ({ sound, selected, previewingSoundId, onPreview, onSelect }) => {
  const formatClock = (secs: number) => {
    const safe = Math.max(0, Math.floor(secs || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const formatViewCount = (num?: number): string => {
    const v = Number(num || 0);
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(v);
  };

  return (
    <div className={`rounded-[24px] border p-4 flex items-center gap-4 ${selected ? 'bg-[#1877F2]/12 border-[#1877F2]/40' : 'bg-white/5 border-white/10'}`}>
      {sound.coverImage || sound.creatorImage ? (
        <img
          src={sound.coverImage || sound.creatorImage}
          alt=""
          className="w-14 h-14 rounded-2xl object-cover"
        />
      ) : (
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1877F2] to-[#F3425F] flex items-center justify-center">
          <i className="fas fa-music text-white" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{sound.name}</div>
        <div className="text-white/50 text-xs truncate mt-1">{sound.creatorName || 'Original Sound'}</div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-white/50">
          <span>{formatClock(sound.end && sound.start !== undefined ? sound.end - sound.start : sound.duration || 0)}</span>
          {sound.playCount ? <span>{formatViewCount(sound.playCount)} plays</span> : null}
          {sound.creationCount ? <span>{formatViewCount(sound.creationCount)} uses</span> : null}
          {sound.isOriginal && (
            <span className="text-green-400">
              <i className="fas fa-phone-alt mr-1 text-[8px]"></i>
              Local
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPreview(sound)}
          className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center active:scale-95"
        >
          <i className={`fas ${previewingSoundId === sound.id ? 'fa-pause' : 'fa-play'} text-sm`} />
        </button>
        <button
          onClick={() => onSelect(sound)}
          className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.14em] ${selected ? 'bg-[#1877F2] text-white' : 'bg-white/8 border border-white/10 text-white'}`}
        >
          {selected ? 'Selected' : 'Use'}
        </button>
      </div>
    </div>
  );
};

// =========================
// SMALL UI PARTS
// =========================
const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  return (
    <div className="rounded-[28px] bg-white/5 border border-white/10 p-4 md:p-5">
      <div className="text-xs uppercase tracking-[0.18em] font-black text-[#7fb6ff] mb-4">{title}</div>
      {children}
    </div>
  );
};

const RangeRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, display, onChange }) => {
  const safeMax = Number.isFinite(max) ? max : min + step;
  const safeValue = Math.min(Math.max(value, min), safeMax);
  const percent = safeMax > min ? ((safeValue - min) / (safeMax - min)) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="text-sm font-bold">{label}</div>
        <div className="text-white/60 text-xs font-black uppercase tracking-[0.14em]">{display}</div>
      </div>
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={safeValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ ['--value-percent' as any]: `${percent}%` }}
      />
    </div>
  );
};

// =========================
// STYLES
// =========================
const RECORDER_STYLES = `
.recorder-page .scrollbar-hide::-webkit-scrollbar { display: none; }
.recorder-page .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
.recorder-page * { -webkit-tap-highlight-color: transparent; }

@keyframes slide-up {
  0% { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}

@keyframes fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

@keyframes scale-in {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-scale-in {
  animation: scale-in 0.3s ease-out;
}

.lyric-overlay {
  position: absolute;
  left: 50%;
  width: min(88%, 540px);
  text-align: center;
  padding: 0 10px;
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.lyric-classic {
  color: #fff;
  font-size: clamp(28px, 5vw, 40px);
  text-shadow: 0 3px 18px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.85);
}

.lyric-neon {
  color: #8bc3ff;
  font-size: clamp(30px, 5.4vw, 42px);
  text-shadow:
    0 0 4px rgba(139,195,255,0.9),
    0 0 16px rgba(24,119,242,0.9),
    0 0 32px rgba(24,119,242,0.75),
    0 4px 18px rgba(0,0,0,0.9);
}

.lyric-cinema {
  color: #f8f1d3;
  font-size: clamp(28px, 5vw, 40px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-shadow: 0 4px 20px rgba(0,0,0,0.95), 0 0 2px rgba(255,255,255,0.35);
}

.lyric-glass {
  color: #fff;
  font-size: clamp(26px, 4.8vw, 38px);
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06));
  border: 1px solid rgba(255,255,255,0.2);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}

.lyric-karaoke {
  font-size: clamp(30px, 5.5vw, 44px);
  background: linear-gradient(90deg, #ffffff 0%, #ffffff 38%, #ffd54f 50%, #ffffff 62%, #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 3px 18px rgba(0,0,0,0.9);
  animation: karaokeGlow 2.6s linear infinite;
}

.lyric-outline {
  color: #fff;
  font-size: clamp(30px, 5.3vw, 42px);
  -webkit-text-stroke: 2px rgba(0,0,0,0.85);
  text-shadow: 0 0 16px rgba(0,0,0,0.55);
}

@keyframes karaokeGlow {
  0% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
  100% { filter: brightness(1); }
}

input[type=range] {
  -webkit-appearance: none;
  height: 4px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  background-image: linear-gradient(to right, #1877F2, #2D8CFF);
  background-size: var(--value-percent, 0%) 100%;
  background-repeat: no-repeat;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1877F2;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(24,119,242,0.5);
  border: 2px solid white;
}

input[type=range]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1877F2;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(24,119,242,0.5);
  border: 2px solid white;
}

input[type=range]::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
  border-radius: 2px;
}

input[type=range]::-moz-range-track {
  height: 4px;
  background: transparent;
  border-radius: 2px;
}
`;

export default Recorder;
