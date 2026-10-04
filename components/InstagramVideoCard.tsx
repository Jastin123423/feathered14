import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import {
  safeUserId,
  avatarFrom,
  formatRelativeTime,
  ReactionButton,
  ReactionsSheet,
  topReactionEmojis,
  formatReactionText,
  pickStableReactorName,
  ShareBottomSheet,
  safeNumber,
} from './Feed';
import { useIsPostSaved, toggleSavePost } from '../utils/savedPosts';
import { VerifiedBadge } from './VerifiedBadge';
import { CommentActionModal } from './CommentActionModal';
import { PostMenu } from './Post/PostMenu';
import { resolveAdaptiveVideoUrls, getNetworkCondition } from '../utils/adaptivePlayback';
import type { ReactionType } from '../types';

const safeParseJsonArray = <T = any>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

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

interface InstagramVideoCardProps {
  post?: any;
  reel?: any;
  author?: any;
  currentUser?: any;
  users?: any[];
  stories?: any[];
  hasStory?: boolean;
  autoplay?: boolean;
  reactionCount?: number;
  myReaction?: ReactionType | null;
  commentCount?: number;
  shareCount?: number;
  emojiList?: string[];
  reactionText?: string;
  onProfileClick: (userId: number) => void;
  onStoryClick?: (userId: number) => void;
  onReact?: (postOrId: any, type: any) => void;
  onShare?: (postId: number, count: number, data?: any, originalPost?: any) => void;
  onShareClick?: (post: any) => void;
  onVideoClick?: (post: any) => void;
  onDelete?: (postId: number) => void;
  onEdit?: (postId: number, text: string) => void;
  isFollowing?: boolean;
  onFollow?: (userId: number) => void;
  onHashtagClick?: (tag: string) => void;
  onOpenComments?: (post: any) => void;
  onOpenReactions?: (post: any) => void;
  onCommentAdded?: () => void;
}

interface ReelComment {
  id: number;
  user_id: number;
  text: string;
  created_at: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  is_verified?: boolean;
  likes_count?: number;
  liked_by_me?: boolean;
  user?: {
    id: number;
    name?: string;
    username?: string;
    profile_image_url?: string;
    is_verified?: boolean;
  };
}

export const InstagramVideoCard: React.FC<InstagramVideoCardProps> = ({
  post,
  reel,
  author,
  currentUser,
  users = [],
  stories = [],
  hasStory,
  autoplay = true,
  reactionCount: propReactionCount,
  myReaction: propMyReaction,
  commentCount: propCommentCount,
  shareCount: propShareCount,
  emojiList: propEmojiList,
  reactionText: propReactionText,
  onProfileClick,
  onStoryClick,
  onReact,
  onShare,
  onShareClick,
  onVideoClick,
  onDelete,
  onEdit,
  isFollowing = false,
  onFollow,
  onHashtagClick,
  onOpenComments,
  onOpenReactions,
  onCommentAdded,
}) => {
  const [localPost, setLocalPost] = useState<any>(post || reel || {});
  const activePost = localPost;
  const activePostId = useMemo(() => {
    const raw = activePost?.post_id ?? activePost?.id ?? activePost?.reel_id ?? activePost?.reelId;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = parseInt(raw.replace(/\D/g, ''), 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }, [activePost?.post_id, activePost?.id, activePost?.reel_id, activePost?.reelId]);

  useEffect(() => {
    setLocalPost(post || reel || {});
  }, [post, reel]);

  useEffect(() => {
    const handlePostUpdate = (e: any) => {
      if (e.detail && (e.detail.id === activePostId || e.detail.post_id === activePostId)) {
        setLocalPost((prev: any) => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('post-updated', handlePostUpdate);
    return () => window.removeEventListener('post-updated', handlePostUpdate);
  }, [activePostId]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);

  // Author details
  const resolvedAuthor = author || activePost?.user || activePost?.author || { id: activePost?.user_id };
  const authorId = safeUserId(resolvedAuthor);

  // Verification check - ONLY show if really verified, NEVER faked
  const isVerified = Boolean(
    resolvedAuthor?.is_verified ||
    resolvedAuthor?.verified ||
    activePost?.user?.is_verified ||
    activePost?.user?.verified ||
    activePost?.author?.is_verified ||
    activePost?.author?.verified ||
    activePost?.is_verified ||
    activePost?.verified
  );

  // Authentic story check - only show story ring/dots if user has active stories
  const userHasStory = useMemo(() => {
    if (typeof hasStory === 'boolean') return hasStory;
    if (resolvedAuthor?.has_story || resolvedAuthor?.hasStory || activePost?.user?.has_story || activePost?.user?.hasStory) return true;
    if (Array.isArray(stories) && stories.length > 0) {
      return stories.some((s: any) => {
        const sUid = Number(s?.user_id ?? s?.user?.id ?? 0);
        return sUid > 0 && sUid === authorId;
      });
    }
    return false;
  }, [hasStory, resolvedAuthor, activePost, stories, authorId]);

  // Online status check
  const isOnline = Boolean(
    resolvedAuthor?.is_online ||
    resolvedAuthor?.isOnline ||
    activePost?.user?.is_online ||
    activePost?.user?.isOnline
  );

  // Adaptive video source resolution: ONLY thumbnail_url, 720, and 1080 (never original)
  const { thumbnailUrl, url720, url1080 } = useMemo(() => {
    return resolveAdaptiveVideoUrls(activePost);
  }, [activePost]);

  const reelId = activePostId;

  // Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);

  // Adaptive streaming & zero-byte idle states
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [currentSource, setCurrentSource] = useState<string>('');
  const [currentQuality, setCurrentQuality] = useState<'720p' | '1080p'>('720p');
  const [isMediaReady, setIsMediaReady] = useState(false);
  const pendingSeekTimeRef = useRef<number>(0);
  const smoothPlaybackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAttemptedUpgradeRef = useRef(false);

  // Reaction states - matching standard posts
  const initialReaction = (propMyReaction || activePost?.my_reaction || activePost?.myReaction || activePost?.reaction || undefined) as ReactionType | undefined;
  const [myReaction, setMyReaction] = useState<ReactionType | undefined>(initialReaction);
  const [serverReactions, setServerReactions] = useState<any[]>([]);

  const initialReactionCount = Number(
    typeof propReactionCount === 'number'
      ? propReactionCount
      : (activePost?.likesCount ??
         activePost?.reactionsCount ??
         activePost?.reactions_count ??
         activePost?.reaction_count ??
         activePost?.likes_count ??
         (Array.isArray(activePost?.reactions) ? activePost.reactions.length : (Array.isArray(activePost?.reactions_preview) ? activePost.reactions_preview.length : 0)))
  );
  const [reactionCount, setReactionCount] = useState<number>(initialReactionCount);
  const [showReactionsSheet, setShowReactionsSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Sync state if props or activePost changes
  useEffect(() => {
    if (propMyReaction !== undefined) {
      setMyReaction(propMyReaction || undefined);
    } else {
      const r = activePost?.my_reaction || activePost?.myReaction || activePost?.reaction;
      if (r !== undefined) {
        setMyReaction((r || undefined) as ReactionType | undefined);
      }
    }
  }, [propMyReaction, activePost?.my_reaction, activePost?.myReaction, activePost?.reaction]);

  useEffect(() => {
    if (typeof propReactionCount === 'number' && (propReactionCount > 0 || !reactionCount)) {
      setReactionCount(propReactionCount);
    } else {
      const count = Number(
        activePost?.likesCount ??
        activePost?.reactionsCount ??
        activePost?.reactions_count ??
        activePost?.reaction_count ??
        activePost?.likes_count ??
        (Array.isArray(activePost?.reactions) ? activePost.reactions.length : (Array.isArray(activePost?.reactions_preview) ? activePost.reactions_preview.length : 0))
      );
      if (count > 0 || !reactionCount) {
        setReactionCount(count);
      }
    }
  }, [
    propReactionCount,
    activePost?.likesCount,
    activePost?.reactionsCount,
    activePost?.reactions_count,
    activePost?.reaction_count,
    activePost?.likes_count,
    activePost?.reactions,
    activePost?.reactions_preview,
  ]);

  const initialSharesCount = Number(
    typeof propShareCount === 'number'
      ? propShareCount
      : (activePost?.sharesCount ?? activePost?.shareCount ?? activePost?.shares ?? activePost?.shares_count ?? 0)
  );
  const [sharesCount, setSharesCount] = useState<number>(initialSharesCount);

  const initialCommentsCount = Number(
    typeof propCommentCount === 'number'
      ? propCommentCount
      : (activePost?.commentsCount ??
         activePost?.commentCount ??
         activePost?.comments_count ??
         activePost?.comment_count ??
         (Array.isArray(activePost?.comments) ? activePost.comments.length : 0))
  );
  const [commentsCount, setCommentsCount] = useState<number>(initialCommentsCount);

  // Sync shares and comments count if props or activePost updates
  useEffect(() => {
    if (typeof propShareCount === 'number' && (propShareCount > 0 || !sharesCount)) {
      setSharesCount(propShareCount);
    } else if (activePost?.sharesCount !== undefined || activePost?.shareCount !== undefined || activePost?.shares !== undefined || activePost?.shares_count !== undefined) {
      const count = Number(activePost?.sharesCount ?? activePost?.shareCount ?? activePost?.shares ?? activePost?.shares_count ?? 0);
      if (count > 0 || !sharesCount) {
        setSharesCount(count);
      }
    }
  }, [propShareCount, activePost?.sharesCount, activePost?.shareCount, activePost?.shares, activePost?.shares_count]);

  useEffect(() => {
    if (typeof propCommentCount === 'number' && (propCommentCount > 0 || !commentsCount)) {
      setCommentsCount(propCommentCount);
    } else if (activePost?.commentsCount !== undefined || activePost?.commentCount !== undefined || activePost?.comments_count !== undefined || activePost?.comment_count !== undefined || activePost?.comments !== undefined) {
      const count = Number(
        activePost?.commentsCount ??
        activePost?.commentCount ??
        activePost?.comments_count ??
        activePost?.comment_count ??
        (Array.isArray(activePost?.comments) ? activePost.comments.length : 0)
      );
      if (count > 0 || !commentsCount) {
        setCommentsCount(count);
      }
    }
  }, [
    propCommentCount,
    activePost?.commentsCount,
    activePost?.commentCount,
    activePost?.comments_count,
    activePost?.comment_count,
    activePost?.comments,
  ]);

  // Background comment count fetch if commentsCount is zero
  useEffect(() => {
    if (activePostId && commentsCount === 0) {
      const viewerId = currentUser?.id || 0;
      apiFetch(`/api/posts/${activePostId}/comments?viewerId=${viewerId}`)
        .then((data) => {
          const list = Array.isArray(data) ? data : (Array.isArray(data?.comments) ? data.comments : []);
          if (list.length > 0) {
            setComments(list);
            setCommentsCount((prev) => Math.max(prev, list.length));
          }
        })
        .catch(() => {});
    }
  }, [activePostId]);

  // Normal Post Reactions endpoint: GET /api/posts/:id/reactions
  const fetchReactions = useCallback(async () => {
    if (!activePostId) return;
    try {
      const viewerId = currentUser?.id || 0;
      const res = await apiFetch(`/api/posts/${activePostId}/reactions?viewerId=${viewerId}&limit=100`);
      if (res && (res.success || Array.isArray(res.reactions))) {
        if (typeof res.reactions_count === 'number' && res.reactions_count >= 0) {
          setReactionCount(res.reactions_count);
        } else if (Array.isArray(res.reactions)) {
          setReactionCount((prev) => Math.max(prev, res.reactions.length));
        }
        if (Array.isArray(res.reactions) && res.reactions.length > 0) {
          setServerReactions(res.reactions);
          if (viewerId) {
            const found = res.reactions.find((r: any) => Number(r.user_id) === Number(viewerId));
            if (found?.type) {
              setMyReaction(found.type as ReactionType);
            }
          }
        }
        if (res.my_reaction !== undefined) {
          setMyReaction((res.my_reaction || undefined) as ReactionType | undefined);
        } else if (res.reaction !== undefined) {
          setMyReaction((res.reaction || undefined) as ReactionType | undefined);
        }
      }
    } catch (err) {
      console.warn('Failed to load reactions:', err);
    }
  }, [activePostId, currentUser?.id]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Reaction emojis and summary text (identical to normal post)
  const reactionsArr = serverReactions.length > 0
    ? serverReactions
    : Array.isArray(activePost?.reactions)
    ? activePost.reactions
    : [];
  const reactionsPreview = Array.isArray(activePost?.reactions_preview) ? activePost.reactions_preview : [];
  const combinedReactions = reactionsArr.length > 0 ? reactionsArr : reactionsPreview;

  const emojiList = useMemo(() => {
    if (propEmojiList && propEmojiList.length > 0) return propEmojiList;
    const em = topReactionEmojis(combinedReactions, 3);
    return em.length > 0 ? em : (reactionCount > 0 ? ['👍'] : []);
  }, [combinedReactions, propEmojiList, reactionCount]);

  const reactorName = useMemo(() => {
    return (
      activePost?.reactor_name ||
      activePost?.reactorName ||
      pickStableReactorName(activePostId, combinedReactions, users)
    );
  }, [activePost?.reactor_name, activePost?.reactorName, activePostId, combinedReactions, users]);

  const reactionText = useMemo(() => {
    if (propReactionText) return propReactionText;
    if (reactionCount <= 0) return '';
    if (reactorName) {
      return formatReactionText(reactionCount, reactorName);
    }
    return reactionCount === 1 ? '1 Reaction' : `${formatCount(reactionCount)} Reactions`;
  }, [reactionCount, reactorName, propReactionText]);

  // Discuss modal & comments state
  const [showDiscussModal, setShowDiscussModal] = useState(false);
  const [comments, setComments] = useState<ReelComment[]>(() => {
    if (Array.isArray(activePost?.comments) && activePost.comments.length > 0) {
      return activePost.comments;
    }
    return [];
  });
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyToComment, setReplyToComment] = useState<any | null>(null);

  // Sync comments if activePost.comments updates
  useEffect(() => {
    if (Array.isArray(activePost?.comments) && activePost.comments.length > 0) {
      setComments((prev) => (prev.length === 0 ? activePost.comments : prev));
    }
  }, [activePost?.comments]);

  // Comprehensive profile picture resolution for currentUser
  const resolvedCurrentUserAvatar = useMemo(() => {
    // 1. Direct fields on currentUser
    const direct =
      currentUser?.profile_image_url ||
      currentUser?.avatar_url ||
      currentUser?.avatarUrl ||
      currentUser?.profileImage ||
      currentUser?.profile_image ||
      currentUser?.avatar ||
      currentUser?.photoURL ||
      currentUser?.photo_url ||
      currentUser?.photoUrl ||
      currentUser?.image ||
      currentUser?.image_url ||
      currentUser?.imageUrl ||
      currentUser?.picture;
    if (
      typeof direct === 'string' &&
      direct.trim() &&
      direct !== 'null' &&
      direct !== 'undefined' &&
      !direct.includes('ui-avatars.com')
    ) {
      return direct.trim();
    }

    // 2. Lookup in users list
    const myId = Number(currentUser?.id || 0);
    const myUsername = String(currentUser?.username || '').trim().toLowerCase();
    if (Array.isArray(users) && (myId || myUsername)) {
      const match = users.find(
        (u: any) =>
          (myId && Number(u.id || u.user_id) === myId) ||
          (myUsername && String(u.username || '').toLowerCase() === myUsername)
      );
      if (match) {
        const matchedPic =
          match.profile_image_url ||
          match.avatar_url ||
          match.avatarUrl ||
          match.profileImage ||
          match.profile_image ||
          match.avatar ||
          match.photoURL ||
          match.photo_url ||
          match.photoUrl ||
          match.image ||
          match.image_url ||
          match.picture;
        if (
          typeof matchedPic === 'string' &&
          matchedPic.trim() &&
          matchedPic !== 'null' &&
          matchedPic !== 'undefined' &&
          !matchedPic.includes('ui-avatars.com')
        ) {
          return matchedPic.trim();
        }
      }
    }

    // 3. Lookup in localStorage
    try {
      const stored =
        localStorage.getItem('user') ||
        localStorage.getItem('unera_user') ||
        localStorage.getItem('social_platform_current_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedPic =
          parsed?.profile_image_url ||
          parsed?.avatar_url ||
          parsed?.avatarUrl ||
          parsed?.profileImage ||
          parsed?.profile_image ||
          parsed?.avatar ||
          parsed?.photoURL ||
          parsed?.photo_url ||
          parsed?.image ||
          parsed?.picture;
        if (
          typeof storedPic === 'string' &&
          storedPic.trim() &&
          storedPic !== 'null' &&
          storedPic !== 'undefined' &&
          !storedPic.includes('ui-avatars.com')
        ) {
          return storedPic.trim();
        }
      }
    } catch {}

    // Fallback: avatarFrom(currentUser)
    return avatarFrom(currentUser);
  }, [currentUser, users]);

  // Caption expand state
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const isSaved = useIsPostSaved(reelId || activePost?.id);
  const [showShareToast, setShowShareToast] = useState(false);

  const authorName = resolvedAuthor?.name || activePost?.user?.name || activePost?.author_name || 'Creator';
  const authorUsername = resolvedAuthor?.username || activePost?.user?.username || authorName.toLowerCase().replace(/\s+/g, '_');
  const authorAvatar = avatarFrom(resolvedAuthor || activePost?.user);

  // Sponsored detection
  const isSponsored = Boolean(
    activePost?.is_sponsored ||
    activePost?.is_ad ||
    activePost?.source === 'sponsored' ||
    activePost?.type === 'sponsored' ||
    activePost?.sponsored_meta ||
    activePost?.meta?.sponsored_meta ||
    post?.is_sponsored ||
    post?.is_ad ||
    post?.source === 'sponsored' ||
    post?.type === 'sponsored' ||
    post?.sponsored_meta
  );

  const sponsoredMeta = activePost?.sponsored_meta || activePost?.meta?.sponsored_meta || post?.sponsored_meta || null;
  const sponsoredAdId = Number(
    activePost?.ad_id ||
    sponsoredMeta?.ad_id ||
    post?.ad_id ||
    (typeof activePost?.id === 'string' && activePost.id.startsWith('ad-')
      ? activePost.id.replace('ad-', '')
      : 0) ||
    0
  );

  const sponsoredImpressionTrackedRef = useRef(false);
  useEffect(() => {
    if (!isSponsored || !sponsoredAdId || sponsoredImpressionTrackedRef.current) return;
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !sponsoredImpressionTrackedRef.current) {
            sponsoredImpressionTrackedRef.current = true;
            fetch('/api/ads/impression', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': String(currentUser?.id || 0),
              },
              body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
            }).catch(() => {});
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isSponsored, sponsoredAdId, currentUser?.id]);

  const sponsoredViewTrackedRef = useRef(false);
  useEffect(() => {
    if (!isSponsored || !sponsoredAdId || !isPlaying || sponsoredViewTrackedRef.current) return;
    sponsoredViewTrackedRef.current = true;
    fetch('/api/ads/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': String(currentUser?.id || 0),
      },
      body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
    }).catch(() => {});
  }, [isSponsored, sponsoredAdId, isPlaying, currentUser?.id]);

  const handleSponsoredClick = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation?.();
      if (!isSponsored || !sponsoredAdId) return;
      fetch('/api/ads/click', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser?.id || 0),
        },
        body: JSON.stringify({ ad_id: sponsoredAdId, user_id: currentUser?.id || 0 }),
      }).catch(() => {});

      const contactType = sponsoredMeta?.contact_type || activePost?.contact_type || 'link';
      const phone = sponsoredMeta?.phone_number || activePost?.phone_number;
      const email = sponsoredMeta?.email_address || activePost?.email_address;
      const ctaUrl = sponsoredMeta?.cta_url || activePost?.cta_url || activePost?.destination_url;

      if (contactType === 'phone' && phone) {
        window.location.href = `tel:${phone}`;
        return;
      }
      if (contactType === 'email' && email) {
        window.location.href = `mailto:${email}`;
        return;
      }
      if (ctaUrl) {
        const dest = ctaUrl.startsWith('http') ? ctaUrl : `https://${ctaUrl}`;
        window.open(dest, '_blank', 'noopener,noreferrer');
      }
    },
    [isSponsored, sponsoredAdId, currentUser?.id, sponsoredMeta, activePost]
  );

  // Unique video ID for global single-playback coordination
  const cardVideoId = useMemo(() => {
    return String(
      reelId ||
      activePost?.reel_id ||
      activePost?.id ||
      activePost?.video_url ||
      post?.reel_id ||
      post?.id ||
      post?.video_url ||
      Math.random()
    );
  }, [reelId, activePost?.reel_id, activePost?.id, activePost?.video_url, post?.reel_id, post?.id, post?.video_url]);

  // Global single-video playback coordinator: pause immediately if another video starts
  useEffect(() => {
    const handleGlobalVideoPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ videoId: string }>;
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
  }, [cardVideoId]);

  // 1. Thumbnail lazy-loading observer (loads 2–3 viewport heights before visible)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isNearViewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsNearViewport(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250% 0px 250% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isNearViewport]);

  // 2. Playback visibility observer (auto-pauses when leaving viewport to minimize mobile data)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!videoRef.current) return;

          // When video leaves viewport, pause immediately to save data & decoder resources
          if (!entry.isIntersecting || entry.intersectionRatio < 0.2) {
            if (!videoRef.current.paused) {
              videoRef.current.pause();
              setIsPlaying(false);
            }
          }
        });
      },
      { threshold: [0, 0.2, 0.5] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [cardVideoId]);

  // When currentSource changes (e.g. initial 720p start or 1080p migration)
  useEffect(() => {
    if (hasStartedPlayback && currentSource && videoRef.current) {
      const savedTime = pendingSeekTimeRef.current;
      if (savedTime > 0) {
        videoRef.current.currentTime = savedTime;
        pendingSeekTimeRef.current = 0;
      }
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [currentSource, hasStartedPlayback]);

  // Clean up smooth playback timer on unmount
  useEffect(() => {
    return () => {
      if (smoothPlaybackTimerRef.current) {
        clearTimeout(smoothPlaybackTimerRef.current);
      }
    };
  }, []);

  // Update progress bar
  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.duration) {
      const pct = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(pct);
    }
  };

  // Toggle play/pause
  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();

    // If playback has not started yet, load and play 720p initially
    if (!hasStartedPlayback || !currentSource) {
      setHasStartedPlayback(true);
      setCurrentQuality('720p');
      setCurrentSource(url720);
      setIsPlaying(true);
      setShowPlayIcon(true);
      setTimeout(() => setShowPlayIcon(false), 700);

      window.dispatchEvent(
        new CustomEvent('unera-video-play', { detail: { videoId: cardVideoId } })
      );
      return;
    }

    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      // Broadcast to pause any other playing videos so only one plays
      window.dispatchEvent(
        new CustomEvent('unera-video-play', { detail: { videoId: cardVideoId } })
      );
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 700);
  };

  const handlePlaying = () => {
    setIsMediaReady(true);
    setIsPlaying(true);

    // Intelligently check if connection and conditions allow 1080p upgrade
    if (
      currentQuality === '720p' &&
      url1080 &&
      url1080 !== url720 &&
      !hasAttemptedUpgradeRef.current
    ) {
      if (smoothPlaybackTimerRef.current) {
        clearTimeout(smoothPlaybackTimerRef.current);
      }
      // Wait for 3.5s of smooth uninterrupted 720p playback
      smoothPlaybackTimerRef.current = setTimeout(() => {
        const net = getNetworkCondition();
        if (net.canUpgradeTo1080p && videoRef.current && !videoRef.current.paused) {
          hasAttemptedUpgradeRef.current = true;
          pendingSeekTimeRef.current = videoRef.current.currentTime || 0;
          setCurrentQuality('1080p');
          setCurrentSource(url1080);
        }
      }, 3500);
    }
  };

  const handleBufferingOrStall = () => {
    // If buffering happens after upgrading to 1080p, drop back to 720p immediately
    if (currentQuality === '1080p' && url720 && url720 !== url1080) {
      hasAttemptedUpgradeRef.current = true; // prevent re-upgrade
      if (videoRef.current) {
        pendingSeekTimeRef.current = videoRef.current.currentTime || 0;
      }
      setCurrentQuality('720p');
      setCurrentSource(url720);
    }
  };

  // Handle double tap to like (Instagram iconic feature)
  const handleVideoAreaClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap!
      handleDoubleTapLike();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      // Single tap after delay if not double tapped
      setTimeout(() => {
        if (lastTapRef.current === now) {
          togglePlay();
        }
      }, 300);
    }
  };

  const handleDoubleTapLike = () => {
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 900);
    handleReact('love');
  };

  // Toggle audio mute
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  // ==========================================
  // NORMAL POST ENDPOINT: REACT (/api/posts/[id]/react)
  // ==========================================
  const handleReact = async (type: ReactionType) => {
    if (!currentUser) {
      alert('Please log in to react');
      return;
    }

    const prevReaction = myReaction;
    const prevCount = reactionCount;

    const isTogglingOff = prevReaction === type;
    const nextReaction: ReactionType | undefined = isTogglingOff ? undefined : type;
    const nextCount = isTogglingOff
      ? Math.max(0, prevCount - 1)
      : prevReaction
      ? prevCount
      : prevCount + 1;

    setMyReaction(nextReaction);
    setReactionCount(nextCount);

    if (onReact) {
      try {
        onReact(activePost, type);
      } catch {
        (onReact as any)(activePostId, type);
      }
    }

    try {
      // Standard post react endpoint: POST /api/posts/${postId}/react
      const res = await apiFetch(`/api/posts/${activePostId}/react`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: currentUser.id,
          type: type,
          post_id: activePostId,
        }),
      });

      if (res) {
        if (typeof res.reactions_count === 'number' && res.reactions_count > 1) {
          setReactionCount(res.reactions_count);
        }
        if (res.my_reaction !== undefined) {
          setMyReaction((res.my_reaction || undefined) as ReactionType | undefined);
        } else if (res.reaction !== undefined) {
          setMyReaction((res.reaction || undefined) as ReactionType | undefined);
        }
      }

      // Re-fetch reactions list: GET /api/posts/:id/reactions
      await fetchReactions();
    } catch (err) {
      console.warn('Post react endpoint error:', err);
      // rollback on error
      setMyReaction(prevReaction);
      setReactionCount(prevCount);
    }
  };

  // Toggle like on individual discussion comment: POST /api/post-comments/${commentId}/like
  const handleToggleLikeComment = async (comment: any) => {
    if (!currentUser) {
      alert('Please log in to like discussions.');
      return;
    }
    const commentId = comment.id;
    const currentlyLiked = Boolean(comment.liked_by_me);
    const currentCount = Number(comment.likes_count || 0);

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          return {
            ...c,
            liked_by_me: !currentlyLiked,
            likes_count: currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
          };
        }
        return c;
      })
    );

    try {
      await apiFetch(`/api/post-comments/${commentId}/like`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: safeUserId(currentUser),
        }),
      });
    } catch (err) {
      console.error('Failed to like comment:', err);
      // Revert optimistic update
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              liked_by_me: currentlyLiked,
              likes_count: currentCount,
            };
          }
          return c;
        })
      );
    }
  };

  // ==========================================
  // NORMAL POST ENDPOINT: DISCUSS / COMMENTS (/api/posts/[id]/comments)
  // ==========================================
  const fetchVideoComments = useCallback(async () => {
    if (!activePostId) return;

    setIsLoadingComments(true);
    try {
      // Standard post comments endpoint: /api/posts/${postId}/comments?viewerId=${viewerId}
      const viewerId = currentUser?.id || 0;
      const data = await apiFetch(`/api/posts/${activePostId}/comments?viewerId=${viewerId}`);
      if (Array.isArray(data)) {
        setComments(data);
        setCommentsCount(data.length);
      } else if (Array.isArray(data?.comments)) {
        setComments(data.comments);
        setCommentsCount(data.comments.length);
      }
    } catch (err) {
      console.warn('Failed to load post comments for video:', err);
    } finally {
      setIsLoadingComments(false);
    }
  }, [activePostId, currentUser?.id]);

  const [actionModalComment, setActionModalComment] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((prev) => (prev === msg ? null : prev)), 2200);
  };

  const isCommentHidden = (comment: any): boolean => {
    return Boolean(
      comment?.is_hidden ||
      comment?.hidden ||
      comment?.hidden_scope ||
      comment?.hidden_by ||
      comment?.hidden_label
    );
  };

  const isCommentAuthor = (comment: any): boolean => {
    const cUid = safeUserId(currentUser);
    const aUid = Number(comment?.user_id ?? comment?.userId ?? comment?.author_id ?? 0);
    return Boolean(cUid && aUid && cUid === aUid);
  };

  const isEntityOwner = (): boolean => {
    const cUid = safeUserId(currentUser);
    if (!cUid) return false;
    const ownerId = Number(
      activePost?.user_id ??
      activePost?.userId ??
      activePost?.author_id ??
      activePost?.authorId ??
      author?.id ??
      0
    );
    return Boolean(ownerId && ownerId === cUid);
  };

  const isPlatformAdmin = (): boolean => {
    const role = String((currentUser as any)?.role || '').toLowerCase();
    return ['admin', 'superadmin', 'moderator', 'owner'].includes(role);
  };

  const canHideComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isEntityOwner() || isPlatformAdmin();
  };

  const canDeleteComment = (comment: any): boolean => {
    return isCommentAuthor(comment) || isEntityOwner() || isPlatformAdmin();
  };

  const handleToggleHide = async (comment: any) => {
    if (!currentUser || !comment) return;
    const userId = safeUserId(currentUser);
    const commentId = comment.id;
    const currentlyHidden = isCommentHidden(comment);
    const nextAction: 'hide' | 'unhide' = currentlyHidden ? 'unhide' : 'hide';

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              is_hidden: !currentlyHidden,
              hidden: !currentlyHidden,
              hidden_by: !currentlyHidden ? userId : null,
              hidden_scope: !currentlyHidden ? 'user' : null,
            }
          : c
      )
    );

    showToast(nextAction === 'hide' ? 'Discussion hidden' : 'Discussion unhidden');

    try {
      await apiFetch(`/api/post-comments/${commentId}/hide`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          action: nextAction,
        }),
      });
    } catch (err) {
      console.error(`Failed to ${nextAction} comment:`, err);
      showToast(`Failed to ${nextAction} discussion`);
      fetchVideoComments();
    }
  };

  const handleDeleteComment = async (comment: any) => {
    if (!currentUser || !comment) return;
    const userId = safeUserId(currentUser);
    const commentId = comment.id;

    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentsCount((prev) => Math.max(0, prev - 1));
    showToast('Discussion deleted');

    if (onCommentAdded) {
      try {
        onCommentAdded();
      } catch {}
    }

    try {
      await apiFetch(`/api/post-comments/${commentId}/delete?user_id=${userId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete comment:', err);
      showToast('Failed to delete discussion');
      fetchVideoComments();
    }
  };

  const handleOpenDiscuss = (e?: React.MouseEvent | React.SyntheticEvent) => {
    e?.stopPropagation();
    if (onOpenComments) {
      onOpenComments(activePost);
    } else if (onVideoClick) {
      onVideoClick(activePost);
    } else {
      setShowDiscussModal(true);
      fetchVideoComments();
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    if (!currentUser) {
      alert('Please log in to comment');
      return;
    }

    setIsSubmittingComment(true);

    const userId = safeUserId(currentUser);

    // Optimistic comment using resolved user profile picture
    const tempComment: ReelComment = {
      id: Date.now(),
      user_id: userId,
      text,
      created_at: new Date().toISOString(),
      name: currentUser.name || currentUser.username || 'You',
      username: currentUser.username || 'you',
      profile_image_url: resolvedCurrentUserAvatar,
      is_verified: currentUser.is_verified || false,
    };

    setComments((prev) => [tempComment, ...prev]);
    setCommentsCount((prev) => prev + 1);
    setCommentText('');

    if (onCommentAdded) {
      try {
        onCommentAdded();
      } catch {}
    }

    try {
      // Standard post comments endpoint: POST /api/posts/${postId}/comments
      // body: { user_id, text, image_url?, parent_comment_id? }
      const payload: any = {
        user_id: userId,
        text,
      };
      if (replyToComment?.id) {
        payload.parent_comment_id = replyToComment.id;
      }

      const res = await apiFetch(`/api/posts/${activePostId}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setReplyToComment(null);

      if (res?.comment?.id || res?.id) {
        const serverComment = res?.comment || res;
        setComments((prev) =>
          prev.map((c) => (c.id === tempComment.id ? { ...c, ...serverComment } : c))
        );
      }
    } catch (err) {
      console.warn('Failed to post comment on video:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // ==========================================
  // NORMAL POST ENDPOINT: SHARE (/api/posts/[id]/share)
  // ==========================================
  const handleShare = async (e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (onShareClick) {
      onShareClick(activePost);
      return;
    }

    setShowShareSheet(true);
  };

  // Parse hashtags & mentions
  const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\s+)/);
    return parts.map((part, i) => {
      if (part.startsWith('#') && part.length > 1) {
        return (
          <span
            key={i}
            className="text-[#38BDF8] font-semibold hover:underline cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onHashtagClick?.(part);
            }}
          >
            {part}
          </span>
        );
      }
      if (part.startsWith('@') && part.length > 1) {
        return (
          <span
            key={i}
            className="text-[#60A5FA] font-medium hover:underline cursor-pointer"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#0F172A] border-b border-[#1E293B] text-[#F8FAFC] font-sans select-none"
    >
      {/* 1. INSTAGRAM HEADER */}
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar with authentic story ring/dots only if user has active story - Blue styled */}
          <div
            className={`relative cursor-pointer transition-transform active:scale-95 ${
              userHasStory
                ? 'p-[2px] rounded-full bg-gradient-to-tr from-[#1877F2] via-[#0284C7] to-[#38BDF8] ring-2 ring-[#0F172A]'
                : 'rounded-full'
            }`}
            onClick={() => {
              if (userHasStory && onStoryClick) {
                onStoryClick(authorId);
              } else {
                onProfileClick(authorId);
              }
            }}
            title={userHasStory ? `${authorName} has an active story` : authorName}
          >
            <img
              src={authorAvatar}
              alt={authorName}
              className={`w-9 h-9 rounded-full object-cover ${
                userHasStory ? 'border border-[#0F172A]' : 'border-2 border-[#1E293B]'
              }`}
            />
            {/* Real online status indicator */}
            {isOnline && (
              <span
                className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#22C55E] border-2 border-[#0F172A] rounded-full shadow-sm"
                title="Online now"
              />
            )}
          </div>

          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="font-bold text-[18px] sm:text-[21px] hover:underline cursor-pointer text-[#F8FAFC]"
                onClick={() => onProfileClick(authorId)}
              >
                {authorName}
              </span>
              {/* REAL verification tick only - NEVER faked */}
              {isVerified && (
                <VerifiedBadge size={16} className="shrink-0" />
              )}
              <span className="text-[#64748B] text-[13px]">•</span>
              {isSponsored ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#1877F2]/20 text-[#38BDF8] border border-[#1877F2]/40 tracking-wide">
                  Sponsored
                </span>
              ) : (
                <span className="text-[#94A3B8] text-[12.5px]">
                  {formatRelativeTime(activePost?.created_at || activePost?.timestamp || post?.created_at || post?.timestamp)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
              {isSponsored ? (
                <span className="truncate max-w-[200px] text-[#94A3B8]">
                  {sponsoredMeta?.headline || 'Promoted Post'}
                </span>
              ) : (
                <>
                  <i className="fas fa-music text-[10px] text-[#38BDF8]"></i>
                  <span className="truncate max-w-[180px] sm:max-w-[240px]">
                    {activePost?.song_name || post?.song_name || 'Original Audio'} • {authorName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser && currentUser.id !== authorId && onFollow && (
            <button
              onClick={() => onFollow(authorId)}
              className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                isFollowing
                  ? 'bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                  : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          )}

          {/* Watch in Videos button */}
          <button
            onClick={() => onVideoClick?.(post)}
            title="Watch in Videos"
            className="flex items-center gap-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
          >
            <i className="fas fa-play text-[10px]"></i>
            <span className="hidden xs:inline">Videos</span>
            <i className="fas fa-chevron-right text-[10px] ml-0.5"></i>
          </button>

          {/* Post Menu (Edit / Delete) */}
          <PostMenu
            item={{
              ...activePost,
              id: activePostId,
              user_id: authorId,
              type: 'post',
              content: activePost.content || activePost.caption,
              caption: activePost.caption || activePost.content,
            }}
            currentUser={currentUser}
            onDeleteSuccess={(deletedId) => {
              onDelete?.(Number(deletedId));
            }}
            onEditSuccess={(updatedItem) => {
              setLocalPost((prev: any) => ({ ...prev, ...updatedItem }));
              onEdit?.(activePostId, updatedItem.content || updatedItem.caption || '');
            }}
          />
        </div>
      </div>

      {/* 2. INSTAGRAM VIDEO MEDIA CONTAINER - FILLS ALL CARD WIDTH */}
      <div
        className="relative w-full bg-black flex items-center justify-center cursor-pointer overflow-hidden min-h-[380px] max-h-[640px] aspect-[4/5] sm:aspect-[1/1] md:aspect-[4/5] max-w-full"
        onClick={handleVideoAreaClick}
      >
        {/* Lazy-loaded Thumbnail (0 network video bytes while scrolling) */}
        {thumbnailUrl && (
          <div
            className={`absolute inset-0 z-0 bg-black flex items-center justify-center transition-opacity duration-300 ${
              hasStartedPlayback && isMediaReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            {isNearViewport ? (
              <img
                src={thumbnailUrl}
                alt="Video preview"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-[#050B14] flex items-center justify-center">
                <i className="fas fa-film text-[#1E293B] text-3xl"></i>
              </div>
            )}
          </div>
        )}

        {/* Video Element: mounted ONLY after user starts playback */}
        {hasStartedPlayback && currentSource && (
          <video
            ref={videoRef}
            src={currentSource}
            playsInline
            loop
            muted={isMuted}
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onPlaying={handlePlaying}
            onWaiting={handleBufferingOrStall}
            onStalled={handleBufferingOrStall}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-cover object-center z-[1]"
          />
        )}

        {/* Quality indicator badge (shows HD badge when upgraded to 1080p) */}
        {hasStartedPlayback && currentQuality === '1080p' && isPlaying && (
          <div className="absolute top-3 left-3 z-20 px-2 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/20 text-[#38BDF8] text-[10px] font-bold tracking-wider pointer-events-none">
            HD
          </div>
        )}

        {/* Play / Pause Ripple Indicator */}
        {showPlayIcon && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white text-2xl animate-scale-in">
              <i className={`fas fa-${isPlaying ? 'play' : 'pause'}`}></i>
            </div>
          </div>
        )}

        {/* Play Icon when paused (e.g., in feed when autoplay is false) */}
        {!isPlaying && !showPlayIcon && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-xl shadow-xl transition-transform active:scale-95">
              <i className="fas fa-play ml-1 text-[#38BDF8]"></i>
            </div>
          </div>
        )}

        {/* User Intent: ">" Button on top of every video to open in Videos page starting from this video */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onVideoClick) {
              onVideoClick(post);
            }
          }}
          title="Open in Videos page"
          aria-label="Open in Videos page"
          className="absolute top-3 right-3 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-black/65 hover:bg-[#1877F2] text-white border border-white/25 shadow-lg backdrop-blur-md transition-all active:scale-90 group cursor-pointer"
        >
          <i className="fas fa-chevron-right text-[13px] ml-0.5 group-hover:translate-x-0.5 transition-transform"></i>
        </button>

        {/* Double-tap Heart Burst Animation */}
        {showHeartBurst && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <i className="fas fa-heart text-white drop-shadow-[0_0_20px_rgba(239,68,68,0.9)] text-7xl animate-ping opacity-90 text-red-500"></i>
          </div>
        )}

        {/* Bottom Audio Track Frosted Pill */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none max-w-[70%]">
          <div className="bg-black/50 backdrop-blur-md border border-white/10 text-white text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md">
            <i className="fas fa-volume-up text-[#38BDF8] text-[10px]"></i>
            <span className="truncate">
              {activePost?.song_name || post?.song_name || 'Original Audio'} - {authorName}
            </span>
          </div>
        </div>

        {/* Sound Toggle Floating Button */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          className="absolute bottom-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
        >
          <i className={`fas fa-${isMuted ? 'volume-mute' : 'volume-up'} text-xs`}></i>
        </button>

        {/* Instagram Scrubber Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20 z-10">
          <div
            className="h-full bg-[#1877F2] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* SPONSORED CTA ACTION BAR - Instagram Ads Style */}
      {isSponsored && (
        <div
          onClick={handleSponsoredClick}
          className="w-full bg-[#1877F2] hover:bg-[#166FE5] active:scale-[0.99] transition-all px-4 py-2.5 flex items-center justify-between cursor-pointer text-white shadow-md select-none border-t border-[#1E293B]"
        >
          <div className="flex flex-col min-w-0 pr-3">
            <span className="text-[11px] uppercase font-bold tracking-wider opacity-85 truncate">
              {(() => {
                const target = sponsoredMeta?.cta_url || activePost?.destination_url || activePost?.cta_url;
                if (!target) return 'SPONSORED';
                try {
                  return new URL(target.startsWith('http') ? target : `https://${target}`).hostname.replace('www.', '');
                } catch {
                  return 'SPONSORED';
                }
              })()}
            </span>
            <span className="text-[13.5px] font-semibold truncate leading-tight text-white">
              {sponsoredMeta?.headline || activePost?.headline || activePost?.content || authorName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSponsoredClick}
            className="shrink-0 bg-white/20 hover:bg-white/30 text-white font-bold text-xs px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
          >
            <span>{sponsoredMeta?.cta_text || activePost?.cta_text || activePost?.cta_button || 'Learn More'}</span>
            <i className="fas fa-chevron-right text-[10px] opacity-80"></i>
          </button>
        </div>
      )}

      {/* 2. REACTION SUMMARY & DISCUSSION COUNTS LAYER (Configured like postcard) */}
      <div className="px-3 md:px-4 py-2.5 flex items-center justify-between text-[#94A3B8] text-[15px] border-t border-[#1E293B]">
        <div className="flex items-center gap-2 min-h-[24px]">
          {reactionCount > 0 && (
            <div
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenReactions) {
                  onOpenReactions(activePost);
                } else {
                  setShowReactionsSheet(true);
                }
              }}
            >
              <div className="flex -space-x-2">
                {emojiList.slice(0, 2).map((emoji, idx) => (
                  <span
                    key={idx}
                    className="w-[24px] h-[24px] rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[16px]"
                    style={{ zIndex: 10 - idx }}
                  >
                    {emoji}
                  </span>
                ))}
              </div>

              {reactionText && (
                <span className="text-[15px] md:text-[16px] text-[#F8FAFC] font-bold">
                  {reactionText}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span
            className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
            onClick={handleOpenDiscuss}
          >
            {formatCount(commentsCount)} {commentsCount === 1 ? 'Discussion' : 'Discussions'}
          </span>
          {sharesCount > 0 && (
            <span
              className="hover:underline cursor-pointer text-[15px] md:text-[16px] text-[#94A3B8] hover:text-[#CBD5E1] transition-colors"
              onClick={handleShare}
            >
              {formatCount(sharesCount)} {sharesCount === 1 ? 'Share' : 'Shares'}
            </span>
          )}
        </div>
      </div>

      {/* 3. ACTION BAR (React with ReactionButton dock, Discuss, Share, Save) */}
      <div className="px-3.5 py-2.5 border-t border-[#1E293B] flex items-center justify-between">
        <div className="flex items-center gap-3 md:gap-4">
          {/* 1. React Button with Animated Dock */}
          <ReactionButton
            currentUserReactions={myReaction}
            reactionCount={reactionCount}
            onReact={handleReact}
            isGuest={!currentUser}
            postId={activePostId}
          />

          {/* 2. Discuss / Comment */}
          <button
            type="button"
            onClick={handleOpenDiscuss}
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1.5 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
            aria-label="Discuss & Comments"
            title="Discuss"
          >
            <i className="far fa-comment text-[20px]"></i>
            {commentsCount > 0 && (
              <span className="text-[14px] font-semibold text-[#F8FAFC]">
                {formatCount(commentsCount)}
              </span>
            )}
          </button>

          {/* 3. Share */}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1.5 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
            aria-label="Share reel"
            title="Share"
          >
            <i className="far fa-paper-plane text-[19px]"></i>
            {sharesCount > 0 && (
              <span className="text-[14px] font-semibold text-[#F8FAFC]">
                {formatCount(sharesCount)}
              </span>
            )}
          </button>
        </div>

        {/* Bookmark / Save */}
        <button
          onClick={() => toggleSavePost(activePost, true)}
          className="flex items-center justify-center p-1.5 rounded-lg hover:bg-[#1E293B]/60 transition-transform active:scale-110 focus:outline-none cursor-pointer"
          aria-label={isSaved ? 'Remove from saved' : 'Save'}
          title={isSaved ? 'Saved' : 'Save post'}
        >
          <i
            className={`${
              isSaved ? 'fas text-[#F59E0B]' : 'far text-[#F8FAFC] hover:text-[#F59E0B]'
            } fa-bookmark text-[19px] transition-colors`}
          ></i>
        </button>
      </div>

      {/* Caption, View Discussions, and Outside Add Discussion Panel */}
      <div className="px-3.5 pb-3">
        {/* Caption & Hashtags */}
        {activePost.content && (
          <div className="text-[15px] leading-snug">
            <span
              className="font-bold text-[15px] text-[#F8FAFC] mr-1.5 cursor-pointer hover:underline"
              onClick={() => onProfileClick(authorId)}
            >
              {authorName}
            </span>
            <span className="text-[#E2E8F0]">
              {isCaptionExpanded
                ? renderFormattedText(activePost.content)
                : renderFormattedText(activePost.content.slice(0, 110))}
            </span>
            {activePost.content.length > 110 && (
              <button
                onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
                className="text-[#94A3B8] hover:text-white text-xs ml-1 font-medium cursor-pointer"
              >
                {isCaptionExpanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}

        {/* View all discussions link (Discussions only shown inside discussion modal) */}
        {commentsCount > 0 && (
          <button
            type="button"
            onClick={handleOpenDiscuss}
            className="mt-2 text-[#94A3B8] hover:text-[#F8FAFC] text-[13.5px] font-medium block transition-colors text-left cursor-pointer"
          >
            View all {formatCount(commentsCount)} {commentsCount === 1 ? 'discussion' : 'discussions'}
          </button>
        )}

        {/* Outside Add Discussion Panel: clicking opens comments / post preview modal */}
        <div
          onClick={handleOpenDiscuss}
          className="mt-2.5 pt-2 border-t border-[#1E293B]/70 flex items-center gap-2.5 cursor-pointer group/adddisc"
          role="button"
          tabIndex={0}
          aria-label="Add a discussion"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenDiscuss();
            }
          }}
        >
          <img
            src={resolvedCurrentUserAvatar}
            alt=""
            className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-[#1E293B]"
            onError={(e) => {
              const target = e.currentTarget;
              const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'User')}&background=1877F2&color=fff&bold=true`;
              if (target.src !== fallback) target.src = fallback;
            }}
          />
          <input
            type="text"
            readOnly
            placeholder="Add a discussion…"
            onClick={handleOpenDiscuss}
            className="bg-transparent flex-1 text-[14px] text-[#F8FAFC] placeholder-[#64748B] group-hover/adddisc:placeholder-[#94A3B8] outline-none cursor-pointer"
          />
          <button
            type="button"
            onClick={handleOpenDiscuss}
            className="text-[#64748B] group-hover/adddisc:text-[#38BDF8] transition-colors p-1 cursor-pointer"
            aria-label="Open discussion"
          >
            <i className="far fa-comment-dots text-[16px]" />
          </button>
        </div>
      </div>

      {/* Share Toast */}
      {showShareToast && (
        <div className="px-4 py-2 bg-[#1E293B] text-[#38BDF8] text-xs font-semibold flex items-center justify-center gap-2">
          <i className="fas fa-check-circle"></i>
          <span>Link copied to clipboard! Ready to share.</span>
        </div>
      )}

      {/* Reactions Sheet */}
      {showReactionsSheet && (
        <ReactionsSheet
          isOpen={showReactionsSheet}
          onClose={() => setShowReactionsSheet(false)}
          post={{
            ...activePost,
            id: activePostId,
            post_id: activePostId,
            reactions_count: reactionCount,
            reactions: combinedReactions,
          }}
          onProfileClick={onProfileClick}
          onOpenComments={handleOpenDiscuss}
        />
      )}

      {/* ========================================== */}
      {/* 4. REEL DISCUSS / COMMENTS DRAWER MODAL    */}
      {/* ========================================== */}
      {showDiscussModal && (
        <div
          className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex justify-center items-end sm:items-center"
          onClick={() => setShowDiscussModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#0B1120] border border-[#1E293B] rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh] h-[550px] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Discuss Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1E293B] bg-[#0B1120]">
              <div className="flex items-center gap-2">
                <i className="fas fa-comments text-[#38BDF8]"></i>
                <h3 className="font-bold text-[16px] text-[#F8FAFC]">Video Discussion</h3>
                <span className="text-xs bg-[#1E293B] text-[#94A3B8] px-2 py-0.5 rounded-full">
                  {commentsCount}
                </span>
              </div>
              <button
                onClick={() => setShowDiscussModal(false)}
                className="w-8 h-8 rounded-full hover:bg-[#1E293B] flex items-center justify-center text-[#94A3B8] hover:text-white transition-colors"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 divide-y divide-[#1E293B]/40">
              {isLoadingComments ? (
                <div className="flex flex-col items-center justify-center h-48 text-[#94A3B8]">
                  <i className="fas fa-spinner fa-spin text-2xl text-[#1877F2] mb-2"></i>
                  <span className="text-sm">Loading comments…</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-[#94A3B8] text-center">
                  <i className="far fa-comment-dots text-3xl text-[#475569] mb-2"></i>
                  <p className="text-sm font-medium text-[#F8FAFC]">No comments yet</p>
                  <p className="text-xs text-[#64748B]">Be the first to start the discussion on this video!</p>
                </div>
              ) : (
                comments.map((comment) => {
                  const cAuthorName = comment.name || comment.user?.name || comment.username || comment.user?.username || 'User';
                  const rawPic = comment.profile_image_url || comment.user?.profile_image_url || comment.avatar || comment.user?.avatar;
                  const cAuthorAvatar = (rawPic && typeof rawPic === 'string' && !rawPic.includes('ui-avatars.com'))
                    ? rawPic
                    : avatarFrom(comment.user || { id: comment.user_id, name: cAuthorName, profile_image_url: rawPic });
                  const isHidden = isCommentHidden(comment);
                  const canHide = canHideComment(comment);
                  const canDelete = canDeleteComment(comment);

                  return (
                    <div
                      key={comment.id}
                      className={`pt-3.5 first:pt-0 flex items-start gap-3 group/comment ${
                        isHidden ? 'opacity-65' : ''
                      }`}
                    >
                      <img
                        src={cAuthorAvatar}
                        alt={cAuthorName}
                        className="w-8 h-8 rounded-full object-cover border border-[#1E293B] shrink-0"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(cAuthorName)}&background=1877F2&color=fff&bold=true`;
                          if (target.src !== fallback) target.src = fallback;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-bold text-[14px] text-[#F8FAFC] hover:underline cursor-pointer"
                              onClick={() => {
                                setShowDiscussModal(false);
                                onProfileClick(comment.user_id);
                              }}
                            >
                              {cAuthorName}
                            </span>
                            <span className="text-[12px] text-[#64748B]">
                              {formatRelativeTime(comment.created_at)}
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
                              className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] rounded-full hover:bg-[#1E293B] transition-colors cursor-pointer"
                              title="Discussion options"
                            >
                              <i className="fas fa-ellipsis-h text-xs" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[13.5px] leading-relaxed text-[#CBD5E1] mt-0.5 break-words whitespace-pre-wrap">
                          {renderFormattedText(comment.text)}
                        </p>

                        <div className="flex items-center gap-3.5 mt-1 text-[11.5px] text-[#94A3B8]">
                          <button
                            type="button"
                            onClick={() => handleToggleLikeComment(comment)}
                            className={`hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer ${comment.liked_by_me ? 'text-red-500 font-semibold' : ''}`}
                          >
                            <i className={`${comment.liked_by_me ? 'fas fa-heart text-red-500' : 'far fa-heart'}`} />
                            <span>{comment.likes_count > 0 ? comment.likes_count : 'Like'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyToComment(comment);
                              const authorTag = comment.username || cAuthorName;
                              setCommentText(`@${authorTag} `);
                            }}
                            className="hover:text-[#38BDF8] transition-colors cursor-pointer"
                          >
                            Reply
                          </button>
                          {canHide && (
                            <button
                              type="button"
                              onClick={() => handleToggleHide(comment)}
                              className="hover:text-amber-400 transition-colors cursor-pointer"
                            >
                              {isHidden ? 'Unhide' : 'Hide'}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment)}
                              className="hover:text-red-400 transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Emoji Bar */}
            <div className="px-4 py-1.5 bg-[#0B1120] border-t border-[#1E293B] flex items-center justify-between text-lg">
              {['❤️', '🙌', '🔥', '👏', '😍', '😂', '😮', '💯'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setCommentText((prev) => prev + emoji)}
                  className="hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Replying Banner */}
            {replyToComment && (
              <div className="flex items-center justify-between px-4 py-1.5 bg-[#0F172A] border-t border-[#1E293B] text-xs text-[#94A3B8]">
                <span>Replying to <strong className="text-white">@{replyToComment.username || 'user'}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyToComment(null);
                    setCommentText('');
                  }}
                  className="text-[#94A3B8] hover:text-white ml-2"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            {/* Comment Form */}
            <form
              onSubmit={handlePostComment}
              className="p-3 bg-[#0F172A] border-t border-[#1E293B] flex items-center gap-3"
            >
              <img
                src={resolvedCurrentUserAvatar}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-[#1E293B]"
                onError={(e) => {
                  const target = e.currentTarget;
                  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.username || 'User')}&background=1877F2&color=fff&bold=true`;
                  if (target.src !== fallback) target.src = fallback;
                }}
              />
              <input
                type="text"
                placeholder="Share your thoughts on this video…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 bg-[#1E293B] border border-[#334155] rounded-full px-4 py-2.5 text-[16px] text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#1877F2]"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || isSubmittingComment}
                className="bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-40 text-white text-sm font-bold px-4 py-2.5 rounded-full transition-colors flex items-center gap-1.5"
              >
                {isSubmittingComment ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  <>
                    <span>Post</span>
                    <i className="fas fa-arrow-up text-[10px]"></i>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Discussion Action Modal */}
      {actionModalComment && (
        <CommentActionModal
          isOpen={Boolean(actionModalComment)}
          onClose={() => setActionModalComment(null)}
          comment={actionModalComment}
          authorName={actionModalComment.name || actionModalComment.user?.name || 'User'}
          authorAvatar={
            actionModalComment.profile_image_url ||
            actionModalComment.user?.profile_image_url ||
            avatarFrom({ id: actionModalComment.user_id, name: actionModalComment.name || 'User' })
          }
          commentText={String(actionModalComment.text || '')}
          isHidden={isCommentHidden(actionModalComment)}
          canHide={canHideComment(actionModalComment)}
          canDelete={canDeleteComment(actionModalComment)}
          onToggleHide={handleToggleHide}
          onDelete={handleDeleteComment}
          onReply={(c) => {
            const author = c.name || c.user?.name || 'User';
            setCommentText(`@${author} `);
          }}
        />
      )}

      {/* Floating Action Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 rounded-full bg-[#1E293B] border border-[#334155] text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Share Bottom Sheet Modal */}
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        post={activePost}
        currentUser={currentUser || null}
        users={users}
        onShareComplete={(destination, data) => {
          const nextCount = safeNumber(data?.shares ?? data?.share_count, sharesCount + 1);
          setSharesCount(nextCount);
          if (onShare) {
            onShare(activePostId, nextCount, data, activePost);
          }
          setShowShareSheet(false);
        }}
      />
    </div>
  );
};
