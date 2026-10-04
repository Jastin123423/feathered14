import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { User, Reel, ReactionType } from '../types';
import { ShareBottomSheet, topReactionEmojis, formatReactionText, reactionEmoji, apiFetch } from './Feed';
import Filters, { UneraFilter, buildUneraFilterStyle, UneraFilterOverlay } from './filters';
import { VerifiedBadge } from './VerifiedBadge';
import { CommentActionModal, useCommentLongPress } from './CommentActionModal';

// ==================== SHARED BUTTON CLASSES ====================
const reelGlassButton =
  "bg-black/35 backdrop-blur-md border-[2px] border-white/90 text-white shadow-[0_6px_22px_rgba(0,0,0,0.45)] active:scale-95 transition";
const reelIconButton =
  `w-12 h-12 rounded-full flex items-center justify-center ${reelGlassButton}`;
const reelFollowButton =
  "px-5 py-2.5 rounded-xl bg-black/25 backdrop-blur-md border-[2px] border-white/80 text-white font-black text-lg shadow-[0_6px_22px_rgba(0,0,0,0.45)] active:scale-95 transition";

// ==================== MEDIA CACHE SYSTEM (MEMORY-SAFE) ====================
const mediaBlobCache = new Map<string, { blobUrl: string; timestamp: number }>();
const mediaWarmPromises = new Map<string, Promise<string>>();
const CACHE_MAX_SIZE = 10;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchAsBlobUrl(url: string, type: 'video' | 'audio' = 'audio'): Promise<string> {
  if (!url) throw new Error('Missing media URL');

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
    cache: 'force-cache',
    headers: { Accept: '*/*' },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (mediaBlobCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = Array.from(mediaBlobCache.entries()).sort(
          (a, b) => a[1].timestamp - b[1].timestamp
        )[0][0];
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

// ==================== NATIVE DOWNLOAD HELPERS ====================
const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative ||
    (window as any).UNERA_IS_NATIVE_APP ||
    (window as any).flutter_inappwebview
  );
};

const callUneraNative = (payload: any): boolean => {
  if (!isUneraNativeApp()) return false;
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(JSON.stringify(payload));
    return true;
  }
  return false;
};
const shouldUseNativeReelPlayer = (): boolean => { 
  return false; // Temporarily disabled until native full-screen solution is ready
}; 

const sendNativeReelVideo = (payload: any): boolean => { 
  return callUneraNative(payload); 
};

// ==================== CREATE VIDEO THUMBNAIL HELPER ====================
const createVideoThumbnailFromFile = async (file: File): Promise<File> => {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load video metadata'));
    });
    video.currentTime = Math.min(0.5, Math.max(0.1, (video.duration || 1) * 0.15));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 600);
    });
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Thumbnail export failed'))),
        'image/webp',
        0.72
      );
    });
    return new File([blob], `reel-thumb-${Date.now()}.webp`, { type: 'image/webp' });
  } finally {
    URL.revokeObjectURL(url);
  }
};

// ==================== REEL LYRICS HELPERS ====================
const getReelLyricsText = (reel: any) => String(reel.lyricsText || reel.lyrics_text || '').trim();
const getReelLyricsTheme = (reel: any) => String(reel.lyricsTheme || reel.lyrics_theme || 'karaoke');
const reelLyricsEnabled = (reel: any) => {
  const v = reel.lyricsEnabled ?? reel.lyrics_enabled;
  return v === true || v === 1 || v === '1' || v === 'true';
};

// ==================== REEL CAMERA CREATOR ====================
const ReelCameraCreator: React.FC<{
  initialSound?: UseSoundPayload;
  onClose: () => void;
  onDone: (payload: {
    file: File;
    thumbnailFile: File;
    sound?: UseSoundPayload;
    effectId?: string;
  }) => void;
}> = ({ initialSound, onClose, onDone }) => {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [effectId, setEffectId] = useState('none');
  const [showFilters, setShowFilters] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  const stopCamera = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    setCameraReady(false);
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      },
      audio: true,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    setCameraReady(true);
  }, [facingMode, stopCamera]);

  useEffect(() => {
    openCamera().catch((err) => {
      alert(err?.message || 'Camera failed');
      onClose();
    });
    return () => stopCamera();
  }, [openCamera, stopCamera, onClose]);

  const rotateCamera = async () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const startMusic = () => {
    if (!initialSound?.audioUrl) return;
    const audio = new Audio(initialSound.audioUrl);
    audio.currentTime = Number(initialSound.audioStart || 5);
    audio.volume = 0.9;
    audio.muted = false;
    audio.play().catch(() => {});
    musicRef.current = audio;
  };

  const stopMusic = () => {
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stopMusic();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const file = new File([blob], `unera-reel-${Date.now()}.webm`, { type: mimeType });
      const thumbnailFile = await createVideoThumbnailFromFile(file);
      onDone({
        file,
        thumbnailFile,
        sound: initialSound,
        effectId,
      });
      stopCamera();
    };
    startMusic();
    recorder.start(250);
    setIsRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-black text-white overflow-hidden">
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
            cameraReady ? 'opacity-100' : 'opacity-0'
          }`}
          style={buildUneraFilterStyle(effectId)}
        />
        <UneraFilterOverlay filterId={effectId} />
      </div>

      {!cameraReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#18191A]">
          <i className="fas fa-camera text-4xl text-white/80 animate-pulse"></i>
          <p className="mt-4 text-white font-black">Opening camera...</p>
        </div>
      )}

      <div className="absolute top-6 left-4 right-4 z-20 flex items-center justify-between">
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-full bg-black/45 flex items-center justify-center"
        >
          <i className="fas fa-times text-2xl"></i>
        </button>
        {initialSound?.songName && (
          <div className="px-4 h-11 rounded-full bg-black/45 flex items-center gap-2 font-bold max-w-[210px]">
            <i className="fas fa-music"></i>
            <span className="truncate">{initialSound.songName}</span>
          </div>
        )}
        <button
          onClick={rotateCamera}
          className="w-12 h-12 rounded-full bg-black/45 flex items-center justify-center"
        >
          <i className="fas fa-sync-alt text-xl"></i>
        </button>
      </div>

      <div className="absolute right-4 top-[120px] z-20 flex flex-col gap-5">
        <button onClick={rotateCamera} className="w-12 h-12 rounded-full bg-black/35">
          <i className="fas fa-sync-alt text-xl"></i>
        </button>
        <button
          onClick={() => setFlashOn((v) => !v)}
          className="w-12 h-12 rounded-full bg-black/35"
        >
          <i className={`fas ${flashOn ? 'fa-bolt' : 'fa-bolt-lightning'} text-xl`}></i>
        </button>
        <button
          onClick={() => setShowFilters(true)}
          className="w-12 h-12 rounded-full bg-black/35"
          aria-label="Effects"
        >
          <i className="fas fa-wand-magic-sparkles text-xl"></i>
        </button>
      </div>

      <div className="absolute bottom-12 left-0 right-0 z-20 flex flex-col items-center">
        <div className="mb-5 text-white font-black tracking-[0.2em] text-sm">REEL</div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className="w-24 h-24 rounded-full border-[5px] border-white flex items-center justify-center active:scale-95"
        >
          <div
            className={`transition-all ${
              isRecording
                ? 'w-10 h-10 rounded-lg bg-[#F3425F]'
                : 'w-16 h-16 rounded-full bg-[#F3425F]'
            }`}
          />
        </button>
      </div>

      {showFilters && (
        <Filters
          selectedFilterId={effectId}
          onSelectFilter={(filter: UneraFilter) => {
            setEffectId(filter.id);
          }}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
};

// ==================== TYPES ====================
interface Sound {
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
  songId?: string | number | null;
  originalSoundOwnerId?: string | number | null;  // ✅ Added this line
}

type NetworkLevel = 'low' | 'medium' | 'high';

type ReelVideoSources = {
  low?: string;
  medium?: string;
  hd?: string;
};

type UseSoundPayload = {
  songName: string;
  audioUrl: string;
  originalUrl?: string;
  audioStart?: number;
  audioEnd?: number;
  songId?: string | number;
  soundKey?: string;
  isTrimmedAudio?: boolean;
  recordedFile?: File;
  thumbnailFile?: File;
  effectId?: string;
};

// ==================== HELPER: Get reel user ID ====================
const getReelUserId = (reel: any): number => {
  return Number(reel.userId ?? reel.user_id ?? 0);
};

// ==================== NETWORK / QUALITY HELPERS ====================
const getNetworkLevel = (): NetworkLevel => {
  const nav = navigator as any;
  const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;

  if (!conn) return 'medium';

  const effectiveType = String(conn.effectiveType || '').toLowerCase();
  const saveData = Boolean(conn.saveData);

  if (saveData) return 'low';
  if (effectiveType.includes('2g') || effectiveType === 'slow-2g') return 'low';
  if (effectiveType === '3g') return 'medium';
  return 'medium';
};

const getReelVideoSources = (reel: Reel): ReelVideoSources => ({
  low: (reel as any).video_url_low || (reel as any).videoUrlLow || '',
  medium:
    (reel as any).video_url_medium ||
    (reel as any).videoUrlMedium ||
    (reel as any).video_url ||
    (reel as any).videoUrl ||
    '',
  hd: (reel as any).video_url_hd || (reel as any).videoUrlHd || '',
});

const pickBestVideoUrl = (sources: ReelVideoSources, networkLevel: NetworkLevel): string => {
  if (networkLevel === 'low') {
    return sources.low || sources.medium || sources.hd || '';
  }
  return sources.medium || sources.low || sources.hd || '';
};

// ==================== REACTION EMOJIS ====================
const REACTION_EMOJIS = [
  '❤️', '🙏', '👍', '💪', '👀', '😊', '😍', '🤣', '😭', '😂', '😟', '🤑',
  '😝', '😋', '🤧', '😪', '👏', '🤘', '✌️', '🤛', '🤝', '🖕', '🖐', '🙆‍♂️',
  '🤦', '🤷‍♂️', '🫂',
];

// ==================== SPARK REACT ICON ====================
const SparkReactIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="reelSparkGrad" x1="12" y1="52" x2="52" y2="12">
        <stop offset="0%" stopColor="#FF7A45" />
        <stop offset="55%" stopColor="#FF5A6A" />
        <stop offset="100%" stopColor="#FF8A3D" />
      </linearGradient>
      <filter id="reelSparkGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle
      cx="32"
      cy="32"
      r="18"
      fill="url(#reelSparkGrad)"
      opacity="0.14"
    />
    <g
      stroke="url(#reelSparkGrad)"
      strokeWidth="5.2"
      strokeLinecap="round"
      filter="url(#reelSparkGlow)"
    >
      <line x1="32" y1="10" x2="32" y2="18" />
      <line x1="32" y1="46" x2="32" y2="54" />
      <line x1="10" y1="32" x2="18" y2="32" />
      <line x1="46" y1="32" x2="54" y2="32" />
      <line x1="17" y1="17" x2="22.8" y2="22.8" />
      <line x1="41.2" y1="41.2" x2="47" y2="47" />
      <line x1="47" y1="17" x2="41.2" y2="22.8" />
      <line x1="22.8" y1="41.2" x2="17" y2="47" />
    </g>
    <circle cx="32" cy="32" r="6.2" fill="url(#reelSparkGrad)" />
  </svg>
);

// ==================== DISCUSS SIGNAL ICON ====================
const DiscussSignalIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = '#1877F2',
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <g
      fill="none"
      stroke={color}
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 20c0-5 4-9 9-9h18c7 0 13 6 13 13v6c0 7-6 13-13 13H30l-9 7v-7h-1c-6 0-10-4-10-10V20z" />
      <circle cx="27" cy="30" r="2.2" />
      <circle cx="33" cy="30" r="2.2" />
      <circle cx="39" cy="30" r="2.2" />
      <path d="M48 18c3 2 5 5 6 9" />
      <path d="M44 22c2 1 3 3 4 6" />
    </g>
  </svg>
);

// ==================== FORMAT HELPERS ====================
const formatViewCount = (num?: number): string => {
  const v = Number(num || 0);

  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
};

const formatCount = (num: number): string => formatViewCount(num);

// Helper to get first reactor's name
const getFirstReactorName = (reactions: any[], users: User[]): string => {
  if (!reactions || reactions.length === 0) return 'Someone';
  
  const firstReaction = reactions[0];
  const userId = Number(firstReaction.userId ?? firstReaction.user_id);
  const user = users.find(u => Number(u.id) === userId);
  
  if (user?.name) return user.name;
  if (firstReaction.user?.name) return firstReaction.user.name;
  return 'Someone';
};

//===GET REELS THUMBNAIL ====
const getReelThumbnailUrl = (reel: any): string => {
  return (
    reel.thumbnail_url ||
    reel.thumbnailUrl ||
    reel.thumbnail ||
    reel.thumb ||
    reel.mediaMeta?.thumb ||
    reel.nativeVideoMeta?.thumb ||
    ''
  );
};

// ==================== REEL REACTIONS SHEET ====================
const ReelReactionsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  reel: Reel;
  users: User[];
  onProfileClick: (id: number) => void;
}> = ({ isOpen, onClose, reel, users, onProfileClick }) => {
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<string>('all');
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const abortRef = useRef<AbortController | null>(null);
  const reelId = reel.id;

  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    setItems([]);
    setCounts({});
    setActive('all');
    
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    
    (async () => {
      try {
        const token = localStorage.getItem('unera_token');
        const response = await fetch(`/api/reels/${reelId}/reactions?limit=500&offset=0`, {
          signal: abortRef.current?.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        
        const data = await response.json();
        const arr = Array.isArray(data?.reactions) ? data.reactions : [];
        setItems(arr);
        
        const map: Record<string, number> = {};
        for (const r of arr) {
          const t = String(r?.type || 'like').toLowerCase();
          map[t] = (map[t] || 0) + 1;
        }
        setCounts(map);
      } catch (e) {
        // ignore abort
      } finally {
        setLoading(false);
      }
    })();
    
    return () => abortRef.current?.abort();
  }, [isOpen, reelId]);

  if (!isOpen) return null;

  const typesSorted = Object.entries(counts)
    .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
    .map(([t]) => t);

  const filtered = active === 'all'
    ? items
    : items.filter((x) => String(x?.type).toLowerCase() === active);

  const reactionEmojiMap: Record<string, string> = {
    like: '👍',
    love: '❤️',
    haha: '😂',
    wow: '😮',
    sad: '😢',
    angry: '😡',
    fire: '🔥',
    party: '🎉',
    clap: '👏',
    star: '⭐',
    thinking: '🤔',
    crying: '😭',
    heart_eyes: '🥰',
    kiss: '😘',
    sunglasses: '😎',
    rocket: '🚀',
    trophy: '🏆',
    crown: '👑',
    unicorn: '🦄',
    rainbow: '🌈',
    money: '💰',
    muscle: '💪',
    brain: '🧠',
    lightning: '⚡',
    gem: '💎',
  };

  const getReactionEmoji = (type: string): string => {
    return reactionEmojiMap[type.toLowerCase()] || '👍';
  };

  const Tab = ({ t, label, count }: { key?: any; t: string; label: React.ReactNode; count: number }) => (
    <button
      onClick={() => setActive(t)}
      className={`px-3 py-2 text-[17px] font-bold border-b-2 whitespace-nowrap ${
        active === t
          ? 'text-[#1877F2] border-[#1877F2]'
          : 'text-[#B0B3B8] border-transparent'
      }`}
    >
      {label} {count ? <span className="ml-1">{count}</span> : null}
    </button>
  );

  const getReactionUserName = (reaction: any): string => {
    if (reaction.user?.name) return reaction.user.name;
    if (reaction.user?.username) return reaction.user.username;
    if (reaction.name) return reaction.name;
    if (reaction.username) return reaction.username;
    
    const userId = Number(reaction.user_id ?? reaction.userId);
    if (userId) {
      const user = users.find(u => Number(u.id) === userId);
      if (user?.name) return user.name;
      if (user?.username) return user.username;
    }
    
    return 'User';
  };

  const getReactionUserImage = (reaction: any): string => {
    if (reaction.user?.profile_image_url) return reaction.user.profile_image_url;
    if (reaction.user?.avatar) return reaction.user.avatar;
    if (reaction.profile_image_url) return reaction.profile_image_url;
    if (reaction.avatar) return reaction.avatar;
    
    const userId = Number(reaction.user_id ?? reaction.userId);
    if (userId) {
      const user = users.find(u => Number(u.id) === userId);
      if (user?.profile_image_url) return user.profile_image_url;
    }
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(getReactionUserName(reaction))}&background=1877F2&color=fff&bold=true`;
  };

  const getReactionUserId = (reaction: any): number => {
    if (reaction.user?.id) return Number(reaction.user.id);
    if (reaction.user_id) return Number(reaction.user_id);
    if (reaction.userId) return Number(reaction.userId);
    if (reaction.id) return Number(reaction.id);
    return 0;
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-[#18191A] flex flex-col">
      <div className="p-4 border-b border-[#3E4042] flex items-center gap-3 bg-[#242526]">
        <button
          className="w-10 h-10 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center"
          onClick={onClose}
          aria-label="Back"
        >
          <i className="fas fa-arrow-left text-[#E4E6EB] text-xl"></i>
        </button>
        <div className="text-[#E4E6EB] font-bold text-[20px]">
          People who reacted
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#3E4042] bg-[#242526] scrollbar-hide">
        <Tab t="all" label="All" count={items.length} />
        {typesSorted.map((t) => (
          <Tab
            key={t}
            t={t}
            label={<span className="text-[20px]">{getReactionEmoji(t)}</span>}
            count={counts[t] || 0}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-[#B0B3B8] text-center text-[17px]">
            Loading reactions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-[#B0B3B8] text-center text-[17px]">
            No reactions yet.
          </div>
        ) : (
          <div className="p-2">
            {filtered.map((r, idx) => {
              const uid = getReactionUserId(r);
              const name = getReactionUserName(r);
              const img = getReactionUserImage(r);
              const emoji = getReactionEmoji(String(r?.type));
              
              return (
                <button
                  key={String(uid) + '-' + idx}
                  className="w-full flex items-center gap-3 p-3 hover:bg-[#3A3B3C] rounded-xl text-left"
                  onClick={() => uid && onProfileClick(uid)}
                >
                  <div className="relative">
                    <img
                      src={img}
                      className="w-12 h-12 rounded-full object-cover"
                      alt=""
                    />
                    <div className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-[#242526] border border-[#3E4042] flex items-center justify-center text-[16px]">
                      {emoji}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#E4E6EB] font-bold text-[17px] truncate">
                      {name}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== UPDATED REEL REACTION BUTTON ====================
const ReelReactionButton: React.FC<{
  reelId: number;
  hasReacted: boolean;
  reactionCount: number;
  onReact: (reelId: number, type?: ReactionType) => void;
  isLoading?: boolean;
  currentUserReaction?: string | null;
}> = ({ reelId, hasReacted, reactionCount, onReact, isLoading = false, currentUserReaction }) => {
  const [showDock, setShowDock] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewEmoji, setPreviewEmoji] = useState<string>('👍');
  const timerRef = useRef<any>(null);
  const longPressTimerRef = useRef<any>(null);

  const reactionConfig = [
    { type: 'like', icon: '👍', color: '#1877F2', label: 'Like' },
    { type: 'love', icon: '❤️', color: '#F3425F', label: 'Love' },
    { type: 'haha', icon: '😂', color: '#F7B928', label: 'Haha' },
    { type: 'wow', icon: '😮', color: '#F7B928', label: 'Wow' },
    { type: 'sad', icon: '😢', color: '#F7B928', label: 'Sad' },
    { type: 'angry', icon: '😡', color: '#E41E3F', label: 'Angry' },
    { type: 'fire', icon: '🔥', color: '#FF6B35', label: 'Fire' },
    { type: 'party', icon: '🎉', color: '#9C27B0', label: 'Party' },
    { type: 'clap', icon: '👏', color: '#4CAF50', label: 'Clap' },
    { type: 'star', icon: '⭐', color: '#FFD700', label: 'Star' },
    { type: 'thinking', icon: '🤔', color: '#607D8B', label: 'Thinking' },
    { type: 'crying', icon: '😭', color: '#2196F3', label: 'Crying' },
    { type: 'heart_eyes', icon: '🥰', color: '#E91E63', label: 'Heart Eyes' },
    { type: 'kiss', icon: '😘', color: '#FF4081', label: 'Kiss' },
    { type: 'sunglasses', icon: '😎', color: '#00BCD4', label: 'Cool' },
    { type: 'rocket', icon: '🚀', color: '#3F51B5', label: 'Rocket' },
    { type: 'trophy', icon: '🏆', color: '#FF9800', label: 'Trophy' },
    { type: 'crown', icon: '👑', color: '#FFC107', label: 'Crown' },
  ] as const;

  const activeReaction = currentUserReaction
    ? reactionConfig.find((r) => r.type === currentUserReaction)
    : null;

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setShowDock(true), 500);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => setShowDock(false), 250);
    setShowPreview(false);
  };

  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setShowDock(true);
      setShowPreview(true);
      setPreviewEmoji('👍');
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setTimeout(() => setShowPreview(false), 300);
  };

  const handleClick = () => {
    if (hasReacted && currentUserReaction) {
      setIsAnimating(true);
      onReact(reelId, currentUserReaction as ReactionType);
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      setShowDock(!showDock);
    }
  };

  const handleDockReact = (type: string) => {
    setIsAnimating(true);
    onReact(reelId, type as ReactionType);
    setShowDock(false);
    setShowPreview(false);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleEmojiHover = (emoji: string) => {
    if (showPreview) {
      setPreviewEmoji(emoji);
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {showPreview && (
        <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-[#242526] rounded-full shadow-2xl p-3 border border-[#3E4042] z-50 reaction-preview">
          <div className="text-4xl">{previewEmoji}</div>
        </div>
      )}

      {showDock && (
        <div
          className="absolute -top-16 left-0 bg-[#242526] rounded-full shadow-2xl p-2 border border-[#3E4042] z-50 react-pop flex items-center"
        >
          <div className="flex gap-1 overflow-x-auto max-w-[320px] scrollbar-hide px-1 py-1">
            {reactionConfig.map((r) => (
              <div
                key={r.type}
                className="text-3xl react-hover cursor-pointer p-1 rounded-full hover:bg-[#3A3B3C] transition-colors flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDockReact(r.type);
                }}
                onMouseEnter={() => handleEmojiHover(r.icon)}
                title={r.label}
              >
                {r.icon}
              </div>
            ))}
          </div>
        </div>
      )}
    <button
  onClick={handleClick}
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
  disabled={isLoading}
  className={`flex items-center justify-center gap-1 px-4 py-2.5 rounded-full bg-[#1877F2]/20 backdrop-blur-md border-[2px] border-[#1877F2] shadow-[0_8px_24px_rgba(24,119,242,0.35)] active:scale-95 transition-all ${isAnimating ? 'scale-110' : ''} ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
>
  {activeReaction ? (
    <>
      <span className="text-2xl">{activeReaction.icon}</span>
      <span className="text-white text-sm font-bold ml-1 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">{formatViewCount(reactionCount)}</span>
    </>
  ) : (
    <>
      <SparkReactIcon size={24} />
      <span className="text-white text-sm font-bold ml-1 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">{formatViewCount(reactionCount)}</span>
    </>
  )}
</button>
    </div>
  );
};

// ==================== REEL DISCUSS BUTTON ====================
const ReelDiscussButton: React.FC<{
  commentCount: number;
  onClick: () => void;
}> = ({ commentCount, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-full bg-black/20 backdrop-blur-md border-[2px] border-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.55)] active:scale-95 transition-all"
    >
      <DiscussSignalIcon size={24} color="#1877F2" />
      <span className="text-white text-sm font-bold ml-1 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
        {formatViewCount(commentCount)}
      </span>
    </button>
  );
};


// ==================== COMMENTS SHEET ====================

const ReelCommentsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  comments: any[];
  users: User[];
  currentUser: User | null;
  onAddComment: (payload: {
    text: string;
    parentId?: number | null;
    imageFile?: File | null;
  }) => Promise<void> | void;
  onEditComment: (
    commentId: number,
    payload: {
      text?: string;
      imageFile?: File | null;
      image_url?: string;
    }
  ) => Promise<void> | void;
  onDeleteComment: (commentId: number) => Promise<void> | void;
  onProfileClick?: (userId: number) => void;
}> = ({
  isOpen,
  onClose,
  comments: initialComments,
  users,
  currentUser,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onProfileClick,
}) => {
  const COMMENT_EMOJIS = ['😀', '😂', '😍', '🔥', '👏', '❤️', '👍', '🎉', '😮', '😢', '🙌', '🥰'];

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [menuComment, setMenuComment] = useState<any | null>(null);
  const [editingComment, setEditingComment] = useState<any | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<number, string>>({});
  const [comments, setComments] = useState<any[]>(initialComments);

  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync comments when they change
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  useEffect(() => {
    if (isOpen) {
      setTranslateY(0);
      setReplyTo(null);
      setSelectedImage(null);
      setImagePreview(null);
      setShowEmojiBar(false);
      setShowReactionPicker(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      clearTimeout(longPressTimerRef.current);
    };
  }, [imagePreview]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !sheetRef.current) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY > 0) setTranslateY(deltaY);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (translateY > 150) onClose();
    else setTranslateY(0);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmitComment = async () => {
    if (!text.trim() && !selectedImage) return;

    try {
      await Promise.resolve(
        onAddComment({
          text: text.trim(),
          parentId: replyTo?.id || null,
          imageFile: selectedImage,
        })
      );

      setText('');
      setReplyTo(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setSelectedImage(null);
      setImagePreview(null);
      setShowEmojiBar(false);
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const isCommentHidden = (comment: any): boolean => {
    return Boolean(
      comment?.is_hidden ||
      comment?.hidden ||
      comment?.hidden_scope ||
      comment?.hidden_by
    );
  };

  const isOwnerComment = (comment: any) => {
    const commentUserId = Number(comment?.userId ?? comment?.user_id ?? comment?.user?.id ?? 0);
    return commentUserId > 0 && commentUserId === Number(currentUser?.id);
  };

  const isPlatformAdmin = (): boolean => {
    const role = String((currentUser as any)?.role || '').toLowerCase();
    return ['admin', 'superadmin', 'moderator', 'owner'].includes(role);
  };

  const canHideComment = (comment: any): boolean => {
    return isOwnerComment(comment) || isPlatformAdmin();
  };

  const canDeleteComment = (comment: any): boolean => {
    return isOwnerComment(comment) || isPlatformAdmin();
  };

  const { getHandlers: getCommentPressHandlers } = useCommentLongPress((comment: any) => {
    setMenuComment(comment);
  });

  const handleToggleHide = async (comment: any) => {
    if (!currentUser || !comment) return;
    const commentId = comment.id;
    const currentlyHidden = isCommentHidden(comment);
    const nextAction: 'hide' | 'unhide' = currentlyHidden ? 'unhide' : 'hide';

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, is_hidden: !currentlyHidden, hidden_by: !currentlyHidden ? currentUser.id : null }
          : c
      )
    );

    showToast(nextAction === 'hide' ? 'Discussion hidden' : 'Discussion unhidden');

    try {
      await apiFetch(`/api/post-comments/${commentId}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          action: nextAction,
        }),
      });
    } catch (e) {
      console.error(`Failed to ${nextAction} reel comment:`, e);
      showToast(`Failed to ${nextAction} discussion`);
    }
  };

  const handleDeleteComment = async (comment: any) => {
    if (!currentUser || !comment) return;
    const commentId = comment.id;

    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId && c.parent_id !== commentId));
    showToast('Discussion deleted');

    try {
      if (onDeleteComment) {
        await Promise.resolve(onDeleteComment(commentId));
      }
      await apiFetch(`/api/post-comments/${commentId}/delete?user_id=${currentUser.id}`, {
        method: 'DELETE',
      });
    } catch (e: any) {
      console.error('Failed to delete comment:', e);
      showToast('Failed to delete discussion');
    }
  };

  const openEditComment = (comment: any) => {
    setMenuComment(null);
    setEditingComment(comment);
    setEditingText(comment.text || '');
  };

  const saveEditedComment = async () => {
    if (!editingComment) return;

    try {
      await Promise.resolve(
        onEditComment(editingComment.id, {
          text: editingText,
        })
      );
      setEditingComment(null);
      setEditingText('');
    } catch (e: any) {
      alert(e?.message || 'Failed to edit discussion');
    }
  };

  const addReaction = (commentId: number, emoji: string) => {
    setCommentReactions((prev) => ({
      ...prev,
      [commentId]: emoji,
    }));
    setShowReactionPicker(null);
  };

  const insertEmoji = (emoji: string) => setText((prev) => prev + emoji);
  const insertEditEmoji = (emoji: string) => setEditingText((prev) => prev + emoji);

  const getReplies = (commentId: number | string) =>
    comments
      .filter(
        (c: any) =>
          Number(c.parentId ?? c.parent_comment_id ?? c.parent_id) === Number(commentId)
      )
      .sort((a: any, b: any) => {
        const ta = new Date(a.created_at || a.createdAt || 0).getTime();
        const tb = new Date(b.created_at || b.createdAt || 0).getTime();
        return ta - tb;
      });

  const getReplyPreviewText = (count: number) => {
    if (count <= 0) return '';
    if (count === 1) return 'View previous 1 reply';
    return `View previous ${count} replies`;
  };

  if (!isOpen) return null;

  const rootComments = comments.filter(
    (c: any) => !c.parentId && !c.parent_comment_id && !c.parent_id
  );
  const hasComments = comments.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/50 font-sans backdrop-blur-sm"
      style={{ opacity: 1 - translateY / 500 }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 max-w-[450px] mx-auto h-[78vh] bg-[#0B1120] rounded-t-[22px] flex flex-col shadow-2xl transition-transform duration-150 ease-out overflow-hidden"
        style={{ transform: `translateY(${translateY}px)` }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-2 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-[#B0B3B8]/30 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-white/10 flex justify-between items-center bg-[#0B1120] shrink-0">
          <span className="text-[#E4E6EB] font-black text-[15px] uppercase tracking-[2px]">
            {replyTo ? `${comments.length} Replies` : `Video Discussion (${comments.length})`}
          </span>
          {replyTo && (
            <button 
              onClick={() => setReplyTo(null)} 
              className="text-[#1877F2] text-[13px] font-bold"
            >
              Back
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#E4E6EB] active:scale-90 transition-all"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Comments List with Skeleton */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {!hasComments ? (
            <div className="space-y-4 px-2 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-white/10" />
                  <div className="flex-1">
                    <div className="w-40 h-4 rounded-full bg-white/10 mb-2" />
                    <div className="w-28 h-3 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {(replyTo ? [replyTo, ...getReplies(replyTo.id)] : rootComments).map((c: any) => {
                const author = users.find((u: any) => Number(u.id) === Number(c.userId ?? c.user_id));
                const replies = getReplies(c.id);
                const lastReply = replies.length ? replies[replies.length - 1] : null;
                const hiddenRepliesCount = replies.length > 1 ? replies.length - 1 : replies.length;
                const isReply = c.parentId || c.parent_comment_id || c.parent_id;
                const isOwner = isOwnerComment(c);
                const reactionEmoji = commentReactions[c.id];
                const isHidden = isCommentHidden(c);
                const pressHandlers = getCommentPressHandlers(c);

                return (
                  <div key={c.id} className={`group/reelcomment ${isReply ? 'ml-9 pl-2 border-l border-white/10' : ''}`}>
                    <div className="flex gap-3">
                      {/* Avatar */}
                      <img
                        src={author?.profile_image_url || author?.profileImage || 'https://ui-avatars.com/api/?name=User&background=1877F2&color=fff&bold=true'}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                        alt=""
                        onClick={() => {
                          const userId = Number(author?.id);
                          if (userId) onProfileClick?.(userId);
                        }}
                      />

                      {/* Comment Bubble */}
                      <div className="flex-1 min-w-0">
                        <div
                          {...pressHandlers}
                          className={`inline-block max-w-[285px] rounded-[18px] px-3.5 py-2.5 border transition-all cursor-pointer select-none ${
                            isHidden
                              ? 'bg-[#162137]/35 hover:bg-[#1E293B]/45 border-amber-500/30 opacity-75'
                              : 'bg-[#162137]/65 hover:bg-[#1E293B]/70 border-[#1E293B]/60'
                          }`}
                          title="Hold for discussion options"
                        >
                          {/* Name & Options Header */}
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[#F8FAFC] font-bold text-[21px] leading-tight cursor-pointer hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const userId = Number(author?.id);
                                  if (userId) onProfileClick?.(userId);
                                }}
                              >
                                {author?.name || 'User'}
                              </span>
                              {isOwner && (
                                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-white/50 font-bold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isHidden && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                  Hidden
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuComment(c);
                                }}
                                className="opacity-0 group-hover/reelcomment:opacity-100 p-1 text-[#94A3B8] hover:text-[#F8FAFC] rounded-full hover:bg-[#1E293B] transition-opacity"
                                title="Discussion options"
                              >
                                <i className="fas fa-ellipsis-h text-xs" />
                              </button>
                            </div>
                          </div>

                          {/* Comment Text */}
                          <div>
                            {c.text && (
                              <p className={`text-[#CBD5E1] ${isReply ? 'text-[19.5px]' : 'text-[20.5px]'} leading-[1.38] font-normal whitespace-pre-wrap break-words`}>
                                {c.text}
                              </p>
                            )}
                            {(c.image_url || c.imageUrl) && (
                              <img
                                src={c.image_url || c.imageUrl}
                                alt=""
                                className="mt-2 max-w-[200px] rounded-[16px] border border-white/10 object-cover"
                              />
                            )}
                          </div>
                        </div>

                        {/* Actions: Time, Like, Reply */}
                        <div className="flex items-center gap-4 mt-1 ml-2">
                          <span className="text-[#B0B3B8] text-[13px] font-bold">
                            {(() => {
                              const created = c.created_at || c.createdAt;
                              if (!created) return '';
                              const diff = Math.floor((Date.now() - new Date(created).getTime()) / 1000);
                              if (diff < 60) return 'now';
                              if (diff < 3600) return `${Math.floor(diff / 60)}m`;
                              if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
                              if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
                              return `${Math.floor(diff / 2592000)}mo`;
                            })()}
                          </span>

                          {/* Reaction Button with Picker */}
                          <div className="relative">
                            <button
                              onClick={() => setShowReactionPicker(showReactionPicker === c.id ? null : c.id)}
                              className="text-[#B0B3B8] text-[13px] font-bold hover:text-white/70 transition-colors"
                            >
                              {reactionEmoji ? (
                                <span className="text-base">{reactionEmoji}</span>
                              ) : (
                                'Like'
                              )}
                            </button>

                            {showReactionPicker === c.id && (
                              <div className="absolute bottom-full left-0 mb-2 bg-[#242526] rounded-2xl p-2 border border-white/10 shadow-2xl z-50">
                                <div className="flex gap-1 overflow-x-auto max-w-[260px] scrollbar-hide">
                                  {REACTION_EMOJIS.slice(0, 12).map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => addReaction(c.id, emoji)}
                                      className="text-2xl hover:scale-125 transition-transform flex-shrink-0 p-1"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => setReplyTo(c)}
                            className="text-[#B0B3B8] text-[13px] font-bold hover:text-white/70 transition-colors"
                          >
                            Reply
                          </button>

                          {isHidden && (
                            <span className="text-amber-400/90 font-medium text-[11px] inline-flex items-center gap-1">
                              <i className="far fa-eye-slash text-[10px]" />
                              <span>Hidden</span>
                            </span>
                          )}
                        </div>

                        {/* Replies Section */}
                        {!replyTo && replies.length > 0 && (
                          <div className="mt-3">
                            {hiddenRepliesCount > 0 && (
                              <button
                                onClick={() => setReplyTo(c)}
                                className="text-[#1877F2] font-bold text-[13px] hover:opacity-80 transition-opacity"
                              >
                                {getReplyPreviewText(hiddenRepliesCount)}
                              </button>
                            )}

                            {lastReply && (
                              <div className="mt-3 flex gap-3">
                                <img
                                  src={
                                    users.find(
                                      (u: any) => Number(u.id) === Number(lastReply.userId ?? lastReply.user_id)
                                    )?.profile_image_url ||
                                    'https://ui-avatars.com/api/?name=User&background=1877F2&color=fff&bold=true'
                                  }
                                  className="w-7 h-7 rounded-full object-cover shrink-0"
                                  alt=""
                                />
                                <div className="inline-block max-w-[260px] bg-[#162137]/65 hover:bg-[#1E293B]/70 rounded-[18px] px-3.5 py-2 border border-[#1E293B]/60 transition-colors">
                                  <span
                                    className="text-[#F8FAFC] font-bold text-[21px] cursor-pointer hover:underline"
                                    onClick={() => {
                                      const userId = Number(lastReply.userId ?? lastReply.user_id);
                                      if (userId) onProfileClick(userId);
                                    }}
                                  >
                                    {users.find(
                                      (u: any) => Number(u.id) === Number(lastReply.userId ?? lastReply.user_id)
                                    )?.name || 'User'}
                                  </span>
                                  {lastReply.text && (
                                    <p className="text-[#CBD5E1] text-[19.5px] leading-[1.38] font-normal mt-0.5">
                                      {lastReply.text}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comment Input - Facebook/TikTok Style */}
        <div className="p-3 pb-5 border-t border-white/10 bg-[#0B1120] shrink-0">
          {replyTo && (
            <div className="mb-3 flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <span className="text-xs text-white/50 font-bold">Replying to</span>
              <span className="text-xs text-[#1877F2] font-bold">
                @{users.find((u) => Number(u.id) === Number(replyTo.userId ?? replyTo.user_id))?.name || 'User'}
              </span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-white/40 hover:text-white">
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>
          )}

          {imagePreview && (
            <div className="mb-3 relative inline-block">
              <img src={imagePreview} className="h-16 w-16 rounded-xl object-cover border border-white/10" alt="" />
              <button
                onClick={() => {
                  if (imagePreview) URL.revokeObjectURL(imagePreview);
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
              >
                <i className="fas fa-times text-white text-[8px]"></i>
              </button>
            </div>
          )}

          {showEmojiBar && (
            <div className="mb-3 flex flex-wrap gap-2 bg-[#242526] border border-white/10 rounded-2xl p-3">
              {COMMENT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => insertEmoji(emoji)}
                  className="text-2xl leading-none active:scale-90 transition-transform hover:bg-white/10 p-1 rounded-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleImageSelect}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#B0B3B8] hover:bg-white/10 active:scale-95 transition-all"
            >
              <i className="far fa-image text-[22px]" />
            </button>

            <div className="flex-1 flex items-center bg-[#242526] border border-white/10 rounded-full px-4 py-2">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-[#E4E6EB] outline-none text-[15px] placeholder:text-[#B0B3B8]"
                placeholder={replyTo ? 'Write a reply...' : `Comment as ${currentUser?.name || 'User'}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && (text.trim() || selectedImage)) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />

              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#B0B3B8] hover:bg-white/10"
                title="Sticker"
              >
                <i className="far fa-sticky-note text-[18px]" />
              </button>

              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#B0B3B8] hover:bg-white/10"
                title="GIF"
              >
                <span className="text-[10px] font-black border border-[#B0B3B8] rounded px-1 leading-[14px]">
                  GIF
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiBar((prev) => !prev)}
                className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors ${
                  showEmojiBar ? 'text-[#1877F2]' : 'text-[#B0B3B8]'
                }`}
                title="Emoji"
              >
                <i className="far fa-smile text-[20px]" />
              </button>
            </div>

            <button
              onClick={handleSubmitComment}
              disabled={!text.trim() && !selectedImage}
              className="w-10 h-10 rounded-full bg-[#1877F2] disabled:bg-[#3A3B3C] disabled:text-[#777] text-white flex items-center justify-center shadow-[0_8px_20px_rgba(24,119,242,0.35)] active:scale-95 transition-all"
              title="Send"
            >
              <i className="fas fa-arrow-up text-[14px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Discussion Hold Action Modal */}
      {menuComment && (
        <CommentActionModal
          isOpen={Boolean(menuComment)}
          onClose={() => setMenuComment(null)}
          comment={menuComment}
          authorName={
            (users.find((u: any) => Number(u.id) === Number(menuComment.userId ?? menuComment.user_id)) || menuComment.user)?.name ||
            'User'
          }
          authorAvatar={
            (users.find((u: any) => Number(u.id) === Number(menuComment.userId ?? menuComment.user_id)) || menuComment.user)?.profile_image_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent('User')}&background=1877F2&color=fff`
          }
          commentText={String(menuComment.text || '')}
          isHidden={isCommentHidden(menuComment)}
          canHide={canHideComment(menuComment)}
          canDelete={canDeleteComment(menuComment)}
          onToggleHide={handleToggleHide}
          onDelete={handleDeleteComment}
          onReply={(c) => {
            setReplyTo(c);
            inputRef.current?.focus();
          }}
        />
      )}

      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 rounded-full bg-[#1E293B] border border-[#334155] text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Edit Comment Modal */}
      {editingComment && (
        <div className="fixed inset-0 z-[100001] bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full max-w-[450px] mx-auto bg-[#18191A] rounded-t-[22px] border-t border-white/10 p-5 animate-slide-up">
            <div className="w-10 h-1 bg-[#B0B3B8]/30 rounded-full mx-auto mb-4"></div>

            <h3 className="text-[#E4E6EB] text-lg font-black mb-4">Edit Discussion</h3>

            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              className="w-full min-h-[100px] bg-[#242526] border border-white/10 rounded-2xl p-3 text-[#E4E6EB] outline-none text-[15px]"
              placeholder="Update discussion..."
            />

            <div className="mt-3 flex flex-wrap gap-2 bg-[#242526] border border-white/10 rounded-2xl p-2">
              {COMMENT_EMOJIS.slice(0, 8).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => insertEditEmoji(emoji)}
                  className="text-2xl leading-none active:scale-90 transition-transform hover:bg-white/10 p-1 rounded-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setEditingComment(null);
                  setEditingText('');
                }}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-[#E4E6EB] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedComment}
                className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ==================== SOUND DETAIL VIEW ====================
interface SoundDetailViewProps { 
  sound: Sound; 
  onClose: () => void; 
  onReelClick: (id: number) => void; 
  onUseSound?: (sound: Sound) => void;
  onProfileClick?: (userId: number) => void;
}

export const SoundDetailView: React.FC<SoundDetailViewProps> = ({ 
  sound, 
  onClose, 
  onReelClick, 
  onUseSound,
  onProfileClick,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [soundReels, setsoundReels] = useState<Reel[]>([]);
  const [displaySound, setDisplaySound] = useState<Sound>(sound);
  const [soundStats, setSoundStats] = useState({
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalUses: 0,
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<any>(null);
  const previewStopRef = useRef<any>(null);

  useEffect(() => {
    setDisplaySound(sound);
  }, [sound]);

  useEffect(() => {
    const fetchSoundReels = async () => {
      try {
        const soundKey = sound.soundKey || sound.id;
        const response = await fetch(`/api/reels/by-sound?sound_key=${encodeURIComponent(String(soundKey))}&limit=60`);
        const data = await response.json();

        if (data?.success && data.reels) {
          setsoundReels(data.reels);

          const stats = {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalUses: data.reels.length,
          };

          data.reels.forEach((reel: Reel) => {
            stats.totalViews += reel.views || 0;
            stats.totalLikes += reel.reactions?.length || 0;
            stats.totalComments += reel.comments?.length || 0;
            stats.totalShares += reel.shares || 0;
          });

          setSoundStats(stats);

          if (data?.sound) {
            setDisplaySound((prev) => ({
              ...prev,
              name: data.sound.name || data.sound.title || prev.name,
              creator: {
                ...(prev.creator || {}),
                id: Number(data.sound.creator_id || 0),
                name: data.sound.creator_name || 'User',
                username: data.sound.creator_username || '',
                profile_image_url: data.sound.creator_avatar || '',
                is_verified: !!data.sound.creator_verified,
              } as any,
              creationCount: Number(data.sound.total_uses || 0),
              viewCount: Number(data.sound.total_views || 0),
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch sound reels:', error);
        setsoundReels([]);
      }
    };

    fetchSoundReels();
  }, [sound.id, sound.soundKey, sound.url]);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (previewStopRef.current) clearTimeout(previewStopRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const playSoundPreview = () => {
    if (!audioRef.current) return;

    if (previewStopRef.current) clearTimeout(previewStopRef.current);

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    audioRef.current.src = displaySound.url;
    audioRef.current.currentTime = displaySound.start || 0;
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);

    const duration = (displaySound.end || displaySound.duration || 30) - (displaySound.start || 0);
    previewStopRef.current = setTimeout(() => {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = displaySound.start || 0;
      }
    }, Math.min(duration * 1000, 10000));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCount = (num: number): string => {
    if (!num && num !== 0) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-black flex flex-col animate-fade-in font-sans pb-20 overflow-hidden">
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 bg-black/90 backdrop-blur-xl shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <i className="fas fa-chevron-left text-sm"></i>
        </button>
        <h3 className="font-black text-white text-[12px] uppercase tracking-[4px]">Sound Details</h3>
        <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          <i className="fas fa-share-alt text-sm"></i>
        </button>
      </div>

      <div className="p-8 flex flex-col md:flex-row items-center gap-10 bg-gradient-to-b from-white/10 to-transparent shrink-0">
        <div className="relative group">
          <div
            onClick={playSoundPreview}
            className={`w-36 h-36 rounded-full bg-gradient-to-tr from-gray-950 via-gray-900 to-black shadow-[0_0_50px_rgba(0,0,0,0.9)] border-4 border-white/20 flex items-center justify-center ${isPlaying ? 'animate-spin-slow' : ''} cursor-pointer hover:scale-105 transition-transform`}
          >
            <div className="w-12 h-12 rounded-full bg-[#1877F2]/20 border border-white/10 flex items-center justify-center">
              <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-[#1877F2] text-2xl ml-1`}></i>
            </div>
          </div>
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <span className="text-white text-[10px] font-bold">
              {formatDuration(currentTime)} / {formatDuration(displaySound.duration || 30)}
            </span>
          </div>
        </div>

        <div className="flex-1 text-center md:text-left">
          <h2 className="text-3xl font-black text-white mb-2 leading-tight tracking-tighter">
            {displaySound.name}
          </h2>
          
          <div className="flex items-center gap-2 mb-1">
            {displaySound.creator?.profile_image_url && (
              <img 
                src={displaySound.creator.profile_image_url} 
                className="w-6 h-6 rounded-full object-cover" 
                alt="" 
              />
            )}
            <button
              onClick={() => {
                const creatorId = Number(displaySound.creator?.id || 0);
                if (!creatorId) return;
                onProfileClick?.(creatorId);
              }}
              className="text-[#1877F2] font-black text-sm uppercase tracking-widest hover:opacity-80 transition-opacity"
            >
              BY{' '}
              <span className="font-bold text-white">
                {displaySound.creator?.name || 'Original Sound'}
              </span>
              {displaySound.creator?.is_verified && (
                <VerifiedBadge size={14} className="ml-1" />
              )}
            </button>
          </div>

          <p className="text-[#B0B3B8] font-bold text-xs uppercase tracking-[4px] mb-8">
            {formatCount(soundStats.totalUses)} VIRAL CREATIONS • {formatCount(soundStats.totalViews)} VIEWS
          </p>

          <div className="flex gap-3">
            <button
              onClick={playSoundPreview}
              className={`flex-1 px-8 py-4 rounded-2xl font-black text-base border transition-all flex items-center justify-center gap-3 ${
                isPlaying ? 'bg-[#45BD62]/20 text-[#45BD62] border-[#45BD62]' : 'bg-white/10 text-white border-white/20'
              }`}
            >
              <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-sm`}></i>
              {isPlaying ? 'Playing...' : 'Preview'}
            </button>
            <button
              onClick={() => onUseSound?.(displaySound)}
              className="flex-1 px-8 py-4 rounded-2xl font-black text-base border border-[#1877F2] bg-[#1877F2] text-white transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              <i className="fas fa-plus text-sm"></i>
              Use this sound
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 border-t border-white/5">
        <h4 className="text-white font-black text-sm uppercase tracking-widest mb-4">Sound Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[#B0B3B8] text-xs font-bold uppercase tracking-widest">Total Uses</p>
            <p className="text-white text-2xl font-black mt-2">{formatCount(soundStats.totalUses)}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[#B0B3B8] text-xs font-bold uppercase tracking-widest">Total Views</p>
            <p className="text-white text-2xl font-black mt-2">{formatCount(soundStats.totalViews)}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[#B0B3B8] text-xs font-bold uppercase tracking-widest">Total Reactions</p>
            <p className="text-white text-2xl font-black mt-2">{formatCount(soundStats.totalLikes)}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[#B0B3B8] text-xs font-bold uppercase tracking-widest">Duration</p>
            <p className="text-white text-2xl font-black mt-2">{formatDuration(displaySound.duration || 30)}</p>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[#B0B3B8] text-xs font-bold uppercase tracking-widest">Sound Type</p>
            <p className="text-white text-2xl font-black mt-2">
              {displaySound.isOriginal ? 'Original' : 'Shared'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-0.5 mt-4">
        <div className="px-8 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-white font-black text-sm uppercase tracking-widest">
                Videos ({formatCount(soundStats.totalUses)})
              </h4>
              <p className="text-white/40 text-xs mt-1">
                {soundStats.totalUses} videos using this sound • {formatCount(soundStats.totalViews)} total views
              </p>
            </div>
            <div className="text-right">
              <p className="text-[#45BD62] text-xs font-bold">
                {soundStats.totalUses > 0 ? formatCount(Math.floor(soundStats.totalViews / soundStats.totalUses)) : 0} avg views per video
              </p>
            </div>
          </div>
        </div>

        {soundReels.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5">
            {soundReels.map((reel: Reel) => (
              <ReelThumbnail
                key={reel.id}
                reel={reel}
                onClick={() => {
                  onClose();
                  onReelClick(reel.id);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <i className="fas fa-music text-4xl text-[#B0B3B8] mb-4"></i>
            <p className="text-white/60">Be the first to use this sound!</p>
            <p className="text-white/40 text-sm mt-2">No reels are using this sound yet.</p>
          </div>
        )}
      </div>
      <audio ref={audioRef} hidden />
    </div>
  );
};

// ==================== REEL THUMBNAIL COMPONENT ====================
const ReelThumbnail: React.FC<{
  reel: Reel;
  onClick: () => void;
}> = ({ reel, onClick }) => {
  const sources = getReelVideoSources(reel);
  const videoSrc =
    sources.low ||
    sources.medium ||
    sources.hd ||
    (reel as any).video_url ||
    (reel as any).videoUrl ||
    '';
  
  const thumb = getReelThumbnailUrl(reel);

  return (
    <div onClick={onClick} className="aspect-[9/16] bg-white/5 relative cursor-pointer group overflow-hidden">
      {thumb ? (
        <img
          src={thumb}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
          alt=""
        />
      ) : (
        <video
          src={videoSrc}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
          muted
          playsInline
          preload="metadata"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-white text-[10px] font-black bg-black/40 px-2 py-1 rounded-lg backdrop-blur-md">
        <i className="fas fa-eye text-[8px]"></i>
        {formatViewCount(reel.views)}
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center">
          <i className="fas fa-play text-white text-xs"></i>
        </div>
      </div>
    </div>
  );
};

// ==================== REEL OWNER MENU ====================
const ReelOwnerMenu: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ isOpen, onClose, onEdit, onDelete }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 max-w-[450px] mx-auto bg-[#121212] rounded-t-[34px] border-t border-white/10 p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5"></div>

        <button
          onClick={onEdit}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white"
        >
          <div className="w-11 h-11 rounded-full bg-[#1877F2]/15 flex items-center justify-center text-[#1877F2]">
            <i className="fas fa-pen"></i>
          </div>
          <div className="text-left">
            <p className="font-bold text-sm">Edit Reel</p>
            <p className="text-white/50 text-xs">Change caption, location, or visibility</p>
          </div>
        </button>

        <button
          onClick={onDelete}
          className="w-full mt-3 flex items-center gap-4 px-4 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400"
        >
          <div className="w-11 h-11 rounded-full bg-red-500/15 flex items-center justify-center">
            <i className="fas fa-trash-alt"></i>
          </div>
          <div className="text-left">
            <p className="font-bold text-sm">Delete Reel</p>
            <p className="text-red-300/60 text-xs">This cannot be undone</p>
          </div>
        </button>

        <button
          onClick={onClose}
          className="w-full mt-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/80 font-bold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ==================== EDIT REEL MODAL ====================
const EditReelModal: React.FC<{
  reel: Reel | null;
  caption: string;
  location: string;
  visibility: 'public' | 'followers' | 'private';
  saving: boolean;
  setCaption: (v: string) => void;
  setLocation: (v: string) => void;
  setVisibility: (v: 'public' | 'followers' | 'private') => void;
  onClose: () => void;
  onSave: () => void;
}> = ({
  reel,
  caption,
  location,
  visibility,
  saving,
  setCaption,
  setLocation,
  setVisibility,
  onClose,
  onSave,
}) => {
  if (!reel) return null;

  return (
    <div className="fixed inset-0 z-[100001] bg-black/70 backdrop-blur-sm flex items-end">
      <div className="w-full max-w-[450px] mx-auto bg-[#121212] rounded-t-[34px] border-t border-white/10 p-6 animate-slide-up">
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-5"></div>

        <h3 className="text-white font-black text-lg mb-5">Edit Reel</h3>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full min-h-[120px] bg-white/5 border border-white/10 rounded-2xl p-4 text-white outline-none text-[17px]"
          placeholder="Update caption..."
        />

        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 text-white outline-none text-[17px]"
          placeholder="Location"
        />

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'public' | 'followers' | 'private')}
          className="w-full mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 text-white outline-none text-[17px]"
        >
          <option value="public">🌍 Public</option>
          <option value="followers">👥 Followers</option>
          <option value="private">🔒 Private</option>
        </select>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-4 rounded-2xl bg-[#1877F2] text-white font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== REELS FEED ====================
interface ReelsFeedProps {
  reels: Reel[];
  users: User[];
  currentUser: User | null;
  onProfileClick: (id: number) => void;
  onReact: (reelId: number, type?: ReactionType) => void;
  onComment: (
    reelId: number,
    payload: {
      text: string;
      parentId?: number | null;
      imageFile?: File | null;
    }
  ) => Promise<void> | void;
  onEditComment: (
    commentId: number,
    payload: {
      text?: string;
      imageFile?: File | null;
      image_url?: string;
    }
  ) => Promise<void> | void;
  onDeleteComment: (commentId: number) => Promise<void> | void;
  onEditReel: (
    reelId: number,
    payload: {
      caption?: string;
      visibility?: string;
      location?: string;
      thumbnail_url?: string;
    }
  ) => Promise<void> | void;
  onDeleteReel: (reelId: number) => Promise<void> | void;
  onShare: (reelId: number, type: 'feed' | 'copy') => void;
  onFollow: (targetUserId: number) => void;
  checkIsFollowing: (targetUserId: number) => boolean;
  followLoading: { [key: number]: boolean };
  initialReelId?: number | null;
  onBack?: () => void;
  onVideoClick?: (sound?: UseSoundPayload) => void;
  reelPublishing?: boolean;
  reelPublishingProgress?: number;
  reelPublishingText?: string;
}

export const ReelsFeed: React.FC<ReelsFeedProps> = ({
  reels: initialReels,
  users,
  currentUser,
  onProfileClick,
  onReact,
  onComment,
  onEditComment,
  onDeleteComment,
  onEditReel,
  onDeleteReel,
  onShare,
  onFollow,
  checkIsFollowing,
  followLoading = {},
  initialReelId,
  onBack,
  onVideoClick,
  reelPublishing = false,
  reelPublishingProgress = 0,
  reelPublishingText = '',
}) => {

  // ==================== PAGINATION STATE ====================
  const [reels, setReels] = useState<Reel[]>(initialReels);
  const [reelsPage, setReelsPage] = useState(1);
  const [hasMoreReels, setHasMoreReels] = useState(true);
  const [loadingMoreReels, setLoadingMoreReels] = useState(false);
  const loadMoreLockRef = useRef(false);


  
  // ==================== OTHER STATE ====================
  const [activeReelId, setActiveReelId] = useState<number | null>(
    initialReelId || initialReels[0]?.id || null
  );
  const [playingReelId, setPlayingReelId] = useState<number | null>(
    initialReelId || initialReels[0]?.id || null
  );
  const [showComments, setShowComments] = useState(false);
  const [selectedSoundData, setSelectedSoundData] = useState<Sound | null>(null);
  const [showReelMenu, setShowReelMenu] = useState(false);
  const [menuReelId, setMenuReelId] = useState<number | null>(null);
  const [editingReel, setEditingReel] = useState<Reel | null>(null);
  const [editingReelCaption, setEditingReelCaption] = useState('');
  const [editingReelLocation, setEditingReelLocation] = useState('');
  const [editingReelVisibility, setEditingReelVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [savingReelEdit, setSavingReelEdit] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null);
  const [reactingReelId, setReactingReelId] = useState<number | null>(null);
  const [reelProgress, setReelProgress] = useState<Record<number, number>>({});
  
  // New states for reactions sheet and share sheet
  const [showReactionsSheet, setShowReactionsSheet] = useState(false);
  const [selectedReelForReactions, setSelectedReelForReactions] = useState<Reel | null>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [selectedReelForShare, setSelectedReelForShare] = useState<Reel | null>(null);

  // Download states with progress
  const [downloadingReelId, setDownloadingReelId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<number, number>>({});

  const [networkLevel, setNetworkLevel] = useState<NetworkLevel>(getNetworkLevel());
  const [resolvedVideoUrls, setResolvedVideoUrls] = useState<Record<number, string>>({});
  const [resolvedAudioUrls, setResolvedAudioUrls] = useState<Record<number, string>>({});
  const [videoErrors, setVideoErrors] = useState<Record<number, boolean>>({});

  // ==================== CHROME VISIBILITY STATES ====================
  const [chromeVisible, setChromeVisible] = useState(true);
  const [creatorLockPaused, setCreatorLockPaused] = useState(false);
  const chromeTimerRef = useRef<any>(null);

  // ==================== REFS ====================
//==================== FEED SEED FOR RANDOMIZATION ====================

  const feedSeedRef = useRef<number>(
  Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100000)
);
  
  const pendingPlayTimeoutRef = useRef<any>(null);
  
  const viewedReelsRef = useRef<Set<number>>(new Set());
  const preloadLinksRef = useRef<Map<string, HTMLLinkElement>>(new Map());
  const bufferingTimeoutsRef = useRef<Record<number, any>>({});
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioSyncCleanupRef = useRef<(() => void) | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const userInteractedRef = useRef(false);
  const warmupTimerRef = useRef<any>(null);
  const playRequestRef = useRef(0);


  const activeIndex = useMemo(
    () => reels.findIndex((r) => r.id === activeReelId),
    [reels, activeReelId]
  );




// ==================== LOAD MORE REELS (SILENT INFINITE SCROLL) ====================


const normalizeReel = useCallback((reel: any): Reel => {
  return {
    ...reel,
    id: Number(reel.id),
    userId: Number(reel.userId ?? reel.user_id),
    views: Number(reel.views ?? 0),
    shares: Number(reel.shares ?? 0),
    reactions: reel.reactions || [],
    comments: reel.comments || [],
    created_at: reel.created_at || reel.createdAt,
  };
}, []);

const apiFetch = useCallback(async (url: string) => {
  const token = localStorage.getItem('unera_token');

  const res = await fetch(url, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}, []);

const loadMoreReels = useCallback(async () => {
  if (loadMoreLockRef.current) return;
  if (!hasMoreReels) return;

  loadMoreLockRef.current = true;
  setLoadingMoreReels(true);

  try {
    const nextPage = reelsPage + 1;
    const viewerId = currentUser?.id || 0;

    const data = await apiFetch(
      `/api/reels?viewerId=${viewerId}&page=${nextPage}&limit=10&seed=${feedSeedRef.current}`
    );

    const nextItems = Array.isArray(data)
      ? data
      : Array.isArray(data?.reels)
      ? data.reels
      : [];

    if (nextItems.length === 0) {
      setHasMoreReels(false);
      return;
    }

    setReels((prev) => {
      const seen = new Set(prev.map((r: any) => Number(r.id)));

      const fresh = nextItems.filter(
        (r: any) => !seen.has(Number(r.id))
      );

      if (fresh.length === 0) {
        console.warn('No fresh reels returned for page', nextPage, {
          received: nextItems.map((x: any) => x.id),
        });

        // Do not stop infinite scroll here.
        // Backend may return some duplicates because ranking is mixed.
        return prev;
      }

      return [...prev, ...fresh.map(normalizeReel)];
    });

    setReelsPage(nextPage);

    const nextVideos = nextItems
      .slice(0, 3)
      .map((reel: any) => {
        const sources = getReelVideoSources(reel);
        return pickBestVideoUrl(sources, networkLevel);
      });

    nextVideos.forEach((url: string) => {
      if (url) {
        fetchAsBlobUrl(url, 'video').catch(() => {});
      }
    });

    // ✅ Only stop when backend sends less than requested limit
    if (nextItems.length < 10) {
      setHasMoreReels(false);
    }
  } catch (e) {
    console.warn('Load more reels failed:', e);
  } finally {
    setLoadingMoreReels(false);
    loadMoreLockRef.current = false;
  }
}, [
  reelsPage,
  hasMoreReels,
  apiFetch,
  normalizeReel,
  networkLevel,
  currentUser?.id,
]);




// ✅ TRIGGER LOAD MORE - depends on activeIndex
useEffect(() => {
  if (loadingMoreReels) return;
  if (!hasMoreReels) return;
  if (reels.length < 6) return;
  if (activeIndex < 0) return;

  const remaining = reels.length - activeIndex - 1;

  if (remaining <= 6) {
    loadMoreReels();
  }
}, [activeIndex, reels.length, loadingMoreReels, hasMoreReels, loadMoreReels]);

// ✅ INITIAL FETCH EFFECT - When initialReels is empty
useEffect(() => {
  let cancelled = false;

  const fetchInitialReels = async () => {
    try {
      const viewerId = currentUser?.id || 0;

      const data = await apiFetch(
        `/api/reels?viewerId=${viewerId}&page=1&limit=10&seed=${feedSeedRef.current}`
      );

      const fetchedReels = Array.isArray(data)
        ? data
        : Array.isArray(data?.reels)
        ? data.reels
        : [];

      if (cancelled) return;

      const normalized = fetchedReels.map(normalizeReel);

      setReels(normalized);
      setReelsPage(1);
      setHasMoreReels(fetchedReels.length >= 10);

      if (normalized.length > 0) {
        const firstId = Number(normalized[0].id);
        setActiveReelId(firstId);
        setPlayingReelId(firstId);
        activeIdRef.current = firstId;
      }
    } catch (e) {
      console.warn('Failed to fetch initial reels:', e);
    }
  };

  if (!Array.isArray(initialReels) || initialReels.length === 0) {
    fetchInitialReels();
  }

  return () => {
    cancelled = true;
  };
}, [currentUser?.id, apiFetch, normalizeReel, initialReels.length]);
  

  // ==================== DOWNLOAD HANDLER WITH PROGRESS ====================
  const handleDownloadReel = useCallback(async (reel: Reel) => {
    if (downloadingReelId === reel.id) return;
    const sources = getReelVideoSources(reel);
    const url = resolvedVideoUrls[reel.id] || sources.hd || sources.medium || sources.low || (reel as any).video_url || (reel as any).videoUrl || '';
    if (!url) return;
    
    setDownloadingReelId(reel.id);
    setDownloadProgress(prev => ({ ...prev, [reel.id]: 1 }));
    
    try {
      if (isUneraNativeApp()) {
        callUneraNative({
          action: 'download_file',
          url,
          fileName: `unera-reel-${reel.id}.mp4`,
          folder: 'UNERA',
          source: 'reel',
          id: reel.id,
        });
        return;
      }
      
      const res = await fetch(url);
      const total = Number(res.headers.get('content-length') || 0);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Download reader unavailable');
      
      const chunks: Uint8Array[] = [];
      let received = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            const percent = Math.min(99, Math.round((received / total) * 100));
            setDownloadProgress(prev => ({ ...prev, [reel.id]: percent }));
          }
        }
      }
      
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `unera-reel-${reel.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      setDownloadProgress(prev => ({ ...prev, [reel.id]: 100 }));
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setTimeout(() => {
        setDownloadingReelId(null);
        setDownloadProgress(prev => {
          const next = { ...prev };
          delete next[reel.id];
          return next;
        });
      }, 1000);
    }
  }, [downloadingReelId, resolvedVideoUrls]);

  // Native download progress listener
  useEffect(() => {
    const onNativeProgress = (e: any) => {
      const id = Number(e.detail?.id || 0);
      const progress = Number(e.detail?.progress || 0);
      if (!id) return;
      setDownloadingReelId(id);
      setDownloadProgress(prev => ({ ...prev, [id]: progress }));
      if (progress >= 100) {
        setTimeout(() => {
          setDownloadingReelId(null);
          setDownloadProgress(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, 900);
      }
    };
    window.addEventListener('uneraNativeDownloadProgress', onNativeProgress);
    return () => {
      window.removeEventListener('uneraNativeDownloadProgress', onNativeProgress);
    };
  }, []);

  // ==================== CHROME HELPER ====================
  const showChromeTemporarily = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(() => {
      setChromeVisible(false);
    }, 2600);
  }, []);

  // ==================== HELPER FUNCTIONS ====================
  
  const truncateName = (name?: string, max = 9) => {
    const value = String(name || '');
    if (value.length <= max) return value;
    return value.slice(0, max) + '...';
  };
  
  const extractSoundFromReel = useCallback(
    (reel: Reel): Sound => {
      const author = users.find(
        (u: User) => Number(u.id) === getReelUserId(reel)
      );

      const rawSoundKey =
        (reel as any).soundKey ||
        (reel as any).sound_key ||
        '';

      const soundKey =
        rawSoundKey && rawSoundKey !== 'original:none'
          ? rawSoundKey
          : `original:${reel.id}`;

      const fallbackVideoUrl =
        resolvedVideoUrls[reel.id] ||
        (reel as any).video_url ||
        (reel as any).videoUrl ||
        (reel as any).video_url_medium ||
        (reel as any).videoUrlMedium ||
        '';

      const audioUrl = String(
        reel.audioUrl ||
          (reel as any).audio_url ||
          fallbackVideoUrl ||
          ''
      ).trim();

      const songName =
        reel.songName ||
        (reel as any).song_name ||
        'Original Sound';

      const audioStart = Number(
        reel.audioStart ??
          (reel as any).audio_start ??
          0
      );

      const audioEnd = Number(
        reel.audioEnd ??
          (reel as any).audio_end ??
          0
      );

      const realSongId =
        (reel as any).songId ??
        (reel as any).song_id ??
        null;

      const originalOwnerId =
        (reel as any).original_sound_owner_id ??
        (reel as any).originalSoundOwnerId ??
        null;

      return {
        id: soundKey,
        songId: realSongId,
        name: songName,
        url: audioUrl,
        originalUrl: audioUrl,
        start: Number.isFinite(audioStart) ? audioStart : 0,
        end: Number.isFinite(audioEnd) ? audioEnd : 0,
        creator: author,
        creationCount: 0,
        duration: Number.isFinite(audioEnd) && audioEnd > 0 ? audioEnd : 30,
        isOriginal: String(soundKey).startsWith('original:'),
        soundKey,
        originalSoundOwnerId: originalOwnerId,
      } as any;
    },
    [users, resolvedVideoUrls]
  );

  const buildUseSoundPayload = useCallback((sound: Sound): UseSoundPayload => {
    return {
      songName: sound.name || 'Original Sound',
      audioUrl: sound.originalUrl || sound.url || '',
      originalUrl: sound.originalUrl || sound.url || '',
      audioStart: sound.start || 0,
      audioEnd: sound.end || sound.duration || 0,
      songId: sound.songId ?? undefined,
      soundKey: sound.soundKey || `sound:${sound.id}`,
      isTrimmedAudio: false,
    };
  }, []);

  const addPreloadLink = useCallback((href: string) => {
    if (!href || preloadLinksRef.current.has(href)) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = href;
    document.head.appendChild(link);
    preloadLinksRef.current.set(href, link);

    setTimeout(() => {
      const existing = preloadLinksRef.current.get(href);
      if (existing) {
        existing.remove();
        preloadLinksRef.current.delete(href);
      }
    }, 5000);
  }, []);

  const resolveReelMedia = useCallback(
    async (reel: Reel) => {
      const id = reel.id;
      const audioUrl = reel.audioUrl || (reel as any).audio_url || '';
      try {
        const videoSources = getReelVideoSources(reel);
        const pickedVideoUrl = pickBestVideoUrl(videoSources, networkLevel);
        if (pickedVideoUrl && !resolvedVideoUrls[id]) {
          setResolvedVideoUrls((prev) => (prev[id] ? prev : { ...prev, [id]: pickedVideoUrl }));
        }
        if (audioUrl && !resolvedAudioUrls[id]) {
          const cachedAudio = mediaBlobCache.get(audioUrl);
          if (cachedAudio) {
            setResolvedAudioUrls((prev) => (prev[id] ? prev : { ...prev, [id]: cachedAudio.blobUrl }));
          } else {
            const blobUrl = await fetchAsBlobUrl(audioUrl, 'audio');
            setResolvedAudioUrls((prev) => (prev[id] ? prev : { ...prev, [id]: blobUrl }));
          }
        }
      } catch (err) {
        console.warn('Failed to resolve reel media', err);
      }
    },
    [networkLevel, resolvedVideoUrls, resolvedAudioUrls]
  );

  const warmReelMedia = useCallback(
    async (reel: Reel) => {
      try {
        const videoSources = getReelVideoSources(reel);
        const pickedVideoUrl = pickBestVideoUrl(videoSources, networkLevel);
        const audioUrl = reel.audioUrl || (reel as any).audio_url || '';
        if (pickedVideoUrl) {
          addPreloadLink(pickedVideoUrl);
        }
        if (audioUrl) {
          await fetchAsBlobUrl(audioUrl, 'audio');
        }
      } catch (err) {
        console.warn('Failed to warm reel media', err);
      }
    },
    [networkLevel, addPreloadLink]
  );

  const unloadFarVideos = useCallback(
    (activeId: number) => {
      const currentIndex = reels.findIndex((r) => r.id === activeId);
      if (currentIndex === -1) return;

      reels.forEach((reel, index) => {
        const video = videoRefs.current[reel.id];
        if (!video) return;

        const distance = Math.abs(index - currentIndex);
        if (distance > 2) {
          try {
            video.pause();
            video.muted = true;
            video.removeAttribute('src');
            video.load();
          } catch (err) {
            console.warn('Failed to unload video', err);
          }
        }
      });
    },
    [reels]
  );

  const waitUntilPlayable = useCallback((video: HTMLVideoElement) => {
    return new Promise<void>((resolve) => {
      if (video.readyState >= 3) {
        resolve();
        return;
      }

      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        resolve();
      };

      video.addEventListener('canplay', onCanPlay, { once: true });
      setTimeout(resolve, 2500);
    });
  }, []);

  const incrementViewCount = useCallback(async (reelId: number) => {
    if (viewedReelsRef.current.has(reelId)) return;

    try {
      viewedReelsRef.current.add(reelId);

      const token = localStorage.getItem('unera_token');
      const response = await fetch(`/api/reels/${reelId}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (data.success && data.views_count !== undefined) {
        console.log(`View count updated for reel ${reelId}: ${data.views_count}`);
      }
    } catch (error) {
      console.error('Failed to increment view count:', error);
      viewedReelsRef.current.delete(reelId);
    }
  }, []);

  const stopAudio = useCallback(() => {
    Object.values(videoRefs.current).forEach((video: any) => {
      if (!video) return;
      try {
        video.pause();
      } catch {}
    });
  }, []);

  // ==================== SOUNDTRACK HELPERS ====================
  const stopSoundtrack = useCallback(() => {
    if (audioSyncCleanupRef.current) {
      audioSyncCleanupRef.current();
      audioSyncCleanupRef.current = null;
    }
    if (shouldUseNativeReelPlayer()) {
      sendNativeReelVideo({ action: 'pause_native_reel_video' });
    }
    const audio = globalAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch {}
  }, []);

  const startSoundtrackForReel = useCallback(
    (id: number) => {
      if (audioSyncCleanupRef.current) {
        audioSyncCleanupRef.current();
        audioSyncCleanupRef.current = null;
      }

      const reel = reels.find((r) => r.id === id);
      const video = videoRefs.current[id];
      const audio = globalAudioRef.current;

      if (!reel || !video || !audio) return;
      if (!userInteractedRef.current) return;

      const soundtrackUrl =
        resolvedAudioUrls[id] || reel.audioUrl || (reel as any).audio_url || '';

      if (!soundtrackUrl) return;

      const start = Number(reel.audioStart || (reel as any).audio_start || 0);
      const end = Number(reel.audioEnd || (reel as any).audio_end || 0);

      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        audio.currentTime = 0;
      } catch {}

      try {
        video.muted = true;
        video.volume = 0;
      } catch {}

      audio.src = soundtrackUrl;
      audio.preload = 'auto';
      audio.loop = false;

      const syncAudio = () => {
        if (video.paused) {
          try {
            audio.pause();
          } catch {}
          return;
        }

        const targetTime = video.currentTime + start;

        if (end > start && targetTime >= end) {
          try {
            video.currentTime = 0;
            audio.currentTime = start;
          } catch {}
          return;
        }

        if (Math.abs(audio.currentTime - targetTime) > 0.35) {
          try {
            audio.currentTime = targetTime;
          } catch {}
        }

        if (audio.paused) {
          audio.play().catch((err) => {
            console.warn('External soundtrack resume failed:', err);
          });
        }
      };

      video.addEventListener('timeupdate', syncAudio);

      audioSyncCleanupRef.current = () => {
        video.removeEventListener('timeupdate', syncAudio);

        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          audio.currentTime = 0;
        } catch {}
      };

      try {
        audio.currentTime = start;
        audio.play().catch((err) => {
          console.warn('External soundtrack failed:', err);
        });
      } catch (err) {
        console.warn('External soundtrack start failed:', err);
      }
    },
    [reels, resolvedAudioUrls]
  );

  const stopActivePlayback = useCallback(() => {
    if (pendingPlayTimeoutRef.current) {
      clearTimeout(pendingPlayTimeoutRef.current);
      pendingPlayTimeoutRef.current = null;
    }
    if (shouldUseNativeReelPlayer()) {
      sendNativeReelVideo({ action: 'stop_native_reel_video' });
    }
    Object.values(videoRefs.current).forEach((video: any) => {
      if (!video) return;
      try {
        video.pause();
        video.muted = true;
        video.volume = 0;
      } catch {}
    });
    stopSoundtrack();
  }, [stopSoundtrack]);

  const playOnly = useCallback(
    async (id: number) => {
      const requestId = ++playRequestRef.current;

      Object.entries(videoRefs.current).forEach(([key, video]: [string, any]) => {
        if (!video) return;

        const rid = Number(key);

        if (rid !== id) {
          try {
            video.pause();
            video.currentTime = 0;
            video.muted = true;
            video.volume = 0;
          } catch {}
        }
      });

      stopSoundtrack();

      const reel = reels.find((r) => r.id === id);
      const video = videoRefs.current[id];

      if (!reel || !video) return;

      const hasExternalSound = !!(
        reel.audioUrl ||
        (reel as any).audio_url
      );

      if (hasExternalSound) {
        try {
          video.muted = true;
          video.volume = 0;
        } catch {}
      }

      setVideoErrors((prev) => ({ ...prev, [id]: false }));

      await resolveReelMedia(reel);

      if (playRequestRef.current !== requestId) return;

      const chosenUrl =
        resolvedVideoUrls[id] ||
        pickBestVideoUrl(getReelVideoSources(reel), networkLevel);

      if (shouldUseNativeReelPlayer()) {
        if (!chosenUrl) return;

        Object.values(videoRefs.current).forEach((v: any) => {
          if (!v) return;

          try {
            v.pause();
            v.muted = true;
            v.volume = 0;
          } catch {}
        });

        stopSoundtrack();

        setActiveReelId(id);
        setPlayingReelId(id);
        activeIdRef.current = id;

        sendNativeReelVideo({
          action: 'play_native_reel_video',
          reelId: id,
          url: chosenUrl,
          poster:
            (reel as any).thumbnail_url ||
            (reel as any).thumbnail ||
            '',
          muted: hasExternalSound,
          loop: true,
        });

        incrementViewCount(id);
        return;
      }

      if (chosenUrl && video.getAttribute('src') !== chosenUrl) {
        try {
          video.muted = hasExternalSound ? true : video.muted;
          video.volume = hasExternalSound ? 0 : video.volume;
          video.src = chosenUrl;
          video.load();
        } catch {}
      }

      unloadFarVideos(id);

      setActiveReelId(id);
      setPlayingReelId(id);
      activeIdRef.current = id;

      try {
        if (hasExternalSound) {
          video.muted = true;
          video.volume = 0;
        }

        await waitUntilPlayable(video);

        if (playRequestRef.current !== requestId) return;

        if (hasExternalSound) {
          video.muted = true;
          video.volume = 0;
        } else if (userInteractedRef.current) {
          video.muted = false;
          video.volume = 1;
        } else {
          video.muted = true;
          video.volume = 0;
        }

        await video.play();

        if (hasExternalSound && userInteractedRef.current) {
          startSoundtrackForReel(id);
        }

        incrementViewCount(id);
      } catch (err) {
        console.warn('Autoplay/play failed', err);
      }
    },
    [
      reels,
      resolveReelMedia,
      resolvedVideoUrls,
      networkLevel,
      unloadFarVideos,
      waitUntilPlayable,
      incrementViewCount,
      stopSoundtrack,
      startSoundtrackForReel,
    ]
  );

  const scrollToReelByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= reels.length) return;
      const nextReel = reels[index];
      if (!nextReel) return;

      if (pendingPlayTimeoutRef.current) {
        clearTimeout(pendingPlayTimeoutRef.current);
        pendingPlayTimeoutRef.current = null;
      }

      const el = document.querySelector(`[data-reel-id="${nextReel.id}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      setActiveReelId(nextReel.id);
      setPlayingReelId(nextReel.id);

      pendingPlayTimeoutRef.current = setTimeout(() => {
        playOnly(nextReel.id);
      }, 40);
    },
    [reels, playOnly]
  );

  const goToNextReel = useCallback(() => {
    if (activeIndex < reels.length - 1) {
      scrollToReelByIndex(activeIndex + 1);
    }
  }, [activeIndex, reels.length, scrollToReelByIndex]);

  const goToPreviousReel = useCallback(() => {
    if (activeIndex > 0) {
      scrollToReelByIndex(activeIndex - 1);
    }
  }, [activeIndex, scrollToReelByIndex]);

  // Updated: Open gallery creator, not camera directly
  const handleCreateReelClick = useCallback(() => {
    setCreatorLockPaused(true);
    stopActivePlayback();
    onVideoClick?.();
  }, [onVideoClick, stopActivePlayback]);

  const handleVideoClick = useCallback(
    (reelId: number) => {
      showChromeTemporarily();
      setCreatorLockPaused(false);
      userInteractedRef.current = true;
      
      if (shouldUseNativeReelPlayer()) {
        if (activeIdRef.current === reelId) {
          sendNativeReelVideo({ action: 'pause_native_reel_video' });
          setPlayingReelId(null);
          activeIdRef.current = null;
          return;
        }
        playOnly(reelId);
        return;
      }

      const video = videoRefs.current[reelId];
      if (!video) return;
      
      if (activeIdRef.current === reelId) {
        if (video.paused) {
          video.play().then(() => {
            const reel = reels.find((r) => r.id === reelId);
            const hasExternalSound = !!(reel?.audioUrl || (reel as any)?.audio_url);
            if (hasExternalSound) {
              video.muted = true;
              video.volume = 0;
              startSoundtrackForReel(reelId);
            } else {
              video.muted = false;
              video.volume = 1;
            }
          }).catch(() => {});
        } else {
          video.pause();
          stopSoundtrack();
        }
        return;
      }
      playOnly(reelId);
    },
    [playOnly, reels, startSoundtrackForReel, stopSoundtrack, showChromeTemporarily]
  );

  // New Handlers for Reactions Sheet and Share
  const handleOpenReactions = useCallback((reel: Reel) => {
    setSelectedReelForReactions(reel);
    setShowReactionsSheet(true);
  }, []);

  const handleOpenShare = useCallback((reel: Reel) => {
    setSelectedReelForShare(reel);
    setShowShareSheet(true);
  }, []);

  const handleShareComplete = useCallback(async (destination: string, data?: any) => {
    if (data?.success && selectedReelForShare) {
      onShare(selectedReelForShare.id, 'feed');
    }
    setShowShareSheet(false);
    setSelectedReelForShare(null);
  }, [selectedReelForShare, onShare]);

  const handleUseSoundFromReel = useCallback(
    (reel: Reel) => {
      const sound = extractSoundFromReel(reel);

      const videoUrl =
        resolvedVideoUrls[reel.id] ||
        (reel as any).video_url ||
        (reel as any).videoUrl ||
        (reel as any).video_url_medium ||
        (reel as any).videoUrlMedium ||
        '';

      const audioUrl = String(
        sound.originalUrl ||
          sound.url ||
          (reel as any).audio_url ||
          (reel as any).audioUrl ||
          videoUrl ||
          ''
      ).trim();

      if (!audioUrl) {
        alert('This sound is not ready yet. Please try another reel.');
        return;
      }

      const payload: UseSoundPayload = {
        songName: sound.name || 'Original Sound',
        audioUrl,
        originalUrl: audioUrl,
        audioStart: Number(sound.start || 0),
        audioEnd: Number(sound.end || sound.duration || 0),
        songId: sound.songId ?? undefined,
        soundKey:
          sound.soundKey ||
          (sound.songId ? `song:${sound.songId}` : `original:${reel.id}`),
        isTrimmedAudio: false,
      };

      setCreatorLockPaused(true);
      stopActivePlayback();
      onVideoClick?.(payload);
    },
    [
      extractSoundFromReel,
      resolvedVideoUrls,
      stopActivePlayback,
      onVideoClick,
    ]
  );

  const handleSoundClick = useCallback(
    (reel: Reel) => {
      const sound = extractSoundFromReel(reel);
      setSelectedSoundData(sound);
    },
    [extractSoundFromReel]
  );

  const openEditReel = useCallback(() => {
    const reel = reels.find((r) => Number(r.id) === Number(menuReelId));
    if (!reel) return;

    setEditingReel(reel);
    setEditingReelCaption(reel.caption || '');
    setEditingReelLocation((reel as any).location || '');
    setEditingReelVisibility(((reel as any).visibility || 'public') as 'public' | 'followers' | 'private');
    setShowReelMenu(false);
  }, [reels, menuReelId]);

  const handleSaveReelEdit = useCallback(async () => {
    if (!editingReel) return;

    try {
      setSavingReelEdit(true);
      await Promise.resolve(
        onEditReel(editingReel.id, {
          caption: editingReelCaption,
          location: editingReelLocation,
          visibility: editingReelVisibility,
        })
      );
      setEditingReel(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to update reel');
    } finally {
      setSavingReelEdit(false);
    }
  }, [editingReel, editingReelCaption, editingReelLocation, editingReelVisibility, onEditReel]);

  const handleDeleteOwnedReel = useCallback(async () => {
    if (!menuReelId) return;

    const ok = window.confirm('Delete this reel?');
    if (!ok) return;

    try {
      await Promise.resolve(onDeleteReel(menuReelId));
      setShowReelMenu(false);
      setMenuReelId(null);
    } catch (e: any) {
      alert(e?.message || 'Failed to delete reel');
    }
  }, [menuReelId, onDeleteReel]);

  const handleReaction = useCallback((reelId: number, emoji: string) => {
    if (reactingReelId === reelId) return;
    setReactingReelId(reelId);
    onReact(reelId, emoji as any);
    setTimeout(() => setReactingReelId(null), 300);
    setShowReactionPicker(null);
  }, [onReact, reactingReelId]);

  const activeReel = reels.find((r) => Number(r.id) === Number(activeReelId));

  // ==================== EFFECTS ====================
  
  // Chrome timer cleanup
  useEffect(() => {
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const nav = navigator as any;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    if (!conn?.addEventListener) return;

    const handleChange = () => {
      const next = getNetworkLevel();
      setNetworkLevel(next);
      setResolvedVideoUrls({});
    };

    conn.addEventListener('change', handleChange);
    return () => conn.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    return () => {
      preloadLinksRef.current.forEach((link) => link.remove());
      preloadLinksRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(bufferingTimeoutsRef.current).forEach((t: any) => {
        if (t) clearTimeout(t);
      });
    };
  }, []);

  // Improved warm preload
  useEffect(() => {
    if (!activeReelId || reels.length === 0) return;

    const currentIndex = reels.findIndex((r) => r.id === activeReelId);
    if (currentIndex === -1) return;

    if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);

    warmupTimerRef.current = setTimeout(() => {
      const targets = [
        reels[currentIndex],
        reels[currentIndex + 1],
        reels[currentIndex + 2],
        reels[currentIndex + 3],
        reels[currentIndex - 1],
      ].filter(Boolean) as Reel[];

      targets.forEach((targetReel) => {
        warmReelMedia(targetReel);
        resolveReelMedia(targetReel);
      });
    }, 80);

    return () => {
      if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
    };
  }, [activeReelId, reels, warmReelMedia, resolveReelMedia]);

  useEffect(() => {
    if (!activeReelId) return;
    const reel = reels.find((r) => r.id === activeReelId);
    if (reel) resolveReelMedia(reel);
  }, [activeReelId, reels, resolveReelMedia]);

  useEffect(() => {
    activeIdRef.current = playingReelId;
  }, [playingReelId]);

  useEffect(() => {
    if (!initialReelId || reels.length === 0) return;

    const timer = setTimeout(() => {
      playOnly(initialReelId);
      const el = document.querySelector(`[data-reel-id="${initialReelId}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 100);

    return () => clearTimeout(timer);
  }, [initialReelId, reels, playOnly]);

  // Unlock effect
  useEffect(() => {
    const unlock = () => {
      userInteractedRef.current = true;
      const id = activeIdRef.current ?? activeReelId;
      if (!id) return;
      const video = videoRefs.current[id];
      const reel = reels.find((r) => r.id === id);
      if (!video || !reel) return;

      const hasExternalSound = !!(reel.audioUrl || (reel as any).audio_url);

      if (hasExternalSound) {
        video.muted = true;
        video.volume = 0;
        if (video.paused) {
          video.play().catch(() => {});
        }
        startSoundtrackForReel(id);
      } else {
        video.muted = false;
        video.volume = 1;
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [activeReelId, reels, startSoundtrackForReel]);

  useEffect(() => {
    const rootEl = scrollerRef.current;
    if (!rootEl) return;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let best: { id: number; ratio: number } | null = null;

        entries.forEach((entry) => {
          const id = Number(entry.target.getAttribute('data-reel-id'));
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { id, ratio: entry.intersectionRatio };
          }
        });

        if (best && best.ratio > 0.6 && activeIdRef.current !== best.id) {
          playOnly(best.id);
        }
      },
      {
        root: rootEl,
        threshold: [0.4, 0.6, 0.8],
      }
    );

    const els = rootEl.querySelectorAll('[data-reel-id]');
    els.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [reels, playOnly]);

  // Pause when comments open
  useEffect(() => {
    if (!showComments) return;
    if (shouldUseNativeReelPlayer()) {
      sendNativeReelVideo({ action: 'pause_native_reel_video' });
      return;
    }
    const activeId = activeIdRef.current;
    if (activeId) {
      const video = videoRefs.current[activeId];
      if (video) {
        try {
          video.pause();
        } catch {}
      }
    }
    stopSoundtrack();
  }, [showComments, stopSoundtrack]);

  // Resume after comments close
  useEffect(() => {
    if (showComments) return;
    if (creatorLockPaused) return;
    const activeId = activeIdRef.current;
    if (!activeId) return;
    if (shouldUseNativeReelPlayer()) {
      sendNativeReelVideo({ action: 'resume_native_reel_video' });
      return;
    }
    const video = videoRefs.current[activeId];
    const reel = reels.find((r) => r.id === activeId);
    if (!video || !reel) return;

    const hasExternalSound = !!(reel.audioUrl || (reel as any).audio_url);

    if (hasExternalSound) {
      video.muted = true;
      video.volume = 0;
    } else if (userInteractedRef.current) {
      video.muted = false;
      video.volume = 1;
    } else {
      video.muted = true;
      video.volume = 0;
    }

    video.play().then(() => {
      if (hasExternalSound && userInteractedRef.current) {
        startSoundtrackForReel(activeId);
      }
    }).catch(() => {});
  }, [showComments, reels, startSoundtrackForReel, creatorLockPaused]);

  // Visibility change effect
  useEffect(() => {
    const stopPlayback = () => {
      if (shouldUseNativeReelPlayer()) {
        sendNativeReelVideo({ action: 'pause_native_reel_video' });
      }
      Object.values(videoRefs.current).forEach((video: any) => {
        if (!video) return;
        try {
          video.pause();
        } catch {}
      });
      stopSoundtrack();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPlayback();
      } else if (!creatorLockPaused && !showComments && activeIdRef.current) {
        if (shouldUseNativeReelPlayer()) {
          sendNativeReelVideo({ action: 'resume_native_reel_video' });
          return;
        }
        const id = activeIdRef.current;
        const video = videoRefs.current[id];
        const reel = reels.find((r) => r.id === id);
        if (video && reel) {
          const hasExternalSound = !!(reel.audioUrl || (reel as any)?.audio_url);
          if (hasExternalSound) {
            video.muted = true;
            video.volume = 0;
          } else if (userInteractedRef.current) {
            video.muted = false;
            video.volume = 1;
          } else {
            video.muted = true;
            video.volume = 0;
          }
          video.play().then(() => {
            if (hasExternalSound && userInteractedRef.current) {
              startSoundtrackForReel(id);
            }
          }).catch(() => {});
        }
      }
    };
    const handlePageHide = () => {
      stopPlayback();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showComments, reels, startSoundtrackForReel, stopSoundtrack, creatorLockPaused]);

  useEffect(() => {
    if (selectedSoundData) {
      const activeId = activeIdRef.current;
      if (activeId) {
        const video = videoRefs.current[activeId];
        if (video) {
          try {
            video.pause();
          } catch {}
        }
      }
      stopSoundtrack();
    }
  }, [selectedSoundData, stopSoundtrack]);

  useEffect(() => {
    if (!showReelMenu && !editingReel) return;
    if (shouldUseNativeReelPlayer()) {
      sendNativeReelVideo({ action: 'pause_native_reel_video' });
      return;
    }
    const activeId = activeIdRef.current;
    if (activeId) {
      const video = videoRefs.current[activeId];
      if (video) {
        try {
          video.pause();
        } catch {}
      }
    }
    stopSoundtrack();
  }, [showReelMenu, editingReel, stopSoundtrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopActivePlayback();
    };
  }, [stopActivePlayback]);

  // Before unload stop
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopActivePlayback();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stopActivePlayback]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showComments || selectedSoundData || showReelMenu || editingReel) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        goToNextReel();
      }

      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goToPreviousReel();
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (activeReelId) handleVideoClick(activeReelId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showComments,
    selectedSoundData,
    showReelMenu,
    editingReel,
    goToNextReel,
    goToPreviousReel,
    activeReelId,
    handleVideoClick,
  ]);

  // ==================== RENDER ====================
  return (
    <div
      className={`fixed inset-0 z-[99999] overflow-hidden font-sans ${
        shouldUseNativeReelPlayer() ? 'bg-transparent' : 'bg-black'
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Hidden audio element for external soundtrack */}
      <audio ref={globalAudioRef} hidden preload="metadata" playsInline />

      {/* PUBLISHING PROGRESS BAR - Just below the top header */}
      {reelPublishing && (
        <div 
          className="absolute left-4 right-4 z-[100001] rounded-2xl bg-[#242526]/95 border border-white/10 shadow-2xl overflow-hidden"
          style={{ top: 'calc(max(env(safe-area-inset-top), 16px) + 96px)' }}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1877F2]/15 flex items-center justify-center">
              <i className="fas fa-cloud-upload-alt text-[#1877F2] text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-black truncate">
                {reelPublishingText || 'Publishing your reel...'}
              </div>
              <div className="text-white/50 text-[11px] font-bold mt-0.5">
                {Math.round(reelPublishingProgress || 0)}%
              </div>
            </div>
          </div>
          <div className="h-[3px] bg-white/10">
            <div 
              className="h-full bg-[#1877F2] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, reelPublishingProgress || 0))}%` }}
            />
          </div>
        </div>
      )}

      {/* Facebook-style back button - UPDATED with reelGlassButton class */}
      <button
        onClick={() => {
          if (shouldUseNativeReelPlayer()) {
            sendNativeReelVideo({ action: 'stop_native_reel_video' });
          }
          if (onBack) onBack();
          else window.history.back();
        }}
        className={reelIconButton + " fixed top-[max(env(safe-area-inset-top),18px)] left-4 z-[10020] shadow-[0_6px_22px_rgba(0,0,0,0.45)]"}
        aria-label="Back"
      >
        <i className="fas fa-chevron-left text-2xl font-black" />
      </button>

      {/* Top right buttons - hide/show with chrome visibility */}
      <div
        className={`fixed top-[max(env(safe-area-inset-top),18px)] right-4 z-[10010] flex items-center gap-4 transition-all duration-300 ${
          chromeVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        {/* Create/Plus button - UPDATED with reelIconButton class */}
        <button
          onClick={handleCreateReelClick}
          className={reelIconButton}
          aria-label="Create reel"
        >
          <i className="fas fa-plus text-white text-xl" />
        </button>

        {/* Download button - UPDATED with reelIconButton class */}
        <button
          onClick={() => handleDownloadReel(activeReel!)}
          className={`${reelIconButton} relative`}
          aria-label="Download reel"
          disabled={downloadingReelId === activeReel?.id}
        >
          {downloadingReelId === activeReel?.id ? (
            <>
              <i className="fas fa-spinner fa-spin text-white text-base" />
              <span className="absolute -bottom-5 text-[10px] text-white font-bold">
                {downloadProgress[activeReel?.id] ? `${downloadProgress[activeReel?.id]}%` : ''}
              </span>
            </>
          ) : (
            <i className="fas fa-download text-white text-base" />
          )}
        </button>

        {/* Menu button (ellipsis) - UPDATED with reelIconButton class */}
        <button
          onClick={() => {
            const reel = reels.find((r) => Number(r.id) === Number(activeReelId));
            if (!reel) return;
            const ownerId = Number((reel as any).userId ?? (reel as any).user_id);
            if (ownerId !== Number(currentUser?.id)) return;
            setMenuReelId(reel.id);
            setShowReelMenu(true);
          }}
          className={reelIconButton}
        >
          <i className="fas fa-ellipsis-h text-white text-base" />
        </button>
      </div>

      <div className="w-full h-full">
        <div
          ref={scrollerRef}
          onScroll={() => {
            setChromeVisible(false);
          }}
          className={`reel-video-shell w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide ${
            shouldUseNativeReelPlayer() ? 'bg-transparent' : 'bg-black'
          }`}
        >
          {reels.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white p-8">
              <div className="w-24 h-24 rounded-full bg-[#1877F2]/10 flex items-center justify-center mb-6">
                <i className="fas fa-video text-3xl text-[#1877F2]"></i>
              </div>
              <h3 className="text-xl font-black mb-2">No Reels Yet</h3>
              <p className="text-[#B0B3B8] text-sm mb-8 text-center">No reels available right now.</p>
            </div>
          ) : (
            reels.map((reel: Reel, reelIndex) => {
              const author = users.find((u: User) => Number(u.id) === getReelUserId(reel));
              if (!author) return null;

              const isFollowing = checkIsFollowing(Number(author.id));
              const isLoadingFollow = !!followLoading[Number(author.id)];
              const hasReacted = reel.reactions?.some(
                (r) => Number(r.userId ?? r.user_id) === Number(currentUser?.id)
              );
              const isReacting = reactingReelId === reel.id;
              const currentUserReaction = reel.reactions?.find(
                (r) => Number(r.userId ?? r.user_id) === Number(currentUser?.id)
              )?.type;

              // Get first reactor's name for the reaction text
              const firstReactorName = getFirstReactorName(reel.reactions || [], users);

              const videoSources = getReelVideoSources(reel);
              const fallbackVideoUrl = pickBestVideoUrl(videoSources, networkLevel);
              const videoUrl = resolvedVideoUrls[reel.id] || fallbackVideoUrl;
              const isNearActive = Math.abs(reelIndex - activeIndex) <= 1;
              const showError = activeReelId === reel.id && videoErrors[reel.id];

              return (
                <div
                  key={reel.id}
                  id={`reel-${reel.id}`}
                  data-reel-id={reel.id}
                  onContextMenu={(e) => e.preventDefault()}
                  className="relative h-[100dvh] w-full snap-start bg-black overflow-hidden"
                >
                  {/* Strong black video stage - UPDATED video wrapper */}
                  <div className="relative h-full w-full bg-black overflow-hidden">
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current[reel.id] = el;
                      }}
                      src={shouldUseNativeReelPlayer() ? undefined : isNearActive ? videoUrl : undefined}
                      poster={getReelThumbnailUrl(reel)}
                      preload={isNearActive ? 'auto' : 'metadata'}
                      playsInline
                      loop
                      controls={false}
                      disablePictureInPicture
                      controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
                      // Updated video className with cinematic opacity
                      className="absolute inset-0 h-full w-full object-cover bg-black opacity-[0.96]"
                      style={{
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        backgroundColor: shouldUseNativeReelPlayer() ? 'transparent' : 'black',
                      }}
                      muted={playingReelId !== reel.id}
                      draggable={false}
                      tabIndex={-1}
                      onContextMenu={(e) => e.preventDefault()}
                      onTimeUpdate={(e) => {
                        const video = e.currentTarget;
                        const duration = video.duration || 0;
                        const current = video.currentTime || 0;
                        const progress = duration > 0 ? Math.min(current / duration, 1) : 0;
                        setReelProgress((prev) => {
                          if (prev[reel.id] === progress) return prev;
                          return { ...prev, [reel.id]: progress };
                        });
                      }}
                      onLoadStart={() => {
                        if (bufferingTimeoutsRef.current[reel.id]) {
                          clearTimeout(bufferingTimeoutsRef.current[reel.id]);
                        }
                        setVideoErrors((prev) => ({ ...prev, [reel.id]: false }));
                      }}
                      onWaiting={() => {
                        if (bufferingTimeoutsRef.current[reel.id]) {
                          clearTimeout(bufferingTimeoutsRef.current[reel.id]);
                        }
                      }}
                      onStalled={() => {}}
                      onCanPlay={() => {}}
                      onCanPlayThrough={() => {}}
                      onPlaying={() => {}}
                      onSeeked={() => {}}
                      onError={() => {
                        setVideoErrors((prev) => ({ ...prev, [reel.id]: true }));
                      }}
                    />

                    {/* ADDED: Stronger video gradient overlays */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/18 via-transparent to-black/18" />

                    {/* Lyrics overlay */}
                    {reelLyricsEnabled(reel) && getReelLyricsText(reel) && (
                      <div className="absolute inset-0 pointer-events-none z-20">
                        <div className={`reel-lyrics-overlay reel-lyrics-${getReelLyricsTheme(reel)}`}>
                          {getReelLyricsText(reel)
                            .split('\n')
                            .map((line, idx) => (
                              <div key={idx}>{line || '\u00A0'}</div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    <div
                      className="absolute inset-0 z-10"
                      onClick={() => handleVideoClick(reel.id)}
                      onContextMenu={(e) => e.preventDefault()}
                      onTouchStart={(e) => {
                        if (e.touches.length > 1) e.preventDefault();
                      }}
                    />

                    {showError && (
                      <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3 px-5 py-4 rounded-2xl bg-black/55 border border-white/10">
                          <i className="fas fa-exclamation-triangle text-yellow-400 text-xl"></i>
                          <p className="text-white text-sm font-bold">Video failed to load</p>
                          <button
                            onClick={() => playOnly(reel.id)}
                            className="px-4 py-2 rounded-xl bg-[#1877F2] text-white text-sm font-bold"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="absolute left-0 right-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20 pb-6 px-4 pointer-events-none">
                      <div className="mb-4 pointer-events-auto">
                        <div className="flex items-center gap-3 mb-2">
                          <img
                            src={author.profile_image_url || author.profileImage}
                            className="w-10 h-10 rounded-full border-2 border-white/30 object-cover cursor-pointer shrink-0"
                            alt=""
                            onClick={() => onProfileClick(author.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="text-white font-bold text-[22px] cursor-pointer hover:underline truncate"
                                onClick={() => onProfileClick(author.id)}
                              >
                                {truncateName(author.name, 9)}
                              </span>
                              {author.is_verified && (
                                <VerifiedBadge size={16} className="shrink-0" />
                              )}
                              {currentUser?.id !== author.id && (
                                // UPDATED: Follow button with reelFollowButton class
                                <button
                                  onClick={() => onFollow(author.id)}
                                  disabled={isLoadingFollow}
                                  className={reelFollowButton + " ml-2 shrink-0"}
                                >
                                  {isLoadingFollow ? '...' : isFollowing ? 'Following' : 'Follow'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {!!reel.caption && (
                          <p className="text-white text-[22px] leading-snug line-clamp-2 mb-2">
                            {reel.caption}
                          </p>
                        )}

                        <div className="pointer-events-auto">
                          <div
                            className="flex items-center gap-2 text-white/90 text-[22px] cursor-pointer w-fit"
                            onClick={() => handleSoundClick(reel)}
                          >
                            <i className="fas fa-music text-[#1877F2]" />
                            <span className="font-semibold truncate max-w-[200px]">
                              {reel.songName || (reel as any).song_name || 'Original Sound'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleUseSoundFromReel(reel)}
                            className="mt-2 px-4 py-2 rounded-full bg-[#1877F2] text-white text-xs font-black uppercase tracking-[0.12em] active:scale-95 transition-all"
                          >
                            Use this sound
                          </button>
                        </div>
                      </div>

                      {/* Reaction count with emoji display - SHOWING ACTUAL NAME */}
                      {reel.reactions && reel.reactions.length > 0 && (
                        <div 
                          className="mt-2 px-2 cursor-pointer hover:opacity-80 transition-opacity pointer-events-auto mb-3"
                          onClick={() => handleOpenReactions(reel)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {topReactionEmojis(reel.reactions, 2).map((emoji, i) => (
                                <span
                                  key={i}
                                  className="w-[24px] h-[24px] rounded-full bg-[#3A3B3C] border border-[#242526] flex items-center justify-center text-[16px]"
                                  style={{ zIndex: 10 - i }}
                                >
                                  {emoji}
                                </span>
                              ))}
                            </div>
                            <span className="text-white/70 text-sm font-medium">
                              {reel.reactions.length === 1 
                                ? `${formatCount(reel.reactions.length)} · ${firstReactorName}`
                                : `${formatCount(reel.reactions.length)} · ${firstReactorName} and ${formatCount(reel.reactions.length - 1)} other${reel.reactions.length - 1 !== 1 ? 's' : ''}`
                              }
                            </span>
                          </div>
                        </div>
                      )}

    <div className="flex items-center justify-around py-2 pointer-events-auto">
  <ReelReactionButton
    reelId={reel.id}
    hasReacted={hasReacted || false}
    reactionCount={reel.reactions?.length || 0}
    currentUserReaction={currentUserReaction}
    onReact={onReact}
    isLoading={isReacting}
  />

  <ReelDiscussButton
    commentCount={reel.comments?.length || 0}
    onClick={() => {
      setActiveReelId(reel.id);
      setShowComments(true);
    }}
  />

  {/* Share button */}
<button
  onClick={() => handleOpenShare(reel)}
  className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-full bg-black/20 backdrop-blur-md border-[2px] border-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.55)] active:scale-95 transition-all"
>
  <i className="fas fa-share text-lg text-white" />
  <span className="text-white text-sm font-bold ml-1 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
    {formatCount(reel.shares || 0)}
  </span>
</button>
</div>

                      {/* Progress bar below action buttons */}
                      <div className="mt-2 px-1 pointer-events-none">
                        <div className="w-full h-[3px] bg-white/20 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-white rounded-full transition-[width] duration-100 ease-linear" 
                            style={{ width: `${(reelProgress[reel.id] || 0) * 100}%` }} 
                          />
                        </div>
                      </div>
                    </div>

                    {!shouldUseNativeReelPlayer() && playingReelId === reel.id && videoRefs.current[reel.id]?.paused && (
                      <div
                        className="absolute inset-0 flex items-center justify-center cursor-pointer z-30"
                        onClick={() => handleVideoClick(reel.id)}
                      >
                        <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20">
                          <i className="fas fa-play text-white text-2xl ml-1"></i>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {activeReelId && (
        <ReelCommentsSheet
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          comments={reels.find((r: any) => r.id === activeReelId)?.comments || []}
          users={users}
          currentUser={currentUser}
          onAddComment={(payload) => onComment(activeReelId, payload)}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
          onProfileClick={onProfileClick}
        />
      )}

      {/* Reactions Sheet - Using ReelReactionsSheet */}
      {selectedReelForReactions && (
        <ReelReactionsSheet
          isOpen={showReactionsSheet}
          onClose={() => {
            setShowReactionsSheet(false);
            setSelectedReelForReactions(null);
          }}
          reel={selectedReelForReactions}
          users={users}
          onProfileClick={onProfileClick}
        />
      )}

      {/* Share Bottom Sheet */}
      {selectedReelForShare && (
        <ShareBottomSheet
          isOpen={showShareSheet}
          onClose={() => {
            setShowShareSheet(false);
            setSelectedReelForShare(null);
          }}
          post={{
            id: selectedReelForShare.id,
            author: users.find(u => u.id === getReelUserId(selectedReelForShare)),
            content: selectedReelForShare.caption,
            media_url: selectedReelForShare.thumbnail_url || selectedReelForShare.videoUrl,
            created_at: selectedReelForShare.created_at,
            source: 'reel',
            item_type: 'reel',
            reel_id: selectedReelForShare.id,
          }}
          currentUser={currentUser}
          users={users}
          groups={[]}
          brands={[]}
          chats={[]}
          onShareComplete={handleShareComplete}
        />
      )}

      {selectedSoundData && (
        <SoundDetailView
          sound={selectedSoundData}
          onClose={() => setSelectedSoundData(null)}
          onReelClick={(id) => {
            setSelectedSoundData(null);
            playOnly(id);
          }}
          onUseSound={(sound) => {
            const payload = buildUseSoundPayload(sound);
            stopActivePlayback();
            setSelectedSoundData(null);
            onVideoClick?.(payload);
          }}
          onProfileClick={onProfileClick}  
        />
      )}

      <ReelOwnerMenu
        isOpen={showReelMenu}
        onClose={() => {
          setShowReelMenu(false);
          setMenuReelId(null);
        }}
        onEdit={openEditReel}
        onDelete={handleDeleteOwnedReel}
      />

      <EditReelModal
        reel={editingReel}
        caption={editingReelCaption}
        location={editingReelLocation}
        visibility={editingReelVisibility}
        saving={savingReelEdit}
        setCaption={setEditingReelCaption}
        setLocation={setEditingReelLocation}
        setVisibility={setEditingReelVisibility}
        onClose={() => setEditingReel(null)}
        onSave={handleSaveReelEdit}
      />
    </div>
  );
};

// ==================== STYLES ====================
const styles = `
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

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 20s linear infinite;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.reel-video-shell,
.reel-video-shell * {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.reel-video-shell video {
  pointer-events: none;
}

.reel-container {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.reel-lyrics-overlay {
  position: absolute;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  width: min(88%, 540px);
  text-align: center;
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: -0.02em;
  padding: 0 10px;
}
.reel-lyrics-classic {
  color: #fff;
  font-size: clamp(28px, 5vw, 42px);
  text-shadow: 0 3px 18px rgba(0,0,0,0.95);
}
.reel-lyrics-neon {
  color: #8bc3ff;
  font-size: clamp(30px, 5.4vw, 44px);
  text-shadow: 0 0 8px rgba(24,119,242,0.95), 0 4px 18px rgba(0,0,0,0.95);
}
.reel-lyrics-cinema {
  color: #f8f1d3;
  font-size: clamp(28px, 5vw, 40px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-shadow: 0 4px 20px rgba(0,0,0,0.95);
}
.reel-lyrics-glass {
  color: #fff;
  font-size: clamp(26px, 4.8vw, 38px);
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  backdrop-filter: blur(12px);
  border-radius: 24px;
  padding: 14px 16px;
}
.reel-lyrics-karaoke {
  font-size: clamp(30px, 5.5vw, 44px);
  color: #fff;
  text-shadow: 0 3px 18px rgba(0,0,0,0.95);
}
.reel-lyrics-outline {
  color: #fff;
  font-size: clamp(30px, 5.3vw, 42px);
  -webkit-text-stroke: 2px rgba(0,0,0,0.85);
  text-shadow: 0 0 16px rgba(0,0,0,0.55);
}
`;

if (typeof document !== 'undefined' && !document.getElementById('reels-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'reels-styles';
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

// ==================== EXPORTS ====================
export {
  fetchAsBlobUrl,
  formatViewCount,
  getNetworkLevel,
  getReelVideoSources,
  pickBestVideoUrl,
  ReelCameraCreator,
  shouldUseNativeReelPlayer,
  sendNativeReelVideo,
  isUneraNativeApp,
  callUneraNative,
};

export type { 
  Sound, 
  NetworkLevel, 
  ReelVideoSources, 
  UseSoundPayload 
};

export default ReelsFeed;
