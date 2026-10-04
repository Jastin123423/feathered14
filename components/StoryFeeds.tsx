import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Search,
  Layers,
  LayoutGrid,
  List,
  Clock,
  Music,
  Trash2,
  Maximize2,
  X,
  UserPlus,
  UserCheck,
  Share2,
} from 'lucide-react';
import { Story, User, ReactionType } from '../types';
import { ReactionButton, ShareBottomSheet, ReactionsSheet, apiFetch, Post } from './Feed';
import { getStoryCommentsCache, setStoryCommentsCache } from './Story';
import { VerifiedBadge } from './VerifiedBadge';
import { mixOrganicAndSponsored } from '../utils/adMixer';

interface StoryFeedsProps {
  currentUser: User | null;
  users?: User[];
  stories?: Story[];
  ads?: any[];
  focusedStoryId?: number | null;
  onCreateStory?: () => void;
  onViewStory?: (storyId: number) => void;
  onProfileClick?: (id: number) => void;
  onReact?: (storyId: number, type: string) => void | Promise<void>;
  onReply?: (storyId: number, text: string) => void | Promise<void>;
  onComment?: (storyId: number) => void;
  onOpenComments?: (post: any) => void;
  onShare?: (story: any) => void;
  onDeleteStory?: (storyId: number) => void | Promise<void>;
  onFollow?: (id: number) => void;
  checkIsFollowing?: (id: number) => boolean;
  followLoading?: boolean | Record<number, boolean>;
  onBack?: () => void;
  onLoginClick?: () => void;
}

type ViewMode = 'stream' | 'grid';

const REACTION_ICONS: Record<string, { emoji: string; label: string; color: string }> = {
  like: { emoji: '👍', label: 'Like', color: '#38BDF8' },
  love: { emoji: '❤️', label: 'Love', color: '#EF4444' },
  fire: { emoji: '🔥', label: 'Fire', color: '#F97316' },
  haha: { emoji: '😂', label: 'Haha', color: '#FBBF24' },
  wow: { emoji: '😮', label: 'Wow', color: '#A855F7' },
  sad: { emoji: '😢', label: 'Sad', color: '#60A5FA' },
  angry: { emoji: '😡', label: 'Angry', color: '#F87171' },
};

const formatTimeAgo = (dateStr?: string): string => {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return 'Recently';
  }
};

export default function StoryFeeds({
  currentUser,
  users = [],
  stories = [],
  ads = [],
  focusedStoryId,
  onCreateStory,
  onViewStory,
  onProfileClick,
  onReact,
  onReply,
  onComment,
  onOpenComments,
  onShare,
  onDeleteStory,
  onFollow,
  checkIsFollowing,
  followLoading,
  onBack,
  onLoginClick,
}: StoryFeedsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('stream');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCreatorId, setSelectedCreatorId] = useState<number | null>(null);
  const [activePlayingStoryId, setActivePlayingStoryId] = useState<number | null>(null);

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

  // Session tracking to preserve variable spacing state across infinite scroll & re-renders
  const sessionTrackingRef = useRef<{
    itemsSinceLastAd: number;
    seenAdIds: Set<number | string>;
  }>({
    itemsSinceLastAd: 0,
    seenAdIds: new Set(),
  });

  const handlePlayVideo = useCallback((storyId: number) => {
    setActivePlayingStoryId(storyId);
  }, []);

  const handlePauseVideo = useCallback((storyId: number) => {
    setActivePlayingStoryId((curr) => (curr === storyId ? null : curr));
  }, []);

  // Auto-scroll to focused story if navigated from Feed
  useEffect(() => {
    if (focusedStoryId) {
      const el = document.getElementById(`story-card-${focusedStoryId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 250);
      }
    }
  }, [focusedStoryId]);

  // Group stories by creator for top reel
  const creatorsMap = useMemo(() => {
    const map = new Map<number, { user: Partial<User>; stories: Story[] }>();

    for (const story of stories) {
      const authorId = Number(story.user_id || story.user?.id || 0);
      if (!authorId) continue;

      const matchedUser = users.find((u) => Number(u.id) === authorId);
      const userObj: Partial<User> = {
        id: authorId,
        name: story.author_name || story.user?.name || matchedUser?.name || 'Creator',
        username:
          story.author_username ||
          story.username ||
          story.user?.username ||
          matchedUser?.username ||
          'creator',
        profile_image_url:
          story.author_image ||
          story.user?.profile_image_url ||
          matchedUser?.profile_image_url ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        is_verified:
          story.user?.is_verified ||
          matchedUser?.is_verified ||
          (matchedUser as any)?.verified ||
          false,
      };

      if (!map.has(authorId)) {
        map.set(authorId, { user: userObj, stories: [] });
      }
      map.get(authorId)!.stories.push(story);
    }

    return map;
  }, [stories, users]);

  const creatorsList = useMemo(() => {
    return Array.from(creatorsMap.values());
  }, [creatorsMap]);

  // Filter & sort stories (recent first, search query, creator filter)
  const filteredStories = useMemo(() => {
    let list = [...stories];

    // Creator focus filter
    if (selectedCreatorId !== null) {
      list = list.filter((s) => Number(s.user_id || s.user?.id) === selectedCreatorId);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const text = (s.text_content || s.text || '').toLowerCase();
        const author = (s.author_name || s.user?.name || '').toLowerCase();
        const username = (s.author_username || s.username || '').toLowerCase();
        const music = (s.music_title || '').toLowerCase();
        return (
          text.includes(q) ||
          author.includes(q) ||
          username.includes(q) ||
          music.includes(q)
        );
      });
    }

    // Standard feed ordering: recent first
    list.sort((a, b) => {
      const timeA = new Date(a.created_at || (a as any).createdAt || 0).getTime();
      const timeB = new Date(b.created_at || (b as any).createdAt || 0).getTime();
      return timeB - timeA;
    });

    return list;
  }, [stories, searchQuery, selectedCreatorId]);

  // Mix organic stories and sponsored ads with variable spacing and strict anti-clustering
  const mixedStories = useMemo(() => {
    if (!internalAds || internalAds.length === 0) {
      return filteredStories;
    }

    const result = mixOrganicAndSponsored(filteredStories, internalAds, {
      minSpacing: 4,
      maxSpacing: 7,
      initialOffset: 2,
      isAdItem: (s: any) => Boolean(s?.is_sponsored || s?.source === 'sponsored' || s?.item_type === 'sponsored'),
      transformAd: (ad: any) => {
        const matchedUser = users.find((u) => Number(u.id) === Number(ad.user_id || ad.advertiser_id));
        const authorName = matchedUser?.name || ad.name || ad.campaign_name || 'Creator';
        const authorAvatar = matchedUser?.profile_image_url || ad.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=1877F2&color=fff`;
        const mediaUrl = ad.mediaUrl || ad.media_url || (Array.isArray(ad.media_urls) ? ad.media_urls[0] : null);
        const isVideo = ad.type === 'video' || ad.media_type === 'video' || Boolean(ad.video_url) || Boolean(mediaUrl && typeof mediaUrl === 'string' && mediaUrl.match(/\.(mp4|webm|mov|m4v|ogg)/i));
        const authorId = Number(ad.user_id || ad.advertiser_id || matchedUser?.id || 0);

        const authorObj = {
          id: authorId,
          name: authorName,
          username: matchedUser?.username || 'creator',
          profile_image_url: authorAvatar,
          is_verified: Boolean(matchedUser?.is_verified || ad.is_verified),
        };

        const adTitle = ad.headline || ad.title || ad.campaign_name || 'Sponsored';
        const adText = ad.description || ad.content || '';
        const numericPostId = Number(ad.post_id || ad.id || 0);

        return {
          ...ad,
          id: numericPostId,
          post_id: numericPostId,
          story_id: numericPostId,
          ad_id: ad.id,
          feed_key: `sponsored_story:${ad.id || numericPostId}`,
          user_id: authorId,
          author_name: authorName,
          author_username: matchedUser?.username || 'creator',
          author_image: authorAvatar,
          user: authorObj,
          author: authorObj,
          media_url: mediaUrl,
          mediaUrl: mediaUrl,
          type: isVideo ? 'video' : 'image',
          text_content: adText,
          content: adText,
          text: adText,
          headline: adTitle,
          name: authorName,
          destination_url: ad.destination_url || ad.link,
          cta_url: ad.destination_url || ad.link,
          cta_button: ad.cta_button || ad.cta || 'Learn More',
          cta_text: ad.cta_button || ad.cta || 'Learn More',
          phone_number: ad.phone_number,
          email_address: ad.email_address,
          is_sponsored: true,
          source: 'sponsored',
          item_type: 'sponsored',
          created_at: ad.created_at || new Date().toISOString(),
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
  }, [filteredStories, internalAds, users]);

  return (
    <div className="w-full min-h-screen bg-[#050B18] text-[#F8FAFC]">
      {/* Top Sticky Header */}
      <div className="sticky top-0 z-30 bg-[#0B1120]/95 backdrop-blur-md border-b border-[#1E293B] px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Go back"
                className="w-10 h-10 rounded-xl bg-[#141E33] hover:bg-[#1E293B] border border-[#1E293B] flex items-center justify-center text-[#94A3B8] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>Story Feed</span>
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#94A3B8] truncate">
                {stories.length} active stories from friends & community
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {onCreateStory && (
              <button
                type="button"
                onClick={onCreateStory}
                className="flex items-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-r from-[#1877F2] to-[#2563EB] hover:from-[#166FE5] hover:to-[#1D4ED8] text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xs:inline">Add Story</span>
              </button>
            )}

            <div className="flex items-center p-1 rounded-xl bg-[#141E33] border border-[#1E293B]">
              <button
                type="button"
                onClick={() => setViewMode('stream')}
                aria-label="Feed stream view"
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'stream'
                    ? 'bg-[#1877F2] text-white shadow-sm'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
                title="Feed Stream (like Feeds)"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-[#1877F2] text-white shadow-sm'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
                title="Visual Grid"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`w-full mx-auto ${viewMode === 'stream' ? 'max-w-[680px] px-0 py-2 space-y-4' : 'max-w-4xl px-2 sm:px-4 py-4 sm:py-6 space-y-5'}`}>
        {/* Top Story Creators Carousel */}
        <div className={`bg-[#0B1120] border border-[#1E293B] rounded-2xl p-3 sm:p-4 shadow-sm overflow-hidden ${viewMode === 'stream' ? 'mx-3 sm:mx-0' : ''}`}>
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
              Story Creators
            </span>
            {selectedCreatorId !== null && (
              <button
                type="button"
                onClick={() => setSelectedCreatorId(null)}
                className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1"
              >
                Clear creator filter
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-[#1E293B] scrollbar-track-transparent">
            {/* Create Story Button Card */}
            {onCreateStory && (
              <button
                type="button"
                onClick={onCreateStory}
                className="flex flex-col items-center gap-1.5 flex-shrink-0 group cursor-pointer"
              >
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full bg-[#0F172A] flex items-center justify-center overflow-hidden border-2 border-[#0B1120]">
                    {currentUser?.profile_image_url ? (
                      <img
                        src={currentUser.profile_image_url}
                        alt="Your story"
                        className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#1E293B] flex items-center justify-center text-white font-bold">
                        You
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-[#1877F2] text-white flex items-center justify-center shadow-md">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-[#94A3B8] group-hover:text-white max-w-[64px] truncate text-center">
                  Your Story
                </span>
              </button>
            )}

            {/* Creator Rings */}
            {creatorsList.map(({ user, stories: userStories }) => {
              const isSelected = selectedCreatorId === user.id;
              const hasUnviewed = userStories.some((s) => !s.seen && !s.viewed_by_me);

              return (
                <button
                  key={`creator-${user.id}`}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCreatorId(null);
                    } else {
                      setSelectedCreatorId(Number(user.id));
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 flex-shrink-0 group transition-all ${
                    isSelected ? 'scale-105' : 'hover:opacity-95'
                  }`}
                >
                  <div
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2.5px] transition-all ${
                      isSelected
                        ? 'bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 shadow-md shadow-blue-500/30'
                        : hasUnviewed
                        ? 'bg-gradient-to-tr from-emerald-400 via-cyan-400 to-blue-500'
                        : 'bg-[#1E293B]'
                    }`}
                  >
                    <img
                      src={
                        user.profile_image_url ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
                      }
                      alt={user.name || 'User'}
                      className="w-full h-full rounded-full object-cover border-2 border-[#0B1120]"
                    />
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#1877F2] text-white border-2 border-[#0B1120]">
                      {userStories.length}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] max-w-[68px] truncate text-center ${
                      isSelected ? 'text-[#38BDF8] font-bold' : 'text-[#94A3B8] group-hover:text-white'
                    }`}
                  >
                    {user.name?.split(' ')[0] || 'User'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clean Search Bar (Categories & Sort completely removed) */}
        <div className={`bg-[#0B1120] border border-[#1E293B] rounded-2xl p-2.5 sm:p-3 shadow-sm ${viewMode === 'stream' ? 'mx-3 sm:mx-0' : ''}`}>
          <div className="flex items-center gap-2 bg-[#050B18] border border-[#1E293B] rounded-xl px-3 py-2 text-sm focus-within:border-[#1877F2] transition-colors">
            <Search className="w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stories by caption, creator, or music..."
              className="bg-transparent text-white placeholder-[#64748B] text-sm focus:outline-none w-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[#64748B] hover:text-white p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Story Feed Content */}
        {mixedStories.length === 0 ? (
          <div className="bg-[#0B1120] border border-[#1E293B] rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#141E33] border border-[#1E293B] flex items-center justify-center text-[#38BDF8]">
              <Layers className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">No Stories Found</h3>
              <p className="text-sm text-[#94A3B8] max-w-sm">
                {searchQuery
                  ? `No stories matched "${searchQuery}". Try clearing search filters.`
                  : 'Be the first to post a story today for your community!'}
              </p>
            </div>
            {onCreateStory && (
              <button
                type="button"
                onClick={onCreateStory}
                className="px-5 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Story
              </button>
            )}
          </div>
        ) : viewMode === 'stream' ? (
          /* Stream Mode (Like Feeds.tsx) */
          <div className="w-full space-y-0">
            {mixedStories.map((story: any) => {
              if (story.is_sponsored) {
                const authorObj = story.author || story.user || {
                  id: story.user_id || 0,
                  name: story.author_name || 'Creator',
                  username: story.author_username || 'creator',
                  profile_image_url: story.author_image || '',
                  is_verified: Boolean(story.is_verified),
                };
                return (
                  <div key={story.feed_key || `story-feed-ad-${story.id}`} className="w-full bg-[#0F172A] border-b-[8px] border-[#050B18]">
                    <Post
                      post={story}
                      author={authorObj}
                      currentUser={currentUser}
                      users={users}
                      stories={stories}
                      onProfileClick={onProfileClick}
                      onReact={(p, type) => onReact?.(Number(story.id || story.story_id), type)}
                      onShare={(id, count) => onShare?.(story)}
                      onOpenComments={() => {
                        if (onOpenComments) {
                          onOpenComments(story);
                        } else if (onComment) {
                          onComment(Number(story.id || story.story_id));
                        }
                      }}
                      onViewImage={() => {}}
                      onVideoClick={() => {}}
                      isFollowing={checkIsFollowing ? checkIsFollowing(Number(authorObj.id)) : false}
                      onFollow={() => onFollow?.(Number(authorObj.id))}
                    />
                  </div>
                );
              }
              return (
                <StoryFeedCard
                  key={`story-feed-card-${story.id}`}
                  story={story}
                  currentUser={currentUser}
                  users={users}
                  activePlayingStoryId={activePlayingStoryId}
                  onPlayVideo={handlePlayVideo}
                  onPauseVideo={handlePauseVideo}
                  onViewStory={onViewStory}
                  onProfileClick={onProfileClick}
                  onReact={onReact}
                  onReply={onReply}
                  onComment={onComment}
                  onShare={onShare}
                  onDeleteStory={onDeleteStory}
                  onFollow={onFollow}
                  checkIsFollowing={checkIsFollowing}
                  followLoading={followLoading}
                  onLoginClick={onLoginClick}
                />
              );
            })}
          </div>
        ) : (
          /* Grid Mode */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 sm:gap-4">
            {mixedStories.map((story: any) => {
              if (story.is_sponsored) {
                return (
                  <SponsoredStoryGridCard
                    key={story.feed_key || `story-grid-ad-${story.id}`}
                    ad={story}
                    currentUser={currentUser}
                    onProfileClick={onProfileClick}
                    onOpenComments={onOpenComments}
                  />
                );
              }
              return (
                <StoryGridCard
                  key={`story-grid-card-${story.id}`}
                  story={story}
                  currentUser={currentUser}
                  users={users}
                  onViewStory={onViewStory}
                  onProfileClick={onProfileClick}
                  onReact={onReact}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SponsoredStoryGridCard: Grid card for sponsored stories in Story Feed Grid mode
 */
function SponsoredStoryGridCard({
  ad,
  currentUser,
  onProfileClick,
  onOpenComments,
}: {
  key?: React.Key;
  ad: any;
  currentUser: any;
  onProfileClick?: (id: number) => void;
  onOpenComments?: (post: any) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mediaUrl = ad.media_url || ad.mediaUrl || (Array.isArray(ad.media_urls) ? ad.media_urls[0] : null);
  const isVideo = ad.type === 'video' || ad.media_type === 'video' || Boolean(ad.video_url) || Boolean(mediaUrl && typeof mediaUrl === 'string' && mediaUrl.match(/\.(mp4|webm|mov|m4v|ogg)/i));
  const title = ad.headline || ad.title || ad.campaign_name || 'Sponsored';
  const advertiserName = ad.author_name || ad.name || 'Sponsored';
  const profileImage = ad.author_image || ad.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(advertiserName)}&background=1877F2&color=fff`;

  // Impression & view tracking via IntersectionObserver
  useEffect(() => {
    if (!ad?.ad_id && !ad?.id) return;
    const adId = Number(ad.ad_id || ad.id);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fetch("/api/ads/impression", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": String(currentUser?.id || 0),
            },
            body: JSON.stringify({ ad_id: adId, user_id: currentUser?.id || 0 }),
          }).catch(() => {});
          fetch("/api/ads/view", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": String(currentUser?.id || 0),
            },
            body: JSON.stringify({ ad_id: adId, user_id: currentUser?.id || 0 }),
          }).catch(() => {});
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [ad?.ad_id, ad?.id, currentUser?.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const adId = Number(ad.ad_id || ad.id);
    if (adId) {
      fetch("/api/ads/click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": String(currentUser?.id || 0),
        },
        body: JSON.stringify({ ad_id: adId, user_id: currentUser?.id || 0 }),
      }).catch(() => {});
    }

    const targetUrl = ad.destination_url || ad.cta_url || ad.link;
    if (targetUrl) {
      const dest = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
      window.open(dest, '_blank', 'noopener,noreferrer');
    } else if (ad.phone_number) {
      window.location.href = `tel:${ad.phone_number}`;
    } else if (ad.email_address) {
      window.location.href = `mailto:${ad.email_address}`;
    }
  };

  const ctaText = ad.cta_button || ad.cta_text || ad.cta || 'Learn More';

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="group relative rounded-2xl overflow-hidden bg-[#0F172A] border border-blue-500/40 aspect-[9/16] cursor-pointer shadow-lg hover:border-blue-400 hover:shadow-blue-500/20 transition-all flex flex-col justify-between p-3"
    >
      {/* Background Media */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
        {mediaUrl && isVideo ? (
          <video
            src={mediaUrl}
            className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300"
            muted
            playsInline
            loop
            autoPlay
          />
        ) : mediaUrl ? (
          <img
            src={mediaUrl}
            alt={title}
            className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-900/60 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
            <span className="text-white/80 font-bold text-sm text-center">{title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90 pointer-events-none" />
      </div>

      {/* Top Badges */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1877F2] text-white shadow-sm uppercase tracking-wider">
          Sponsored
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-black/60 text-white/80 font-medium">
          Ad
        </span>
      </div>

      {/* Bottom Advertiser and CTA */}
      <div className="relative z-10 space-y-2">
        <div className="flex items-center gap-2">
          <img
            src={profileImage}
            alt={advertiserName}
            className="w-7 h-7 rounded-full object-cover border border-[#1877F2]"
            onClick={(e) => {
              e.stopPropagation();
              onProfileClick?.(ad.user_id || ad.advertiser_id || 0);
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-bold truncate drop-shadow-sm">{advertiserName}</p>
            <p className="text-white/70 text-[10px] truncate">{title}</p>
          </div>
        </div>

        <button
          onClick={handleClick}
          className="w-full py-1.5 px-3 bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold rounded-lg shadow flex items-center justify-center gap-1 transition-colors"
        >
          <span>{ctaText}</span>
          <i className="fas fa-chevron-right text-[9px] opacity-75"></i>
        </button>
      </div>
    </div>
  );
}

/**
 * StoryFeedCard: High-fidelity feed-style card component designed like Feeds.tsx
 * Supports:
 * - Text stories (rich gradient backgrounds, custom quotes, typography)
 * - Image stories (high resolution, full frame, zoom)
 * - Video stories (interactive HTML5 player with play/pause, mute, timeline)
 * - Full Feeds-like interaction bar (reactions, discussions, shares, quick replies)
 */
interface StoryFeedCardProps {
  key?: React.Key;
  story: Story;
  currentUser: User | null;
  users?: User[];
  activePlayingStoryId?: number | null;
  onPlayVideo?: (storyId: number) => void;
  onPauseVideo?: (storyId: number) => void;
  onViewStory?: (storyId: number) => void;
  onProfileClick?: (id: number) => void;
  onReact?: (storyId: number, type: string) => void | Promise<void>;
  onReply?: (storyId: number, text: string) => void | Promise<void>;
  onComment?: (storyId: number) => void;
  onShare?: (story: any) => void;
  onDeleteStory?: (storyId: number) => void | Promise<void>;
  onFollow?: (id: number) => void;
  checkIsFollowing?: (id: number) => boolean;
  followLoading?: boolean | Record<number, boolean>;
  onLoginClick?: () => void;
}

function StoryFeedCard({
  story,
  currentUser,
  users = [],
  activePlayingStoryId,
  onPlayVideo,
  onPauseVideo,
  onViewStory,
  onProfileClick,
  onReact,
  onReply,
  onComment,
  onShare,
  onDeleteStory,
  onFollow,
  checkIsFollowing,
  followLoading,
  onLoginClick,
}: StoryFeedCardProps) {
  const authorId = Number(story.user_id || story.user?.id || 0);
  const matchedUser = users.find((u) => Number(u.id) === authorId);

  const authorName =
    story.author_name || story.user?.name || matchedUser?.name || 'Creator';
  const authorUsername =
    story.author_username ||
    story.username ||
    story.user?.username ||
    matchedUser?.username ||
    'creator';
  const authorImage =
    story.author_image ||
    story.user?.profile_image_url ||
    matchedUser?.profile_image_url ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
  const isVerified =
    story.user?.is_verified ||
    matchedUser?.is_verified ||
    (matchedUser as any)?.verified ||
    false;

  const isAuthor = currentUser && Number(currentUser.id) === authorId;
  const isFollowing = checkIsFollowing ? checkIsFollowing(authorId) : false;
  const isFollowPending =
    typeof followLoading === 'object' && followLoading !== null
      ? Boolean((followLoading as Record<number, boolean>)[authorId])
      : Boolean(followLoading);

  // Media determination
  const storyType = story.type || 'text';
  const isVideo = storyType === 'video' || !!(story.media_url && story.media_url.endsWith('.mp4'));
  const isImage = storyType === 'image';
  const isText = storyType === 'text';

  // Video and card refs
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);

  // Ensure only ONE video plays at any time:
  // When another video becomes active, pause this one immediately
  useEffect(() => {
    if (activePlayingStoryId !== story.id && isPlaying) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    }
  }, [activePlayingStoryId, story.id, isPlaying]);

  // Pause video automatically when user scrolls past or away from this post
  useEffect(() => {
    if (!isVideo) return;
    const cardEl = cardRef.current;
    if (!cardEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        // If card scrolls out or is less than 50% visible, pause playback
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
            setIsPlaying(false);
            onPauseVideo?.(story.id);
          }
        }
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    observer.observe(cardEl);
    return () => {
      observer.disconnect();
    };
  }, [isVideo, story.id, onPauseVideo]);

  // Pause video if tab becomes hidden or on unmount
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
        onPauseVideo?.(story.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };
  }, [story.id, onPauseVideo]);

  // Reaction state
  const [currentReaction, setCurrentReaction] = useState<string | null>(
    story.my_reaction || (story.liked_by_me ? 'like' : null)
  );
  const [reactionCount, setReactionCount] = useState<number>(
    story.reactions_count || story.reactions?.length || 0
  );

  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showReactionsSheet, setShowReactionsSheet] = useState(false);

  const storyId = Number(story?.id || 0);
  const normalizedStoryPost = useMemo(() => {
    return {
      ...story,
      id: storyId,
      story_id: storyId,
      item_type: 'story',
      type: 'story',
      post_type: 'story',
      author: authorName,
      author_name: authorName,
      author_image: authorImage,
      user: story?.user || {
        id: authorId,
        name: authorName,
        username: authorUsername,
        profile_image_url: authorImage,
      },
    };
  }, [story, storyId, authorId, authorName, authorImage, authorUsername]);

  const [commentsCount, setCommentsCount] = useState<number>(() => {
    const cached = getStoryCommentsCache(storyId);
    if (cached) return cached.length;
    return Number((story as any).comments_count ?? (story as any).comments?.length ?? (story as any).discussions_count ?? 0);
  });

  useEffect(() => {
    const initial = Number((story as any).comments_count ?? (story as any).comments?.length ?? (story as any).discussions_count ?? 0);
    setCommentsCount(initial);

    if (!storyId) return;
    const cached = getStoryCommentsCache(storyId);
    if (cached) {
      setCommentsCount(cached.length);
    }
    const viewerParam = currentUser?.id ? `?viewerId=${currentUser.id}` : '';
    apiFetch(`/api/stories/${storyId}/comments${viewerParam}`, {
      headers: currentUser?.id ? { 'x-user-id': String(currentUser.id) } : undefined,
    }).then((data: any) => {
      const list = Array.isArray(data?.comments) ? data.comments : (Array.isArray(data) ? data : []);
      const count = typeof data?.count === 'number' ? data.count : list.length;
      setCommentsCount(count);
      setStoryCommentsCache(storyId, list);
    }).catch(() => {});
  }, [storyId, (story as any).comments_count, (story as any).comments?.length, (story as any).discussions_count, currentUser?.id]);

  // Dropdown options
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Best media URL
  const mediaUrl =
    story.media_url ||
    (story.media_urls && story.media_urls[0]) ||
    story.mediaUrl ||
    '';

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      onPauseVideo?.(story.id);
    } else {
      // Coordinate single-video playback: notify parent to pause others
      onPlayVideo?.(story.id);
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Video play prevented or failed:', err);
        });
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0) {
      setVideoProgress((currentTime / duration) * 100);
    }
  };

  const handleReactClick = async (type: ReactionType) => {
    if (!currentUser) {
      if (onLoginClick) onLoginClick();
      return;
    }
    const isSameReaction = currentReaction === type;
    const newReaction = isSameReaction ? null : type;
    const newCount = isSameReaction
      ? Math.max(0, reactionCount - 1)
      : currentReaction
      ? reactionCount
      : reactionCount + 1;

    setCurrentReaction(newReaction);
    setReactionCount(newCount);

    if (onReact) {
      await onReact(story.id, type);
    }

    try {
      await fetch(`/api/stories/${story.id}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          type: type,
        }),
      });
    } catch (err) {
      console.error('Failed to react to story:', err);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteStory) return;
    if (window.confirm('Are you sure you want to delete this story?')) {
      setIsDeleting(true);
      try {
        await onDeleteStory(story.id);
      } catch (err) {
        console.error('Delete failed:', err);
      } finally {
        setIsDeleting(false);
        setShowMenu(false);
      }
    }
  };

  return (
    <article
      ref={cardRef}
      id={`story-card-${story.id}`}
      className="w-full relative bg-[#0F172A] border-b-[8px] border-[#050B18] overflow-hidden shadow-xl transition-all"
    >
      {/* Top Header Row (Author & Context) */}
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 border-b border-[#1E293B]/60">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onProfileClick?.(authorId)}
            className="relative flex-shrink-0 group cursor-pointer"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full p-[2px] bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400">
              <img
                src={authorImage}
                alt={authorName}
                className="w-full h-full rounded-full object-cover border-2 border-[#0F172A]"
              />
            </div>
          </button>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onProfileClick?.(authorId)}
                className="text-[#F8FAFC] font-bold text-[21px] hover:text-[#38BDF8] transition-colors truncate text-left inline-flex items-center gap-1.5"
              >
                <span>{authorName}</span>
                {isVerified && <VerifiedBadge size={21} className="shrink-0" />}
              </button>
              <span className="text-[14px] text-[#64748B] hidden xs:inline">
                @{authorUsername}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#94A3B8] mt-0.5">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#64748B]" />
                {formatTimeAgo(story.created_at || (story as any).createdAt)}
              </span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded-md bg-[#1E293B] text-[10px] font-bold text-[#38BDF8] uppercase tracking-wider">
                {isVideo ? '🎬 Video Story' : isImage ? '📷 Photo Story' : '✍️ Text Story'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!isAuthor && currentUser && onFollow && (
            <button
              type="button"
              onClick={() => onFollow(authorId)}
              disabled={isFollowPending}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                isFollowing
                  ? 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] hover:text-white'
                  : 'bg-[#1877F2] text-white hover:bg-[#166FE5] shadow-sm'
              }`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Follow</span>
                </>
              )}
            </button>
          )}

          {/* Options Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Story options"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-10 w-48 bg-[#0B1120] border border-[#1E293B] rounded-xl shadow-2xl p-1.5 z-50 animate-fade-in text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onViewStory?.(story.id);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-white hover:bg-[#1E293B] flex items-center gap-2"
                >
                  <Maximize2 className="w-4 h-4 text-[#38BDF8]" />
                  Watch in Story Viewer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onShare?.(story);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-white hover:bg-[#1E293B] flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  Share Story
                </button>
                {isAuthor && onDeleteStory && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 border-t border-[#1E293B] mt-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? 'Deleting...' : 'Delete Story'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Music Banner (if story has audio) */}
      {(story.music_title || story.musicTitle || story.music_url) && (
        <div className="px-4 py-2 bg-gradient-to-r from-indigo-950/40 via-[#0B1120] to-blue-950/40 border-b border-[#1E293B]/40 flex items-center justify-between text-xs text-[#38BDF8]">
          <div className="flex items-center gap-2 truncate">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-[#38BDF8] flex items-center justify-center animate-spin" style={{ animationDuration: '4s' }}>
              <Music className="w-3 h-3" />
            </div>
            <span className="font-semibold truncate">
              {story.music_title || story.musicTitle || 'Original Audio'}
            </span>
          </div>
          <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider">
            Audio Track
          </span>
        </div>
      )}

      {/* Media Canvas Body */}
      <div className="relative w-full bg-[#050B18] overflow-hidden flex items-center justify-center select-none">
        {/* 1. TEXT STORY */}
        {isText && (
          <div
            onClick={() => onViewStory?.(story.id)}
            className="w-full min-h-[360px] sm:min-h-[440px] flex flex-col items-center justify-center p-8 sm:p-12 text-center cursor-pointer transition-transform relative group"
            style={{
              background:
                story.background_style ||
                story.backgroundStyle ||
                'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #0f172a 100%)',
            }}
          >
            {/* Subtle background particles / overlay */}
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />

            <div className="relative z-10 max-w-lg mx-auto">
              <span className="text-3xl sm:text-4xl text-white/40 block mb-2 font-serif">
                “
              </span>
              <p className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] whitespace-pre-wrap">
                {story.text_content || story.text || 'My Story'}
              </p>
              <span className="text-3xl sm:text-4xl text-white/40 block mt-2 font-serif">
                ”
              </span>
            </div>

            <div className="absolute bottom-4 right-4 z-10 opacity-80 group-hover:opacity-100 transition-opacity">
              <span className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10">
                <Maximize2 className="w-3 h-3" />
                Tap to view
              </span>
            </div>
          </div>
        )}

        {/* 2. IMAGE STORY */}
        {isImage && mediaUrl && (
          <div
            onClick={() => onViewStory?.(story.id)}
            className="w-full relative min-h-[380px] sm:min-h-[480px] max-h-[640px] bg-black flex items-center justify-center cursor-pointer group"
          >
            <img
              src={mediaUrl}
              alt="Story"
              className="w-full h-full max-h-[640px] object-contain group-hover:scale-[1.01] transition-transform duration-300"
              loading="lazy"
            />

            {/* Optional text caption overlay */}
            {(story.text_content || story.text) && (
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white text-sm sm:text-base font-medium">
                <p className="line-clamp-3 drop-shadow-md">
                  {story.text_content || story.text}
                </p>
              </div>
            )}

            <div className="absolute top-4 right-4 opacity-80 group-hover:opacity-100 transition-opacity">
              <span className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 border border-white/20">
                <Maximize2 className="w-3 h-3" />
                Full Viewer
              </span>
            </div>
          </div>
        )}

        {/* 3. VIDEO STORY */}
        {isVideo && mediaUrl && (
          <div className="w-full relative min-h-[380px] sm:min-h-[480px] max-h-[640px] bg-black flex items-center justify-center group">
            <video
              ref={videoRef}
              src={mediaUrl}
              className="w-full h-full max-h-[640px] object-contain"
              playsInline
              loop
              muted={isMuted}
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={() => {
                onPlayVideo?.(story.id);
                setIsPlaying(true);
              }}
              onPause={() => {
                setIsPlaying(false);
              }}
              onEnded={() => {
                setIsPlaying(false);
                onPauseVideo?.(story.id);
              }}
              onClick={handleTogglePlay}
            />

            {/* Play/Pause Center Overlay (when paused) */}
            {!isPlaying && (
              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label="Play video"
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#1877F2]/90 hover:bg-[#1877F2] text-white flex items-center justify-center shadow-2xl backdrop-blur-sm transition-transform hover:scale-110 z-10"
              >
                <Play className="w-8 h-8 fill-white translate-x-0.5" />
              </button>
            )}

            {/* Video Controls Bar */}
            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-center justify-between gap-3 z-10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Video Progress Bar */}
              <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden mx-2">
                <div
                  className="h-full bg-[#1877F2] transition-all duration-100"
                  style={{ width: `${videoProgress}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => onViewStory?.(story.id)}
                className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Fullscreen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Social Feedback Bar (Reactions & Discussions Counts - Instagram/Feeds style) */}
      <div className="px-3.5 md:px-4 py-2 flex items-center justify-between text-[#94A3B8] text-[14px] border-t border-[#1E293B]">
        <div className="flex items-center gap-2">
          {reactionCount > 0 ? (
            <div
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
              onClick={() => setShowReactionsSheet(true)}
              title="View reactions"
            >
              <div className="flex -space-x-1.5">
                <span className="w-5 h-5 rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[11px]">
                  {currentReaction && REACTION_ICONS[currentReaction]
                    ? REACTION_ICONS[currentReaction].emoji
                    : '❤️'}
                </span>
                <span className="w-5 h-5 rounded-full bg-[#1E293B] border border-[#0B1120] flex items-center justify-center text-[11px]">
                  🔥
                </span>
              </div>
              <span className="text-[13px] text-[#F8FAFC] font-semibold">
                {reactionCount}
              </span>
            </div>
          ) : (
            <span className="text-xs text-[#64748B]">Be the first to react</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="hover:underline cursor-pointer text-[#CBD5E1] hover:text-[#F8FAFC] text-[15px] md:text-[16px] font-semibold transition-colors"
            onClick={() => onComment?.(story.id)}
          >
            {commentsCount} {commentsCount === 1 ? 'Discussion' : 'Discussions'}
          </button>
        </div>
      </div>

      {/* Main Action Buttons: ReactionButton from Feeds, Comment, Share, View Story */}
      <div className="px-3.5 py-2 border-t border-white/10 flex items-center justify-between bg-[#0B1120]/60">
        <div className="flex items-center gap-4">
          <ReactionButton
            currentUserReactions={(currentReaction as ReactionType) || undefined}
            reactionCount={reactionCount}
            onReact={handleReactClick}
            isGuest={!currentUser}
          />
          <button
            type="button"
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-colors focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onComment?.(story.id);
            }}
            aria-label="Discuss & Comments"
            title="Discuss"
          >
            <i className="far fa-comment text-[22px]"></i>
            {commentsCount > 0 && (
              <span className="text-[14px] font-semibold text-[#F8FAFC]">
                {commentsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[#F8FAFC] hover:text-[#38BDF8] transition-transform active:scale-110 focus:outline-none p-1 rounded-lg hover:bg-[#1E293B]/60 cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!currentUser) {
                if (onLoginClick) onLoginClick();
                return;
              }
              if (onShare) {
                onShare(normalizedStoryPost);
              } else {
                setShowShareSheet(true);
              }
            }}
            aria-label="Share story"
            title="Share"
          >
            <i className="far fa-paper-plane text-[21px]"></i>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onViewStory?.(story.id)}
          className="px-3.5 py-1.5 rounded-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>View Story</span>
        </button>
      </div>

      {/* Share Bottom Sheet for Story (Opens exactly as other posts in Feeds.tsx) */}
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        post={normalizedStoryPost}
        currentUser={currentUser}
        users={users}
        onShareComplete={() => setShowShareSheet(false)}
      />

      {/* Reactions Sheet for Story */}
      <ReactionsSheet
        isOpen={showReactionsSheet}
        onClose={() => setShowReactionsSheet(false)}
        post={normalizedStoryPost}
        onProfileClick={onProfileClick || (() => {})}
        onOpenComments={() => onComment?.(story.id)}
        currentUser={currentUser}
      />
    </article>
  );
}

/**
 * StoryGridCard: Compact bento card for Grid View
 */
interface StoryGridCardProps {
  key?: React.Key;
  story: Story;
  currentUser: User | null;
  users?: User[];
  onViewStory?: (storyId: number) => void;
  onProfileClick?: (id: number) => void;
  onReact?: (storyId: number, type: string) => void | Promise<void>;
}

function StoryGridCard({
  story,
  users = [],
  onViewStory,
  onProfileClick,
}: StoryGridCardProps) {
  const authorId = Number(story.user_id || story.user?.id || 0);
  const matchedUser = users.find((u) => Number(u.id) === authorId);

  const authorName =
    story.author_name || story.user?.name || matchedUser?.name || 'Creator';
  const authorImage =
    story.author_image ||
    story.user?.profile_image_url ||
    matchedUser?.profile_image_url ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

  const storyType = story.type || 'text';
  const isVideo = storyType === 'video' || !!(story.media_url && story.media_url.endsWith('.mp4'));
  const isImage = storyType === 'image';
  const isText = storyType === 'text';

  const mediaUrl =
    story.media_url ||
    (story.media_urls && story.media_urls[0]) ||
    story.mediaUrl ||
    '';

  return (
    <div
      onClick={() => onViewStory?.(story.id)}
      className="group relative rounded-2xl overflow-hidden bg-[#0F172A] border border-[#1E293B] aspect-[9/16] cursor-pointer shadow-lg hover:border-[#1877F2]/60 hover:shadow-blue-500/10 transition-all flex flex-col justify-between p-3"
    >
      {/* Background Media */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-black">
        {isText ? (
          <div
            className="w-full h-full flex items-center justify-center p-4 text-center"
            style={{
              background:
                story.background_style ||
                story.backgroundStyle ||
                'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #0f172a 100%)',
            }}
          >
            <p className="text-white font-bold text-sm sm:text-base line-clamp-6 drop-shadow-md">
              {story.text_content || story.text}
            </p>
          </div>
        ) : isVideo ? (
          <div className="relative w-full h-full bg-black flex items-center justify-center">
            <video
              src={mediaUrl}
              className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300"
              muted
              playsInline
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="w-10 h-10 rounded-full bg-[#1877F2]/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 fill-white translate-x-0.5" />
              </div>
            </div>
          </div>
        ) : (
          <img
            src={mediaUrl}
            alt="Story"
            className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 pointer-events-none" />
      </div>

      {/* Top Badges */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/10">
          {isVideo ? '🎬 Video' : isImage ? '📷 Photo' : '✍️ Text'}
        </span>

        <span className="text-[10px] text-white/80 font-medium">
          {formatTimeAgo(story.created_at || (story as any).createdAt)}
        </span>
      </div>

      {/* Bottom Creator Info */}
      <div className="relative z-10 flex items-center gap-2">
        <div
          onClick={(e) => {
            e.stopPropagation();
            onProfileClick?.(authorId);
          }}
          className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-tr from-blue-500 to-cyan-400 flex-shrink-0"
        >
          <img
            src={authorImage}
            alt={authorName}
            className="w-full h-full rounded-full object-cover border border-black"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-white text-[15px] font-bold truncate drop-shadow-sm">
            {authorName}
          </span>
          <span className="text-[10px] text-white/70 truncate">
            {story.reactions_count || 0} reactions
            {Number((story as any).comments_count || (story as any).discussions_count || 0) > 0 &&
              ` · ${Number((story as any).comments_count || (story as any).discussions_count || 0)} discussions`}
          </span>
        </div>
      </div>
    </div>
  );
}
