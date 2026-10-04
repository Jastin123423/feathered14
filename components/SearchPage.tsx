import React, { useState, useEffect, useMemo, useRef } from 'react';
import { avatarFrom, safeUserId, formatRelativeTime } from './Feed';
import { apiFetch } from '../utils/api';
import { VerifiedBadge } from './VerifiedBadge';

export interface RecentSearchItem {
  id: string;
  query: string;
  type: 'query' | 'user' | 'group' | 'reel';
  targetId?: number | string;
  title?: string;
  subtitle?: string;
  avatar?: string;
  timestamp: number;
}

interface SearchPageProps {
  onBack: () => void;
  users?: any[];
  posts?: any[];
  reels?: any[];
  groups?: any[];
  marketplaceItems?: any[];
  currentUser: any;
  onProfileClick: (userId: number) => void;
  onOpenGroup?: (groupId: number) => void;
  onFollow?: (userId: number) => void;
  followingIds?: Set<number> | number[];
  onVideoClick?: (reel: any) => void;
  onPostClick?: (post: any) => void;
  onViewProduct?: (productId: any) => void;
}

const STORAGE_KEY = 'unera_recent_searches_cache';

export const SearchPage: React.FC<SearchPageProps> = ({
  onBack,
  users = [],
  posts = [],
  reels = [],
  groups = [],
  marketplaceItems = [],
  currentUser,
  onProfileClick,
  onOpenGroup,
  onFollow,
  followingIds,
  onVideoClick,
  onPostClick,
  onViewProduct,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'people' | 'videos' | 'posts' | 'groups' | 'marketplace'>('all');
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);

  // Load cached recent searches on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached searches:', e);
    }
  }, []);

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearches = (items: RecentSearchItem[]) => {
    setRecentSearches(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save recent searches:', e);
    }
  };

  // Add query to recent searches
  const recordSearch = (
    searchQuery: string,
    type: 'query' | 'user' | 'group' | 'reel' = 'query',
    extra?: Partial<RecentSearchItem>
  ) => {
    const q = searchQuery.trim();
    if (!q) return;

    const newItem: RecentSearchItem = {
      id: `${type}-${extra?.targetId || q.toLowerCase()}-${Date.now()}`,
      query: q,
      type,
      timestamp: Date.now(),
      ...extra,
    };

    // Deduplicate existing matches
    const filtered = recentSearches.filter(
      (item) =>
        !(item.query.toLowerCase() === q.toLowerCase() && item.type === type) &&
        !(item.targetId && item.targetId === extra?.targetId)
    );

    const updated = [newItem, ...filtered].slice(0, 20);
    saveRecentSearches(updated);
  };

  // Remove single search item
  const removeRecentSearch = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = recentSearches.filter((item) => item.id !== id);
    saveRecentSearches(updated);
  };

  // Clear all recent searches
  const clearAllRecent = () => {
    saveRecentSearches([]);
  };

  // User follow set
  const followSet = useMemo(() => {
    if (followingIds instanceof Set) return followingIds;
    if (Array.isArray(followingIds)) return new Set(followingIds);
    return new Set<number>();
  }, [followingIds]);

  // Filtered results
  const trimmedQuery = query.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!trimmedQuery) return [];
    return users.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const username = String(u.username || '').toLowerCase();
      const bio = String(u.bio || '').toLowerCase();
      return name.includes(trimmedQuery) || username.includes(trimmedQuery) || bio.includes(trimmedQuery);
    });
  }, [users, trimmedQuery]);

  const filteredReels = useMemo(() => {
    if (!trimmedQuery) return [];
    return reels.filter((r) => {
      const cap = String(r.caption || r.content || '').toLowerCase();
      const song = String(r.song_name || '').toLowerCase();
      const author = String(r.user?.name || r.name || '').toLowerCase();
      return cap.includes(trimmedQuery) || song.includes(trimmedQuery) || author.includes(trimmedQuery);
    });
  }, [reels, trimmedQuery]);

  const filteredPosts = useMemo(() => {
    if (!trimmedQuery) return [];
    return posts.filter((p) => {
      const text = String(p.content || '').toLowerCase();
      const author = String(p.author?.name || p.user?.name || '').toLowerCase();
      return text.includes(trimmedQuery) || author.includes(trimmedQuery);
    });
  }, [posts, trimmedQuery]);

  const filteredGroups = useMemo(() => {
    if (!trimmedQuery) return [];
    return groups.filter((g) => {
      const name = String(g.name || '').toLowerCase();
      const desc = String(g.description || '').toLowerCase();
      return name.includes(trimmedQuery) || desc.includes(trimmedQuery);
    });
  }, [groups, trimmedQuery]);

  const filteredProducts = useMemo(() => {
    if (!trimmedQuery) return [];
    return marketplaceItems.filter((p) => {
      const title = String(p.title || p.name || '').toLowerCase();
      const desc = String(p.description || '').toLowerCase();
      return title.includes(trimmedQuery) || desc.includes(trimmedQuery);
    });
  }, [marketplaceItems, trimmedQuery]);

  const totalResults =
    filteredUsers.length +
    filteredReels.length +
    filteredPosts.length +
    filteredGroups.length +
    filteredProducts.length;

  const handleSelectUser = (user: any) => {
    recordSearch(user.name || user.username || 'User', 'user', {
      targetId: user.id,
      title: user.name || user.username,
      subtitle: `@${user.username || user.name?.toLowerCase().replace(/\s+/g, '_')}`,
      avatar: avatarFrom(user),
    });
    onProfileClick(safeUserId(user));
  };

  const handleSelectGroup = (group: any) => {
    recordSearch(group.name, 'group', {
      targetId: group.id,
      title: group.name,
      subtitle: `${group.members_count || group.member_count || 1} members`,
      avatar: group.avatar_url || group.image_url,
    });
    onOpenGroup?.(group.id);
  };

  const handleSelectReel = (reel: any) => {
    recordSearch(reel.caption || 'Video Reel', 'reel', {
      targetId: reel.id,
      title: reel.caption || 'Video Reel',
      subtitle: reel.user?.name || 'Reels',
    });
    onVideoClick?.(reel);
  };

  const handleRecentClick = (item: RecentSearchItem) => {
    if (item.type === 'user' && item.targetId) {
      onProfileClick(Number(item.targetId));
    } else if (item.type === 'group' && item.targetId) {
      onOpenGroup?.(Number(item.targetId));
    } else if (item.type === 'reel' && item.targetId) {
      const foundReel = reels.find((r) => r.id === Number(item.targetId));
      if (foundReel) onVideoClick?.(foundReel);
    } else {
      setQuery(item.query);
    }
  };

  return (
    <div className="min-h-screen bg-[#050B18] text-[#F8FAFC] flex flex-col font-sans">
      {/* 1. TOP HEADER & SEARCH INPUT */}
      <div className="sticky top-0 z-40 bg-[#0B1120] border-b border-[#1E293B] px-3 sm:px-4 py-2.5 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-3">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-[16px]"></i>
          </button>

          {/* Search Input Box */}
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] text-sm pointer-events-none"></i>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  recordSearch(query.trim());
                }
              }}
              placeholder="Search people, videos, reels, groups, posts…"
              className="w-full bg-[#0F172A] border border-[#1E293B] focus:border-[#1877F2] rounded-xl py-2 pl-10 pr-10 text-sm text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors text-xs"
                aria-label="Clear search"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
        </div>

        {/* 2. FILTER TABS (When searching) */}
        {query.trim() && (
          <div className="max-w-3xl mx-auto flex items-center gap-2 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
              }`}
            >
              All ({totalResults})
            </button>
            <button
              onClick={() => setActiveTab('people')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'people'
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
              }`}
            >
              People ({filteredUsers.length})
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'videos'
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
              }`}
            >
              Videos & Reels ({filteredReels.length})
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'posts'
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
              }`}
            >
              Posts ({filteredPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'groups'
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
              }`}
            >
              Groups ({filteredGroups.length})
            </button>
          </div>
        )}
      </div>

      {/* 3. MAIN CONTENT BODY */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-3 sm:p-4">
        {/* ======================================================== */}
        {/* STATE A: EMPTY QUERY -> SHOW RECENT SEARCHES (CACHED)   */}
        {/* ======================================================== */}
        {!query.trim() && (
          <div>
            {/* Header: Recent Searches + Clear all */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[15px] font-bold text-[#F8FAFC] flex items-center gap-2">
                <i className="fas fa-history text-[#1877F2]"></i>
                <span>Recent Searches</span>
              </span>
              {recentSearches.length > 0 && (
                <button
                  onClick={clearAllRecent}
                  className="text-xs font-semibold text-[#1877F2] hover:text-[#38BDF8] transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* List of Recent Searches */}
            {recentSearches.length > 0 ? (
              <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] divide-y divide-[#1E293B]/60 overflow-hidden shadow-sm">
                {recentSearches.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleRecentClick(item)}
                    className="flex items-center justify-between p-3 sm:px-4 hover:bg-[#1E293B]/60 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.avatar ? (
                        <img
                          src={item.avatar}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover border border-[#1E293B]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#1E293B] flex items-center justify-center text-[#94A3B8] group-hover:text-[#F8FAFC] transition-colors">
                          <i
                            className={`fas fa-${
                              item.type === 'user'
                                ? 'user'
                                : item.type === 'group'
                                ? 'users'
                                : item.type === 'reel'
                                ? 'play'
                                : 'clock'
                            } text-sm`}
                          ></i>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-semibold text-[#F8FAFC] truncate">
                          {item.title || item.query}
                        </div>
                        <div className="text-xs text-[#64748B] truncate">
                          {item.subtitle || 'Recent search'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => removeRecentSearch(item.id, e)}
                      className="w-8 h-8 rounded-full hover:bg-[#334155] text-[#64748B] hover:text-[#F8FAFC] flex items-center justify-center transition-colors ml-2"
                      aria-label="Remove search"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-[#0F172A]/50 rounded-2xl border border-[#1E293B] p-6">
                <div className="w-12 h-12 rounded-full bg-[#1E293B] text-[#94A3B8] flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-search text-lg"></i>
                </div>
                <h4 className="text-[15px] font-bold text-[#F8FAFC] mb-1">Search for anything</h4>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                  Find your friends, trending reels, exciting groups, and community posts across UNERA.
                </p>
              </div>
            )}

            {/* Suggested / Popular searches */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-3 px-1">
                Suggested Topics
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  '🔥 Trending Reels',
                  '📸 Photography',
                  '🎵 Music & Sounds',
                  '🚀 Technology',
                  '🎨 Art & Design',
                  '⚽ Sports',
                  '🍕 Food & Cooking',
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      const clean = tag.replace(/^[^\w]+/, '').trim();
                      setQuery(clean);
                      recordSearch(clean);
                    }}
                    className="bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-[#CBD5E1] hover:text-white px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STATE B: QUERY ENTERED -> DISPLAY SEARCH RESULTS        */}
        {/* ======================================================== */}
        {query.trim() && (
          <div className="space-y-4">
            {totalResults === 0 ? (
              <div className="text-center py-12 bg-[#0F172A] rounded-2xl border border-[#1E293B] p-6">
                <i className="fas fa-search text-3xl text-[#475569] mb-3"></i>
                <h4 className="text-base font-bold text-[#F8FAFC]">No results found for "{query}"</h4>
                <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                  Check your spelling or try searching for another name, topic, or keyword.
                </p>
              </div>
            ) : null}

            {/* 1. PEOPLE RESULTS */}
            {(activeTab === 'all' || activeTab === 'people') && filteredUsers.length > 0 && (
              <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0B1120] border-b border-[#1E293B] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                  <span>People</span>
                  <span className="text-[11px] font-normal">{filteredUsers.length} found</span>
                </div>
                <div className="divide-y divide-[#1E293B]/60">
                  {filteredUsers.slice(0, activeTab === 'people' ? 50 : 5).map((user) => {
                    const uid = safeUserId(user);
                    const isFollowed = followSet.has(uid);

                    return (
                      <div
                        key={uid}
                        onClick={() => handleSelectUser(user)}
                        className="flex items-center justify-between p-3.5 hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={avatarFrom(user)}
                            alt=""
                            className="w-11 h-11 rounded-full object-cover border border-[#1E293B]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[15px] font-bold text-[#F8FAFC] truncate hover:underline">
                                {user.name}
                              </span>
                              {user.is_verified && (
                                <VerifiedBadge size={17} className="shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-[#64748B] truncate">
                              @{user.username || user.name?.toLowerCase().replace(/\s+/g, '_')}
                            </div>
                          </div>
                        </div>

                        {currentUser && currentUser.id !== uid && onFollow && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onFollow(uid);
                            }}
                            className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ml-2 ${
                              isFollowed
                                ? 'bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]'
                                : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                            }`}
                          >
                            {isFollowed ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. VIDEOS & REELS RESULTS */}
            {(activeTab === 'all' || activeTab === 'videos') && filteredReels.length > 0 && (
              <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0B1120] border-b border-[#1E293B] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                  <span>Videos & Reels</span>
                  <span className="text-[11px] font-normal">{filteredReels.length} found</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3">
                  {filteredReels.slice(0, activeTab === 'videos' ? 30 : 6).map((reel) => (
                    <div
                      key={reel.id}
                      onClick={() => handleSelectReel(reel)}
                      className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black cursor-pointer group shadow-sm"
                    >
                      {reel.thumbnail_url || reel.thumbnail ? (
                        <img
                          src={reel.thumbnail_url || reel.thumbnail}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <video
                          src={reel.video_url || reel.video}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />
                      
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white text-[10px]">
                        <i className="fas fa-play"></i>
                      </div>

                      <div className="absolute bottom-2 left-2 right-2 text-white">
                        <p className="text-xs font-medium line-clamp-2 leading-tight">
                          {reel.caption || 'Video Reel'}
                        </p>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-[#94A3B8]">
                          <span>{reel.user?.name || 'Creator'}</span>
                          <span className="flex items-center gap-1">
                            <i className="fas fa-eye text-[9px]"></i>
                            {reel.views || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. GROUPS RESULTS */}
            {(activeTab === 'all' || activeTab === 'groups') && filteredGroups.length > 0 && (
              <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0B1120] border-b border-[#1E293B] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                  <span>Groups</span>
                  <span className="text-[11px] font-normal">{filteredGroups.length} found</span>
                </div>
                <div className="divide-y divide-[#1E293B]/60">
                  {filteredGroups.map((group) => (
                    <div
                      key={group.id}
                      onClick={() => handleSelectGroup(group)}
                      className="flex items-center justify-between p-3.5 hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={group.avatar_url || group.image_url || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=120'}
                          alt=""
                          className="w-11 h-11 rounded-xl object-cover border border-[#1E293B]"
                        />
                        <div className="min-w-0">
                          <h4 className="text-[14.5px] font-bold text-[#F8FAFC] truncate">
                            {group.name}
                          </h4>
                          <div className="text-xs text-[#64748B]">
                            {group.members_count || 1} members • {group.privacy || 'Public'} Group
                          </div>
                        </div>
                      </div>
                      <button className="bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ml-2">
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. POSTS RESULTS */}
            {(activeTab === 'all' || activeTab === 'posts') && filteredPosts.length > 0 && (
              <div className="bg-[#0F172A] rounded-2xl border border-[#1E293B] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0B1120] border-b border-[#1E293B] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                  <span>Posts</span>
                  <span className="text-[11px] font-normal">{filteredPosts.length} found</span>
                </div>
                <div className="divide-y divide-[#1E293B]/60">
                  {filteredPosts.slice(0, activeTab === 'posts' ? 30 : 5).map((post) => (
                    <div
                      key={post.id}
                      onClick={() => {
                        recordSearch(post.content?.slice(0, 40) || 'Post', 'query');
                        onPostClick?.(post);
                      }}
                      className="p-3.5 hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <img
                          src={avatarFrom(post.author || post.user)}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover"
                        />
                        <span className="text-xs font-bold text-[#F8FAFC]">
                          {post.author?.name || post.user?.name || 'User'}
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          {formatRelativeTime(post.created_at || post.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-[#CBD5E1] line-clamp-2">
                        {post.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
