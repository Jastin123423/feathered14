import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InstagramVideoCard } from './InstagramVideoCard';
import { Post, safeUserId } from './Feed';
import { mixOrganicAndSponsored } from '../utils/adMixer';
import { apiFetch } from '../utils/api';

interface VideosPageProps {
  posts?: any[];
  reels?: any[];
  users?: any[];
  stories?: any[];
  ads?: any[];
  currentUser: any;
  initialVideoId?: number | string | null;
  onInitialScrolled?: () => void;
  onPostVideoClick?: () => void;
  onProfileClick: (userId: number) => void;
  onStoryClick?: (userId: number) => void;
  onReact?: (post: any, type: string) => void;
  onShare?: (postId: number, count: number) => void;
  onOpenComments?: (post: any) => void;
  onFollow?: (userId: number) => void;
  checkIsFollowing?: (userId: number) => boolean;
  onBack?: () => void;
}

const VIDEOS_PER_PAGE = 15;

export const VideosPage: React.FC<VideosPageProps> = ({
  posts = [],
  reels = [],
  users = [],
  stories = [],
  ads = [],
  currentUser,
  initialVideoId,
  onInitialScrolled,
  onProfileClick,
  onStoryClick,
  onReact,
  onShare,
  onOpenComments,
  onFollow,
  checkIsFollowing,
  onBack,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolledVideoIdRef = useRef<string | number | null>(null);

  // Active ads pool
  const [internalAds, setInternalAds] = useState<any[]>(Array.isArray(ads) && ads.length > 0 ? ads : []);

  useEffect(() => {
    if (Array.isArray(ads) && ads.length > 0) {
      setInternalAds(ads);
      return;
    }
    apiFetch('/api/ads/feeds')
      .then((res: any) => {
        if (res && Array.isArray(res.ads)) {
          setInternalAds(res.ads);
        }
      })
      .catch(() => {});
  }, [ads]);

  // Extract, normalize, and unify ALL videos from feed posts and reels
  const allVideos = useMemo(() => {
    const videoMap = new Map<string, any>();

    // 1. Process feed posts that are videos
    posts.forEach((post) => {
      const vUrl =
        post?.video_url ||
        (Array.isArray(post?.media)
          ? post.media.find((m: any) => m?.type === 'video')?.feed ||
            post.media.find((m: any) => m?.type === 'video')?.url
          : null) ||
        (post?.media_type === 'video' ? post?.feed_url || post?.media_url : null) ||
        (typeof post?.feed_url === 'string' && post.feed_url.match(/\.(mp4|webm|mov|m4v|ogg)/i)
          ? post.feed_url
          : null) ||
        (typeof post?.media_url === 'string' && post.media_url.match(/\.(mp4|webm|mov|m4v|ogg)/i)
          ? post.media_url
          : null) ||
        (Array.isArray(post?.media_urls)
          ? post.media_urls.find((u: string) => typeof u === 'string' && u.match(/\.(mp4|webm|mov|m4v)/i))
          : null);

      const isVideo =
        post?.media_type === 'video' ||
        post?.type === 'video' ||
        post?.meta?.type === 'video' ||
        Boolean(vUrl);

      if (isVideo && (vUrl || post?.media_url)) {
        const resolvedVideoUrl = vUrl || post?.media_url;
        const key = resolvedVideoUrl || `post_${post?.id}`;
        if (!videoMap.has(key)) {
          videoMap.set(key, {
            ...post,
            source: 'post',
            video_url: resolvedVideoUrl,
            media_url: resolvedVideoUrl,
            created_at: post?.created_at || new Date().toISOString(),
          });
        }
      }
    });

    // 2. Process reels
    reels.forEach((reel) => {
      const vUrl = reel?.video_url || reel?.media_url;
      if (!vUrl) return;

      const key = vUrl;
      // If not already included from a feed post, add it
      if (!videoMap.has(key)) {
        const reelAuthor = reel?.user || users.find((u) => u.id === (reel?.user_id || reel?.userId)) || {
          id: reel?.user_id || 0,
          name: reel?.author || reel?.username || 'User',
          profile_image_url: reel?.avatar || reel?.profile_image_url,
          is_verified: Boolean(reel?.verified || reel?.is_verified),
        };

        videoMap.set(key, {
          id: reel?.id || `reel_${Date.now()}_${Math.random()}`,
          reel_id: reel?.id,
          content: reel?.caption || reel?.content || '',
          caption: reel?.caption || '',
          media_url: vUrl,
          video_url: vUrl,
          media_type: 'video',
          type: 'video',
          created_at: reel?.created_at || new Date().toISOString(),
          author: reelAuthor,
          user: reelAuthor,
          user_id: safeUserId(reelAuthor),
          likes_count: reel?.likes_count ?? reel?.views ?? 0,
          comments_count: reel?.comments_count ?? 0,
          shares_count: reel?.shares_count ?? 0,
          source: 'reel',
          song_name: reel?.song_name || reel?.audio_title,
        });
      }
    });

    // Convert map to array and sort chronologically (newest first)
    const list = Array.from(videoMap.values());
    list.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return list;
  }, [posts, reels, users]);

  // Session tracking to preserve variable spacing state across infinite scroll & pagination
  const sessionTrackingRef = useRef<{
    itemsSinceLastAd: number;
    seenAdIds: Set<number | string>;
  }>({
    itemsSinceLastAd: 0,
    seenAdIds: new Set(),
  });

  // Mix organic videos and ads with variable spacing and strict anti-clustering
  const mixedVideos = useMemo(() => {
    if (!internalAds || internalAds.length === 0) {
      return allVideos;
    }

    const result = mixOrganicAndSponsored(allVideos, internalAds, {
      minSpacing: 4,
      maxSpacing: 7,
      initialOffset: 2,
      isAdItem: (v: any) => Boolean(v?.is_sponsored || v?.source === 'sponsored'),
      transformAd: (ad: any) => {
        const originalPost = posts.find((p) => Number(p.id) === Number(ad.post_id));
        const matchedUser = users.find((u) => Number(u.id) === Number(originalPost?.user_id || ad.user_id || ad.advertiser_id));
        const mediaUrl = ad.mediaUrl || ad.media_url || (Array.isArray(ad.media_urls) ? ad.media_urls[0] : null) || originalPost?.media_url;
        const isVideo = ad.type === 'video' || ad.media_type === 'video' || Boolean(ad.video_url) || Boolean(mediaUrl && typeof mediaUrl === 'string' && mediaUrl.match(/\.(mp4|webm|mov|m4v|ogg)/i));
        const authorName = originalPost?.author?.name || originalPost?.user?.name || matchedUser?.name || ad.name || ad.campaign_name || 'Creator';
        const authorAvatar = originalPost?.author?.profile_image_url || originalPost?.user?.profile_image_url || matchedUser?.profile_image_url || ad.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=1877F2&color=fff`;
        const authorId = Number(originalPost?.user_id || ad.user_id || ad.advertiser_id || matchedUser?.id || 0);

        const authorObj = {
          id: authorId,
          name: authorName,
          username: originalPost?.author?.username || matchedUser?.username || 'creator',
          profile_image_url: authorAvatar,
          is_verified: Boolean(originalPost?.author?.is_verified || matchedUser?.is_verified || ad.is_verified),
        };

        const adContent = originalPost?.content || originalPost?.caption || ad.description || ad.content || '';
        const adTitle = originalPost?.name || originalPost?.title || ad.headline || ad.name || 'Sponsored';
        const numericPostId = Number(ad.post_id || originalPost?.id || ad.id || 0);

        return {
          ...originalPost,
          ...ad,
          id: numericPostId,
          post_id: numericPostId,
          ad_id: ad.id,
          feed_key: `sponsored:${ad.id || numericPostId}`,
          is_sponsored: true,
          source: 'sponsored',
          type: isVideo ? 'video' : 'sponsored',
          media_type: isVideo ? 'video' : 'image',
          media_url: mediaUrl,
          video_url: isVideo ? (ad.video_url || mediaUrl) : undefined,
          content: adContent,
          caption: adContent,
          headline: adTitle,
          name: authorName,
          destination_url: ad.destination_url || ad.link,
          cta_url: ad.destination_url || ad.link,
          cta_button: ad.cta_button || ad.cta || 'Learn More',
          cta_text: ad.cta_button || ad.cta || 'Learn More',
          phone_number: ad.phone_number,
          email_address: ad.email_address,
          user: authorObj,
          author: authorObj,
          user_id: authorId,
          likes_count: originalPost?.likes_count ?? originalPost?.likes?.length ?? 0,
          comments_count: originalPost?.comments_count ?? originalPost?.comments?.length ?? 0,
          shares_count: originalPost?.shares_count ?? 0,
          created_at: ad.created_at || originalPost?.created_at || new Date().toISOString(),
          sponsored_meta: {
            ad_id: ad.id,
            campaign_name: ad.campaign_name || ad.name,
            headline: adTitle,
            cta_text: ad.cta_button || ad.cta || 'Learn More',
            cta_url: ad.destination_url || ad.link,
            contact_type: ad.phone_number ? 'phone' : ad.email_address ? 'email' : 'link',
            phone_number: ad.phone_number,
            email_address: ad.email_address,
          },
        };
      },
    });

    return result.mixedItems;
  }, [allVideos, internalAds, posts, users]);

  // Jump to specific video when user enters with initialVideoId from feed
  // Respects the user's manual scrolling: only jumps once upon arrival and never snaps back
  useEffect(() => {
    if (!initialVideoId || mixedVideos.length === 0) return;
    if (scrolledVideoIdRef.current === initialVideoId) return;

    const targetId = String(initialVideoId);
    const index = mixedVideos.findIndex(
      (v) =>
        String(v.id) === targetId ||
        String(v.reel_id) === targetId ||
        String(v.post_id) === targetId
    );

    if (index !== -1) {
      scrolledVideoIdRef.current = initialVideoId;
      const targetPage = Math.floor(index / VIDEOS_PER_PAGE) + 1;
      setCurrentPage(targetPage);

      const timer = setTimeout(() => {
        const el =
          document.getElementById(`video-card-${targetId}`) ||
          document.getElementById(`video-card-${mixedVideos[index].id}`) ||
          document.getElementById(`video-card-${mixedVideos[index].reel_id}`) ||
          document.querySelector(`[data-video-id="${targetId}"]`) ||
          document.querySelector(`[data-reel-id="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        onInitialScrolled?.();
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [initialVideoId, mixedVideos.length, onInitialScrolled]);

  // Pagination calculation: 15 videos per page
  const totalVideos = mixedVideos.length;
  const totalPages = Math.max(1, Math.ceil(totalVideos / VIDEOS_PER_PAGE));
  const startIndex = (currentPage - 1) * VIDEOS_PER_PAGE;
  const endIndex = Math.min(startIndex + VIDEOS_PER_PAGE, totalVideos);
  const currentVideos = mixedVideos.slice(startIndex, endIndex);

  // Handle page change and smooth scroll to top of list
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div ref={containerRef} className="w-full max-w-[700px] mx-auto min-h-screen pb-20">
      {/* 1. CLEAN VIDEO PAGE HEADER (No Videos icon, No videos posted text, No Post Video button, No Share prompt) */}
      {onBack && (
        <div className="bg-[#0B1120] border-b border-[#1E293B] sticky top-14 z-30 px-3.5 py-2.5 flex items-center gap-3 shadow-md">
          <button
            onClick={onBack}
            type="button"
            className="w-8 h-8 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-[13px]"></i>
          </button>
          <span className="text-[16px] font-bold text-[#F8FAFC]">Videos</span>
        </div>
      )}

      {/* 2. VIDEOS STREAM - AUTOPLAY ENABLED */}
      {currentVideos.length > 0 ? (
        <div className="flex flex-col divide-y divide-[#1E293B]">
          {currentVideos.map((videoPost, idx) => {
            const isSponsored = Boolean(videoPost.is_sponsored || videoPost.source === 'sponsored');
            const hasVideoMedia = Boolean(
              videoPost.video_url || 
              (videoPost.media_type === 'video') || 
              (typeof videoPost.media_url === 'string' && videoPost.media_url.match(/\.(mp4|webm|mov|m4v|ogg)/i))
            );

            // If it's a sponsored ad without video format (e.g. pushed image/text post), render standard Post from Feed.tsx
            if (isSponsored && !hasVideoMedia) {
              const author =
                videoPost.author ||
                videoPost.user ||
                users.find((u) => u.id === (videoPost.user_id || videoPost.userId)) || {
                  id: videoPost.user_id || 0,
                  name: videoPost.name || 'User',
                  profile_image_url: null,
                  is_verified: false,
                };
              const authorId = safeUserId(author);
              const isFollowing = checkIsFollowing ? checkIsFollowing(authorId) : false;

              return (
                <div key={videoPost.feed_key || `ad_post_${videoPost.id}_${idx}`} className="w-full bg-[#0F172A]">
                  <Post
                    post={videoPost}
                    author={author}
                    currentUser={currentUser}
                    users={users}
                    stories={stories}
                    onProfileClick={onProfileClick}
                    onReact={(p, type) => onReact?.(videoPost, type)}
                    onShare={(id, count) => onShare?.(Number(videoPost.id), count)}
                    onOpenComments={() => onOpenComments?.(videoPost)}
                    onViewImage={() => {}}
                    onVideoClick={() => {}}
                    isFollowing={isFollowing}
                    onFollow={() => onFollow?.(authorId)}
                  />
                </div>
              );
            }

            const author =
              videoPost.author ||
              videoPost.user ||
              users.find((u) => u.id === (videoPost.user_id || videoPost.userId)) || {
                id: videoPost.user_id || 0,
                name: 'User',
                profile_image_url: null,
                is_verified: false,
              };

            const authorId = safeUserId(author);
            const isFollowing = checkIsFollowing ? checkIsFollowing(authorId) : false;
            const elementId = videoPost.reel_id || videoPost.id || `v_${idx}`;

            return (
              <div
                key={videoPost.feed_key || videoPost.id || `v_${idx}`}
                id={`video-card-${elementId}`}
                data-video-id={videoPost.id}
                data-reel-id={videoPost.reel_id}
                className="w-full bg-[#0F172A]"
              >
                <InstagramVideoCard
                  post={videoPost}
                  author={author}
                  currentUser={currentUser}
                  users={users}
                  stories={stories}
                  autoplay={false}
                  onProfileClick={onProfileClick}
                  onStoryClick={onStoryClick}
                  onReact={onReact ? (post, type) => onReact(videoPost, type) : undefined}
                  onShare={onShare}
                  onOpenComments={onOpenComments}
                  isFollowing={isFollowing}
                  onFollow={onFollow}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 text-center my-10">
          <div className="w-16 h-16 rounded-full bg-[#0F172A] border border-[#1E293B] flex items-center justify-center text-[#64748B] mb-4">
            <i className="fas fa-film text-2xl text-[#38BDF8]"></i>
          </div>
          <h3 className="text-base font-bold text-[#F8FAFC]">No Videos Available</h3>
          <p className="text-xs text-[#94A3B8] max-w-sm mt-1">
            Videos from the feed and reels will appear here.
          </p>
        </div>
      )}

      {/* 3. PAGINATION AFTER 15 VIDEOS */}
      {totalPages > 1 && (
        <div className="mt-6 mb-10 px-4 py-3.5 bg-[#0B1120] border border-[#1E293B] rounded-2xl mx-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-[#94A3B8] font-medium">
            Showing <strong className="text-[#F8FAFC]">{startIndex + 1}–{endIndex}</strong> of{' '}
            <strong className="text-[#F8FAFC]">{totalVideos}</strong> videos
          </span>

          <div className="flex items-center gap-1.5">
            {/* Previous button */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                currentPage === 1
                  ? 'text-[#475569] bg-[#0F172A] border border-[#1E293B]/60 cursor-not-allowed'
                  : 'text-[#CBD5E1] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] cursor-pointer'
              }`}
            >
              <i className="fas fa-chevron-left text-[10px]"></i>
              <span>Prev</span>
            </button>

            {/* Page number buttons */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              if (
                totalPages > 6 &&
                pageNum !== 1 &&
                pageNum !== totalPages &&
                Math.abs(pageNum - currentPage) > 1
              ) {
                if (pageNum === 2 || pageNum === totalPages - 1) {
                  return (
                    <span key={`ellipsis_${pageNum}`} className="px-1 text-xs text-[#64748B]">
                      …
                    </span>
                  );
                }
                return null;
              }

              const isActive = pageNum === currentPage;
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1877F2] text-white shadow-md shadow-[#1877F2]/30'
                      : 'bg-[#0F172A] hover:bg-[#1E293B] text-[#94A3B8] border border-[#1E293B]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            {/* Next button */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                currentPage === totalPages
                  ? 'text-[#475569] bg-[#0F172A] border border-[#1E293B]/60 cursor-not-allowed'
                  : 'text-[#CBD5E1] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] cursor-pointer'
              }`}
            >
              <span>Next</span>
              <i className="fas fa-chevron-right text-[10px]"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
