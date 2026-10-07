import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { VerifiedBadge } from './VerifiedBadge';

export interface ShareScreenProps {
  isOpen: boolean;
  onClose: () => void;
  post: any;
  currentUser: any;
  users?: any[];
  groups?: any[];
  brands?: any[];
  onShareComplete?: (destination: string, data?: any) => void;
}

const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('unera_token');
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    let errMessage = 'Request failed';
    try {
      const err = await response.json();
      errMessage = err.message || err.error || errMessage;
    } catch {}
    throw new Error(errMessage);
  }
  return response.json();
};

const avatarFrom = (u: any): string => {
  const img = String(
    u?.profile_image_url ??
      u?.avatar_url ??
      u?.avatarUrl ??
      u?.profileImage ??
      u?.profile_image ??
      u?.avatar ??
      u?.photoURL ??
      u?.photo_url ??
      u?.photoUrl ??
      u?.author_image ??
      u?.authorImage ??
      u?.image ??
      u?.image_url ??
      u?.imageUrl ??
      u?.picture ??
      ''
  ).trim();
  if (img && img !== 'null' && img !== 'undefined') return img;
  const label = String(u?.name || u?.username || 'User').trim();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=1877F2&color=fff&size=150`;
};

export const ShareScreen: React.FC<ShareScreenProps> = ({
  isOpen,
  onClose,
  post,
  currentUser,
  users = [],
  onShareComplete,
}) => {
  const [shareMessage, setShareMessage] = useState('');
  const [audience, setAudience] = useState<'Public' | 'Friends' | 'Only Me'>('Public');
  const [showAudienceMenu, setShowAudienceMenu] = useState(false);
  const [feeling, setFeeling] = useState('');
  const [location, setLocation] = useState('');
  const [subModal, setSubModal] = useState<'none' | 'location' | 'feeling'>('none');
  const [isPosting, setIsPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (subModal !== 'none') {
            setSubModal('none');
          } else {
            onClose();
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, subModal, onClose]);

  // Focus textarea when composer opens
  useEffect(() => {
    if (isOpen && subModal === 'none') {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, subModal]);

  const ownerAuthor = useMemo(() => {
    const rawAuthor = post?.author;
    const rawUser = post?.user;
    const authorObj = typeof rawAuthor === 'object' && rawAuthor !== null ? rawAuthor : null;
    const userObj = typeof rawUser === 'object' && rawUser !== null ? rawUser : null;
    const authorId = Number(authorObj?.id || userObj?.id || post?.user_id || post?.seller_id || post?.uploader_id || 0);
    const matchedUser = authorId ? users?.find((u) => Number(u.id) === authorId) : null;

    return {
      id: authorId,
      name:
        matchedUser?.name ||
        authorObj?.name ||
        userObj?.name ||
        (typeof rawAuthor === 'string' && rawAuthor !== 'User' ? rawAuthor : null) ||
        post?.author_name ||
        post?.author_full_name ||
        matchedUser?.username ||
        authorObj?.username ||
        userObj?.username ||
        post?.author_username ||
        post?.username ||
        'User',
      username:
        matchedUser?.username ||
        authorObj?.username ||
        userObj?.username ||
        post?.author_username ||
        post?.username ||
        'user',
      profile_image_url:
        matchedUser?.profile_image_url ||
        matchedUser?.avatar_url ||
        authorObj?.profile_image_url ||
        authorObj?.avatar_url ||
        userObj?.profile_image_url ||
        userObj?.avatar_url ||
        post?.author_avatar ||
        post?.author_image ||
        null,
      is_verified: Boolean(
        matchedUser?.is_verified ||
        authorObj?.is_verified ||
        userObj?.is_verified ||
        post?.author_verified ||
        post?.is_verified
      ),
    };
  }, [post, users]);

  const authorName = ownerAuthor.name || 'User';

  const cardTitle = useMemo(() => {
    const hasImages =
      (Array.isArray(post?.media_urls) && post.media_urls.length > 0) ||
      (Array.isArray(post?.images) && post.images.length > 0) ||
      (post?.media_url && !String(post.media_url).match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i));

    const hasVideo =
      post?.video_url ||
      post?.videoUrl ||
      post?.video ||
      (post?.media_url && String(post.media_url).match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i));

    const isSong =
      post?.song_id || post?.song_id2 || post?.song || post?.item_type === 'song' || post?.item_type === 'music';

    const isProduct = post?.item_type === 'product' || post?.source === 'product';
    const isEvent = post?.item_type === 'event' || post?.source === 'event';

    if (hasImages) {
      const count = post?.media_urls?.length || post?.images?.length || 1;
      return count > 1 ? `Photos from ${authorName}'s post` : `Photo from ${authorName}'s post`;
    }
    if (hasVideo) return `Video from ${authorName}'s post`;
    if (isSong) return post?.title ? `Song: ${post.title}` : `Song from ${authorName}`;
    if (isProduct) return `Product from ${authorName}`;
    if (isEvent) return `Event from ${authorName}`;
    return `Post from ${authorName}'s post`;
  }, [post, authorName]);

  const snippet = useMemo(() => {
    return (
      post?.content ||
      post?.caption ||
      post?.text ||
      post?.title ||
      post?.description ||
      post?.name ||
      ''
    );
  }, [post]);

  const cardThumbnail = useMemo(() => {
    return (
      post?.cover_image_url ||
      post?.song_cover_image_url ||
      post?.cover_url ||
      post?.cover ||
      (Array.isArray(post?.media_urls) && post.media_urls[0]) ||
      (Array.isArray(post?.images) && post.images[0]) ||
      post?.media_url ||
      post?.thumbnail ||
      post?.thumbnail_url ||
      post?.image ||
      avatarFrom(ownerAuthor) ||
      ''
    );
  }, [post, ownerAuthor]);

  if (!isOpen || !post || typeof document === 'undefined') return null;

  const handlePostSubmit = async () => {
    if (!currentUser) {
      alert('Please log in to share to your feed or profile.');
      return;
    }
    setIsPosting(true);
    try {
      const isVideo = Boolean(
        post?.video_url ||
        post?.videoUrl ||
        post?.video ||
        post?.media_type === 'video' ||
        post?.type === 'video' ||
        (typeof post?.media_url === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(post.media_url)) ||
        (Array.isArray(post?.media_urls) && post.media_urls.some((u: string) => typeof u === 'string' && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)))
      );
      const isProduct = !isVideo && Boolean(
        post?.item_type === 'product' ||
        post?.source === 'product' ||
        post?.type === 'product' ||
        post?.type === 'marketplace' ||
        post?.post_type === 'product' ||
        post?.kind === 'product' ||
        post?.is_product ||
        (post?.product_id && (post?.price != null || post?.main_price != null || post?.is_product || post?.item_type === 'product' || post?.source === 'product'))
      );
      const isEvent = Boolean(
        post?.item_type === 'event' ||
        post?.source === 'event' ||
        post?.type === 'event' ||
        post?.event_id
      );
      const isSong = Boolean(
        post?.item_type === 'music' ||
        post?.item_type === 'song' ||
        post?.source === 'song' ||
        post?.source === 'music' ||
        post?.type === 'music' ||
        post?.type === 'song' ||
        post?.post_type === 'music' ||
        post?.post_type === 'song' ||
        post?.kind === 'music' ||
        post?.song_id ||
        post?.song_id2 ||
        post?.song_title ||
        (post?.meta as any)?.song?.id ||
        (post?.audio_url && !post?.podcast_id)
      );
      const isPodcast = Boolean(
        post?.item_type === 'podcast' ||
        post?.source === 'podcast' ||
        post?.type === 'podcast'
      );
      const isGroup = Boolean(
        post?.item_type === 'group_post' ||
        post?.source === 'group_post' ||
        post?.group_id
      );
      const isStory = Boolean(
        post?.item_type === 'story' ||
        post?.source === 'story' ||
        post?.type === 'story' ||
        post?.post_type === 'story' ||
        post?.kind === 'story' ||
        post?.story_id
      );

      const itemId = Number(post?.id ?? post?.post_id ?? 0);
      let endpoint = `/api/posts/${itemId}/share`;
      if (isGroup) {
        endpoint = '/api/groups/posts/share';
      } else if (isVideo) {
        endpoint = `/api/posts/${itemId}/share`;
      } else if (isStory) {
        const storyId = Number(post?.story_id || post?.id || 0);
        endpoint = `/api/stories/${storyId}/share`;
      } else if (isProduct) {
        const prodId = Number(post?.product_id || post?.id || 0);
        endpoint = `/api/products/${prodId}/share`;
      } else if (isEvent) {
        const evId = Number(post?.event_id || post?.id || 0);
        endpoint = `/api/events/${evId}/share`;
      } else if (isSong) {
        const sId = Number(post?.song_id || post?.song_id2 || (post?.meta as any)?.song?.id || (post?.meta as any)?.original_song_id || (post?.shared_song as any)?.id || post?.id || 0);
        endpoint = `/api/songs/${sId}/share`;
      } else if (isPodcast) {
        endpoint = `/api/podcasts/${itemId}/share`;
      }

      const itemType = isGroup
        ? 'group_post'
        : isVideo
        ? 'post'
        : isStory
        ? 'story'
        : isProduct
        ? 'product'
        : isEvent
        ? 'event'
        : isSong
        ? 'music'
        : isPodcast
        ? 'podcast'
        : post?.item_type || post?.source || 'post';

      const songTargetId = Number(post?.song_id || post?.song_id2 || (post?.meta as any)?.song?.id || (post?.meta as any)?.original_song_id || (post?.shared_song as any)?.id || post?.id || itemId || 0);

      const payload: any = {
        user_id: currentUser?.id,
        destination: 'feed',
        shared_at: new Date().toISOString(),
        item_type: itemType,
        post_id: itemId,
        message: shareMessage,
        feeling: feeling || undefined,
        location: location || undefined,
        audience,
      };
      if (isStory) {
        payload.story_id = Number(post?.story_id || post?.id || 0);
      }
      if (isProduct) {
        payload.product_id = Number(post?.product_id || post?.id || 0);
      }
      if (itemType === 'event') payload.event_id = itemId;
      if (itemType === 'group_post') {
        payload.post_id = itemId;
        payload.group_id = Number(post?.group_id || post?.groupId || post?.meta?.group_id || 0);
        payload.source = 'group';
      }
      if (itemType === 'music' || itemType === 'song') {
        payload.song_id = songTargetId;
        payload.item_type = 'music';
      }
      if (itemType === 'podcast') payload.podcast_id = itemId;

      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(currentUser.id),
        },
        body: JSON.stringify({
          ...payload,
          user_id: currentUser.id,
          destination: 'feed',
        }),
      });

      const nextShares = Number(
        response?.shares ??
          response?.shares_count ??
          response?.share_count ??
          Number(post?.shares ?? post?.shares_count ?? 0) + 1
      );

      if (onShareComplete) {
        onShareComplete('feed', {
          success: true,
          data: response,
          shares: nextShares,
          message: shareMessage,
          feeling: feeling || undefined,
          location: location || undefined,
          audience,
          post: response?.post || {
            id: response?.id || response?.share_id || Date.now(),
            post_id: response?.id || response?.share_id || Date.now(),
            user_id: currentUser?.id,
            author: currentUser,
            user: currentUser,
            content: shareMessage || '',
            description: shareMessage || '',
            message: shareMessage || '',
            feeling: feeling || undefined,
            location: location || undefined,
            shared_post_id: isProduct ? (post.product_id || post.id) : (post.id || post.post_id),
            product_id: isProduct ? (post.product_id || post.id) : undefined,
            shared_post: response?.shared_post || post,
            shared_product: response?.shared_product || (isProduct ? post : undefined),
            item_type: isProduct ? 'product_share' : 'share',
            post_type: isProduct ? 'product_share' : 'share',
            type: isProduct ? 'product_share' : 'share',
            source: isProduct ? 'product_share' : 'share',
            created_at: new Date().toISOString(),
            shares: nextShares,
            shares_count: nextShares,
            likes_count: 0,
            reactions_count: 0,
            reactions: [],
            comments: [],
          },
        });
      }
      setIsPosting(false);
      onClose();
    } catch (err: any) {
      console.error('Share to feed failed:', err);
      setIsPosting(false);
      if (onShareComplete) {
        onShareComplete('feed', { success: false, error: err.message });
      }
    }
  };

  return createPortal(
    <div
      id="unera-share-screen-root"
      className="fixed inset-0 z-[9999999] w-screen h-[100dvh] min-h-screen bg-white text-gray-900 dark:bg-[#050B18] dark:text-[#F8FAFC] flex flex-col font-sans select-text overflow-hidden"
    >
      {/* Top Header App Bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#1E293B] bg-white dark:bg-[#050B18] shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (subModal !== 'none') {
                setSubModal('none');
              } else {
                onClose();
              }
            }}
            className="w-10 h-10 flex items-center justify-center -ml-2 rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1E293B] active:scale-95 transition-all cursor-pointer"
            aria-label="Back"
          >
            <i className="fas fa-arrow-left text-xl"></i>
          </button>
          <h1 className="text-[20px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {subModal === 'location'
              ? 'Add Location'
              : subModal === 'feeling'
              ? 'How are you feeling?'
              : 'Share to Feed / Profile'}
          </h1>
        </div>

        {/* Top Post button for quick mobile reach */}
        {subModal === 'none' ? (
          <button
            type="button"
            onClick={handlePostSubmit}
            disabled={isPosting}
            className="bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1565C0] text-white px-5 py-1.5 rounded-full font-bold text-[15px] transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPosting ? (
              <>
                <i className="fas fa-spinner fa-spin text-sm"></i>
                <span>POSTING...</span>
              </>
            ) : (
              <span>POST</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSubModal('none')}
            className="text-[#1877F2] font-bold text-[16px] px-2 py-1 cursor-pointer"
          >
            Done
          </button>
        )}
      </header>

      {/* Sub-view: Add location */}
      {subModal === 'location' && (
        <div className="flex-1 p-4 flex flex-col overflow-hidden max-w-xl mx-auto w-full">
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Where are you?"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-gray-100 dark:bg-[#1E293B] text-gray-900 dark:text-[#F8FAFC] px-4 py-3 pl-10 rounded-xl text-[16px] outline-none border border-gray-200 dark:border-[#334155]"
              autoFocus
            />
            <i className="fas fa-map-marker-alt absolute left-3.5 top-1/2 -translate-y-1/2 text-[#EC4899]"></i>
          </div>
          <div className="text-[13px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Popular locations
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto">
            {[
              'Nairobi, Kenya',
              'Dar es Salaam, TZ',
              'Kigali, Rwanda',
              'Kampala, Uganda',
              'Lagos, Nigeria',
              'Johannesburg, SA',
              'London, UK',
              'New York, USA',
              'Dubai, UAE',
              'Paris, France',
            ].map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => {
                  setLocation(loc);
                  setSubModal('none');
                }}
                className="p-3 bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-[#1E293B] rounded-xl text-left hover:bg-gray-100 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
              >
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-[15px]">
                  {loc}
                </div>
              </button>
            ))}
          </div>
          {location && (
            <button
              type="button"
              onClick={() => setSubModal('none')}
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold py-3.5 rounded-xl mt-4 text-[16px] transition-colors shadow-md cursor-pointer"
            >
              Confirm Location
            </button>
          )}
        </div>
      )}

      {/* Sub-view: Feeling / Activity */}
      {subModal === 'feeling' && (
        <div className="flex-1 p-4 overflow-y-auto max-w-xl mx-auto w-full">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Happy', emoji: '😊' },
              { label: 'Blessed', emoji: '🙏' },
              { label: 'Loved', emoji: '❤️' },
              { label: 'Excited', emoji: '🤩' },
              { label: 'Thankful', emoji: '🙌' },
              { label: 'Cool', emoji: '😎' },
              { label: 'Relaxed', emoji: '😌' },
              { label: 'Celebrating', emoji: '🥳' },
              { label: 'Proud', emoji: '🦁' },
              { label: 'Crazy', emoji: '😜' },
              { label: 'Sad', emoji: '😢' },
              { label: 'Tired', emoji: '🥱' },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setFeeling(f.label);
                  setSubModal('none');
                }}
                className={`p-3 rounded-xl border flex items-center gap-3 transition-colors cursor-pointer ${
                  feeling === f.label
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 text-amber-700 dark:text-amber-300 font-bold'
                    : 'bg-gray-50 dark:bg-[#0B1120] border-gray-200 dark:border-[#1E293B] text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1E293B]'
                }`}
              >
                <span className="text-2xl">{f.emoji}</span>
                <span className="text-[16px]">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Separate Page View */}
      {subModal === 'none' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 max-w-xl mx-auto w-full flex flex-col">
          <div>
            {/* User Profile Bar */}
            <div className="flex items-center gap-3 mb-3 relative">
              <img
                src={avatarFrom(currentUser)}
                alt={currentUser?.name || 'User'}
                className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-[#1E293B] shadow-sm flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1">
                  <span className="text-gray-900 dark:text-gray-100 font-bold text-[21px] leading-snug">
                    {currentUser?.name || currentUser?.username || 'User'}
                  </span>
                  {feeling && (
                    <span className="text-[15px] text-gray-600 dark:text-gray-300">
                      {' '}
                      is feeling{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {feeling}
                      </span>
                    </span>
                  )}
                  {location && (
                    <span className="text-[15px] text-gray-600 dark:text-gray-300">
                      {' '}
                      in{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {location}
                      </span>
                    </span>
                  )}
                </div>

                {/* Privacy Audience Selector: Public ▾ */}
                <div className="relative inline-block mt-1">
                  <button
                    type="button"
                    onClick={() => setShowAudienceMenu(!showAudienceMenu)}
                    className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer text-[16px] font-medium px-2 py-0.5 -ml-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#1E293B]"
                  >
                    <i className="fas fa-globe-americas text-[#1877F2] text-[17px]"></i>
                    <span>Share with: {audience}</span>
                    <i className="fas fa-caret-down text-gray-500 text-[13px] ml-0.5"></i>
                  </button>

                  {showAudienceMenu && (
                    <div className="absolute left-0 mt-1.5 w-56 bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-[#1E293B] rounded-xl shadow-2xl z-30 py-1 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setAudience('Public');
                          setShowAudienceMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[15px] hover:bg-gray-100 dark:hover:bg-[#1E293B] cursor-pointer ${
                          audience === 'Public'
                            ? 'font-bold text-[#1877F2]'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <i className="fas fa-globe-americas text-[#1877F2] w-5 text-center"></i>
                        <div>
                          <div className="font-semibold">Public</div>
                          <div className="text-[12px] text-gray-500 font-normal">
                            Anyone on UNERA
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudience('Friends');
                          setShowAudienceMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[15px] hover:bg-gray-100 dark:hover:bg-[#1E293B] cursor-pointer ${
                          audience === 'Friends'
                            ? 'font-bold text-[#1877F2]'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <i className="fas fa-user-friends text-[#45BD62] w-5 text-center"></i>
                        <div>
                          <div className="font-semibold">Friends</div>
                          <div className="text-[12px] text-gray-500 font-normal">
                            Your friends only
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudience('Only Me');
                          setShowAudienceMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[15px] hover:bg-gray-100 dark:hover:bg-[#1E293B] cursor-pointer ${
                          audience === 'Only Me'
                            ? 'font-bold text-[#1877F2]'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <i className="fas fa-lock text-[#E11D48] w-5 text-center"></i>
                        <div>
                          <div className="font-semibold">Only Me</div>
                          <div className="text-[12px] text-gray-500 font-normal">
                            Only you can see this
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Write something caption textarea */}
            <textarea
              ref={textareaRef}
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              placeholder="Write something"
              className="w-full bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-[19px] outline-none resize-none min-h-[100px] py-1 mb-3 leading-relaxed border-none focus:ring-0"
            />

            {/* Shared Post Preview Box - Exact layout from screenshot */}
            <div className="border border-gray-300 dark:border-[#334155] bg-white dark:bg-[#0A101F] rounded-xl overflow-hidden mb-5 flex items-stretch shadow-sm">
              {/* Left: Thumbnail image */}
              <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gray-100 dark:bg-black/30 flex-shrink-0 flex items-center justify-center overflow-hidden border-r border-gray-200 dark:border-[#1E293B]">
                {cardThumbnail ? (
                  <img
                    src={cardThumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <i className="fas fa-file-alt text-3xl text-gray-400"></i>
                )}
              </div>

              {/* Right: Title, Snippet, Author */}
              <div className="flex-1 p-2.5 sm:p-3 min-w-0 flex flex-col justify-center">
                <div className="font-bold text-[17px] text-gray-900 dark:text-gray-100 truncate mb-0.5">
                  {cardTitle}
                </div>
                <div className="text-[15px] text-gray-800 dark:text-gray-200 line-clamp-1 mb-1">
                  {snippet
                    ? snippet.length > 55
                      ? `${snippet.slice(0, 55)}...`
                      : snippet
                    : '...'}
                </div>
                <div className="text-[15px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
                  <span>{authorName}</span>
                  {Boolean(ownerAuthor?.is_verified) && (
                    <VerifiedBadge size={14} className="shrink-0" />
                  )}
                </div>
              </div>
            </div>

            {/* Action Items: Add location, Feeling/activity */}
            <div className="space-y-2 mb-4 pt-1 border-t border-gray-100 dark:border-[#1E293B]/70">
              <button
                type="button"
                onClick={() => setSubModal('location')}
                className="w-full flex items-center gap-3.5 text-left text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer py-1.5"
              >
                <i className="fas fa-map-marker-alt text-[#EC4899] text-xl w-6 text-center"></i>
                <span className="text-[17px] font-medium">Add location</span>
                {location && (
                  <span className="ml-auto text-[13px] bg-pink-100 dark:bg-pink-900/40 text-[#EC4899] px-2.5 py-0.5 rounded-full font-semibold truncate max-w-[150px]">
                    {location}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSubModal('feeling')}
                className="w-full flex items-center gap-3.5 text-left text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer py-1.5"
              >
                <i className="far fa-smile text-[#F59E0B] text-xl w-6 text-center"></i>
                <span className="text-[17px] font-medium">Feeling/activity</span>
                {feeling && (
                  <span className="ml-auto text-[13px] bg-amber-100 dark:bg-amber-900/40 text-[#F59E0B] px-2.5 py-0.5 rounded-full font-semibold">
                    {feeling}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Prominently Pulled-Up Primary Full-Width POST Button */}
          <div className="pt-2 pb-6">
            <button
              type="button"
              onClick={handlePostSubmit}
              disabled={isPosting}
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] active:bg-[#1565C0] text-white font-bold text-[18px] tracking-wide py-3.5 rounded-xl transition-all shadow-md uppercase cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isPosting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>POSTING...</span>
                </>
              ) : (
                <span>POST</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
