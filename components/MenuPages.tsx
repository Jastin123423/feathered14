//
import React, { useState, useEffect, useMemo } from 'react';
import { User, Event, Group, Product, Post as PostType, AudioTrack } from '../types';
import { MARKETPLACE_COUNTRIES } from '../constants';
import { Post } from './Feed';
import { AllEvents } from './AllEvents'; // 

// --- SUGGESTED PROFILES PAGE ---
interface SuggestedProfilesPageProps {
    currentUser: User;
    users: User[];
    onFollow: (id: number) => void;
    onProfileClick: (id: number) => void;
    onBack?: () => void;
}

export const SuggestedProfilesPage: React.FC<SuggestedProfilesPageProps> = ({ 
    currentUser, users, onFollow, onProfileClick, onBack 
}) => {
    const [hiddenUserIds, setHiddenUserIds] = useState<number[]>([]);

    const availableUsers = useMemo(() => {
        if (!users || !Array.isArray(users)) return [];
        return users.filter(u => {
            if (!currentUser) return true;
            if (u.id === currentUser.id) return false; 
            if (currentUser.following?.includes(u.id)) return false; 
            if (hiddenUserIds.includes(u.id)) return false;
            return true;
        }).map(u => {
            let score = 0;
            let reason = "Suggested for you";
            if(currentUser && u.location === currentUser.location) score += 5;
            return { user: u, score, reason };
        }).sort((a, b) => b.score - a.score);
    }, [users, currentUser, hiddenUserIds]);

    const handleFollow = (id: number) => {
        onFollow(id);
        setHiddenUserIds(prev => [...prev, id]);
    };

    return (
        <div className="w-full max-w-[700px] mx-auto p-4 font-sans pb-20 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-full bg-[#1E293B] hover:bg-[#334155] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors shadow-sm shrink-0"
                        aria-label="Back"
                    >
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                )}
                <h2 className="text-2xl font-bold text-[#F8FAFC]">Discover People</h2>
            </div>
            {availableUsers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {availableUsers.slice(0, 12).map(({ user, reason }) => (
                        <div key={user.id} className="bg-[#0B1120] rounded-xl border border-[#1E293B] overflow-hidden flex flex-col shadow-sm">
                            <div className="h-20 bg-gradient-to-r from-blue-900 to-slate-900 relative">
                                 {user.cover_image_url && <img src={user.cover_image_url} className="w-full h-full object-cover opacity-40" alt="" />}
                                 <div className="absolute -bottom-6 left-4">
                                     <img src={user.profile_image_url} className="w-16 h-16 rounded-full border-4 border-[#0B1120] object-cover bg-[#0B1120]" alt="" />
                                 </div>
                            </div>
                            <div className="pt-8 px-4 pb-4 flex-1 flex flex-col">
                                <div onClick={() => onProfileClick(user.id)} className="cursor-pointer">
                                    <h3 className="text-[#F8FAFC] font-bold text-lg hover:underline truncate">{user.name || user.username}</h3>
                                </div>
                                <p className="text-[#94A3B8] text-xs mb-4 line-clamp-1">{user.location || reason}</p>
                                <div className="mt-auto">
                                    <button onClick={() => handleFollow(user.id)} className="w-full bg-[#1877F2] text-white py-2 rounded-lg font-semibold hover:bg-[#166FE5] transition-colors">Follow</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 text-[#94A3B8]">
                    <p>No new suggestions at the moment.</p>
                </div>
            )}
        </div>
    );
};

// --- BIRTHDAYS PAGE COMPONENT ---
interface BirthdaysPageProps { 
    currentUser: User; 
    users: User[]; 
    onMessage: (id: number) => void;
    onProfileClick: (id: number) => void;
    onBack?: () => void;
}

export const BirthdaysPage: React.FC<BirthdaysPageProps> = ({
  currentUser,
  users,
  onMessage,
  onProfileClick,
  onBack,
}) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  const allUsers = Array.isArray(users) ? users : [];

  const getBirthDate = (u: any) => u?.birth_date || u?.birthDate || u?.dob || u?.birthday;

  const isBirthdayToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const s = String(dateStr).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    return month === currentMonth && day === currentDay;
  };

  const birthdayPeople = allUsers.filter(
    (u) => Number(u?.id) !== Number(currentUser?.id) && isBirthdayToday(getBirthDate(u))
  );

  return (
    <div className="w-full max-w-[800px] mx-auto p-4 md:p-6 font-sans pb-20 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        {onBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#1E293B] hover:bg-[#334155] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors shadow-sm shrink-0"
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
        )}
        <div className="w-14 h-14 bg-gradient-to-tr from-[#FF0080] to-[#7928CA] rounded-2xl flex items-center justify-center shadow-lg transform -rotate-3 shrink-0">
          <i className="fas fa-birthday-cake text-white text-2xl"></i>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">Birthdays</h1>
          <p className="text-[#94A3B8]">Celebrate special moments with your community.</p>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
          Today's Stars{" "}
          <span className="text-xs bg-[#F3425F] px-2 py-0.5 rounded-full animate-pulse-slow uppercase tracking-wider">
            Live
          </span>
        </h2>

        {birthdayPeople.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {birthdayPeople.map((person: any) => (
              <div
                key={person.id}
                className="relative group overflow-hidden rounded-3xl bg-[#0B1120] border border-[#1E293B] hover:border-[#1877F2]/50 transition-all duration-300 shadow-xl p-6 flex flex-col items-center text-center"
              >
                <div className="relative mb-4">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-[#1877F2] via-[#F3425F] to-[#FAB400] rounded-full animate-spin-slow opacity-50 blur-sm"></div>
                  <img
                    src={person.profile_image_url}
                    className="w-24 h-24 rounded-full object-cover border-4 border-[#0B1120] relative z-10 cursor-pointer"
                    onClick={() => onProfileClick(person.id)}
                    alt=""
                  />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {person.name || person.username || "User"}
                </h3>
                <p className="text-[#94A3B8] text-sm mb-6 flex items-center gap-1">
                  <i className="fas fa-map-marker-alt text-[10px]"></i>{" "}
                  {person.location || "World Citizen"}
                </p>
                <button
                  onClick={() => onMessage(person.id)}
                  className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  Wish Him/Her
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0B1120] rounded-3xl p-10 text-center border border-[#1E293B] shadow-inner">
            <i className="fas fa-calendar-day text-[#94A3B8] text-4xl mb-4 opacity-50"></i>
            <h3 className="text-white font-bold text-lg">No Birthdays Today</h3>
            <p className="text-[#94A3B8] text-sm mt-2">
              Check back tomorrow or see upcoming birthdays.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- MEMORIES PAGE ---
export const MemoriesPage = ({
  currentUser,
  posts,
  users,
  onProfileClick,
  onReact,
  onShare,
  onViewImage,
  onOpenComments,
  onVideoClick,
  onPlayAudioTrack,
  onHashtagClick,
  onBack,
}: any) => {
  // ---- Defensive helpers (avoid blank screen) ----
  const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? v : []);
  const safeNumber = (v: any, fallback = 0) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const allPosts = safeArray<PostType>(posts);
  const allUsers = safeArray<User>(users);

  // ---- Find author safely (important for feed Post component) ----
  const authorOf = (p: any) =>
    allUsers.find((u: any) => Number(u?.id) === Number(p?.user_id || p?.author?.id)) || p?.author || currentUser;

  // ---- Date utilities ----
  const parseDate = (d: any): Date | null => {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  // Filter posts to memory posts: user's posts or fallback if none
  const memoryPosts = useMemo(() => {
    const userFiltered = allPosts.filter((p: any) => {
      if (!currentUser?.id) return true;
      return Number(p?.user_id) === Number(currentUser?.id) || Number(p?.user?.id) === Number(currentUser?.id);
    });
    return userFiltered.length > 0 ? userFiltered : allPosts;
  }, [allPosts, currentUser?.id]);

  // Arrange posts from OLD post to NEW (ascending order)
  const sortedPosts = useMemo(() => {
    return [...memoryPosts]
      .map((p: any) => ({
        ...p,
        id: safeNumber(p?.id ?? p?.post_id ?? p?.postId),
        user_id: safeNumber(p?.user_id || p?.user?.id || currentUser?.id),
        created_at: p?.created_at ?? p?.createdAt ?? p?.created ?? p?.date ?? new Date().toISOString(),
      }))
      .sort((a: any, b: any) => {
        const timeA = parseDate(a.created_at)?.getTime() || 0;
        const timeB = parseDate(b.created_at)?.getTime() || 0;
        return timeA - timeB; // Oldest post first to newest
      });
  }, [memoryPosts, currentUser?.id]);

  // Pagination: Show only 5, then User clicks See More is shown other 5
  const PAGE_SIZE = 5;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const visiblePosts = useMemo(() => {
    return sortedPosts.slice(0, visibleCount);
  }, [sortedPosts, visibleCount]);

  const hasMore = visibleCount < sortedPosts.length;

  const handleSeeMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setIsLoadingMore(false);
    }, 250);
  };

  return (
    <div className="w-full mx-auto font-sans pb-20 animate-fade-in">
      {/* Top back navigation bar if onBack exists */}
      {onBack && (
        <div className="w-full max-w-[700px] mx-auto px-3.5 sm:px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#1E293B] hover:bg-[#334155] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors shadow-sm shrink-0"
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <span className="text-lg font-bold text-white">Memories</span>
        </div>
      )}

      {/* Posts List */}
      {sortedPosts.length === 0 ? (
        <div className="w-full max-w-[700px] mx-auto px-4 py-12 text-center">
          <div className="bg-[#0B1120] rounded-3xl p-10 text-center border border-[#1E293B] shadow-inner">
            <i className="fas fa-clock text-[#94A3B8] text-4xl mb-4 opacity-50"></i>
            <h3 className="text-white font-bold text-lg mb-1">No Memories Found</h3>
            <p className="text-[#94A3B8] text-sm">
              When you share posts and moments, your memories will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col">
          {visiblePosts.map((post: any) => (
            <Post
              key={post.id}
              post={post}
              author={authorOf(post)}
              currentUser={currentUser}
              users={allUsers}
              onProfileClick={onProfileClick}
              onReact={onReact}
              onShare={onShare}
              onViewImage={onViewImage}
              onOpenComments={onOpenComments}
              onVideoClick={onVideoClick}
              onPlayAudioTrack={onPlayAudioTrack}
              onHashtagClick={onHashtagClick}
            />
          ))}

          {/* See More Button */}
          {hasMore && (
            <div className="w-full max-w-[700px] mx-auto px-4 py-6 flex justify-center">
              <button
                onClick={handleSeeMore}
                disabled={isLoadingMore}
                className="px-6 py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#334155] active:scale-95 text-[#F8FAFC] font-semibold text-sm transition-all border border-[#334155] shadow-md flex items-center gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <span>See More</span>
                    <i className="fas fa-chevron-down text-xs"></i>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- SETTINGS PAGE ---
export const SettingsPage = () => {
  return <div className="p-6 text-white">SettingsPage not implemented yet.</div>;
};

// Note: EventsPage has been removed. Use AllEvents component directly for the Events page.
