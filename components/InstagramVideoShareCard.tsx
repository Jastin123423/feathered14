import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { safeUserId, avatarFrom, formatRelativeTime, ExpandableRichText } from './Feed';
import { VerifiedBadge } from './VerifiedBadge';

const formatCount = (count: number): string => {
  if (!count || count <= 0) return '0';
  if (count >= 1000000) {
    const val = String((count / 1000000).toFixed(1) ?? '');
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}M`;
  }
  if (count >= 1000) {
    const val = String((count / 1000).toFixed(1) ?? '');
    return `${val.endsWith('.0') ? val.slice(0, -2) : val}k`;
  }
  return String(count);
};

export interface InstagramVideoShareCardProps {
  post: any;
  originalPost: any;
  ownerAuthor: any;
  currentUser?: any;
  users?: any[];
  onProfileClick: (userId: number) => void;
  onVideoClick?: (post: any) => void;
  onHashtagClick?: (tag: string) => void;
}

export const InstagramVideoShareCard: React.FC<InstagramVideoShareCardProps> = ({
  post,
  originalPost,
  ownerAuthor,
  currentUser,
  users = [],
  onProfileClick,
  onVideoClick,
  onHashtagClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const lastTapRef = useRef<number>(0);

  // Resolve best video URL from various possible field names on originalPost
  const videoUrl = useMemo(() => {
    if (!originalPost) return '';
    return (
      originalPost.video_url ||
      originalPost.video_url_medium ||
      originalPost.video_url_hd ||
      originalPost.video_url_low ||
      originalPost.video ||
      originalPost.media_url ||
      originalPost.feed_url ||
      (Array.isArray(originalPost.media_urls) && originalPost.media_urls.find((u: string) => typeof u === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u))) ||
      (Array.isArray(originalPost.media_urls) && originalPost.media_urls[0]) ||
      originalPost.meta?.video_url ||
      ''
    );
  }, [originalPost]);

  const posterUrl = useMemo(() => {
    if (!originalPost) return '';
    return (
      originalPost.thumbnail_url ||
      originalPost.cover_url ||
      originalPost.thumb_url ||
      originalPost.poster ||
      (Array.isArray(originalPost.images) ? originalPost.images[0] : null) ||
      ''
    );
  }, [originalPost]);

  const authorName = useMemo(() => {
    return (
      ownerAuthor?.name ||
      originalPost?.author?.name ||
      originalPost?.user?.name ||
      originalPost?.author_name ||
      ownerAuthor?.username ||
      originalPost?.author?.username ||
      'Creator'
    );
  }, [ownerAuthor, originalPost]);

  const authorUsername = useMemo(() => {
    return (
      ownerAuthor?.username ||
      originalPost?.author?.username ||
      originalPost?.user?.username ||
      originalPost?.author_username ||
      'creator'
    );
  }, [ownerAuthor, originalPost]);

  const isVerified = Boolean(
    ownerAuthor?.is_verified ||
    ownerAuthor?.verified ||
    originalPost?.author?.is_verified ||
    originalPost?.author?.verified ||
    originalPost?.is_verified
  );

  const authorId = Number(
    ownerAuthor?.id ||
    originalPost?.author?.id ||
    originalPost?.user?.id ||
    originalPost?.user_id ||
    0
  );

  const captionText =
    originalPost?.caption ||
    originalPost?.description ||
    originalPost?.content ||
    originalPost?.text_content ||
    '';

  const audioTitle =
    originalPost?.song_name ||
    originalPost?.audio_title ||
    originalPost?.sound_title ||
    `Original audio - ${authorName}`;

  // Time update progress bar
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && videoRef.current.duration) {
      const pct = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(pct);
    }
  }, []);

  // Global single-video playback coordinator: pause if another video starts
  useEffect(() => {
    const handleGlobalVideoPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ videoId: string }>;
      const cardVideoId = `share_video_${originalPost?.id || post?.id}`;
      if (customEvent.detail?.videoId && customEvent.detail.videoId !== cardVideoId) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('unera-video-play', handleGlobalVideoPlay);
    return () => {
      window.removeEventListener('unera-video-play', handleGlobalVideoPlay);
    };
  }, [originalPost?.id, post?.id]);

  const togglePlay = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      const cardVideoId = `share_video_${originalPost?.id || post?.id}`;
      try {
        window.dispatchEvent(
          new CustomEvent('unera-video-play', { detail: { videoId: cardVideoId } })
        );
      } catch {}

      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setShowPlayIcon(true);
          setTimeout(() => setShowPlayIcon(false), 500);
        })
        .catch(() => {
          setIsPlaying(false);
        });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowPlayIcon(true);
      setTimeout(() => setShowPlayIcon(false), 500);
    }
  }, [originalPost?.id, post?.id]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  }, [isMuted]);

  // Double tap to like animation
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    togglePlay(e);
  }, [togglePlay]);

  const handleOpenOriginal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onVideoClick) {
      onVideoClick(originalPost);
    }
  }, [onVideoClick, originalPost]);

  const viewsCount = Number(originalPost?.views ?? originalPost?.view_count ?? 0);
  const likesCount = Number(originalPost?.likes_count ?? originalPost?.reactions_count ?? 0);
  const commentsCount = Number(originalPost?.comments_count ?? originalPost?.comment_count ?? 0);

  return (
    <div className="w-full bg-[#0A101F] rounded-2xl overflow-hidden border border-[#334155]/80 hover:border-[#475569] shadow-md transition-all">
      {/* 1. ORIGINAL CREATOR HEADER */}
      <div className="p-3 md:p-3.5 flex items-center justify-between border-b border-[#1E293B]/80 bg-[#0F172A]/70">
        <div
          className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
          onClick={(e) => {
            e.stopPropagation();
            if (authorId) onProfileClick(authorId);
          }}
        >
          <img
            src={avatarFrom(ownerAuthor || originalPost?.author || originalPost?.user)}
            alt=""
            className="w-10 h-10 rounded-full object-cover border border-[#1E293B] shrink-0 group-hover:scale-105 transition-transform"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h5 className="font-bold text-[#F8FAFC] text-[16px] sm:text-[17px] group-hover:underline cursor-pointer truncate">
                {authorName}
              </h5>
              {isVerified && <VerifiedBadge size={16} className="shrink-0" />}
            </div>

            <div className="flex items-center gap-1.5 text-[#94A3B8] text-[12px]">
              <span>@{authorUsername}</span>
              {originalPost?.created_at && (
                <>
                  <span>•</span>
                  <span>{formatRelativeTime(originalPost.created_at)}</span>
                </>
              )}
              <span>•</span>
              <i className="fas fa-globe-americas text-[11px]" title="Public"></i>
            </div>
          </div>
        </div>

        {/* Open in Videos Page chevron button matching Feed video card */}
        {onVideoClick && (
          <button
            type="button"
            onClick={handleOpenOriginal}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-black/65 hover:bg-[#1877F2] text-white border border-white/25 shadow-lg backdrop-blur-md transition-all active:scale-90 group cursor-pointer shrink-0"
            title="Open in Videos page"
            aria-label="Open in Videos page"
          >
            <i className="fas fa-chevron-right text-[13px] ml-0.5 group-hover:translate-x-0.5 transition-transform"></i>
          </button>
        )}
      </div>

      {/* 2. ORIGINAL CAPTION / DESCRIPTION */}
      {captionText && (
        <div className="px-3.5 py-2.5 text-[#F8FAFC] bg-[#0A101F]">
          <ExpandableRichText
            text={captionText}
            users={users}
            onProfileClick={onProfileClick}
            onHashtagClick={onHashtagClick}
            maxWords={20}
            fontSizePx={15}
          />
        </div>
      )}

      {/* 3. INSTAGRAM VIDEO MEDIA PLAYER CONTAINER */}
      <div
        className="relative w-full bg-black flex items-center justify-center cursor-pointer overflow-hidden min-h-[300px] max-h-[540px] aspect-[4/5] sm:aspect-[1/1] md:aspect-[4/5]"
        onClick={handleContainerClick}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl || undefined}
            playsInline
            loop
            muted={isMuted}
            preload="metadata"
            onTimeUpdate={handleTimeUpdate}
            className="w-full h-full object-cover object-center bg-black"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 text-[#94A3B8]">
            <i className="fas fa-video-slash text-4xl mb-2 text-[#475569]"></i>
            <p className="text-sm">Video not available</p>
          </div>
        )}

        {/* Play/Pause Ripple Indicator */}
        {showPlayIcon && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity">
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white text-xl animate-scale-in">
              <i className={`fas fa-${isPlaying ? 'play' : 'pause'}`}></i>
            </div>
          </div>
        )}

        {/* Idle Play Button when paused */}
        {!isPlaying && !showPlayIcon && videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-14 h-14 rounded-full bg-black/65 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-xl shadow-xl transition-transform">
              <i className="fas fa-play ml-1 text-[#38BDF8]"></i>
            </div>
          </div>
        )}

        {/* Double-tap Heart Burst */}
        {showHeartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <i className="fas fa-heart text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.9)] text-6xl animate-ping opacity-90"></i>
          </div>
        )}

        {/* Top-Right: Open in Videos Page / Fullscreen Viewer */}
        {onVideoClick && (
          <button
            type="button"
            onClick={handleOpenOriginal}
            title="Watch in full player"
            aria-label="Watch in full player"
            className="absolute top-3 right-3 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-black/65 hover:bg-[#1877F2] text-white border border-white/25 shadow-lg backdrop-blur-md transition-all active:scale-90 group cursor-pointer"
          >
            <i className="fas fa-chevron-right text-[12px] ml-0.5 group-hover:translate-x-0.5 transition-transform"></i>
          </button>
        )}

        {/* Bottom-Left: Audio Track Pill */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none max-w-[70%]">
          <div className="bg-black/50 backdrop-blur-md border border-white/10 text-white text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md">
            <i className="fas fa-volume-up text-[#38BDF8] text-[10px]"></i>
            <span className="truncate">{audioTitle}</span>
          </div>
        </div>

        {/* Bottom-Right: Sound Mute/Unmute Toggle */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
        >
          <i className={`fas fa-${isMuted ? 'volume-mute' : 'volume-up'} text-xs`}></i>
        </button>

        {/* Scrubber Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-10">
          <div
            className="h-full bg-[#1877F2] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 4. FOOTER STATS BAR */}
      <div className="px-3.5 py-2 flex items-center justify-between text-[#94A3B8] text-[13px] bg-[#0A101F] border-t border-[#1E293B]">
        <div className="flex items-center gap-3">
          {viewsCount > 0 && (
            <span className="flex items-center gap-1">
              <i className="fas fa-eye text-[11px] text-[#64748B]"></i>
              <span>{formatCount(viewsCount)} views</span>
            </span>
          )}
          {likesCount > 0 && (
            <span className="flex items-center gap-1">
              <i className="fas fa-heart text-[11px] text-red-400"></i>
              <span>{formatCount(likesCount)}</span>
            </span>
          )}
          {commentsCount > 0 && (
            <span className="flex items-center gap-1">
              <i className="far fa-comment text-[11px] text-[#64748B]"></i>
              <span>{formatCount(commentsCount)}</span>
            </span>
          )}
        </div>

        {onVideoClick && (
          <button
            type="button"
            onClick={handleOpenOriginal}
            className="text-[12px] font-semibold text-[#38BDF8] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>Watch video</span>
            <i className="fas fa-arrow-right text-[10px]"></i>
          </button>
        )}
      </div>
    </div>
  );
};
