import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Song, AudioTrack, User, ReactionType } from '../types';
import { VerifiedBadge } from './VerifiedBadge';
import { PostUploadProgressBanner, PostUploadState } from './PostUploadProgress';
import {
  getCachedComments,
  setCachedComments,
  addCachedComment,
  updateCachedComment,
  removeCachedComment,
  getCachedSongs,
  setCachedSongs,
} from '../utils/dataCache';
import { CommentActionModal, useCommentLongPress } from './CommentActionModal';
import { PostMenu } from './Post/PostMenu';
import { apiFetch, shareSong } from '../utils/api';

/* =========================================================
   CONSTANTS & DEFAULTS
========================================================= */
const DEFAULT_MUSIC_COVER = 'https://media.unera.social/task_01kftb3024ed7bm84gy6j485fh_1769336848_img_0.webp';

/* =========================================================
   NATIVE APP DETECTION & HELPERS (WORKING VERSION)
========================================================= */

// Global reference for tracking pending upload type
let pendingUploadTypeRef: 'audio' | 'cover' | 'album_track_audio' | 'album_track_cover' | null = null;
export const setPendingUploadType = (type: 'audio' | 'cover' | 'album_track_audio' | 'album_track_cover' | null) => {
  pendingUploadTypeRef = type;
};

export const getPendingUploadType = () => pendingUploadTypeRef;

// Detect if running in UNERA Native App
const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative || 
    (window as any).UNERA_IS_NATIVE_APP ||
    (window as any).ReactNativeWebView ||
    navigator.userAgent.includes('UneraApp')
  );
};

// Open native FILE PICKER for audio (NOT recorder!)
const openNativeAudioPicker = (): boolean => {
  console.log('📱 Opening native AUDIO FILE PICKER...');
  
  if (!isUneraNativeApp()) return false;
  
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ 
        action: 'pick_file',
        fileType: 'audio',
        mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac']
      })
    );
    return true;
  }
  
  if ((window as any).ReactNativeWebView?.postMessage) {
    (window as any).ReactNativeWebView.postMessage(
      JSON.stringify({ 
        action: 'pick_file',
        fileType: 'audio',
        mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg']
      })
    );
    return true;
  }
  
  return false;
};

// Open native image picker for cover art
const openNativeImagePicker = (): boolean => {
  console.log('📱 Opening native IMAGE picker...');
  
  if (!isUneraNativeApp()) return false;
  
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ 
        action: 'pick_image',
        type: 'image/*',
        allowMultiple: false 
      })
    );
    return true;
  }
  
  if ((window as any).ReactNativeWebView?.postMessage) {
    (window as any).ReactNativeWebView.postMessage(
      JSON.stringify({ 
        action: 'pick_image',
        type: 'image/*',
        allowMultiple: false 
      })
    );
    return true;
  }
  
  return false;
};

/* =========================================================
   SPARK REACT ICON (same as Feed.tsx)
========================================================= */
const SparkReactIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="uneraSparkGrad" x1="12" y1="52" x2="52" y2="12">
        <stop offset="0%" stopColor="#FF7A45" />
        <stop offset="55%" stopColor="#FF5A6A" />
        <stop offset="100%" stopColor="#FF8A3D" />
      </linearGradient>
      <filter id="uneraSparkGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="32" cy="32" r="18" fill="url(#uneraSparkGrad)" opacity="0.14" />
    <g stroke="url(#uneraSparkGrad)" strokeWidth="5.2" strokeLinecap="round" filter="url(#uneraSparkGlow)">
      <line x1="32" y1="10" x2="32" y2="18" />
      <line x1="32" y1="46" x2="32" y2="54" />
      <line x1="10" y1="32" x2="18" y2="32" />
      <line x1="46" y1="32" x2="54" y2="32" />
      <line x1="17" y1="17" x2="22.8" y2="22.8" />
      <line x1="41.2" y1="41.2" x2="47" y2="47" />
      <line x1="47" y1="17" x2="41.2" y2="22.8" />
      <line x1="22.8" y1="41.2" x2="17" y2="47" />
    </g>
    <circle cx="32" cy="32" r="6.2" fill="url(#uneraSparkGrad)" />
  </svg>
);

const DiscussSignalIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = '#1877F2',
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <g fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 20c0-5 4-9 9-9h18c7 0 13 6 13 13v6c0 7-6 13-13 13H30l-9 7v-7h-1c-6 0-10-4-10-10V20z" />
      <circle cx="27" cy="30" r="2.2" />
      <circle cx="33" cy="30" r="2.2" />
      <circle cx="39" cy="30" r="2.2" />
      <path d="M48 18c3 2 5 5 6 9" />
      <path d="M44 22c2 1 3 3 4 6" />
    </g>
  </svg>
);

/* =========================================================
   HELPER COMPONENTS FOR MODERN FEED LAYOUT
========================================================= */

const formatCompactNumber = (value: number | string | undefined) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${n}`;
};

const getSongPlayCount = (song: Song, trackPlays?: Record<string, number>) => {
  const live = trackPlays?.[`music:${song.id}`];
  if (typeof live === 'number' && Number.isFinite(live)) {
    return live;
  }
  return Number((song.stats as any)?.plays ?? (song as any).plays_count ?? (song as any).plays ?? 0);
};

const safeTime = (value: any) => {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

const seededNoise = (id: any, seed: number) => {
  const str = `${id}-${seed}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0) / 4294967295;
};

const freshnessBoost = (uploadDate: any) => {
  const ageDays = Math.max(0, (Date.now() - safeTime(uploadDate)) / 86400000);
  if (ageDays <= 2) return 45;
  if (ageDays <= 7) return 32;
  if (ageDays <= 14) return 20;
  if (ageDays <= 30) return 10;
  return 0;
};

const rankMusicSongs = (
  songs: Song[],
  currentUser: User | null,
  trackPlays: Record<string, number> = {},
  seed = 1,
  mode: 'balanced' | 'trending' | 'gems' | 'fresh' | 'all' = 'balanced'
) => {
  const meId = Number((currentUser as any)?.id || 0);
  const scored = songs.map((song) => {
    const plays = getSongPlayCount(song, trackPlays);
    const likes = Number((song.stats as any)?.likes || 0);
    const shares = Number((song.stats as any)?.shares || 0);
    const downloads = Number((song.stats as any)?.downloads || 0);
    const reelsUse = Number((song.stats as any)?.reelsUse || 0);
    const isMine = meId && Number(song.uploaderId) === meId;
    const noise = seededNoise(song.id, seed);
    
    let score = 0;
    
    if (mode === 'trending') {
      score = Math.log1p(plays) * 40 + Math.log1p(likes) * 28 + Math.log1p(shares) * 20 + freshnessBoost(song.uploadDate) + noise * 8;
    } else if (mode === 'gems') {
      score = Math.log1p(likes) * 45 + Math.log1p(reelsUse) * 20 + Math.log1p(plays) * 15 + freshnessBoost(song.uploadDate) * 0.5 + noise * 14;
    } else if (mode === 'fresh') {
      score = freshnessBoost(song.uploadDate) * 2 + Math.log1p(plays) * 12 + Math.log1p(likes) * 10 + noise * 18;
    } else if (mode === 'all') {
      score = Math.log1p(plays) * 26 + Math.log1p(likes) * 24 + Math.log1p(shares) * 12 + Math.log1p(downloads) * 8 + freshnessBoost(song.uploadDate) + noise * 28;
    } else {
      score = Math.log1p(plays) * 30 + Math.log1p(likes) * 26 + Math.log1p(shares) * 12 + Math.log1p(downloads) * 8 + Math.log1p(reelsUse) * 8 + freshnessBoost(song.uploadDate) + noise * 12;
    }
    
    if (isMine && mode !== 'all') score -= 6;
    return { song, score };
  });
  
  const sorted = scored.sort((a, b) => b.score - a.score).map((x) => x.song);
  
  const result: Song[] = [];
  const waiting = [...sorted];
  
  while (waiting.length) {
    const lastTwo = result.slice(-2).map((s) => Number(s.uploaderId));
    const pickIndex = waiting.findIndex((s) => {
      const uid = Number(s.uploaderId);
      return !lastTwo.includes(uid);
    });
    const index = pickIndex >= 0 ? pickIndex : 0;
    result.push(waiting.splice(index, 1)[0]);
  }
  
  return result;
};

const SectionTitle: React.FC<{ title: string; subtitle?: string; onMore?: () => void; }> = ({ title, subtitle, onMore }) => (
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-[28px] leading-none font-extrabold text-white">{title}</h2>
      {subtitle ? <p className="text-[#9CA3AF] text-sm mt-1">{subtitle}</p> : null}
    </div>
    <button onClick={onMore} className="text-[#1877F2] font-semibold text-sm hover:opacity-80" type="button">
      More <i className="fas fa-angle-double-right ml-1"></i>
    </button>
  </div>
);

const QuickActionCircle: React.FC<{ icon: string; label: string; onClick?: () => void; }> = ({ icon, label, onClick }) => (
  <button type="button" onClick={onClick} className="flex flex-col items-center min-w-[74px] group">
    <div className="w-16 h-16 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-[0_0_18px_rgba(24,119,242,0.25)] group-hover:scale-105 transition-transform">
      <i className={`${icon} text-[26px]`}></i>
    </div>
    <span className="text-white text-sm mt-2 font-medium">{label}</span>
  </button>
);

const FeaturedBannerCard: React.FC<{ song: Song; artistName: string; onPlay: () => void; trackPlays?: Record<string, number>; }> = ({ song, artistName, onPlay, trackPlays }) => {
  const playCount = getSongPlayCount(song, trackPlays);
  return (
    <div onClick={onPlay} className="relative h-[220px] rounded-2xl overflow-hidden cursor-pointer border border-white/10">
      <img src={song.cover || DEFAULT_MUSIC_COVER} alt={song.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
      <div className="relative z-10 h-full flex items-end justify-between p-4">
        <div className="max-w-[70%]">
          <p className="text-[#1877F2] text-xs font-bold uppercase tracking-wider mb-2">Featured</p>
          <h3 className="text-white text-2xl font-extrabold leading-tight line-clamp-2">{song.title}</h3>
          <p className="text-white/80 mt-1 text-sm">{artistName}</p>
          <div className="mt-3 inline-flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5 text-xs text-white">
            <i className="fas fa-headphones"></i>
            <span>{formatCompactNumber(playCount)} plays</span>
          </div>
        </div>
        <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
          <i className="fas fa-play text-lg ml-1"></i>
        </div>
      </div>
    </div>
  );
};

const MusicFeedCard: React.FC<{
  song: Song;
  isLiked: boolean;
  artistName: string;
  artistAvatar?: string | null;
  verified?: boolean;
  badge?: string;
  badgeColor?: string;
  onPlay: () => void;
  onLike: () => void;
  onArtistClick?: () => void;
  trackPlays?: Record<string, number>;
  reactionCount?: number;
  myReaction?: ReactionType;
  onReact?: (type: ReactionType) => void;
  currentUser?: User | null;
}> = ({
  song,
  isLiked,
  artistName,
  artistAvatar,
  verified,
  badge,
  badgeColor = 'bg-black/60 text-white',
  onPlay,
  onLike,
  onArtistClick,
  trackPlays,
  reactionCount = 0,
  myReaction,
  onReact,
  currentUser,
}) => {
  const playCount = getSongPlayCount(song, trackPlays);
  
  return (
    <div className="w-[160px] sm:w-[175px] flex-shrink-0 snap-start">
      <div onClick={onPlay} className="group cursor-pointer">
        <div className="relative rounded-xl overflow-hidden aspect-[1/1] bg-[#0B1120]">
          <img 
            src={song.cover || DEFAULT_MUSIC_COVER} 
            alt={song.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
          
          {badge ? (
            <div className={`absolute top-2 left-2 text-[11px] px-2 py-1 rounded-full font-bold ${badgeColor}`}>
              {badge}
            </div>
          ) : null}
          
          {onReact && currentUser ? (
            <div className="absolute top-2 right-2">
              <div className="scale-75 origin-top-right">
                <ReactionButton
                  currentUserReactions={myReaction}
                  reactionCount={reactionCount}
                  onReact={(type) => onReact(type)}
                  isGuest={!currentUser}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLike();
              }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <i className={`${isLiked ? 'fas text-[#FF4D8D]' : 'far text-white'} fa-heart text-sm`}></i>
            </button>
          )}
          
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex items-center justify-between text-white text-xs">
              <span className="inline-flex items-center gap-1">
                <i className="fas fa-headphones text-[10px]"></i>
                {formatCompactNumber(playCount)}
              </span>
              <span>{(song as any).duration || '3:00'}</span>
            </div>
          </div>
        </div>
        
        <div className="mt-2">
          <h3 className="text-white text-[15px] font-semibold leading-tight line-clamp-1">{song.title}</h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArtistClick?.();
            }}
            className="mt-1 flex items-center gap-2 max-w-full text-left"
          >
            {artistAvatar ? (
              <img src={artistAvatar} alt={artistName} className="w-4 h-4 rounded-full object-cover" />
            ) : null}
            <span className="text-[#94A3B8] text-sm truncate inline-flex items-center gap-1">
              {artistName}
              {verified ? <VerifiedBadge size={12} className="shrink-0" /> : null}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

const HorizontalMusicRow: React.FC<{
  title: string;
  subtitle?: string;
  songs: Song[];
  users: User[];
  isTrackLiked: (id: string | number) => boolean;
  onPlaySong: (song: Song) => void;
  onLikeSong: (id: string) => void;
  onArtistClick: (id: number) => void;
  badgeBuilder?: (song: Song, index: number) => { text?: string; className?: string };
  trackPlays?: Record<string, number>;
  reactionCounts?: Record<string, { count: number; myReaction?: ReactionType }>;
  onReact?: (track: AudioTrack, type: ReactionType) => void;
  currentUser?: User | null;
}> = ({
  title,
  subtitle,
  songs,
  users,
  isTrackLiked,
  onPlaySong,
  onLikeSong,
  onArtistClick,
  badgeBuilder,
  trackPlays,
  reactionCounts,
  onReact,
  currentUser,
}) => {
  if (!songs.length) return null;
  
  return (
    <div className="mb-8">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {songs.map((song, index) => {
          const uploaderProfile = users.find((u) => u.id === song.uploaderId);
          const artistName = uploaderProfile?.name || uploaderProfile?.username || song.artist;
          const artistAvatar = (uploaderProfile as any)?.profileImage || (uploaderProfile as any)?.profile_image_url || null;
          const badge = badgeBuilder?.(song, index);
          const trackKey = `music:${song.id}`;
          const reactionData = reactionCounts?.[trackKey] || { count: 0, myReaction: undefined };
          
          return (
            <MusicFeedCard
              key={song.id}
              song={song}
              isLiked={isTrackLiked(String(song.id))}
              artistName={artistName}
              artistAvatar={artistAvatar}
              verified={Boolean((uploaderProfile as any)?.isVerified || (uploaderProfile as any)?.is_verified)}
              badge={badge?.text}
              badgeColor={badge?.className}
              onPlay={() => onPlaySong(song)}
              onLike={() => onLikeSong(String(song.id))}
              onArtistClick={() => song.uploaderId && onArtistClick(song.uploaderId)}
              trackPlays={trackPlays}
              reactionCount={reactionData.count}
              myReaction={reactionData.myReaction}
              onReact={(type) => {
                const uploaderProfileLocal = users.find((u) => u.id === song.uploaderId);
                const artistNameLocal = uploaderProfileLocal?.name || uploaderProfileLocal?.username || song.artist;
                const audioTrack: AudioTrack = {
                  id: String(song.id),
                  title: song.title,
                  artist: artistNameLocal,
                  duration: typeof song.duration === 'string' ? 180 : (song.duration as any) || 180,
                  url: song.audioUrl || '',
                  uploaderId: song.uploaderId || 1,
                  cover: song.cover || DEFAULT_MUSIC_COVER,
                  type: 'music',
                  isVerified: Boolean((uploaderProfileLocal as any)?.isVerified),
                  likesCount: Number((song.stats as any)?.likes || 0),
                } as any;
                onReact?.(audioTrack, type);
              }}
              currentUser={currentUser}
            />
          );
        })}
      </div>
    </div>
  );
};

/* =========================================================
   REACTION BUTTON COMPONENT (with Spark icon - same as Feed.tsx)
========================================================= */

const ReactionButton: React.FC<{
  currentUserReactions: ReactionType | undefined;
  reactionCount: number;
  onReact: (type: ReactionType) => void;
  isGuest?: boolean;
}> = ({ currentUserReactions, reactionCount, onReact, isGuest }) => {
  const [showDock, setShowDock] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewEmoji, setPreviewEmoji] = useState<string>('👍');
  const timerRef = useRef<any>(null);
  const longPressTimerRef = useRef<any>(null);
  const dockRef = useRef<HTMLDivElement>(null);

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
  ] as const;

  const handleMouseEnter = () => {
    if (isGuest) return;
    timerRef.current = setTimeout(() => setShowDock(true), 500);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTimeout(() => setShowDock(false), 250);
    setShowPreview(false);
  };

  const handleTouchStart = () => {
    if (isGuest) return;
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
    if (isGuest) return alert('Please login to react.');
    if (currentUserReactions) {
      setIsAnimating(true);
      onReact(currentUserReactions);
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      setShowDock(!showDock);
    }
  };

  const handleDockReact = (type: ReactionType) => {
    setIsAnimating(true);
    onReact(type);
    setShowDock(false);
    setShowPreview(false);
    setTimeout(() => setIsAnimating(false), 300);
  };

  const handleEmojiHover = (emoji: string) => {
    if (showPreview) {
      setPreviewEmoji(emoji);
    }
  };

  const activeReaction = currentUserReactions
    ? reactionConfig.find((r) => r.type === currentUserReactions)
    : null;

  return (
    <div
      className="flex-1 relative group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {showPreview && (
        <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-[#0F172A] rounded-full shadow-2xl p-3 border border-[#1E293B] z-50 reaction-preview">
          <div className="text-4xl">{previewEmoji}</div>
        </div>
      )}

      {showDock && (
        <div
          ref={dockRef}
          className="absolute -top-16 left-0 bg-[#0F172A] rounded-full shadow-2xl p-2 border border-[#1E293B] z-50 react-pop flex items-center"
        >
          <div className="flex gap-1 overflow-x-auto max-w-[320px] scrollbar-hide px-1 py-1">
            {reactionConfig.map((r) => (
              <div
                key={r.type}
                className="text-3xl react-hover cursor-pointer p-1 rounded-full hover:bg-[#1E293B] transition-colors flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDockReact(r.type as ReactionType);
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
        className={`w-full flex items-center justify-center gap-2 h-10 rounded hover:bg-[#1E293B] transition-all duration-200 active:scale-95 ${
          isAnimating ? 'scale-110' : ''
        }`}
      >
        {activeReaction ? (
          <>
            <span className="text-[22px] transition-transform duration-300">
              {activeReaction.icon}
            </span>
            <span
              className="text-[19px] font-bold transition-colors duration-300"
              style={{ color: activeReaction.color }}
            >
              {reactionCount > 0 ? formatCompactNumber(reactionCount) : 'React'}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center justify-center -mt-[1px]">
              <SparkReactIcon size={28} />
            </span>
            <span className="text-[19px] font-bold text-[#94A3B8]">
              {reactionCount > 0 ? formatCompactNumber(reactionCount) : 'React'}
            </span>
          </>
        )}
      </button>
    </div>
  );
};

/* =========================================================
   COMMENTS SHEET MODAL (Half-screen bottom sheet)
========================================================= */

export const CommentsSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  track: AudioTrack;
  currentUser: User | null;
  users: User[];
  onProfileClick: (id: number) => void;
  onCommentAdded?: () => void;
}> = ({ isOpen, onClose, track, currentUser, users, onProfileClick, onCommentAdded }) => {
  const [comments, setComments] = useState<any[]>(() => {
    if (!track?.id) return [];
    const cached = getCachedComments('song', track.id);
    return cached?.data || [];
  });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchComments = useCallback(async (force = false) => {
    if (!track?.id) return;
    const cached = getCachedComments('song', track.id);
    if (!force && cached && cached.data.length > 0) {
      setComments(cached.data);
      if (cached.isFresh) {
        return; // Fresh cache, no need to re-query network
      }
    }
    if (!cached || cached.data.length === 0) {
      setLoading(true);
    }
    try {
      const viewerId = currentUser?.id ? String(currentUser.id) : '';
      const endpoint = `/api/songs/${track.id}/comments?viewerId=${viewerId || 0}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...(viewerId ? { 'x-user-id': viewerId } : {}),
        },
      });
      const data = await res.json().catch(() => null);
      const commentsList = Array.isArray(data) ? data : data?.comments || [];
      setComments(commentsList);
      setCachedComments('song', track.id, commentsList);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  }, [track, currentUser]);

  useEffect(() => {
    if (isOpen && track?.id) {
      // Rehydrate instantly from cache
      const cached = getCachedComments('song', track.id);
      if (cached?.data?.length) {
        setComments(cached.data);
      }
      fetchComments();
    }
  }, [isOpen, track?.id, fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !currentUser || !track?.id) return;

    setSubmitting(true);
    const newCommentText = text.trim();
    const optimisticComment = {
      id: Date.now(),
      song_id: track.id,
      user_id: currentUser.id,
      text: newCommentText,
      created_at: new Date().toISOString(),
      user: currentUser,
    };

    setComments((prev) => [optimisticComment, ...prev]);
    addCachedComment('song', track.id, optimisticComment);
    setText('');

    try {
      const endpoint = `/api/songs/${track.id}/comment`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          text: newCommentText,
          image_url: null,
          parent_comment_id: null,
        }),
      });

      if (res.ok) {
        fetchComments(true);
        onCommentAdded?.();
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Hold / Hide / Delete Handlers for Song Discussions
  const [actionModalComment, setActionModalComment] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const { getHandlers: getCommentPressHandlers } = useCommentLongPress((comment: any) => {
    setActionModalComment(comment);
  });

  const isCommentHidden = (comment: any): boolean => {
    return Boolean(
      comment?.is_hidden ||
      comment?.hidden ||
      comment?.hidden_scope ||
      comment?.hidden_by
    );
  };

  const isCommentAuthor = (comment: any): boolean => {
    if (!currentUser) return false;
    const authorId = Number(comment?.user_id ?? comment?.userId ?? comment?.user?.id ?? 0);
    return authorId > 0 && authorId === Number(currentUser.id);
  };

  const isSongOwner = (): boolean => {
    if (!currentUser || !track) return false;
    const ownerId = Number(
      (track as any).user_id ||
      (track as any).userId ||
      (track as any).artist_id ||
      (track as any).owner_id ||
      0
    );
    return ownerId > 0 && ownerId === Number(currentUser.id);
  };

  const isPlatformAdmin = (): boolean => {
    const role = String((currentUser as any)?.role || '').toLowerCase();
    return ['admin', 'superadmin', 'moderator', 'owner'].includes(role);
  };

  const canHideComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isSongOwner() || isPlatformAdmin();
  };

  const canDeleteComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isSongOwner() || isPlatformAdmin();
  };

  const handleToggleHide = async (comment: any) => {
    if (!currentUser || !comment || !track?.id) return;
    const commentId = comment.id;
    const currentlyHidden = isCommentHidden(comment);
    const nextAction: 'hide' | 'unhide' = currentlyHidden ? 'unhide' : 'hide';

    // Optimistic UI & cache update
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, is_hidden: !currentlyHidden, hidden_by: !currentlyHidden ? currentUser.id : null }
          : c
      )
    );

    updateCachedComment('song', track.id, commentId, (c: any) => ({
      ...c,
      is_hidden: !currentlyHidden,
      hidden_by: !currentlyHidden ? currentUser.id : null,
    }));

    showToast(nextAction === 'hide' ? 'Discussion hidden' : 'Discussion unhidden');

    try {
      const endpoint = `/api/songs/${track.id}/comments`;
      await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          comment_id: commentId,
          action: nextAction,
        }),
      });
    } catch (error) {
      console.error(`Failed to ${nextAction} song comment:`, error);
      showToast(`Failed to ${nextAction} discussion`);
      fetchComments(true);
    }
  };

  const handleDeleteComment = async (comment: any) => {
    if (!currentUser || !comment || !track?.id) return;
    const commentId = comment.id;

    // Optimistic removal
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    removeCachedComment('song', track.id, commentId);
    showToast('Discussion deleted');

    try {
      const endpoint = `/api/songs/${track.id}/comments?comment_id=${commentId}&user_id=${currentUser.id}`;
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'x-user-id': String(currentUser.id) },
      });

      onCommentAdded?.();
    } catch (error) {
      console.error('Failed to delete song comment:', error);
      showToast('Failed to delete discussion');
      fetchComments(true);
    }
  };

  const formatRelativeTime = (dateInput: any): string => {
    if (!dateInput) return 'Just now';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Just now';
    const now = Date.now();
    let diffMs = now - d.getTime();
    if (diffMs < 0) diffMs = 0;
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? '1 min' : `${min} mins`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs === 1 ? '1 hr' : `${hrs} hrs`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return days === 1 ? '1 day' : `${days} days`;
    return new Date(dateInput).toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end" onClick={onClose}>
      <div 
        className="w-full h-[72vh] bg-[#050B18] rounded-t-3xl flex flex-col overflow-hidden shadow-2xl border-t border-[#1E293B]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center bg-[#0B1120]">
          <div className="w-12 h-1.5 rounded-full bg-[#1E293B]"></div>
        </div>

        <div className="p-4 border-b border-[#1E293B] flex items-center justify-between bg-[#0B1120] sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center transition-colors"
              onClick={onClose}
              aria-label="Back"
            >
              <i className="fas fa-arrow-left text-[#E4E6EB] text-xl"></i>
            </button>
            <div className="text-[#E4E6EB] font-bold text-[22px]">Discussions</div>
          </div>
          <button
            type="button"
            className="text-[#1877F2] font-bold text-[17px] hover:underline"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-3 mb-6 p-3 bg-[#0F172A] border border-[#1E293B] rounded-xl">
            <div className="w-12 h-12 rounded-lg overflow-hidden">
              <img src={track.cover || DEFAULT_MUSIC_COVER} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[#E4E6EB] font-bold text-[17px] truncate">{track.title}</div>
              <div className="text-[#B0B3B8] text-[15px] truncate">{track.artist}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10">
              <i className="fas fa-spinner fa-spin text-[#1877F2] text-2xl"></i>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-[#B0B3B8] text-[19px] mb-2">No discussions yet</div>
              <p className="text-[#B0B3B8] text-[15px]">Be the first to start a discussion!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment: any) => {
                const author = users.find((u) => u.id === comment.user_id) || comment.user;
                const authorName = author?.name || author?.username || 'User';
                const authorAvatar = author?.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=1877F2&color=fff`;
                const isHidden = isCommentHidden(comment);
                const pressHandlers = getCommentPressHandlers(comment);
                
                return (
                  <div key={comment.id} className="flex gap-3 group/songcomment">
                    <img
                      src={authorAvatar}
                      className="w-9 h-9 rounded-full object-cover cursor-pointer flex-shrink-0"
                      alt=""
                      onClick={() => author?.id && onProfileClick(author.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        {...pressHandlers}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                          isHidden
                            ? 'bg-[#162137]/35 hover:bg-[#1E293B]/45 border-amber-500/30 opacity-75'
                            : 'bg-[#162137]/65 hover:bg-[#1E293B]/70 border-[#1E293B]/60'
                        }`}
                        title="Hold for discussion options"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[#E4E6EB] font-bold text-[21px] cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (author?.id) onProfileClick(author.id);
                              }}
                            >
                              {authorName}
                            </span>
                            <span className="text-[#B0B3B8] text-[13px]">
                              • {formatRelativeTime(comment.created_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isHidden && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                Hidden
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModalComment(comment);
                              }}
                              className="opacity-0 group-hover/songcomment:opacity-100 p-1 text-[#94A3B8] hover:text-[#F8FAFC] rounded-full hover:bg-[#1E293B] transition-opacity"
                              title="Discussion options"
                            >
                              <i className="fas fa-ellipsis-h text-xs" />
                            </button>
                          </div>
                        </div>
                        <div className="text-[#E4E6EB] text-[18px] font-normal whitespace-pre-wrap break-words">
                          {comment.text}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 ml-2">
                        <button className="text-[14px] text-[#B0B3B8] hover:text-[#E4E6EB]">
                          Like
                        </button>
                        <button
                          className="text-[14px] text-[#B0B3B8] hover:text-[#E4E6EB]"
                          onClick={() => {
                            setText(`@${authorName} `);
                            inputRef.current?.focus();
                          }}
                        >
                          Reply
                        </button>
                        {isHidden && (
                          <span className="text-amber-400/90 font-medium text-[11px] inline-flex items-center gap-1">
                            <i className="far fa-eye-slash text-[10px]" />
                            <span>Hidden</span>
                          </span>
                        )}
                        {comment.likes_count > 0 && (
                          <span className="text-[14px] text-[#B0B3B8]">
                            {formatCompactNumber(comment.likes_count)} like{comment.likes_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#1E293B] bg-[#0B1120] sticky bottom-0">
          <form className="flex gap-3 items-center" onSubmit={handleSubmit}>
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-[#070D1D] text-white rounded-full px-5 py-3 outline-none border border-[#1E293B] focus:border-[#1877F2] transition-all text-[17px]"
                placeholder="Write a comment..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!currentUser}
              />
            </div>
            <button
              type="submit"
              className="text-[#1877F2] font-bold text-[17px] disabled:text-[#B0B3B8] disabled:cursor-not-allowed px-4 py-2 min-w-[60px] transition-colors"
              disabled={!text.trim() || submitting || !currentUser}
            >
              {submitting ? <i className="fas fa-spinner fa-spin"></i> : 'Post'}
            </button>
          </form>
          {!currentUser && (
            <p className="text-[#B0B3B8] text-sm text-center mt-2">Please login to comment</p>
          )}
        </div>
      </div>

      {/* Discussion Hold Action Modal */}
      {actionModalComment && (
        <CommentActionModal
          isOpen={Boolean(actionModalComment)}
          onClose={() => setActionModalComment(null)}
          comment={actionModalComment}
          authorName={
            (users.find((u) => u.id === actionModalComment.user_id) || actionModalComment.user)?.name ||
            'User'
          }
          authorAvatar={
            (users.find((u) => u.id === actionModalComment.user_id) || actionModalComment.user)?.profile_image_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent('User')}&background=1877F2&color=fff`
          }
          commentText={String(actionModalComment.text || '')}
          isHidden={isCommentHidden(actionModalComment)}
          canHide={canHideComment(actionModalComment)}
          canDelete={canDeleteComment(actionModalComment)}
          onToggleHide={handleToggleHide}
          onDelete={handleDeleteComment}
          onReply={(c) => {
            const aName = (users.find((u) => u.id === c.user_id) || c.user)?.name || 'User';
            setText(`@${aName} `);
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
    </div>
  );
};

/* =========================================================
   SHARE BOTTOM SHEET MODAL
========================================================= */

const ShareBottomSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  track: AudioTrack;
  currentUser: User | null;
  users?: User[];
  groups?: any[];
  onShareComplete?: (destination: string, data?: any) => void;
}> = ({ isOpen, onClose, track, currentUser, users = [], groups = [], onShareComplete }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBackdropClick = (e: MouseEvent) => {
      if (backdropRef.current && e.target === backdropRef.current) closeSheet();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) closeSheet();
    };
    if (isOpen) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
      document.body.style.overflow = 'hidden';
      document.addEventListener('click', handleBackdropClick);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const closeSheet = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onClose();
      setIsAnimating(false);
    }, 200);
  };

  const handleShareAction = async (destination: string) => {
    if (!currentUser) {
      alert('Please login to share.');
      return;
    }
    try {
      const response = await shareSong(
        Number(track.id),
        Number(currentUser.id),
        (destination as any) || 'feed'
      );

      if (response.success) {
        if (onShareComplete) {
          onShareComplete(destination, { success: true, data: response });
        }
        alert(`Shared to ${destination}!`);
        closeSheet();
      }
    } catch (error: any) {
      console.error('Share failed:', error);
      alert(error?.message || 'Failed to share');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className={`fixed inset-0 bg-black/60 z-[300] transition-opacity duration-300 ${
          isAnimating ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-[301] bg-[#0F172A] rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col border-t border-[#1E293B] transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-full' : 'translate-y-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-2">
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-[#1E293B] rounded-full"></div>
          </div>
          
          <div className="flex items-start gap-3 mb-4 p-3 bg-[#0B1120] border border-[#1E293B] rounded-xl">
            <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
              <img src={track.cover || DEFAULT_MUSIC_COVER} alt={track.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#E4E6EB] font-semibold text-[15px]">{track.title}</span>
              </div>
              <p className="text-[#B0B3B8] text-[15px] line-clamp-2">{track.artist}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-1">
            <button
              onClick={() => handleShareAction('feed')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#141E33] transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <i className="fas fa-newspaper text-[#1877F2] text-lg"></i>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[#E4E6EB] font-medium text-[17px]">Share to UNERA Feed</div>
                <div className="text-[#B0B3B8] text-[13px] mt-0.5">Share to your profile feed</div>
              </div>
              <i className="fas fa-chevron-right text-[#B0B3B8] text-[15px]"></i>
            </button>

            <button
              onClick={() => handleShareAction('message')}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#141E33] transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <i className="fas fa-comment-alt text-[#1877F2] text-lg"></i>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[#E4E6EB] font-medium text-[17px]">Send as a Message</div>
                <div className="text-[#B0B3B8] text-[13px] mt-0.5">Share via direct message</div>
              </div>
              <i className="fas fa-chevron-right text-[#B0B3B8] text-[15px]"></i>
            </button>

            <button
              onClick={() => {
                const text = `Check out this track on UNERA: ${track.title} by ${track.artist}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                closeSheet();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#141E33] transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-full bg-[#25D36615] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <i className="fab fa-whatsapp text-[#25D366] text-lg"></i>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[#E4E6EB] font-medium text-[17px]">Send via WhatsApp</div>
                <div className="text-[#B0B3B8] text-[13px] mt-0.5">Share to WhatsApp</div>
              </div>
            </button>

            <button
              onClick={() => {
                const url = `${window.location.origin}/music/${track.id}`;
                navigator.clipboard.writeText(url);
                alert('Link copied to clipboard!');
                closeSheet();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#1E293B] active:bg-[#141E33] transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-full bg-[#1877F215] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <i className="fas fa-link text-[#1877F2] text-lg"></i>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[#E4E6EB] font-medium text-[17px]">Copy Track Link</div>
                <div className="text-[#B0B3B8] text-[13px] mt-0.5">Copy link to clipboard</div>
              </div>
            </button>
          </div>
        </div>

        <div className="p-4 pt-3 border-t border-[#1E293B]">
          <button
            onClick={closeSheet}
            className="w-full py-3 bg-[#1E293B] hover:bg-[#141E33] text-[#E4E6EB] font-semibold rounded-xl transition-colors text-[17px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

/* =========================================================
   API CLIENT (safe JSON parsing + auth + errors)
========================================================= */

type ApiResult<T> = { success: true; data: T; error?: string } | { success: false; error: string; data?: any };

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('unera_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const safeParseJson = async (res: Response) => {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
};

async function apiJson<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });

    const payload = await safeParseJson(res);

    if (!res.ok) {
      return { success: false, error: (payload?.error || payload?.message || `API Error: ${res.status}`) as string, data: payload };
    }

    const data = (payload?.data ?? payload) as T;
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

async function apiForm<T>(endpoint: string, form: FormData, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(endpoint, {
      method: options.method || 'POST',
      ...options,
      body: form,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });

    const payload = await safeParseJson(res);

    if (!res.ok) {
      return { success: false, error: (payload?.error || payload?.message || `API Error: ${res.status}`) as string, data: payload };
    }

    const data = (payload?.data ?? payload) as T;
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

/* =========================================================
   MAPPERS (backend -> UI types)
========================================================= */

function mapSongFromApi(s: any): Song {
  const plays = Number(s.plays_count ?? s.plays ?? s.stats?.plays ?? 0);
  const likes = Number(s.likes_count ?? s.likes ?? s.stats?.likes ?? 0);
  
  let cover = s.cover_image_url || s.cover || DEFAULT_MUSIC_COVER;
  
  if (!cover || cover.trim() === '' || 
      cover.includes('ui-avatars.com') || 
      !cover.startsWith('http')) {
    cover = DEFAULT_MUSIC_COVER;
  }

  return {
    id: String(s.id),
    title: s.title || 'Untitled',
    artist: s.artist_name || s.artist || 'Unknown Artist',
    cover: cover,
    audioUrl: s.audio_url || s.audioUrl || '',
    duration: s.duration || s.duration_seconds || '3:00',
    uploaderId: Number(s.uploader_id ?? s.uploaderId ?? 0) || 0,
    uploadDate: s.created_at || s.uploadDate || new Date().toISOString(),
    genre: s.genre || '',
    album: s.album_name || s.album || 'Single',
    isVerified: Boolean(s.is_verified || s.isVerified),
    stats: {
      plays,
      likes,
      shares: Number(s.shares_count ?? s.shares ?? s.stats?.shares ?? 0),
      downloads: Number(s.downloads_count ?? s.downloads ?? s.stats?.downloads ?? 0),
      reelsUse: Number(s.reels_use_count ?? s.reelsUse ?? s.stats?.reelsUse ?? 0),
    },
  } as any;
}

/* =========================================================
   COVER IMAGE COMPRESSION HELPERS (Silent, no user notification)
========================================================= */

const loadCoverImage = (src: string): Promise<HTMLImageElement> => 
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load cover image'));
    img.src = src;
  });

const canvasToImageBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Canvas export failed'));
  }, type, quality);
});

const calcCoverSize = (w: number, h: number, max: number) => {
  if (!w || !h) return { width: max, height: max };
  if (Math.max(w, h) <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
};

const compressCoverImage = async (file: File): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadCoverImage(objectUrl);
    const target = calcCoverSize(img.naturalWidth, img.naturalHeight, 900);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    
    ctx.drawImage(img, 0, 0, target.width, target.height);
    const blob = await canvasToImageBlob(canvas, 'image/webp', 0.82);
    
    const safeName = (file.name || 'cover')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\-]+/g, '_');
    
    return new File([blob], `${safeName}_cover.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const uploadCompressedCoverToR2 = async (file: File) => {
  const compressed = await compressCoverImage(file);
  return uploadToR2(compressed);
};

declare function uploadToR2(file: File): Promise<string>;

// ✅ FIXED: reactToItem with x-user-id header
async function reactToItem(itemId: string, type: 'music' | 'podcast', userId: number, reactionType: string) {
  const endpoint = `/api/songs/${itemId}/react`;
  
  return apiJson<any>(endpoint, {
    method: 'POST',
    headers: {
      'x-user-id': String(userId),
    },
    body: JSON.stringify({ 
      user_id: userId, 
      type: reactionType 
    }),
  });
}

/* =========================================================
   MODERN GLOBAL AUDIO PLAYER (Optimized for Mobile)
========================================================= */

interface GlobalAudioPlayerProps {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
  onDownload: (id: string) => void;
  onLike: (id: string, type: 'music' | 'podcast') => void;
  onArtistClick?: (uploaderId: number) => void;
  isLiked: boolean;
  uploaderProfile?: User | null;
  ownerUser?: User | null;
  totalPlays?: number;
  totalPlaysLoading?: boolean;
  onStarted?: (track: AudioTrack) => void;
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
  myReaction?: ReactionType;
  onReact?: (track: AudioTrack, type: ReactionType) => void;
  onOpenComments?: (track: AudioTrack) => void;
  onShare?: (track: AudioTrack) => void;
  currentUser?: User | null;
  users?: User[];
}

export const GlobalAudioPlayer: React.FC<GlobalAudioPlayerProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrevious,
  onClose,
  onDownload,
  onLike,
  onArtistClick,
  isLiked,
  uploaderProfile,
  ownerUser,
  totalPlays = 0,
  totalPlaysLoading = false,
  onStarted,
  reactionCount = 0,
  commentCount = 0,
  shareCount = 0,
  myReaction,
  onReact,
  onOpenComments,
  onShare,
  currentUser,
  users = [],
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadToast, setDownloadToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const showDownloadToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setDownloadToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setDownloadToast(null);
    }, 3200);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const startedKeyRef = useRef<string>("");
  const [volume, setVolume] = useState(1);
  const [isRepeating, setIsRepeating] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    startedKeyRef.current = "";
  }, [currentTrack?.id, currentTrack?.type]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentTrack || !onStarted) return;

    const onPlaying = () => {
      const k = `${currentTrack.type}:${currentTrack.id}`;
      if (startedKeyRef.current === k) return;
      startedKeyRef.current = k;
      onStarted(currentTrack);
    };

    el.addEventListener("playing", onPlaying);
    return () => el.removeEventListener("playing", onPlaying);
  }, [currentTrack, onStarted]);

// Auto-expand when track changes from external source (like Feed)
useEffect(() => {
  if (currentTrack && isPlaying) {
    setExpanded(true);
  }
}, [currentTrack?.id]);
       
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'metadata';
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const setAudioData = () => {
      if (!isNaN(audio.duration)) setDuration(audio.duration);
    };
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      if (isRepeating) {
        audio.currentTime = 0;
        audio.play();
      } else {
        onNext();
      }
    };
    const handleError = (e: Event) => console.warn('Audio playback warning:', e);

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    const managePlayback = async () => {
      if (!currentTrack?.url) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        lastUrlRef.current = null;
        return;
      }

      if (lastUrlRef.current !== currentTrack.url) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = currentTrack.url;
        lastUrlRef.current = currentTrack.url;
        audio.load();
        
        if (isPlaying) {
          try {
            if (playPromiseRef.current) {
              playPromiseRef.current.catch(() => {});
            }
            playPromiseRef.current = audio.play();
            await playPromiseRef.current;
          } catch (err: any) {
            console.warn('Auto-play prevented:', err?.name);
          }
        }
      } else {
        if (isPlaying && audio.paused) {
          try {
            if (playPromiseRef.current) {
              playPromiseRef.current.catch(() => {});
            }
            playPromiseRef.current = audio.play();
            await playPromiseRef.current;
          } catch (err: any) {
            console.warn('Play failed:', err);
          }
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      }
    };

    managePlayback();

    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentTrack, isPlaying, onNext, isRepeating, volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    setVolume(vol);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    if (isPlaying) onTogglePlay();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      lastUrlRef.current = null;
    }
    onClose();
  };

  const downloadCurrentTrack = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentTrack?.url) {
      showDownloadToast('Audio URL not available for download', 'error');
      return;
    }
    const trackId = String(currentTrack.id);
    if (downloadingTrackId === trackId) return;
    
    setDownloadingTrackId(trackId);
    setDownloadProgress(0);
    
    const displayUser = ownerUser || uploaderProfile;
    const artistName = displayUser 
      ? (displayUser.name || displayUser.username || currentTrack.artist)
      : currentTrack.artist;
    
    const cleanArtist = (artistName || 'Artist')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const cleanTitle = (currentTrack.title || 'Track')
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const fileName = `${cleanArtist || 'Artist'} - ${cleanTitle || 'Track'}.mp3`;
    
    // 1. Native app download support
    if (isUneraNativeApp() && (window as any).UneraNative?.postMessage) {
      try {
        const progressHandler = (event: any) => {
          const data = event.detail;
          if (data && data.fileName === fileName) {
            const progress = Math.min(100, Math.max(0, data.progress || 0));
            setDownloadProgress(progress);
          }
        };
        
        const completeHandler = (event: any) => {
          const data = event.detail;
          if (data && data.fileName === fileName) {
            setDownloadProgress(100);
            showDownloadToast(`Downloaded "${fileName}"`, 'success');
            setTimeout(() => {
              setDownloadingTrackId(null);
              setDownloadProgress(0);
            }, 1200);
            window.removeEventListener('uneraNativeDownloadProgress', progressHandler);
            window.removeEventListener('uneraNativeDownloadComplete', completeHandler);
            window.removeEventListener('uneraNativeDownloadError', errorHandler);
          }
        };
        
        const errorHandler = (event: any) => {
          const data = event.detail;
          showDownloadToast(data?.message || 'Download failed. Please try again.', 'error');
          setDownloadingTrackId(null);
          setDownloadProgress(0);
          window.removeEventListener('uneraNativeDownloadProgress', progressHandler);
          window.removeEventListener('uneraNativeDownloadComplete', completeHandler);
          window.removeEventListener('uneraNativeDownloadError', errorHandler);
        };
        
        window.addEventListener('uneraNativeDownloadProgress', progressHandler);
        window.addEventListener('uneraNativeDownloadComplete', completeHandler);
        window.addEventListener('uneraNativeDownloadError', errorHandler);
        
        (window as any).UneraNative.postMessage(
          JSON.stringify({
            action: 'download_file',
            url: currentTrack.url,
            fileName: fileName,
          })
        );
        return;
      } catch (nativeErr) {
        console.warn('Native download failed, falling back to web download:', nativeErr);
      }
    }
    
    // 2. High-performance Web download with real stream progress
    showDownloadToast(`Downloading "${cleanTitle}"...`, 'info');
    try {
      setDownloadProgress(10);
      const response = await fetch(currentTrack.url, {
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }
      
      const contentLength = response.headers.get('content-length');
      let blob: Blob;

      if (contentLength && response.body) {
        const total = parseInt(contentLength, 10);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (total > 0) {
              setDownloadProgress(Math.min(98, Math.round((received / total) * 100)));
            }
          }
        }

        blob = new Blob(chunks, { type: 'audio/mpeg' });
      } else {
        setDownloadProgress(65);
        blob = await response.blob();
      }

      setDownloadProgress(100);
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        setDownloadingTrackId(null);
        setDownloadProgress(0);
      }, 1500);
      
      onDownload(String(currentTrack.id));
      showDownloadToast(`Downloaded "${fileName}"`, 'success');
    } catch (error) {
      console.warn('Direct blob download failed, trying browser native download:', error);
      try {
        setDownloadProgress(95);
        const link = document.createElement('a');
        link.href = currentTrack.url;
        link.download = fileName;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
          setDownloadingTrackId(null);
          setDownloadProgress(0);
        }, 1500);
        
        onDownload(String(currentTrack.id));
        showDownloadToast(`Download started for "${fileName}"`, 'success');
      } catch (fallbackErr) {
        console.error('All download methods failed:', fallbackErr);
        showDownloadToast('Download could not be started. Please try again.', 'error');
        setDownloadingTrackId(null);
        setDownloadProgress(0);
      }
    }
  };

  if (!currentTrack) return null;

  const displayUser = ownerUser || uploaderProfile;
  const profilePicture = displayUser 
    ? (displayUser as any).profileImage || (displayUser as any).profile_image_url 
    : null;
  const displayName = displayUser 
    ? displayUser.name || displayUser.username 
    : currentTrack.artist;
  const userRole = 'Artist';
  const trackCover = currentTrack.cover && 
                    currentTrack.cover.trim() !== '' && 
                    currentTrack.cover.startsWith('http')
                    ? currentTrack.cover
                    : DEFAULT_MUSIC_COVER;
  
  const isDownloading = downloadingTrackId === String(currentTrack.id);

  return (
    <>
      {downloadToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border flex items-center gap-2.5 transition-all ${
          downloadToast.type === 'success' 
            ? 'bg-[#0F172A] text-emerald-400 border-emerald-500/40 shadow-emerald-950/40' 
            : downloadToast.type === 'error'
            ? 'bg-[#0F172A] text-rose-400 border-rose-500/40 shadow-rose-950/40'
            : 'bg-[#0F172A] text-[#38BDF8] border-[#38BDF8]/40 shadow-sky-950/40'
        }`}>
          <i className={`fas ${
            downloadToast.type === 'success' 
              ? 'fa-check-circle text-emerald-400' 
              : downloadToast.type === 'error' 
              ? 'fa-exclamation-circle text-rose-400' 
              : 'fa-info-circle text-[#38BDF8]'
          }`}></i>
          <span>{downloadToast.message}</span>
        </div>
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 ${
          expanded ? 'h-full bg-[#050B18]' : 'h-20 sm:h-22 bg-[#0F172A]'
        } transition-all duration-300 z-[160] shadow-2xl border-t border-[#1E293B]`}
      >
        {expanded ? (
          <div className="flex flex-col h-full w-full relative overflow-hidden bg-[#050B18]">
            {/* Subtle atmospheric ambient glow matching feed dark palette */}
            <div
              className="absolute inset-0 z-0 opacity-15 blur-3xl scale-125 pointer-events-none"
              style={{
                backgroundImage: `url(${trackCover})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            ></div>

            {/* Header */}
            <div className="relative z-10 flex justify-between items-center px-4 py-3 sm:py-4 bg-[#050B18]/90 backdrop-blur-md border-b border-[#1E293B] text-[#F8FAFC]">
              <button
                onClick={() => setExpanded(false)}
                className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center cursor-pointer transition-colors text-[#94A3B8] hover:text-white"
                aria-label="Minimize player"
              >
                <i className="fas fa-chevron-down text-lg"></i>
              </button>

              <div className="flex flex-col items-center">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Now Playing</span>
                <span className="text-sm font-bold text-[#F8FAFC] max-w-[200px] sm:max-w-[320px] truncate">{currentTrack.title}</span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(String(currentTrack.id), currentTrack.type);
                }}
                className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Like track"
              >
                <i className={`${isLiked ? 'fas text-[#F43F5E]' : 'far text-[#94A3B8]'} fa-heart text-lg`}></i>
              </button>
            </div>

            {/* Center Album Art Vinyl & Track Info */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-6 overflow-y-auto">
              <div className="relative mb-6">
                <div
                  className={`relative w-[210px] h-[210px] sm:w-[270px] sm:h-[270px] rounded-full border-[8px] sm:border-[10px] border-[#0F172A] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center ${
                    isPlaying ? 'animate-spin-slow' : ''
                  }`}
                  style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                >
                  <img 
                    src={trackCover} 
                    className="w-full h-full object-cover" 
                    alt="Album Art" 
                  />
                  
                  <div className="absolute w-11 h-11 bg-[#050B18] rounded-full border-4 border-[#1E293B] flex items-center justify-center shadow-inner">
                    <div className="w-3.5 h-3.5 bg-[#1E293B] rounded-full"></div>
                  </div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    onClick={onTogglePlay}
                    className="w-16 h-16 bg-[#050B18]/70 border border-[#1E293B] backdrop-blur-sm rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play ml-1'} text-white text-2xl`}></i>
                  </button>
                </div>
              </div>

              <div className="text-center px-4 max-w-xl">
                <h2 className="text-lg sm:text-xl font-bold text-[#F8FAFC] mb-1 line-clamp-2">{currentTrack.title}</h2>
                
                <div
                  className="inline-flex items-center justify-center gap-2 cursor-pointer group mt-1.5 px-3 py-1 rounded-full hover:bg-[#0F172A] border border-transparent hover:border-[#1E293B] transition-colors"
                  onClick={() => currentTrack.uploaderId && onArtistClick && onArtistClick(currentTrack.uploaderId)}
                >
                  {profilePicture ? (
                    <img 
                      src={profilePicture} 
                      className="w-5 h-5 rounded-full border border-[#1E293B] object-cover group-hover:scale-105 transition-transform" 
                      alt="Profile" 
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#1877F2] flex items-center justify-center text-white text-[10px] font-bold">
                      {displayName?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#F8FAFC] text-sm font-semibold">{displayName}</span>
                    {displayUser?.isVerified && (
                      <VerifiedBadge size={14} className="shrink-0" />
                    )}
                  </div>
                  <span className="text-[#64748B] text-xs">• {userRole}</span>
                </div>

                {totalPlays > 0 && (
                  <div className="mt-2.5">
                    <div className="inline-flex items-center gap-1.5 bg-[#0F172A] border border-[#1E293B] px-3 py-1 rounded-full">
                      <i className="fas fa-headphones text-xs text-[#1877F2]"></i>
                      <span className="text-xs font-medium text-[#94A3B8]">
                        {totalPlaysLoading ? '...' : `${totalPlays.toLocaleString()} plays`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Controls Card matching Feed Dark Theme (#0F172A) */}
            <div className="relative z-10 px-4 sm:px-6 pt-3 pb-6 sm:pb-8 bg-[#0F172A] border-t border-[#1E293B]">
              <div className="max-w-xl mx-auto">
                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-[#94A3B8] font-medium mb-1.5">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#1877F2] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1877F2]"
                  />
                </div>

                {/* Primary controls */}
                <div className="flex items-center justify-between px-2 mb-3">
                  <button
                    onClick={() => setIsShuffling(!isShuffling)}
                    className={`p-2 rounded-lg transition-colors ${isShuffling ? 'text-[#1877F2]' : 'text-[#64748B] hover:text-[#F8FAFC]'}`}
                    aria-label="Shuffle"
                  >
                    <i className="fas fa-random text-base"></i>
                  </button>

                  <button 
                    onClick={onPrevious} 
                    className="p-2 text-[#94A3B8] hover:text-[#1877F2] transition-colors"
                    aria-label="Previous track"
                  >
                    <i className="fas fa-step-backward text-xl"></i>
                  </button>

                  <button
                    onClick={onTogglePlay}
                    className="w-14 h-14 bg-[#1877F2] hover:bg-[#166fe5] active:scale-95 rounded-full flex items-center justify-center shadow-lg shadow-[#1877F2]/30 hover:scale-105 transition-all"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play ml-0.5'} text-white text-xl`}></i>
                  </button>

                  <button 
                    onClick={onNext} 
                    className="p-2 text-[#94A3B8] hover:text-[#1877F2] transition-colors"
                    aria-label="Next track"
                  >
                    <i className="fas fa-step-forward text-xl"></i>
                  </button>

                  <button
                    onClick={() => setIsRepeating(!isRepeating)}
                    className={`p-2 rounded-lg transition-colors ${isRepeating ? 'text-[#1877F2]' : 'text-[#64748B] hover:text-[#F8FAFC]'}`}
                    aria-label="Repeat"
                  >
                    <i className="fas fa-redo text-base"></i>
                  </button>
                </div>

                {/* Secondary controls: Stop, Volume, and Download */}
                <div className="flex items-center justify-between px-2 pt-1 border-t border-[#1E293B]/60">
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors"
                  >
                    <i className="fas fa-stop text-xs"></i>
                    <span className="text-xs font-medium">Stop</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <i className="fas fa-volume-down text-[#64748B] text-xs"></i>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-20 sm:w-28 h-1 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#1877F2]"
                    />
                    <i className="fas fa-volume-up text-[#64748B] text-xs"></i>
                  </div>

                  <button 
                    onClick={downloadCurrentTrack} 
                    disabled={isDownloading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      isDownloading 
                        ? 'bg-[#1877F2]/20 text-[#38BDF8] border border-[#1877F2]/40' 
                        : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
                    }`}
                    title={isDownloading ? `Downloading ${downloadProgress}%` : 'Download audio'}
                  >
                    <i className={`fas ${
                      isDownloading ? 'fa-spinner fa-spin text-[#38BDF8]' : 'fa-download'
                    } text-xs`}></i>
                    <span className="text-xs font-medium">
                      {isDownloading 
                        ? (downloadProgress > 0 ? `${downloadProgress}%` : 'Saving...') 
                        : 'Download'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Mini Player Bar matching feed card dark theme (#0F172A) */
          <div className="flex items-center justify-between h-full px-4 bg-[#0F172A] border-t border-[#1E293B]">
            <div 
              className="flex items-center gap-3 flex-1 cursor-pointer overflow-hidden mr-2"
              onClick={() => setExpanded(true)}
            >
              <div className="relative flex-shrink-0">
                <div className={`w-11 h-11 rounded-lg overflow-hidden border border-[#1E293B] ${isPlaying ? 'ring-2 ring-[#1877F2]/40' : ''}`}>
                  <img 
                    src={trackCover} 
                    alt="Album Art" 
                    className="w-full h-full object-cover"
                  />
                </div>
                {isPlaying && (
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#1877F2] rounded-full ring-2 ring-[#0F172A] animate-pulse"></div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-[#F8FAFC] font-semibold text-sm truncate">{currentTrack.title}</h4>
                <div className="flex items-center gap-1 mt-0.5">
                  {profilePicture ? (
                    <img 
                      src={profilePicture} 
                      className="w-3 h-3 rounded-full object-cover"
                      alt="Profile"
                    />
                  ) : null}
                  <span className="text-[#94A3B8] text-xs truncate flex items-center gap-1">
                    {displayName}
                    {displayUser?.isVerified && (
                      <VerifiedBadge size={12} className="shrink-0" />
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLike(String(currentTrack.id), currentTrack.type);
                }}
                className="w-8 h-8 rounded-full hover:bg-[#1E293B] flex items-center justify-center text-sm transition-transform active:scale-95"
                aria-label="Like"
              >
                <i className={`${isLiked ? 'fas text-[#F43F5E]' : 'far text-[#94A3B8]'} fa-heart`}></i>
              </button>

              <button 
                onClick={onPrevious} 
                className="w-8 h-8 rounded-full hover:bg-[#1E293B] flex items-center justify-center text-sm text-[#94A3B8] hover:text-white transition-colors"
                aria-label="Previous"
              >
                <i className="fas fa-step-backward"></i>
              </button>

              <button
                onClick={onTogglePlay}
                className="w-9 h-9 rounded-full bg-[#1877F2] hover:bg-[#166fe5] flex items-center justify-center transition-colors shadow-md shadow-[#1877F2]/30 active:scale-95"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play ml-0.5'} text-white text-xs`}></i>
              </button>

              <button 
                onClick={onNext} 
                className="w-8 h-8 rounded-full hover:bg-[#1E293B] flex items-center justify-center text-sm text-[#94A3B8] hover:text-white transition-colors"
                aria-label="Next"
              >
                <i className="fas fa-step-forward"></i>
              </button>

              <button
                onClick={downloadCurrentTrack}
                disabled={isDownloading}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  isDownloading 
                    ? 'bg-[#1877F2]/20 text-[#38BDF8]' 
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
                }`}
                title={isDownloading ? `Downloading ${downloadProgress}%` : 'Download audio'}
                aria-label="Download"
              >
                {isDownloading ? (
                  <i className="fas fa-spinner fa-spin text-xs"></i>
                ) : (
                  <i className="fas fa-download text-xs"></i>
                )}
              </button>

              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full hover:bg-rose-500/20 text-[#64748B] hover:text-rose-400 flex items-center justify-center text-sm transition-colors"
                aria-label="Close"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin-slow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin-slow {
            animation: spin-slow 20s linear infinite;
          }
          @keyframes ping {
            75%, 100% { transform: scale(1.2); opacity: 0; }
          }
          .animate-ping {
            animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
          }
        `}</style>
      </div>
    </>
  );
};

/* =========================================================
   UPLOAD MODAL (Full Page Version with Native Support - Fixed)
========================================================= */

interface AudioUploadModalProps {
  currentUser: User;
  onClose: () => void;
  onUploaded: () => void;
  initialNativeAudioFile?: File | null;
  initialNativeCoverFile?: File | null;
  onUploadProgress?: (state: PostUploadState | null | ((prev: PostUploadState | null) => PostUploadState | null)) => void;
}

const AudioUploadModal: React.FC<AudioUploadModalProps> = ({ 
  currentUser, 
  onClose, 
  onUploaded,
  initialNativeAudioFile,
  initialNativeCoverFile,
  onUploadProgress,
}) => {
  const [mode, setMode] = useState<'single' | 'album'>('single');
  const [artist, setArtist] = useState((currentUser as any).name || (currentUser as any).username || '');
  const [genre, setGenre] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [title, setTitle] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [albumTitle, setAlbumTitle] = useState('');
  const [albumTracks, setAlbumTracks] = useState<{ title: string; file: File; coverFile?: File | null; artist?: string }[]>([]);

  const [tempTrackTitle, setTempTrackTitle] = useState('');
  const [tempTrackArtist, setTempTrackArtist] = useState(artist);
  const [tempTrackFile, setTempTrackFile] = useState<File | null>(null);
  const [tempTrackCoverFile, setTempTrackCoverFile] = useState<File | null>(null);
  const tempTrackCoverInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialNativeAudioFile && !audioFile) {
      setAudioFile(initialNativeAudioFile);
    }
  }, [initialNativeAudioFile, audioFile]);

  useEffect(() => {
    if (initialNativeCoverFile && !coverFile) {
      setCoverFile(initialNativeCoverFile);
      setCoverPreview(URL.createObjectURL(initialNativeCoverFile));
    }
  }, [initialNativeCoverFile, coverFile]);

  useEffect(() => {
    const handleAlbumTrackAudio = (event: any) => {
      const file = event.detail;
      if (file) {
        setTempTrackFile(file);
        console.log('📀 Album track audio received:', file.name);
      }
    };

    window.addEventListener('albumTrackAudioSelected', handleAlbumTrackAudio);
    return () => {
      window.removeEventListener('albumTrackAudioSelected', handleAlbumTrackAudio);
    };
  }, []);

  useEffect(() => {
    const handleAlbumTrackCover = (event: any) => {
      const file = event.detail;
      if (file) {
        setTempTrackCoverFile(file);
        console.log('📀 Album track cover received:', file.name);
      }
    };

    window.addEventListener('albumTrackCoverSelected', handleAlbumTrackCover);
    return () => {
      window.removeEventListener('albumTrackCoverSelected', handleAlbumTrackCover);
    };
  }, []);

  const handlePickAudio = () => {
    fileInputRef.current?.click();
  };

  const handlePickCover = () => {
    coverInputRef.current?.click();
  };
   
  const handlePickTrackAudio = () => {
    trackInputRef.current?.click();
  };

  const handlePickTrackCover = () => {
    tempTrackCoverInputRef.current?.click();
  };

  const handleAddTrack = () => {
    if (!tempTrackTitle || !tempTrackFile) {
      alert('Track title and audio file are required.');
      return;
    }
    setAlbumTracks((prev) => [
      ...prev, 
      { 
        title: tempTrackTitle, 
        artist: tempTrackArtist, 
        file: tempTrackFile, 
        coverFile: tempTrackCoverFile,
      }
    ]);
    setTempTrackTitle('');
    setTempTrackFile(null);
    setTempTrackCoverFile(null);
  };

  const uploadToR2 = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);

    const up = await apiForm<{ success: boolean; url: string; key: string }>(
      "/api/upload",
      fd
    );

    if (!up.success) throw new Error(up.error || "Upload failed");
    if (!(up.data as any)?.url) throw new Error("Upload failed: missing url");
    return (up.data as any).url as string;
  };

  const uploadSingle = async () => {
    if (!title.trim()) return alert("Title required");
    if (!audioFile) return alert("Audio file required");

    const trackTitle = title.trim();
    const trackArtist = (artist || "").trim();
    const trackGenre = (genre || "").trim() || null;
    const coverToProcess = coverFile;
    const audioToUpload = audioFile;
    const preview = coverPreview || DEFAULT_MUSIC_COVER;

    // Immediately close modal so creator can continue browsing and listening
    onClose();

    if (onUploadProgress) {
      onUploadProgress({
        isUploading: true,
        progress: 15,
        title: `Publishing "${trackTitle}"…`,
        secondaryStatus: 'Uploading high-fidelity audio...',
        previewUrl: preview,
        isSuccess: false,
      });
    }

    try {
      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({ ...prev, progress: 35, secondaryStatus: 'Uploading audio to UNERA CDN...' }) : null);
      }
      const audioUrl = await uploadToR2(audioToUpload);

      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({ ...prev, progress: 65, secondaryStatus: 'Compressing cover artwork...' }) : null);
      }
      const coverUrl = coverToProcess ? await uploadCompressedCoverToR2(coverToProcess) : null;
      const finalCoverUrl = coverUrl || DEFAULT_MUSIC_COVER;

      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({ ...prev, progress: 85, secondaryStatus: 'Registering track with creator library...' }) : null);
      }
      
      const payload = {
        uploader_id: Number((currentUser as any).id),
        title: trackTitle,
        artist_name: trackArtist,
        album_name: "Single",
        cover_image_url: finalCoverUrl,
        audio_url: audioUrl,
        duration_seconds: null,
        genre: trackGenre,
      };

      const res = await apiJson<any>("/api/songs", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to publish song");
      }

      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({
          ...prev,
          isUploading: false,
          isSuccess: true,
          progress: 100,
          title: 'Track published!',
          secondaryStatus: 'Your music is now live on UNERA.',
        }) : null);

        setTimeout(() => {
          onUploadProgress(null);
        }, 2800);
      }

      onUploaded();
    } catch (e: any) {
      console.error(e);
      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({
          ...prev,
          isUploading: false,
          isSuccess: false,
          progress: 0,
          title: 'Upload failed',
          secondaryStatus: e?.message || 'Something went wrong',
          error: e?.message,
        }) : null);

        setTimeout(() => {
          onUploadProgress(null);
        }, 4000);
      }
    }
  };

  const uploadAlbum = async () => {
    if (!albumTitle.trim()) return alert("Album title required");
    if (albumTracks.length === 0) return alert("Add at least 1 track");

    const albTitle = albumTitle.trim();
    const tracksToUpload = [...albumTracks];
    const sharedCoverFile = coverFile;
    const albArtist = (artist || "").trim();
    const albGenre = (genre || "").trim() || null;
    const preview = coverPreview || DEFAULT_MUSIC_COVER;

    // Immediately close modal
    onClose();

    if (onUploadProgress) {
      onUploadProgress({
        isUploading: true,
        progress: 10,
        title: `Publishing album "${albTitle}"…`,
        secondaryStatus: `Preparing ${tracksToUpload.length} tracks...`,
        previewUrl: preview,
        isSuccess: false,
      });
    }

    try {
      const sharedCoverUrl = sharedCoverFile ? await uploadCompressedCoverToR2(sharedCoverFile) : null;

      for (let i = 0; i < tracksToUpload.length; i++) {
        const t = tracksToUpload[i];
        const stepProgress = 15 + Math.round(((i + 0.5) / tracksToUpload.length) * 75);

        if (onUploadProgress) {
          onUploadProgress((prev) => prev ? ({
            ...prev,
            progress: stepProgress,
            secondaryStatus: `Uploading track ${i + 1} of ${tracksToUpload.length} ("${t.title}")...`,
          }) : null);
        }

        const audioUrl = await uploadToR2(t.file);
        const trackCoverUrl = t.coverFile ? await uploadCompressedCoverToR2(t.coverFile) : null;
        const coverUrl = trackCoverUrl || sharedCoverUrl || DEFAULT_MUSIC_COVER;

        const payload = {
          uploader_id: Number((currentUser as any).id),
          title: (t.title || "").trim(),
          artist_name: (t.artist || albArtist).trim(),
          album_name: albTitle,
          cover_image_url: coverUrl,
          audio_url: audioUrl,
          duration_seconds: null,
          genre: albGenre,
        };

        const res = await apiJson<any>("/api/songs", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (!res.success) {
          throw new Error(`Failed uploading "${t.title}": ${res.error}`);
        }
      }

      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({
          ...prev,
          isUploading: false,
          isSuccess: true,
          progress: 100,
          title: 'Album published!',
          secondaryStatus: `All ${tracksToUpload.length} tracks are now live.`,
        }) : null);

        setTimeout(() => {
          onUploadProgress(null);
        }, 2800);
      }

      onUploaded();
    } catch (e: any) {
      console.error(e);
      if (onUploadProgress) {
        onUploadProgress((prev) => prev ? ({
          ...prev,
          isUploading: false,
          isSuccess: false,
          progress: 0,
          title: 'Album upload failed',
          secondaryStatus: e?.message || 'Something went wrong',
          error: e?.message,
        }) : null);

        setTimeout(() => {
          onUploadProgress(null);
        }, 4000);
      }
    }
  };

  const handleSubmit = async () => {
    if (mode === 'single') await uploadSingle();
    if (mode === 'album') await uploadAlbum();
  };

  return (
    <div className="w-full">
      <div className="bg-transparent w-full max-w-5xl mx-auto overflow-hidden flex flex-col">
        <div className="p-5 border-b border-[#1E293B] bg-[#0F172A] rounded-t-2xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-[#FFF] text-2xl font-bold">Professional Upload</h2>
              <p className="text-[#888] text-sm">Distribute your content to F-Music</p>
            </div>
            <i className="fas fa-times text-[#888] cursor-pointer text-xl hover:text-white transition-colors" onClick={onClose}></i>
          </div>

          <div className="flex p-1 bg-[#070D1D] border border-[#1E293B] rounded-lg">
            {['single', 'album'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m as any)}
                className={`flex-1 py-2.5 rounded-md font-bold capitalize text-sm transition-all ${
                  mode === m ? 'bg-[#1877F2] text-white shadow-lg' : 'text-[#888] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">Main Artist Name</label>
                <input
                  className="w-full bg-[#070D1D] border border-[#1E293B] p-3 rounded-lg text-white outline-none focus:border-[#1877F2]"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">Genre / Category</label>
                <input
                  className="w-full bg-[#070D1D] border border-[#1E293B] p-3 rounded-lg text-white outline-none focus:border-[#1877F2]"
                  placeholder="Pop, Hip Hop, R&B..."
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">{mode === 'album' ? 'Album Artwork' : 'Artwork'}</label>
                <div
                  onClick={handlePickCover}
                  className="w-full bg-[#070D1D] border border-[#1E293B] rounded-lg h-[120px] flex flex-col items-center justify-center cursor-pointer hover:border-[#1877F2] group relative overflow-hidden"
                >
                  {coverPreview ? (
                    <img src={coverPreview} className="w-full h-full object-cover" alt="Cover Preview" />
                  ) : (
                    <>
                      <i className="fas fa-image text-2xl text-[#666] group-hover:text-white mb-2"></i>
                      <span className="text-[#666] text-xs group-hover:text-white">Tap to select image</span>
                      <span className="text-[#666] text-xs group-hover:text-white mt-1">Camera or gallery</span>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  ref={coverInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setCoverFile(f);
                      setCoverPreview(URL.createObjectURL(f));
                    }
                  }}
                />
              </div>

              {mode === 'single' && (
                <div>
                  <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">Audio File</label>
                  <div
                    onClick={handlePickAudio}
                    className="border-2 border-dashed border-[#1E293B] bg-[#070D1D] rounded-lg h-[86px] flex items-center justify-center cursor-pointer hover:border-[#1877F2] group"
                  >
                    {audioFile ? (
                      <div className="text-[#1877F2] font-semibold flex items-center gap-2">
                        <i className="fas fa-check-circle"></i> {audioFile.name}
                      </div>
                    ) : (
                      <div className="text-[#666] group-hover:text-white flex items-center gap-2">
                        <i className="fas fa-cloud-upload-alt"></i> Tap to select audio file
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAudioFile(f);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#1E293B] pt-6">
            {mode === 'single' && (
              <div>
                <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">Song Name</label>
                <input
                  className="w-full bg-[#070D1D] border border-[#1E293B] p-3 rounded-lg text-white outline-none focus:border-[#1877F2] text-lg font-bold"
                  placeholder="Enter song title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            )}

            {mode === 'album' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[#888] text-xs font-bold mb-1.5 uppercase">Album Name</label>
                  <input
                    className="w-full bg-[#070D1D] border border-[#1E293B] p-3 rounded-lg text-white outline-none focus:border-[#1877F2] text-lg font-bold"
                    placeholder="Enter album title..."
                    value={albumTitle}
                    onChange={(e) => setAlbumTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-white font-bold flex items-center gap-2">
                    <i className="fas fa-list-ol text-[#1877F2]"></i> Add Tracks to Album
                  </h4>

                  <div className="space-y-2 mb-4">
                    {albumTracks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-[#070D1D] border border-[#1E293B] rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-[#666] font-mono">{idx + 1}</span>
                          <img src={t.coverFile ? URL.createObjectURL(t.coverFile) : (coverPreview || DEFAULT_MUSIC_COVER)} className="w-8 h-8 rounded object-cover" alt="" />
                          <div>
                            <span className="text-white font-semibold block">{t.title}</span>
                            <span className="text-[#666] text-xs">{t.artist}</span>
                          </div>
                        </div>
                        <i className="fas fa-trash text-red-500 cursor-pointer" onClick={() => setAlbumTracks(albumTracks.filter((_, i) => i !== idx))}></i>
                      </div>
                    ))}
                    {albumTracks.length === 0 && <div className="text-[#666] text-sm text-center py-2">No tracks added yet.</div>}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="bg-[#070D1D] border border-[#1E293B] p-2 rounded text-white text-sm" placeholder="Song Name" value={tempTrackTitle} onChange={(e) => setTempTrackTitle(e.target.value)} />
                      <input className="bg-[#070D1D] border border-[#1E293B] p-2 rounded text-white text-sm" placeholder="Artist Name" value={tempTrackArtist} onChange={(e) => setTempTrackArtist(e.target.value)} />
                    </div>
                    <div
                      onClick={handlePickTrackCover}
                      className="w-full bg-[#070D1D] border border-[#1E293B] p-2 rounded text-sm text-[#888] hover:text-white cursor-pointer"
                    >
                      {tempTrackCoverFile ? (
                        <span className="text-[#1877F2] font-bold">
                          <i className="fas fa-image"></i> {tempTrackCoverFile.name}
                        </span>
                      ) : (
                        'Select Track Cover (Optional)'
                      )}
                    </div>
                    <input
                      type="file"
                      ref={tempTrackCoverInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setTempTrackCoverFile(f);
                      }}
                    />

                    <div className="flex items-center gap-2 mt-2">
                      <div
                        onClick={handlePickTrackAudio}
                        className="flex-1 bg-[#0B1120] hover:bg-[#1E293B] p-2 rounded text-center cursor-pointer text-sm text-[#888] hover:text-white transition-colors border border-[#1E293B]"
                      >
                        {tempTrackFile ? (
                          <span className="text-[#1877F2] font-bold">
                            <i className="fas fa-file-audio"></i> {tempTrackFile.name}
                          </span>
                        ) : (
                          'Select Audio File'
                        )}
                      </div>

                      <button onClick={handleAddTrack} className="bg-[#1877F2] text-white px-6 py-2 rounded text-sm font-bold hover:bg-[#166FE5]">
                        Add Track
                      </button>
                    </div>

                    <input
                      type="file"
                      ref={trackInputRef}
                      className="hidden"
                      accept="audio/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setTempTrackFile(f);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-[#1E293B] bg-[#0F172A] flex justify-end rounded-b-2xl">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 text-white py-3 px-8 rounded-xl font-bold transition-all shadow-lg text-lg flex items-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Publishing...
              </>
            ) : (
              <>
                <i className="fas fa-cloud-upload-alt"></i> Publish Content
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   API HELPER FUNCTIONS FOR PLAYS AND LIKES
========================================================= */

async function recordSongPlay(songId: string, userId: any) {
  try {
    const a = await apiJson<any>(`/api/songs/${encodeURIComponent(songId)}/play`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId ?? null }),
    });
    if (a.success) return a.data;
  } catch (error) {
    console.warn('New play endpoint failed, trying fallback...');
  }

  try {
    const b = await apiJson<any>(`/api/song-plays`, {
      method: "POST",
      body: JSON.stringify({ song_id: songId, user_id: userId ?? null }),
    });
    return b.success ? b.data : null;
  } catch (error) {
    console.error('All play endpoints failed:', error);
    return null;
  }
}

async function toggleSongLike(songId: string, userId: any, method: 'POST' | 'DELETE' = 'POST') {
  try {
    const a = await apiJson<any>(`/api/songs/${encodeURIComponent(songId)}/like`, {
      method: method,
      body: JSON.stringify({ user_id: userId }),
    });
    if (a.success) return a.data;
  } catch (error) {
    console.warn('New like endpoint failed, trying fallback...');
  }

  try {
    const endpoint = method === 'DELETE' 
      ? `/api/song-likes?song_id=${encodeURIComponent(songId)}&user_id=${encodeURIComponent(userId)}`
      : '/api/song-likes';
    
    const b = await apiJson<any>(endpoint, {
      method: method,
      body: method === 'DELETE' ? undefined : JSON.stringify({ song_id: songId, user_id: userId }),
    });
    return b.success ? b.data : null;
  } catch (error) {
    console.error('All like endpoints failed:', error);
    return null;
  }
}

/* =========================================================
   MAIN MUSIC SYSTEM (MODERN FEED LAYOUT)
========================================================= */

interface MusicSystemProps {
  currentUser: User | null;
  onPlayTrack: (track: AudioTrack) => void;
  onProfileClick?: (id: number) => void;
  likedTracks: string[];
  onToggleLike: (key: string, liked: boolean) => void;
  playHistory: AudioTrack[];
  onFollow: (userId: number) => Promise<void>;
  checkIsFollowing: (userId: number) => boolean;
  users?: User[];
  currentTrack?: AudioTrack | null;
  isPlaying?: boolean;
  myTotalPlays?: number;
  playsLoading?: boolean;
  trackPlays?: Record<string, number>;
  reactionCounts?: Record<string, { count: number; myReaction?: ReactionType }>;
  commentCounts?: Record<string, number>;
  shareCounts?: Record<string, number>;
  onReact?: (track: AudioTrack, type: ReactionType) => void;
  onOpenComments?: (track: AudioTrack) => void;
  onShare?: (track: AudioTrack) => void;
  onBack?: () => void;
  uploadState?: PostUploadState | null;
  onDismissUpload?: () => void;
  onUploadStateChange?: (state: PostUploadState | null | ((prev: PostUploadState | null) => PostUploadState | null)) => void;
}

const MusicSystem: React.FC<MusicSystemProps> = ({ 
  currentUser, 
  onPlayTrack, 
  onProfileClick, 
  likedTracks: initialLikedTracks, 
  onToggleLike,
  playHistory,
  onFollow,
  checkIsFollowing,
  users = [],
  currentTrack,
  isPlaying,
  myTotalPlays = 0,
  playsLoading = false,
  trackPlays = {},
  reactionCounts = {},
  commentCounts = {},
  shareCounts = {},
  onReact,
  onOpenComments,
  onShare,
  onBack,
  uploadState,
  onDismissUpload,
  onUploadStateChange,
}) => {
  const [localUploadState, setLocalUploadState] = useState<PostUploadState | null>(null);
  const activeUploadState = uploadState !== undefined ? uploadState : localUploadState;
  const dismissUpload = onDismissUpload || (() => setLocalUploadState(null));
  const setUploadProgressState = onUploadStateChange || setLocalUploadState;

  const [view, setView] = useState<'music' | 'upload' | 'dashboard' | 'artist' | 'albums' | 'album'>('music');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  const [songs, setSongs] = useState<Song[]>(() => {
    const cached = getCachedSongs();
    return Array.isArray(cached) && cached.length > 0 ? cached : [];
  });
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [likedTracks, setLikedTracks] = useState<string[]>(initialLikedTracks);
  const [downloads, setDownloads] = useState<string[]>([]);

  const [nativeAudioFile, setNativeAudioFile] = useState<File | null>(null);
  const [nativeCoverFile, setNativeCoverFile] = useState<File | null>(null);

  const isAdmin = (currentUser as any)?.role === 'admin';
  const musicSeed = useMemo(() => Date.now(), []);
   
  // ✅ Local reaction handler that connects to parent
  const handleMusicReact = useCallback((track: AudioTrack, type: ReactionType) => {
    if (!currentUser) {
      alert('Please login to react.');
      return;
    }
    
    if (onReact) {
      onReact(track, type);
    }
  }, [currentUser, onReact]);

  useEffect(() => {
    const handleNativeUpload = (event: any) => {
      const media = event.detail;
      console.log('📱 MusicSystem: Native upload received:', media);
      
      if (!media) return;
      
      const url = media.full || media.feed || media.url || '';
      const isAudioByUrl = /\.(mp3|wav|m4a|ogg|aac|flac|webm)$/i.test(url);
      const isAudioByMime = media.mimeType?.startsWith('audio/');
      const isExplicitAudio = media.type === 'audio';
      const isAudio = isExplicitAudio || isAudioByUrl || isAudioByMime;
      
      const isImage = media.type === 'image' || media.mimeType?.startsWith('image/');
      
      const pendingType = getPendingUploadType();
      console.log('📱 Pending type:', pendingType);
      
      if (isAudio && pendingType === 'audio') {
        const audioUrl = media.full || media.feed || media.url;
        if (audioUrl) {
          fetch(audioUrl)
            .then(res => res.blob())
            .then(blob => {
              const ext = audioUrl.split('.').pop()?.split('?')[0] || 'mp3';
              const file = new File([blob], `native-audio-${Date.now()}.${ext}`, { type: media.mimeType || 'audio/mpeg' });
              setNativeAudioFile(file);
              console.log('✅ Single audio file created:', file.name);
            })
            .catch(err => console.error('Failed to process native audio:', err));
        }
        setPendingUploadType(null);
      } 
      else if (isAudio && pendingType === 'album_track_audio') {
        const audioUrl = media.full || media.feed || media.url;
        if (audioUrl) {
          fetch(audioUrl)
            .then(res => res.blob())
            .then(blob => {
              const ext = audioUrl.split('.').pop()?.split('?')[0] || 'mp3';
              const file = new File([blob], `album-track-audio-${Date.now()}.${ext}`, { type: media.mimeType || 'audio/mpeg' });
              window.dispatchEvent(new CustomEvent('albumTrackAudioSelected', { detail: file }));
              console.log('✅ Album track audio file created:', file.name);
            })
            .catch(err => console.error('Failed to process album track audio:', err));
        }
        setPendingUploadType(null);
      }
      else if (isImage && pendingType === 'cover') {
        const imageUrl = media.full || media.feed || media.url;
        if (imageUrl) {
          fetch(imageUrl)
            .then(res => res.blob())
            .then(blob => {
              const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
              const file = new File([blob], `native-cover-${Date.now()}.${ext}`, { type: 'image/jpeg' });
              setNativeCoverFile(file);
              console.log('✅ Cover file created:', file.name);
            })
            .catch(err => console.error('Failed to process native cover:', err));
        }
        setPendingUploadType(null);
      }
      else if (isImage && pendingType === 'album_track_cover') {
        const imageUrl = media.full || media.feed || media.url;
        if (imageUrl) {
          fetch(imageUrl)
            .then(res => res.blob())
            .then(blob => {
              const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
              const file = new File([blob], `album-track-cover-${Date.now()}.${ext}`, { type: 'image/jpeg' });
              window.dispatchEvent(new CustomEvent('albumTrackCoverSelected', { detail: file }));
              console.log('✅ Album track cover file created:', file.name);
            })
            .catch(err => console.error('Failed to process album track cover:', err));
        }
        setPendingUploadType(null);
      }
    };

    window.addEventListener('uneraNativeUpload', handleNativeUpload);
    return () => {
      window.removeEventListener('uneraNativeUpload', handleNativeUpload);
    };
  }, []);

  const albums = useMemo(() => {
    const grouped = new Map<string, Song[]>();
    songs.forEach((song) => {
      const rawAlbum = String(song.album || '').trim();
      const albumName = rawAlbum || 'Single';
      if (!grouped.has(albumName)) grouped.set(albumName, []);
      grouped.get(albumName)!.push(song);
    });
    return Array.from(grouped.entries()).map(([name, albumSongs]) => {
      const sortedSongs = [...albumSongs].sort((a, b) => {
        const aDate = new Date(a.uploadDate || 0).getTime();
        const bDate = new Date(b.uploadDate || 0).getTime();
        return aDate - bDate;
      });
      const firstSong = sortedSongs[0];
      return {
        name,
        songs: sortedSongs,
        cover: firstSong?.cover || DEFAULT_MUSIC_COVER,
        artist: users.find((u) => u.id === firstSong?.uploaderId)?.name || 
                users.find((u) => u.id === firstSong?.uploaderId)?.username || 
                firstSong?.artist || 'Unknown Artist',
        totalTracks: sortedSongs.length,
      };
    });
  }, [songs, users]);

  const selectedAlbumData = useMemo(() => {
    if (!selectedAlbum) return null;
    return albums.find((a) => a.name === selectedAlbum) || null;
  }, [albums, selectedAlbum]);

  useEffect(() => {
    setLikedTracks(initialLikedTracks || []);
  }, [initialLikedTracks]);

  const fetchMyLikes = useCallback(async () => {
    if (!currentUser) return;

    const userId = String((currentUser as any).id);

    try {
      const songLikesRes = await apiJson<any[]>(`/api/song-likes?userId=${encodeURIComponent(userId)}`);
      const songIds = songLikesRes.success ? (songLikesRes.data || []).map((x: any) => String(x.song_id ?? x.id)) : [];
      const newLikedTracks = songIds.map((id: string) => `music:${id}`);
      
      setLikedTracks(newLikedTracks);
      
      if (newLikedTracks.length !== initialLikedTracks.length || 
          !newLikedTracks.every(k => initialLikedTracks.includes(k))) {
        newLikedTracks.forEach(key => {
          onToggleLike(key, true);
        });
      }
    } catch (error) {
      console.error('Failed to fetch likes:', error);
    }
  }, [currentUser, onToggleLike, initialLikedTracks]);

  useEffect(() => {
    fetchMyLikes();
  }, [fetchMyLikes]);

  const isTrackLiked = useCallback((id: string | number): boolean => {
    return likedTracks.includes(`music:${String(id)}`);
  }, [likedTracks]);

  const toggleLike = useCallback(async (id: string | number) => {
    if (!currentUser) return;

    const trackId = String(id);
    const key = `music:${trackId}`;
    const isLiked = likedTracks.includes(key);
    const userId = String((currentUser as any).id);

    setLikedTracks(prev => {
      if (isLiked) {
        return prev.filter(x => x !== key);
      } else {
        return [...prev, key];
      }
    });
    
    onToggleLike(key, !isLiked);

    try {
      const res = await toggleSongLike(trackId, userId, isLiked ? 'DELETE' : 'POST');

      if (res) {
        const likesCount = Number(res.likes_count ?? res.likes ?? res.count ?? 0);
        
        setSongs(prev => prev.map(song =>
          String(song.id) === trackId
            ? { 
                ...song, 
                stats: { 
                  ...(song.stats || {}), 
                  likes: Math.max(likesCount, (song.stats as any)?.likes || 0)
                } 
              }
            : song
        ));
      }
    } catch (error) {
      console.error('Failed to sync like count from backend:', error);
      setLikedTracks(prev => isLiked ? [...prev, key] : prev.filter(x => x !== key));
      onToggleLike(key, isLiked);
    }
  }, [currentUser, likedTracks, onToggleLike]);

  const fetchSongs = useCallback(async () => {
    const cached = getCachedSongs();
    if (!cached || cached.length === 0) {
      setLoadingSongs(true);
    }
    setError(null);
    const res = await apiJson<any[]>('/api/songs', { method: 'GET' });
    if (!res.success) {
      if (!cached || cached.length === 0) {
        setError(res.error);
      }
      setLoadingSongs(false);
      return;
    }
    const arr = Array.isArray(res.data) ? res.data : (res.data as any)?.results || [];
    const mapped = arr.map(mapSongFromApi);
    setSongs(mapped);
    setCachedSongs(mapped);
    setLoadingSongs(false);
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const handlePlayTrackFromSong = useCallback((song: Song) => {
    const uploaderProfile = users.find((u) => u.id === song.uploaderId);
    const artistName = uploaderProfile?.name || uploaderProfile?.username || song.artist;
    
    const audioTrack: AudioTrack = {
      id: String(song.id),
      title: song.title,
      artist: artistName,
      duration:
        typeof song.duration === 'string'
          ? (() => {
              const parts = song.duration.split(':');
              const mm = Number(parts[0] || 0);
              const ss = Number(parts[1] || 0);
              return mm * 60 + ss || 180;
            })()
          : (song.duration as any) || 180,
      url: song.audioUrl || '',
      uploaderId: song.uploaderId || 1,
      cover: song.cover || DEFAULT_MUSIC_COVER,
      type: 'music',
      isVerified: Boolean((uploaderProfile as any)?.isVerified),
      likesCount: Number((song.stats as any)?.likes || 0),
    } as any;

    onPlayTrack(audioTrack);
  }, [users, onPlayTrack]);

  const handleArtistClick = (uploaderId: number) => {
    if (onProfileClick) onProfileClick(uploaderId);
    else {
      setSelectedArtistId(uploaderId);
      setView('artist');
    }
  };

  const deleteSong = async (id: string) => {
    if (!currentUser) return;
    const userId = (currentUser as any).id;

    // Optimistic immediate removal
    setSongs((prev) => prev.filter((s) => String(s.id) !== String(id)));

    try {
      await fetch(`/api/songs?id=${encodeURIComponent(id)}&user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('Failed to delete song', e);
    }
  };

  const filteredSongs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [songs, searchQuery]);

  const rankedAllSongs = useMemo(() => {
    return rankMusicSongs(songs, currentUser, trackPlays, musicSeed, 'all');
  }, [songs, currentUser, trackPlays, musicSeed]);

  const trendingSongs = useMemo(() => {
    return rankMusicSongs(songs, currentUser, trackPlays, musicSeed, 'trending').slice(0, 12);
  }, [songs, currentUser, trackPlays, musicSeed]);

  const handpickedSongs = useMemo(() => {
    return rankMusicSongs(songs, currentUser, trackPlays, musicSeed + 11, 'gems').slice(0, 12);
  }, [songs, currentUser, trackPlays, musicSeed]);

  const bestPickSongs = useMemo(() => {
    return rankMusicSongs(songs, currentUser, trackPlays, musicSeed + 22, 'balanced').slice(0, 12);
  }, [songs, currentUser, trackPlays, musicSeed]);

  const freshVibeSongs = useMemo(() => {
    return rankMusicSongs(songs, currentUser, trackPlays, musicSeed + 33, 'fresh').slice(0, 12);
  }, [songs, currentUser, trackPlays, musicSeed]);

  const featuredSongs = useMemo(() => {
    return trendingSongs.slice(0, 5);
  }, [trendingSongs]);

  const heroSong = featuredSongs[heroIndex] || rankedAllSongs[0] || null;

  useEffect(() => {
    if (featuredSongs.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % featuredSongs.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredSongs.length]);

  const showLoading = loadingSongs && view === 'music';

  return (
    <div className="min-h-screen bg-[#050B18] text-[#F8FAFC] font-sans">
      {/* Navigation Tabs */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] bg-[#0B1120]/95 backdrop-blur-md z-30 px-4 py-3 border-b border-[#1E293B] flex items-center gap-4 overflow-x-auto scrollbar-hide">
        {/* Back Button */}
        <button
          onClick={() => {
            if (view !== 'music') {
              setView('music');
            } else if (onBack) {
              onBack();
            } else if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            }
          }}
          className="w-9 h-9 rounded-full bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-white flex items-center justify-center transition-colors shadow-sm shrink-0"
          aria-label="Back"
        >
          <i className="fas fa-arrow-left text-sm"></i>
        </button>

        <button onClick={() => setView('music')} className={`cursor-pointer font-bold text-sm whitespace-nowrap ${view === 'music' ? 'text-[#1877F2]' : 'text-gray-400 hover:text-white'}`}>
          MUSIC
        </button>
        <button onClick={() => setView('albums')} className={`cursor-pointer font-bold text-sm whitespace-nowrap ${view === 'albums' || view === 'album' ? 'text-[#1877F2]' : 'text-gray-400 hover:text-white'}`}>
          ALBUMS
        </button>

        {currentUser && (
          <button onClick={() => setView('dashboard')} className={`cursor-pointer font-bold text-sm whitespace-nowrap ${view === 'dashboard' ? 'text-[#1877F2]' : 'text-gray-400 hover:text-white'}`}>
            DASHBOARD
          </button>
        )}

        {selectedArtistId && (
          <button onClick={() => setView('artist')} className={`cursor-pointer font-bold text-sm whitespace-nowrap ${view === 'artist' ? 'text-[#1877F2]' : 'text-gray-400 hover:text-white'}`}>
            ARTIST
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeUploadState && (
          <div className="mb-6 animate-fade-in">
            <PostUploadProgressBanner
              uploadState={activeUploadState}
              onDismiss={dismissUpload}
            />
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <i className="fas fa-triangle-exclamation"></i>
                <span className="text-sm font-semibold">{error}</span>
              </div>
              <button onClick={() => { fetchSongs(); }} className="text-sm font-bold text-[#1877F2] hover:underline">
                Retry
              </button>
            </div>
          </div>
        )}

        {showLoading && (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* MUSIC FEED LAYOUT */}
        {view === 'music' && !showLoading && (
          <div className="space-y-8">
            {/* Mobile Entertainment Header */}
            <div className="rounded-[28px] bg-[#0F172A] border border-[#1E293B] p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">F-Music</h1>
                  <p className="text-[#94A3B8] mt-1 text-sm sm:text-base">Discover trending sounds, creators and fresh vibes</p>
                </div>
                {currentUser && (
                  <button onClick={() => setView('dashboard')} className="shrink-0 px-4 py-2 rounded-full bg-[#1877F2] text-white font-bold text-sm hover:opacity-90">
                    Studio
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search songs, artists..."
                  className="w-full bg-[#070D1D] text-[#F8FAFC] px-4 py-3 pl-11 rounded-2xl border border-[#1E293B] focus:border-[#1877F2] focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#8D96A8]"></i>
              </div>

              {/* Hero Banner */}
              {heroSong && (
                <div className="mb-5">
                  <FeaturedBannerCard
                    song={heroSong}
                    artistName={
                      users.find((u) => u.id === heroSong.uploaderId)?.name ||
                      users.find((u) => u.id === heroSong.uploaderId)?.username ||
                      heroSong.artist
                    }
                    onPlay={() => handlePlayTrackFromSong(heroSong)}
                    trackPlays={trackPlays}
                  />
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                <QuickActionCircle icon="fas fa-chart-bar" label="Charts" onClick={() => setSearchQuery('')} />
                <QuickActionCircle icon="fas fa-compact-disc" label="Albums" onClick={() => setView('albums')} />
                <QuickActionCircle icon="fas fa-list-music" label="Playlists" />
                <QuickActionCircle icon="fas fa-compact-disc" label="Genres" />
              </div>

              {/* Genre Chips */}
              <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
                {['Bongo Fleva', 'Amapiano', 'Afrobeats', 'Hip Hop', 'RnB', 'Gospel'].map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSearchQuery(genre)}
                    className="px-4 py-1.5 rounded-full bg-[#070D1D] border border-[#1E293B] text-[#94A3B8] text-sm hover:bg-[#1877F2] hover:text-white transition-colors whitespace-nowrap"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            {/* Mini now playing strip */}
            {currentUser && currentTrack && (
              <div className="rounded-2xl bg-[#0F172A] border border-[#1E293B] p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-full overflow-hidden border border-white/10 ${isPlaying ? 'animate-spin-slow' : ''}`}>
                      <img src={currentTrack.cover || DEFAULT_MUSIC_COVER} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#8D96A8] text-xs">Now Playing</p>
                      <p className="text-white font-bold truncate">{currentTrack.title}</p>
                      <p className="text-[#B8BCC7] text-sm truncate">{currentTrack.artist}</p>
                    </div>
                  </div>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center ${isPlaying ? 'bg-[#1877F2] text-white' : 'bg-[#2A2F39] text-white'}`}>
                    <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play ml-0.5'}`}></i>
                  </div>
                </div>
              </div>
            )}

            {/* Horizontal feed sections with reaction props */}
            {!searchQuery ? (
              <>
                <HorizontalMusicRow
                  title="Trending"
                  subtitle="Popular tracks with strong listener momentum"
                  songs={trendingSongs}
                  users={users}
                  isTrackLiked={isTrackLiked}
                  onPlaySong={handlePlayTrackFromSong}
                  onLikeSong={(id) => toggleLike(id)}
                  onArtistClick={handleArtistClick}
                  badgeBuilder={(song, index) => ({
                    text: index === 0 ? 'HOT' : `#${index + 1}`,
                    className: index === 0 ? 'bg-[#FF7A00] text-white' : 'bg-black/65 text-white'
                  })}
                  trackPlays={trackPlays}
                  reactionCounts={reactionCounts}
                  onReact={handleMusicReact}
                  currentUser={currentUser}
                />
                <HorizontalMusicRow
                  title="Handpicked User Gems"
                  subtitle="Quality tracks from UNERA creators"
                  songs={handpickedSongs}
                  users={users}
                  isTrackLiked={isTrackLiked}
                  onPlaySong={handlePlayTrackFromSong}
                  onLikeSong={(id) => toggleLike(id)}
                  onArtistClick={handleArtistClick}
                  badgeBuilder={() => ({
                    text: 'GEM',
                    className: 'bg-[#1877F2] text-white'
                  })}
                  trackPlays={trackPlays}
                  reactionCounts={reactionCounts}
                  onReact={handleMusicReact}
                  currentUser={currentUser}
                />
                <HorizontalMusicRow
                  title="Best Picks For You"
                  subtitle="Balanced by plays, likes, freshness and creator fairness"
                  songs={bestPickSongs}
                  users={users}
                  isTrackLiked={isTrackLiked}
                  onPlaySong={handlePlayTrackFromSong}
                  onLikeSong={(id) => toggleLike(id)}
                  onArtistClick={handleArtistClick}
                  badgeBuilder={() => ({
                    text: 'TOP',
                    className: 'bg-[#1877F2] text-white'
                  })}
                  trackPlays={trackPlays}
                  reactionCounts={reactionCounts}
                  onReact={handleMusicReact}
                  currentUser={currentUser}
                />
                <HorizontalMusicRow
                  title="Fresh Releases"
                  subtitle="New music with early listener signals"
                  songs={freshVibeSongs}
                  users={users}
                  isTrackLiked={isTrackLiked}
                  onPlaySong={handlePlayTrackFromSong}
                  onLikeSong={(id) => toggleLike(id)}
                  onArtistClick={handleArtistClick}
                  badgeBuilder={() => ({
                    text: 'NEW',
                    className: 'bg-[#1877F2] text-white'
                  })}
                  trackPlays={trackPlays}
                  reactionCounts={reactionCounts}
                  onReact={handleMusicReact}
                  currentUser={currentUser}
                />
              </>
            ) : (
              <div className="rounded-2xl bg-[#0F172A] border border-[#1E293B] p-4 shadow-sm">
                <SectionTitle title={`Search Results (${filteredSongs.length})`} subtitle="Matched songs" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredSongs.length > 0 ? (
                    filteredSongs.map((song) => {
                      const uploaderProfile = users.find((u) => u.id === song.uploaderId);
                      const artistName = uploaderProfile?.name || uploaderProfile?.username || song.artist;
                      const artistAvatar = (uploaderProfile as any)?.profileImage || (uploaderProfile as any)?.profile_image_url || null;
                      const trackKey = `music:${song.id}`;
                      const reactionData = reactionCounts?.[trackKey] || { count: 0, myReaction: undefined };
                      
                      return (
                        <MusicFeedCard
                          key={song.id}
                          song={song}
                          isLiked={isTrackLiked(String(song.id))}
                          artistName={artistName}
                          artistAvatar={artistAvatar}
                          verified={Boolean((uploaderProfile as any)?.isVerified || (uploaderProfile as any)?.is_verified)}
                          badge="PLAY"
                          badgeColor="bg-black/60 text-white"
                          onPlay={() => handlePlayTrackFromSong(song)}
                          onLike={() => toggleLike(String(song.id))}
                          onArtistClick={() => song.uploaderId && handleArtistClick(song.uploaderId)}
                          trackPlays={trackPlays}
                          reactionCount={reactionData.count}
                          myReaction={reactionData.myReaction}
                          onReact={(type) => {
                            const audioTrack: AudioTrack = {
                              id: String(song.id),
                              title: song.title,
                              artist: artistName,
                              duration: typeof song.duration === 'string' ? 180 : (song.duration as any) || 180,
                              url: song.audioUrl || '',
                              uploaderId: song.uploaderId || 1,
                              cover: song.cover || DEFAULT_MUSIC_COVER,
                              type: 'music',
                              isVerified: Boolean((uploaderProfile as any)?.isVerified),
                              likesCount: Number((song.stats as any)?.likes || 0),
                            } as any;
                            handleMusicReact(audioTrack, type);
                          }}
                          currentUser={currentUser}
                        />
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center py-10">
                      <i className="fas fa-magnifying-glass text-4xl text-[#677083] mb-3"></i>
                      <p className="text-[#B8BCC7] text-lg">No songs found</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All songs list */}
            {!searchQuery && filteredSongs.length > 0 && (
              <div className="rounded-2xl bg-[#0F172A] border border-[#1E293B] p-4 shadow-sm">
                <SectionTitle title="All Songs" subtitle="A fresh ranked mix from all UNERA creators" />
                <div className="space-y-2">
                  {rankedAllSongs.slice(0, 20).map((song, index) => {
                    const uploaderProfile = users.find((u) => u.id === song.uploaderId);
                    const artistName = uploaderProfile?.name || uploaderProfile?.username || song.artist;
                    const isCurrentTrack = currentTrack && currentTrack.type === 'music' && String(currentTrack.id) === String(song.id);
                    const playCount = getSongPlayCount(song, trackPlays);
                    return (
                      <div
                        key={song.id}
                        onClick={() => handlePlayTrackFromSong(song)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                          isCurrentTrack ? 'bg-[#1877F2]/10 border border-[#1877F2]/30' : 'hover:bg-[#1E293B]'
                        }`}
                      >
                        <div className="w-6 text-center text-[#9CA3AF] font-bold text-sm">{index + 1}</div>
                        <img src={song.cover || DEFAULT_MUSIC_COVER} alt={song.title} className="w-12 h-12 rounded-lg object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold truncate">{song.title}</p>
                          <p className="text-[#9CA3AF] text-sm truncate">{artistName}</p>
                        </div>
                        <div className="text-[#9CA3AF] text-xs hidden sm:block">{formatCompactNumber(playCount)} plays</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(String(song.id));
                          }}
                          className="w-9 h-9 rounded-full bg-[#1E293B] flex items-center justify-center"
                        >
                          <i className={`${isTrackLiked(String(song.id)) ? 'fas text-[#FF4D8D]' : 'far text-white'} fa-heart`}></i>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ALBUMS LIST VIEW */}
        {view === 'albums' && !showLoading && (
          <div className="space-y-8">
            <div>
              <div className="mb-6">
                <h2 className="text-3xl font-extrabold text-white">Albums</h2>
                <p className="text-[#A8AFBC] text-sm mt-1">Browse music projects from UNERA creators</p>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
                {albums.length > 0 ? (
                  albums.map((album) => (
                    <div
                      key={album.name}
                      onClick={() => {
                        setSelectedAlbum(album.name);
                        setView('album');
                      }}
                      className="w-[165px] sm:w-[185px] flex-shrink-0 snap-start cursor-pointer group"
                    >
                      <div className="relative rounded-xl overflow-hidden aspect-[1/1] bg-[#0B1120]">
                        <img src={album.cover} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                      </div>
                      <div className="mt-2">
                        <h3 className="font-bold text-white text-[15px] line-clamp-1">{album.name}</h3>
                        <p className="text-[#B8BCC7] text-sm mt-1 line-clamp-1">{album.artist}</p>
                        <p className="text-[#888] text-xs mt-1">{album.totalTracks} song{album.totalTracks !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <i className="fas fa-compact-disc text-5xl text-[#B0B3B8] mb-4"></i>
                    <p className="text-[#B0B3B8] text-lg">No albums found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ALBUM DETAIL VIEW */}
        {view === 'album' && selectedAlbumData && !showLoading && (
          <div className="space-y-8">
            <div className="bg-[#0F172A] rounded-2xl overflow-hidden border border-[#1E293B] shadow-sm">
              <div className="relative p-6 bg-gradient-to-br from-[#0B1528] to-[#070D1D]">
                <button onClick={() => setView('albums')} className="mb-4 w-10 h-10 rounded-full bg-[#1E293B] hover:bg-[#141E33] flex items-center justify-center text-white border border-[#1E293B]">
                  <i className="fas fa-arrow-left"></i>
                </button>
                <div className="flex items-center gap-4">
                  <img src={selectedAlbumData.cover} alt={selectedAlbumData.name} className="w-28 h-28 rounded-xl object-cover shadow-xl" />
                  <div className="min-w-0">
                    <h1 className="text-3xl font-bold text-white line-clamp-2">{selectedAlbumData.name}</h1>
                    <p className="text-white/80 mt-2">{selectedAlbumData.artist}</p>
                    <p className="text-white/70 text-sm mt-1">{selectedAlbumData.totalTracks} song{selectedAlbumData.totalTracks !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-b border-[#1E293B]">
                <button onClick={() => selectedAlbumData.songs[0] && handlePlayTrackFromSong(selectedAlbumData.songs[0])} className="bg-[#1877F2] text-white px-6 py-3 rounded-full font-bold flex items-center gap-2">
                  <i className="fas fa-play"></i> Play All ({selectedAlbumData.totalTracks})
                </button>
              </div>
              <div className="divide-y divide-[#1E293B]">
                {selectedAlbumData.songs.map((song, index) => {
                  const uploaderProfile = users.find((u) => u.id === song.uploaderId);
                  const artistName = uploaderProfile?.name || uploaderProfile?.username || song.artist;
                  return (
                    <div key={song.id} onClick={() => handlePlayTrackFromSong(song)} className="flex items-center gap-4 p-4 hover:bg-[#1E293B] cursor-pointer transition-colors">
                      <div className="w-6 text-center text-[#B0B3B8] font-bold">{index + 1}</div>
                      <img src={song.cover || DEFAULT_MUSIC_COVER} alt={song.title} className="w-12 h-12 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate">{song.title}</div>
                        <div className="text-xs text-[#888] truncate">{artistName}</div>
                      </div>
                      <span className="text-sm text-[#B0B3B8]">{(song as any).duration || '3:00'}</span>
                      <button onClick={(e) => { e.stopPropagation(); toggleLike(String(song.id)); }} className="text-lg hover:scale-110 transition-transform" title="Like">
                        <i className={`${isTrackLiked(String(song.id)) ? 'fas text-[#FF4D8D]' : 'far'} fa-heart`}></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD FULL PAGE VIEW */}
        {view === 'upload' && currentUser && !showLoading && (
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('dashboard')} className="w-11 h-11 rounded-full bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] flex items-center justify-center">
                <i className="fas fa-arrow-left text-white"></i>
              </button>
              <div>
                <h1 className="text-3xl font-extrabold text-white">Creator Upload Studio</h1>
                <p className="text-[#A8AFBC] text-sm mt-1">Upload singles or albums to F-Music.</p>
              </div>
            </div>
            <AudioUploadModal
              currentUser={currentUser}
              onClose={() => {
                setView('dashboard');
                setNativeAudioFile(null);
                setNativeCoverFile(null);
              }}
              onUploaded={() => { 
                fetchSongs(); 
                setView('music'); 
                setNativeAudioFile(null);
                setNativeCoverFile(null);
              }}
              initialNativeAudioFile={nativeAudioFile}
              initialNativeCoverFile={nativeCoverFile}
              onUploadProgress={setUploadProgressState}
            />
          </div>
        )}

        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && currentUser && !showLoading && (
          <div className="space-y-8">
            <div className="bg-[#0F172A] rounded-2xl p-6 border border-[#1E293B] shadow-sm">
              <div className="flex flex-col items-center justify-center mb-10 mt-4 text-center">
                <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 text-transparent bg-clip-text">Creator Studio</h2>
                <p className="text-[#888] mb-6 max-w-2xl">Upload your music and albums. Monitor your performance.</p>
                <button onClick={() => setView('upload')} className="bg-gradient-to-r from-[#1877F2] to-[#0062E3] px-10 py-4 rounded-full font-bold flex items-center gap-3 hover:scale-105 transition-transform shadow-[0_4px_20px_rgba(24,119,242,0.5)] text-lg">
                  <i className="fas fa-cloud-upload-alt text-2xl"></i> Upload New Content
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                <div className="bg-[#0B1120] p-6 rounded-2xl border border-[#1E293B]">
                  <div className="flex items-center justify-between">
                    <div><p className="text-[#B0B3B8] text-sm">Your Uploads</p><p className="text-2xl font-bold text-white">{songs.filter(s => s.uploaderId === (currentUser as any).id).length}</p></div>
                    <i className="fas fa-upload text-[#45BD62] text-xl"></i>
                  </div>
                </div>
                <div className="bg-[#0B1120] p-6 rounded-2xl border border-[#1E293B]">
                  <div className="flex items-center justify-between">
                    <div><p className="text-[#B0B3B8] text-sm">Total Plays</p><p className="text-2xl font-bold text-white">{myTotalPlays.toLocaleString()}</p></div>
                    <i className="fas fa-play-circle text-[#07E8F8] text-xl"></i>
                  </div>
                </div>
                <div className="bg-[#0B1120] p-6 rounded-2xl border border-[#1E293B]">
                  <div className="flex items-center justify-between">
                    <div><p className="text-[#B0B3B8] text-sm">Likes Received</p><p className="text-2xl font-bold text-white">{songs.filter(s => s.uploaderId === (currentUser as any).id).reduce((sum, s) => sum + ((s.stats as any)?.likes || 0), 0)}</p></div>
                    <i className="fas fa-heart text-[#FF4D8D] text-xl"></i>
                  </div>
                </div>
              </div>

              <div className="bg-[#0B1120] rounded-2xl border border-[#1E293B] overflow-hidden">
                <div className="p-6 border-b border-[#1E293B]"><h3 className="text-xl font-bold text-white">Your Catalog</h3><p className="text-[#888] text-sm">Manage your uploaded content</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#0F172A] text-[#888] text-xs uppercase font-bold border-b border-[#1E293B]">
                      <tr><th className="p-4">Content</th><th className="p-4 text-right">Plays</th><th className="p-4 text-right">Likes</th><th className="p-4 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {songs.filter((s) => s.uploaderId === (currentUser as any).id).map((item: any) => {
                        const playCount = getSongPlayCount(item, trackPlays);
                        return (
                          <tr key={item.id} className="hover:bg-[#1E293B] transition-colors">
                            <td className="p-4"><div className="flex items-center gap-3"><img src={item.cover || DEFAULT_MUSIC_COVER} className="w-10 h-10 rounded object-cover" alt="" /><div><div className="font-bold text-white text-sm">{item.title}</div><div className="text-xs text-[#888]">{item.artist}</div></div></div></td>
                            <td className="p-4 text-right font-bold text-sm">{formatCompactNumber(playCount)}</td>
                            <td className="p-4 text-right font-bold text-sm">{(item.stats as any)?.likes || 0}</td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end">
                                <PostMenu
                                  item={{
                                    ...item,
                                    id: item.id,
                                    song_id: item.id,
                                    type: 'song',
                                    user_id: item.uploaderId || (currentUser as any)?.id,
                                    uploaderId: item.uploaderId || (currentUser as any)?.id,
                                  }}
                                  currentUser={currentUser}
                                  onDeleteSuccess={(id) => {
                                    setSongs((prev) => prev.filter((s) => String(s.id) !== String(id)));
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {songs.filter((s) => s.uploaderId === (currentUser as any).id).length === 0 && (<tr><td colSpan={4} className="p-12 text-center text-[#666]"><p>No uploads yet. Start by clicking "Upload New Content" above.</p></td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ARTIST VIEW */}
        {view === 'artist' && !showLoading && (
          <div className="space-y-8">
            <div className="bg-[#0F172A] rounded-2xl overflow-hidden border border-[#1E293B] shadow-sm">
              <div className="h-48 relative">
                <img src="https://images.unsplash.com/photo-1514525253440-b393452e8d26?ixlib=rb-1.2.1&auto=format&fit=crop&w=1500&q=80" className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050B18] to-transparent"></div>
                <div className="absolute bottom-4 left-4 flex items-end gap-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#1877F2] to-[#F3425F] flex items-center justify-center text-white text-3xl font-bold border-4 border-[#050B18]">
                    {selectedArtistId ? (users.find(u => u.id === selectedArtistId)?.name?.charAt(0) || 'A') : 'A'}
                  </div>
                  <div className="mb-2"><h1 className="text-2xl font-bold text-white">{users.find(u => u.id === selectedArtistId)?.name || 'Artist'}</h1></div>
                </div>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-4">Popular Releases</h2>
                <div className="space-y-2">
                  {songs.filter(s => s.uploaderId === selectedArtistId).slice(0, 5).map((song, i) => (
                    <div key={song.id} onClick={() => handlePlayTrackFromSong(song)} className="flex items-center gap-4 p-3 hover:bg-[#1E293B] rounded-xl cursor-pointer group transition-colors">
                      <div className="text-[#B0B3B8] font-bold w-4 text-center group-hover:hidden">{i + 1}</div>
                      <div className="hidden group-hover:block w-4 text-center text-white"><i className="fas fa-play"></i></div>
                      <img src={song.cover || DEFAULT_MUSIC_COVER} className="w-10 h-10 rounded object-cover" alt="" />
                      <div className="flex-1"><div className="font-bold text-white text-sm">{song.title}</div><div className="text-xs text-[#888]">{formatCompactNumber(getSongPlayCount(song, trackPlays))} plays</div></div>
                      <button onClick={(e) => { e.stopPropagation(); toggleLike(String(song.id)); }} className="text-lg hover:scale-110 transition-transform"><i className={`${isTrackLiked(String(song.id)) ? 'fas text-[#FF4D8D]' : 'far'} fa-heart`}></i></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicSystem;
export { CommentsSheet as MusicCommentsSheet };
