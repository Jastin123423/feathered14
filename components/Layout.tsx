// Layout.tsx
import React, { useState, useEffect, useRef } from 'react';
import { User, Notification } from '../types';
import { NotificationDropdown } from './Notifications';
import { useNavigate } from 'react-router-dom';
import { VerifiedBadge } from './VerifiedBadge';
import { FeatheredLogo } from './FeatheredLogo';

const getUserAvatarUrl = (user: any) => {
  const url = user?.profile_image_url || user?.avatar_url || user?.avatar;
  if (url && typeof url === 'string' && url.trim() && url !== 'null' && url !== 'undefined') {
    return url;
  }
  const name = user?.name || user?.username || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1877F2&color=fff&bold=true`;
};

/* ============================================================
   GLOBAL ONLINE PRESENCE
============================================================ */
const sendHeartbeat = async (userId: number) => {
  const token = localStorage.getItem('unera_token');

  try {
    await fetch('/api/presence/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-user-id': String(userId),
      },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch {
    // best effort
  }
};

interface MenuOverlayProps {
  currentUser: User | null;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export const MenuOverlay: React.FC<MenuOverlayProps> = ({
  currentUser,
  onClose,
  onNavigate,
  onLogout,
}) => {
  const navigate = useNavigate();

  const menuItems = [
    { id: 'marketplace', title: 'MarketPoint', icon: 'fas fa-store', color: '#1877F2' },
    { id: 'saved-posts', title: 'Saved Posts', icon: 'fas fa-bookmark', color: '#F59E0B' },
    { id: 'events', title: 'Events', icon: 'fas fa-calendar-alt', color: '#2563EB' },
    { id: 'profiles', title: 'Profiles', icon: 'fas fa-user-friends', color: '#1877F2' },
    { id: 'groups', title: 'Groups', icon: 'fas fa-users', color: '#38BDF8' },
    { id: 'music', title: 'F-Music', icon: 'fas fa-music', color: '#1877F2' },
    { id: 'tools', title: 'Feathered Tools', icon: 'fas fa-briefcase', color: '#2DD4BF' },
    { id: 'reels', title: 'Videos', icon: 'fas fa-play-circle', color: '#1877F2' },
    { id: 'birthdays', title: 'Birthdays', icon: 'fas fa-birthday-cake', color: '#FBBF24' },
    { id: 'memories', title: 'Memories', icon: 'fas fa-history', color: '#818CF8' },
    { id: 'story-feed', title: 'Story Feed', icon: 'fas fa-layer-group', color: '#34D399' },
    { id: 'notifications', title: 'Notifications', icon: 'fas fa-bell', color: '#1877F2' },
    { id: 'ads', title: 'Ad Manager', icon: 'fas fa-chart-line', color: '#10B981' },
  ];

  const bottomItems = [
    { id: 'settings', title: 'Settings & Privacy', icon: 'fas fa-cog' },
    { 
      id: 'privacy', 
      title: 'Privacy Policy', 
      icon: 'fas fa-user-shield',
      route: '/privacy'
    },
    { id: 'help', title: 'Help & Support', icon: 'fas fa-question-circle' },
    { 
      id: 'terms', 
      title: 'Terms of Service', 
      icon: 'fas fa-file-alt',
      route: '/terms'
    },
  ];

  const handleMenuItemClick = (item: any) => {
    // If item has a route, navigate to it as a page
    if (item.route) {
      navigate(item.route);
      onClose();
      return;
    }
    
    // Otherwise use the existing navigation system
    onNavigate(item.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B1120] animate-slide-down flex flex-col font-sans overflow-hidden">
      <div className="pt-[env(safe-area-inset-top,0px)] border-b border-[#1E293B] bg-[#0B1120] shadow-sm flex-shrink-0">
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#166FE5] to-[#1877F2] flex items-center justify-center shadow-sm">
              <i className="fas fa-th-large text-white text-[14px]"></i>
            </div>
            <h2 className="text-[20px] font-bold text-[#F8FAFC]">Menu</h2>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 bg-[#162137]/65 hover:bg-[#1E293B] border border-[#1E293B]/60 rounded-xl flex items-center justify-center cursor-pointer text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            aria-label="Close menu"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] bg-[#0B1120]">
        {currentUser && (
          <div
            className="flex items-center gap-3 p-3.5 bg-[#162137]/65 border border-[#1E293B]/60 rounded-2xl shadow-sm mb-5 cursor-pointer hover:bg-[#1E293B]/70 transition-colors"
            onClick={() => {
              onNavigate('profile');
              onClose();
            }}
          >
            <img
              src={getUserAvatarUrl(currentUser)}
              alt={currentUser.name}
              className="w-12 h-12 rounded-xl object-cover border border-[#1E293B]"
            />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[#F8FAFC] text-[21px] truncate" style={{ fontSize: '21px' }}>{currentUser.name}</span>
              <span className="text-[#1877F2] text-xs font-medium">View your profile →</span>
            </div>
          </div>
        )}

        <h3 className="text-[#94A3B8] font-semibold text-[13px] uppercase tracking-wider mb-3 px-1">All shortcuts</h3>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {menuItems.map((item) => (
            <div
              key={item.id}
              className="bg-[#162137]/65 border border-[#1E293B]/60 rounded-2xl p-4 shadow-sm flex flex-col gap-3 cursor-pointer hover:bg-[#1E293B]/70 hover:border-[#1877F2]/40 transition-all group"
              onClick={() => handleMenuItemClick(item)}
            >
              <div className="w-10 h-10 rounded-xl bg-[#1E293B]/60 border border-[#334155]/40 flex items-center justify-center group-hover:scale-105 transition-transform">
                <i className={`${item.icon} text-[20px]`} style={{ color: item.color }}></i>
              </div>
              <div>
                <h4 className="font-semibold text-[#F8FAFC] text-[20px] leading-tight mb-0.5 group-hover:text-[#1877F2] transition-colors" style={{ fontSize: '20px' }}>
                  {item.title}
                </h4>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#1E293B] my-4"></div>

        <div className="flex flex-col gap-1.5 mb-8">
          {bottomItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[#162137]/50 border border-[#1E293B]/50 hover:bg-[#1E293B]/65 cursor-pointer transition-colors"
              onClick={() => handleMenuItemClick(item)}
            >
              <div className="flex items-center gap-3">
                <i className={`${item.icon} text-[#94A3B8] text-lg w-6 text-center`}></i>
                <span className="text-[#F8FAFC] font-medium text-[20px]" style={{ fontSize: '20px' }}>{item.title}</span>
              </div>
              <i className="fas fa-chevron-right text-[#64748B] text-xs"></i>
            </div>
          ))}

          <div
            className="flex items-center justify-between p-3 rounded-xl bg-[#162137]/50 border border-[#1E293B]/50 hover:bg-[#EF4444]/15 hover:border-[#EF4444]/40 cursor-pointer transition-colors mt-2 text-[#F87171]"
            onClick={onLogout}
          >
            <div className="flex items-center gap-3">
              <i className="fas fa-sign-out-alt text-lg w-6 text-center"></i>
              <span className="font-medium text-[20px]" style={{ fontSize: '20px' }}>Log Out</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== HEADER PROPS INTERFACE ====================
export interface HeaderProps {
  onHomeClick: () => void;
  onProfileClick: (id: number) => void;
  onReelsClick: () => void;
  onMarketplaceClick: () => void;
  onGroupsClick: () => void;
  onOpenGroup?: (id: number | string) => void;
  groups?: any[];
  onAdsClick: () => void;
  onStoryFeedClick?: () => void;
  currentUser: User | null;
  notifications: Notification[];
  users: User[];
  onLogout: () => void;
  onLoginClick: () => void;
  onMarkNotificationsRead: () => void;
  activeTab: string;
  onNavigate: (view: string) => void;
  setNotifications?: React.Dispatch<React.SetStateAction<Notification[]>>;
  onOpenChatsList?: () => void;
  isChatsListOpen?: boolean;
  badgeCounts?: {
    home?: number;
    music?: number;
    messages?: number;
    reels?: number;
    notifications?: number;
    marketplace?: number;
  };
  unreadNotifications?: number;
  onNotificationClick?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  currentView?: string;
  onCreatePostClick?: () => void;
  onSearchClick?: () => void;
}

// ==================== BOTTOM NAVIGATION COMPONENT ====================
export interface BottomNavigationProps {
  activeTab: string;
  currentView?: string;
  badgeCounts?: {
    home?: number;
    music?: number;
    messages?: number;
    reels?: number;
    notifications?: number;
    marketplace?: number;
  };
  onHomeClick: () => void;
  onMarketplaceClick: () => void;
  onPostClick: () => void;
  onMessageClick: () => void;
  onMenuClick: () => void;
  isChatsListOpen?: boolean;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  currentView,
  badgeCounts,
  onHomeClick,
  onMarketplaceClick,
  onPostClick,
  onMessageClick,
  onMenuClick,
  isChatsListOpen,
}) => {
  const formatBadge = (value?: number) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    return n > 15 ? '15+' : String(n);
  };

  const isHomeActive =
    (activeTab === 'home' || currentView === 'home') &&
    activeTab !== 'marketplace' &&
    activeTab !== 'messages' &&
    !isChatsListOpen;

  const isMarketActive =
    activeTab === 'marketplace' || currentView === 'marketplace';

  const isMessageActive =
    activeTab === 'messages' || currentView === 'messages' || !!isChatsListOpen;

  return (
    <nav
      id="unera-bottom-navigation"
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B1120] border-t border-[#1E293B] shadow-[0_-8px_30px_rgba(0,0,0,0.65)] pb-[max(env(safe-area-inset-bottom,0px),0px)]"
    >
      <div className="max-w-md sm:max-w-lg md:max-w-xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between relative">
        {/* 1. Home */}
        <button
          onClick={onHomeClick}
          className="flex flex-col items-center justify-center flex-1 h-full pt-1 transition-all duration-150 active:scale-95 group focus:outline-none cursor-pointer"
          aria-label="Home"
        >
          <div className="relative flex items-center justify-center">
            <i
              className={`fas fa-th-large text-[19px] sm:text-[21px] transition-colors ${
                isHomeActive ? 'text-[#1877F2]' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
              }`}
            />
            {Number(badgeCounts?.home || 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 bg-[#E41E3F] text-white text-[10px] font-bold px-1.5 py-[0.5px] rounded-full min-w-[17px] text-center shadow-sm">
                {formatBadge(badgeCounts?.home)}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-medium tracking-tight mt-1 transition-colors ${
              isHomeActive ? 'text-[#1877F2] font-bold' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
            }`}
          >
            Home
          </span>
          {isHomeActive && <span className="w-1.5 h-1 rounded-full bg-[#1877F2] mt-0.5" />}
        </button>

        {/* 2. MarketPoint */}
        <button
          onClick={onMarketplaceClick}
          className="flex flex-col items-center justify-center flex-1 h-full pt-1 transition-all duration-150 active:scale-95 group focus:outline-none cursor-pointer"
          aria-label="MarketPoint"
        >
          <div className="relative flex items-center justify-center">
            <i
              className={`fas fa-store text-[19px] sm:text-[21px] transition-colors ${
                isMarketActive ? 'text-[#1877F2]' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
              }`}
            />
            {Number(badgeCounts?.marketplace || 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 bg-[#E41E3F] text-white text-[10px] font-bold px-1.5 py-[0.5px] rounded-full min-w-[17px] text-center shadow-sm">
                {formatBadge(badgeCounts?.marketplace)}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-medium tracking-tight mt-1 transition-colors ${
              isMarketActive ? 'text-[#1877F2] font-bold' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
            }`}
          >
            MarketPoint
          </span>
          {isMarketActive && <span className="w-1.5 h-1 rounded-full bg-[#1877F2] mt-0.5" />}
        </button>

        {/* 3. CENTRAL ELEVATED CIRCULAR [POST] BUTTON */}
        <div className="flex flex-col items-center justify-center flex-1 h-full relative">
          <button
            onClick={onPostClick}
            className="absolute -top-5.5 w-14 h-14 rounded-full bg-gradient-to-tr from-[#166FE5] via-[#1877F2] to-[#3B82F6] text-white shadow-[0_6px_22px_rgba(24,119,242,0.48)] border-[3.5px] border-[#050B18] flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none group z-10"
            aria-label="Create Post"
            title="Create Post"
          >
            <i className="fas fa-plus text-[20px] text-white group-hover:rotate-90 transition-transform duration-200" />
          </button>
          <span className="text-[10px] font-black tracking-wider text-[#1877F2] mt-7.5 uppercase select-none">
            POST
          </span>
        </div>

        {/* 4. Message (remapped from Madeni) */}
        <button
          onClick={onMessageClick}
          className="flex flex-col items-center justify-center flex-1 h-full pt-1 transition-all duration-150 active:scale-95 group focus:outline-none cursor-pointer"
          aria-label="Message"
        >
          <div className="relative flex items-center justify-center">
            <i
              className={`fas fa-comment-dots text-[19px] sm:text-[21px] transition-colors ${
                isMessageActive ? 'text-[#1877F2]' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
              }`}
            />
            {Number(badgeCounts?.messages || 0) > 0 && (
              <span className="absolute -top-1.5 -right-3 bg-[#E41E3F] text-white text-[10px] font-bold px-1.5 py-[0.5px] rounded-full min-w-[17px] text-center shadow-sm">
                {formatBadge(badgeCounts?.messages)}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-medium tracking-tight mt-1 transition-colors ${
              isMessageActive ? 'text-[#1877F2] font-bold' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
            }`}
          >
            Message
          </span>
          {isMessageActive && <span className="w-1.5 h-1 rounded-full bg-[#1877F2] mt-0.5" />}
        </button>

        {/* 5. Menu */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center flex-1 h-full pt-1 transition-all duration-150 active:scale-95 group focus:outline-none cursor-pointer"
          aria-label="Menu"
        >
          <div className="relative flex items-center justify-center">
            <i className="fas fa-bars text-[19px] sm:text-[21px] text-[#94A3B8] group-hover:text-[#F8FAFC] transition-colors" />
          </div>
          <span className="text-[11px] font-medium tracking-tight mt-1 text-[#94A3B8] group-hover:text-[#F8FAFC] transition-colors">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
};

// ==================== HEADER COMPONENT ====================
export const Header: React.FC<HeaderProps> = ({
  onHomeClick,
  onProfileClick,
  onReelsClick,
  onMarketplaceClick,
  onGroupsClick,
  onOpenGroup,
  groups = [],
  onAdsClick,
  onStoryFeedClick,
  currentUser,
  notifications,
  users,
  onLogout,
  onLoginClick,
  onMarkNotificationsRead,
  activeTab,
  onNavigate,
  setNotifications,
  onOpenChatsList,
  isChatsListOpen,
  badgeCounts,
  unreadNotifications,
  onNotificationClick,
  showBackButton,
  onBack,
  currentView,
  onCreatePostClick,
  onSearchClick,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [groupResults, setGroupResults] = useState<any[]>([]);
  const [featureResults, setFeatureResults] = useState<any[]>([]);
  const [activeSearchFilter, setActiveSearchFilter] = useState<'all' | 'people' | 'groups' | 'more'>('all');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const presenceTimer = useRef<number | null>(null);

  const unreadCount =
    typeof unreadNotifications === 'number'
      ? unreadNotifications
      : notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!currentUser || !setNotifications) return;

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', {
          headers: {
            'x-user-id': String(currentUser.id),
          },
        });
        const data = await res.json();
        setNotifications(data);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);

    return () => clearInterval(interval);
  }, [currentUser, setNotifications]);

  useEffect(() => {
    const userId = Number(localStorage.getItem('unera_user_id') || 0);
    if (!userId || !currentUser) return;

    const heartbeat = () => sendHeartbeat(userId);

    heartbeat();

    presenceTimer.current = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (presenceTimer.current) {
        clearInterval(presenceTimer.current);
        presenceTimer.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (searchOverlayRef.current && !searchOverlayRef.current.contains(event.target as Node)) {
        setShowSearchOverlay(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      setSearchResults([]);
      setGroupResults([]);
      setFeatureResults([]);
      return;
    }

    // 1. People search - sensitive even to a single character
    const scoredUsers = users
      .filter((u) => !currentUser || u.id !== currentUser.id)
      .map((user) => {
        let score = 0;
        const name = String(user.name || '').toLowerCase();
        const username = String((user as any).username || '').toLowerCase();
        const bio = String((user as any).bio || '').toLowerCase();

        if (name.startsWith(trimmed)) score += 30;
        else if (name.includes(trimmed)) score += 15;
        if (username.startsWith(trimmed)) score += 25;
        else if (username.includes(trimmed)) score += 10;
        if (bio.includes(trimmed)) score += 5;

        return { user, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.user);

    setSearchResults(scoredUsers);

    // 2. Groups search - sensitive even to a single character
    if (Array.isArray(groups)) {
      const scoredGroups = groups
        .map((g: any) => {
          let score = 0;
          const gName = String(g.name || '').toLowerCase();
          const gDesc = String(g.description || '').toLowerCase();
          const gCat = String(g.category || '').toLowerCase();

          if (gName.startsWith(trimmed)) score += 30;
          else if (gName.includes(trimmed)) score += 15;
          if (gCat.startsWith(trimmed)) score += 20;
          else if (gCat.includes(trimmed)) score += 10;
          if (gDesc.includes(trimmed)) score += 5;

          return { group: g, score };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .map((item: any) => item.group);

      setGroupResults(scoredGroups);
    } else {
      setGroupResults([]);
    }

    // 3. Shortcuts / pages / more
    const allFeatures = [
      { id: 'marketplace', title: 'MarketPoint', icon: 'fas fa-store', color: '#10B981', desc: 'Browse and sell items', action: () => onMarketplaceClick() },
      { id: 'groups', title: 'Groups', icon: 'fas fa-users', color: '#1877F2', desc: 'Discover and join communities', action: () => onGroupsClick() },
      { id: 'reels', title: 'Videos', icon: 'fas fa-play-circle', color: '#1877F2', desc: 'Watch trending videos & reels', action: () => onReelsClick() },
      { id: 'music', title: 'F-Music', icon: 'fas fa-music', color: '#1877F2', desc: 'Listen to songs and audio tracks', action: () => onNavigate('music') },
      { id: 'ads', title: 'Ad Manager', icon: 'fas fa-chart-line', color: '#06B6D4', desc: 'Create and track ads', action: () => onAdsClick() },
      { id: 'events', title: 'Events', icon: 'fas fa-calendar-alt', color: '#EC4899', desc: 'Find local events and gatherings', action: () => onNavigate('events') },
    ];

    const matchedFeatures = allFeatures.filter(
      (f) =>
        f.title.toLowerCase().includes(trimmed) ||
        f.desc.toLowerCase().includes(trimmed) ||
        f.id.toLowerCase().includes(trimmed)
    );
    setFeatureResults(matchedFeatures);
  };

  const goToMessages = () => {
    if (!currentUser) {
      onLoginClick();
      return;
    }
    setShowSearchOverlay(false);
    setSearchQuery('');
    setSearchResults([]);
    if (onOpenChatsList) {
      onOpenChatsList();
      return;
    }
    onNavigate('messages');
  };

  const goToMusic = () => {
    onNavigate('music');
  };

  const handlePostClick = () => {
    if (!currentUser) {
      onLoginClick();
      return;
    }
    if (onCreatePostClick) {
      onCreatePostClick();
      return;
    }
    onNavigate('create');
  };

  return (
    <>
      {/* TOP HEADER - CLEAN DARK NAVY BAR WITH EDGE-TO-EDGE STATUS BAR INTEGRATION */}
      <header className="sticky top-0 z-50 bg-[#0B1120] border-b border-[#1E293B] pt-[env(safe-area-inset-top,0px)]">
        <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 max-w-7xl mx-auto">
          {/* LEFT: Back (if non-home), Feathered Logo and Name on the left */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {showBackButton && (
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors flex-shrink-0 focus:outline-none"
                aria-label="Go Back"
              >
                <i className="fas fa-arrow-left text-[14px]"></i>
              </button>
            )}

            {/* Feathered Brand Button (Icon + Name) */}
            <button
              type="button"
              onClick={onHomeClick}
              className="flex items-center gap-2.5 focus:outline-none select-none cursor-pointer group"
              aria-label="Feathered Home"
              title="Feathered"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0B0E14] border border-[#1E293B] group-hover:border-[#2563EB]/60 flex items-center justify-center shadow-[0_2px_12px_rgba(37,99,235,0.25)] group-hover:shadow-[0_4px_16px_rgba(37,99,235,0.45)] group-hover:scale-105 active:scale-95 transition-all flex-shrink-0 p-1.5">
                <FeatheredLogo className="w-full h-full text-[#2563EB] group-hover:text-[#38BDF8] transition-colors" />
              </div>
              <span className="text-[20px] sm:text-[22px] font-black tracking-tight text-white group-hover:text-[#38BDF8] transition-colors select-none font-sans">
                Feathered
              </span>
            </button>
          </div>

          {/* RIGHT: Search, Notifications (Carrot Orange Badge), Profile / Login */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {/* 1. MarketPoint Button */}
            <button
              onClick={onMarketplaceClick}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.08] border border-white/30 transition-all duration-150 flex items-center justify-center relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-md shadow-black/25 active:scale-95 group backdrop-blur-md ${
                activeTab === 'marketplace' || currentView === 'marketplace'
                  ? 'bg-white/[0.22] ring-2 ring-white/60 border-white/60 shadow-[0_0_15px_rgba(255,255,255,0.35)]'
                  : 'hover:bg-white/[0.18] hover:border-white/50'
              }`}
              aria-label="MarketPoint"
              title="MarketPoint"
            >
              <i className="fas fa-store text-[20px] sm:text-[22px] text-white group-hover:scale-105 transition-transform" />
              {Number(badgeCounts?.marketplace || 0) > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 bg-[#F97316] text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md ring-2 ring-[#0F172A] leading-none pointer-events-none select-none tracking-tight">
                  {Number(badgeCounts?.marketplace || 0) > 99 ? '99+' : badgeCounts?.marketplace}
                </span>
              )}
            </button>

            {/* 2. Search Button */}
            <button
              onClick={() => {
                if (onSearchClick) {
                  onSearchClick();
                } else {
                  setShowSearchOverlay(true);
                }
              }}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.08] hover:bg-white/[0.18] active:scale-95 border border-white/30 hover:border-white/60 backdrop-blur-md text-white flex items-center justify-center transition-all duration-150 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-md shadow-black/25 group"
              aria-label="Search"
              title="Search"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-[28px] h-[28px] sm:w-[30px] sm:h-[30px] group-hover:scale-105 transition-transform"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.2" y2="16.2" />
              </svg>
            </button>

            {/* 3. Notification Button */}
            <button
              onClick={() => {
                if (onNotificationClick) {
                  onNotificationClick();
                } else {
                  setShowNotifications((prev) => !prev);
                }
              }}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/[0.08] border border-white/30 transition-all duration-150 flex items-center justify-center relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-md shadow-black/25 active:scale-95 group backdrop-blur-md ${
                showNotifications || activeTab === 'notifications'
                  ? 'bg-white/[0.22] ring-2 ring-white/60 border-white/60 shadow-[0_0_15px_rgba(255,255,255,0.35)]'
                  : 'hover:bg-white/[0.18] hover:border-white/50'
              }`}
              aria-label="Notifications"
              title="Notifications"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-[30px] h-[30px] sm:w-[32px] sm:h-[32px] group-hover:scale-105 transition-transform"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1.5 bg-[#F97316] text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md ring-2 ring-[#0F172A] leading-none pointer-events-none select-none tracking-tight">
                  {unreadCount > 99 ? '99+' : unreadCount > 15 ? '15+' : unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile Avatar / Login */}
            {currentUser ? (
              <button
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-[#334155]/80 hover:border-[#38BDF8] transition-all flex items-center justify-center ml-0.5 focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/50 active:scale-95 shadow-md shadow-black/40 bg-[#1E293B] relative"
                aria-label="User Profile"
                title={currentUser.name}
              >
                <img
                  src={getUserAvatarUrl(currentUser)}
                  alt={currentUser.name}
                  onError={(e) => {
                    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || currentUser.username || 'User')}&background=1877F2&color=fff`;
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src !== fallback) {
                      target.src = fallback;
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <button
                onClick={onLoginClick}
                className="h-9 sm:h-10 px-3.5 rounded-xl bg-gradient-to-r from-[#166FE5] to-[#1877F2] text-white font-semibold text-xs hover:opacity-95 shadow-sm transition-all flex items-center justify-center ml-0.5"
              >
                Log In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* SEARCH OVERLAY - SENSITIVE SEARCH FOR PEOPLE, GROUPS & MORE */}
      {showSearchOverlay && (
        <div className="fixed inset-0 z-[180] bg-black/70 backdrop-blur-sm animate-fade-in">
          <div
            ref={searchOverlayRef}
            className="bg-[#0B1120] border-b border-[#1E293B] px-4 pt-3 pb-4 shadow-2xl max-w-2xl mx-auto rounded-b-2xl"
          >
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setShowSearchOverlay(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setGroupResults([]);
                  setFeatureResults([]);
                }}
                className="w-10 h-10 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] flex items-center justify-center transition-colors"
                aria-label="Close search"
              >
                <i className="fas fa-arrow-left"></i>
              </button>

              <div className="relative flex-1">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search names, groups, marketplace..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="w-full bg-[#0F172A] border border-[#1E293B] rounded-xl py-2.5 pl-11 pr-11 text-[#F8FAFC] placeholder-[#64748B] outline-none focus:border-[#F97316] transition-colors text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setGroupResults([]);
                      setFeatureResults([]);
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC]"
                  >
                    <i className="fas fa-times-circle"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs when query entered */}
            {searchQuery.trim() && (
              <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setActiveSearchFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSearchFilter === 'all'
                      ? 'bg-[#F97316] text-white shadow-sm'
                      : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
                  }`}
                >
                  All ({searchResults.length + groupResults.length + featureResults.length})
                </button>
                <button
                  onClick={() => setActiveSearchFilter('people')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSearchFilter === 'people'
                      ? 'bg-[#F97316] text-white shadow-sm'
                      : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
                  }`}
                >
                  People ({searchResults.length})
                </button>
                <button
                  onClick={() => setActiveSearchFilter('groups')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSearchFilter === 'groups'
                      ? 'bg-[#F97316] text-white shadow-sm'
                      : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
                  }`}
                >
                  Groups ({groupResults.length})
                </button>
                <button
                  onClick={() => setActiveSearchFilter('more')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSearchFilter === 'more'
                      ? 'bg-[#F97316] text-white shadow-sm'
                      : 'bg-[#0F172A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E293B]'
                  }`}
                >
                  Shortcuts & More ({featureResults.length})
                </button>
              </div>
            )}

            {!searchQuery.trim() && (
              <div className="mt-3 text-xs text-[#94A3B8] px-1 flex items-center gap-1.5">
                <i className="fas fa-bolt text-[#FBBF24]"></i>
                <span>Instant sensitive search: Start typing any letter to find people, groups, or pages.</span>
              </div>
            )}

            {searchQuery.trim() && (
              <div className="mt-3 bg-[#0F172A] rounded-2xl border border-[#1E293B] overflow-hidden max-h-[60vh] overflow-y-auto divide-y divide-[#1E293B]">
                {/* 1. PEOPLE RESULTS */}
                {(activeSearchFilter === 'all' || activeSearchFilter === 'people') && searchResults.length > 0 && (
                  <div>
                    <div className="px-3.5 py-2 bg-[#0B1120] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                      <span>People</span>
                      <span className="text-[11px] font-normal">{searchResults.length} found</span>
                    </div>
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-3 hover:bg-[#141E33] cursor-pointer transition-colors"
                        onClick={() => {
                          onProfileClick(user.id);
                          setShowSearchOverlay(false);
                          setSearchQuery('');
                          setSearchResults([]);
                          setGroupResults([]);
                          setFeatureResults([]);
                        }}
                      >
                        <img
                          src={user.profile_image_url}
                          alt={user.name}
                          className="w-11 h-11 rounded-xl object-cover border border-[#1E293B]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[15px] text-[#F8FAFC] flex items-center gap-1.5 truncate">
                            <span className="truncate">{user.name}</span>
                            {(user.is_verified || (user as any).verified) && (
                              <VerifiedBadge size={14} />
                            )}
                          </div>
                          {!!(user as any).username && (
                            <div className="text-[#94A3B8] text-xs truncate">
                              @{(user as any).username}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-medium text-[#1877F2] bg-[#1877F2]/10 px-2.5 py-1 rounded-lg">
                          Profile
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. GROUPS RESULTS */}
                {(activeSearchFilter === 'all' || activeSearchFilter === 'groups') && groupResults.length > 0 && (
                  <div>
                    <div className="px-3.5 py-2 bg-[#0B1120] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                      <span>Groups</span>
                      <span className="text-[11px] font-normal">{groupResults.length} found</span>
                    </div>
                    {groupResults.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 p-3 hover:bg-[#141E33] cursor-pointer transition-colors"
                        onClick={() => {
                          setShowSearchOverlay(false);
                          setSearchQuery('');
                          setSearchResults([]);
                          setGroupResults([]);
                          setFeatureResults([]);
                          if (onOpenGroup) {
                            onOpenGroup(group.id);
                          } else {
                            onGroupsClick();
                          }
                        }}
                      >
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#1877F2] to-[#3B82F6] flex items-center justify-center text-white font-bold text-lg shrink-0">
                          {group.cover_image || group.image ? (
                            <img
                              src={group.cover_image || group.image}
                              alt={group.name}
                              className="w-full h-full object-cover rounded-xl"
                            />
                          ) : (
                            <i className="fas fa-users text-sm"></i>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[15px] text-[#F8FAFC] truncate">
                            {group.name}
                          </div>
                          <div className="text-[#94A3B8] text-xs truncate">
                            {group.category || 'Community group'} • {group.members_count || group.members?.length || 1} members
                          </div>
                        </div>
                        <span className="text-xs font-medium text-[#1877F2] bg-[#1877F2]/10 px-2.5 py-1 rounded-lg">
                          View Group
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. SHORTCUTS & MORE RESULTS */}
                {(activeSearchFilter === 'all' || activeSearchFilter === 'more') && featureResults.length > 0 && (
                  <div>
                    <div className="px-3.5 py-2 bg-[#0B1120] text-xs font-bold uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
                      <span>Pages & Shortcuts</span>
                      <span className="text-[11px] font-normal">{featureResults.length} found</span>
                    </div>
                    {featureResults.map((feat) => (
                      <div
                        key={feat.id}
                        className="flex items-center gap-3 p-3 hover:bg-[#141E33] cursor-pointer transition-colors"
                        onClick={() => {
                          setShowSearchOverlay(false);
                          setSearchQuery('');
                          setSearchResults([]);
                          setGroupResults([]);
                          setFeatureResults([]);
                          feat.action();
                        }}
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg shrink-0"
                          style={{ backgroundColor: feat.color }}
                        >
                          <i className={feat.icon}></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[15px] text-[#F8FAFC] truncate">
                            {feat.title}
                          </div>
                          <div className="text-[#94A3B8] text-xs truncate">
                            {feat.desc}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-[#94A3B8] bg-[#1E293B] px-2.5 py-1 rounded-lg">
                          Open
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* NO RESULTS STATE */}
                {searchResults.length === 0 && groupResults.length === 0 && featureResults.length === 0 && (
                  <div className="p-8 text-center text-[#94A3B8]">
                    <i className="fas fa-search text-3xl mb-3 text-[#64748B]/50 block"></i>
                    <p className="text-sm font-semibold text-[#F8FAFC]">No results found</p>
                    <p className="text-xs text-[#64748B] mt-1">
                      No matches found for "{searchQuery}". Try searching for another name, group, or page.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOTIFICATIONS DROPDOWN */}
      {showNotifications && (
        <div ref={notifRef}>
          <NotificationDropdown
            notifications={notifications}
            users={users}
            currentUser={currentUser}
            onNotificationClick={(n) => {
              setShowNotifications(false);
              if ((n as any).post_id) onNavigate(`post-${(n as any).post_id}`);
              else if ((n as any).sender_id) onProfileClick((n as any).sender_id);
            }}
            onMarkAllRead={onMarkNotificationsRead}
          />
        </div>
      )}

      {/* PROFILE DROPDOWN MENU */}
      {currentUser && showProfileMenu && (
        <div
          ref={profileRef}
          className="fixed top-[58px] right-3 w-[290px] bg-[#0B1120] rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.65)] border border-[#1E293B] z-[190] p-2 overflow-hidden animate-fade-in"
        >
          <div
            className="flex items-center gap-3 p-2.5 bg-[#162137]/65 hover:bg-[#1E293B]/75 border border-[#1E293B]/60 rounded-xl cursor-pointer transition-colors mb-1.5"
            onClick={() => {
              onProfileClick(currentUser.id);
              setShowProfileMenu(false);
            }}
          >
            <img
              src={getUserAvatarUrl(currentUser)}
              alt=""
              onError={(e) => {
                const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || currentUser.username || 'User')}&background=1877F2&color=fff`;
                const target = e.currentTarget as HTMLImageElement;
                if (target.src !== fallback) {
                  target.src = fallback;
                }
              }}
              className="w-11 h-11 rounded-xl object-cover border border-[#1E293B]"
            />
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[21px] text-[#F8FAFC] truncate" style={{ fontSize: '21px' }}>{currentUser.name}</span>
              <span className="text-[#1877F2] text-xs font-medium">View your profile</span>
            </div>
          </div>

          <div className="border-b border-[#1E293B] my-1"></div>

          <div
            className="flex items-center gap-3 p-2.5 bg-[#162137]/45 hover:bg-[#EF4444]/15 border border-[#1E293B]/40 hover:border-[#EF4444]/40 rounded-xl cursor-pointer text-[#F87171] transition-colors"
            onClick={() => {
              setShowProfileMenu(false);
              onLogout();
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-[#EF4444]/10 flex items-center justify-center">
              <i className="fas fa-sign-out-alt text-sm"></i>
            </div>
            <span className="font-medium text-[20px]" style={{ fontSize: '20px' }}>Log Out</span>
          </div>
        </div>
      )}

      {/* FULL MENU OVERLAY */}
      {showFullMenu && (
        <MenuOverlay
          currentUser={currentUser}
          onClose={() => setShowFullMenu(false)}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      {/* FIXED BOTTOM NAVIGATION BAR - 5 POSITIONS */}
      <BottomNavigation
        activeTab={activeTab}
        currentView={currentView}
        badgeCounts={badgeCounts}
        onHomeClick={onHomeClick}
        onMarketplaceClick={onMarketplaceClick}
        onPostClick={handlePostClick}
        onMessageClick={goToMessages}
        onMenuClick={() => setShowFullMenu(true)}
        isChatsListOpen={isChatsListOpen}
      />
    </>
  );
};

// ==================== SIDEBAR COMPONENT ====================
interface SidebarProps {
  currentUser: User;
  onProfileClick: (id: number) => void;
  onReelsClick: () => void;
  onMarketplaceClick: () => void;
  onGroupsClick: () => void;
  onEventsClick?: () => void;
  onAdsClick?: () => void;
  onStoryFeedClick?: () => void;
  onSavedPostsClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  onProfileClick,
  onReelsClick,
  onMarketplaceClick,
  onGroupsClick,
  onEventsClick,
  onAdsClick,
  onStoryFeedClick,
  onSavedPostsClick,
}) => {
  const items = [
    { id: 'friends', label: 'Friends', icon: 'fas fa-user-friends', color: '#1877F2' },
    { id: 'memories', label: 'Memories', icon: 'fas fa-history', color: '#818CF8' },
    { id: 'saved', label: 'Saved', icon: 'fas fa-bookmark', color: '#F59E0B', onClick: onSavedPostsClick },
    { id: 'story-feed', label: 'Story Feed', icon: 'fas fa-layer-group', color: '#34D399', onClick: onStoryFeedClick },
    { id: 'groups', label: 'Groups', icon: 'fas fa-users', color: '#38BDF8', onClick: onGroupsClick },
    { id: 'marketplace', label: 'MarketPoint', icon: 'fas fa-store', color: '#1877F2', onClick: onMarketplaceClick },
    { id: 'reels', label: 'Videos', icon: 'fas fa-play-circle', color: '#1877F2', onClick: onReelsClick },
    { id: 'events', label: 'Events', icon: 'fas fa-calendar-alt', color: '#2563EB', onClick: onEventsClick },
    { id: 'ads', label: 'Ad Manager', icon: 'fas fa-chart-line', color: '#10B981', onClick: onAdsClick },
  ];

  return (
    <div className="w-[300px] h-full overflow-y-auto px-2 pt-4 pb-24 bg-[#0B1120] hidden lg:block scrollbar-hide border-r border-[#1E293B]">
      <div
        className="flex items-center gap-3 p-2.5 hover:bg-[#162137]/60 border border-transparent hover:border-[#1E293B]/60 rounded-xl cursor-pointer transition-colors mb-2"
        onClick={() => onProfileClick(currentUser.id)}
      >
        <img
          src={getUserAvatarUrl(currentUser)}
          alt=""
          className="w-10 h-10 rounded-xl object-cover border border-[#1E293B]"
        />
        <span className="text-[#F8FAFC] font-semibold text-[21px] truncate" style={{ fontSize: '21px' }}>{currentUser.name}</span>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 p-2.5 hover:bg-[#162137]/60 border border-transparent hover:border-[#1E293B]/60 rounded-xl cursor-pointer mb-1 transition-colors"
          onClick={item.onClick}
        >
          <div className="w-9 h-9 rounded-lg bg-[#162137]/65 border border-[#1E293B]/60 flex items-center justify-center flex-shrink-0">
            <i className={`${item.icon} text-[18px]`} style={{ color: item.color }}></i>
          </div>
          <span className="text-[#F8FAFC] font-medium text-[20px]" style={{ fontSize: '20px' }}>{item.label}</span>
        </div>
      ))}

      <div className="border-t border-[#1E293B] my-4 mx-2"></div>
      <div className="px-4 text-[#64748B] text-[12px] leading-tight">
        <p>Feathered © 2025</p>
      </div>
    </div>
  );
};

// ==================== RIGHT SIDEBAR COMPONENT ====================
export const RightSidebar: React.FC<{
  contacts: User[];
  onProfileClick: (id: number) => void;
}> = ({ contacts, onProfileClick }) => {
  return (
    <div className="w-[280px] h-full overflow-y-auto pt-4 pr-2 pb-24 bg-[#0B1120] hidden xl:block scrollbar-hide border-l border-[#1E293B]">
      <div className="flex items-center justify-between px-3 mb-2.5">
        <span className="text-[#94A3B8] font-bold text-[13px] uppercase tracking-wider">Contacts</span>
      </div>

      <div className="space-y-1">
        {contacts.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-3 p-2.5 hover:bg-[#0F172A] border border-transparent hover:border-[#1E293B] rounded-xl cursor-pointer transition-colors relative"
            onClick={() => onProfileClick(user.id)}
          >
            <div className="relative">
              <img
                src={user.profile_image_url}
                alt=""
                className="w-9 h-9 rounded-xl object-cover border border-[#1E293B]"
              />
              {(user as any).is_online && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#10B981] rounded-full border-2 border-[#050B18]"></div>
              )}
            </div>

            <span className="text-[#F8FAFC] font-medium text-[14px]">{user.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
