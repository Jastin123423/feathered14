import { useState, useEffect, useCallback } from 'react';

export interface SavedPostItem {
  id: string | number;
  type: 'video' | 'normal';
  savedAt: number;
  post: any;
}

const STORAGE_KEY = 'unera_saved_posts';
const CHANGE_EVENT = 'unera_saved_posts_changed';

/**
 * Determine whether a post or reel item is considered a video post
 */
export const detectIsVideoPost = (post: any, explicitIsVideo?: boolean): boolean => {
  if (explicitIsVideo !== undefined) return explicitIsVideo;
  if (!post) return false;
  if (post.type === 'video' || post.media_type === 'video' || post.is_video) return true;
  if (post.video_url || post.videoUrl || post.reel_url) return true;
  if (Array.isArray(post.video_urls) && post.video_urls.length > 0) return true;
  if (Array.isArray(post.media_urls) && post.media_urls.some((url: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url))) return true;
  if (typeof post.media_url === 'string' && /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(post.media_url)) return true;
  return false;
};

/**
 * Retrieve all saved posts from localStorage
 */
export const getSavedPosts = (): SavedPostItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read saved posts from localStorage:', e);
    return [];
  }
};

/**
 * Check whether a post or reel is saved
 */
export const isPostSaved = (id: string | number): boolean => {
  if (id === undefined || id === null) return false;
  const list = getSavedPosts();
  return list.some((item) => String(item.id) === String(id));
};

const sanitizePostForStorage = (p: any): any => {
  if (!p || typeof p !== 'object') return p;
  try {
    return JSON.parse(
      JSON.stringify(p, (key, value) => {
        if (key && (key.startsWith('_') || key.startsWith('$'))) return undefined;
        if (typeof value === 'function') return undefined;
        return value;
      })
    );
  } catch {
    return {
      id: p.id,
      post_id: p.post_id || p.id,
      reel_id: p.reel_id,
      content: p.content,
      caption: p.caption,
      media_url: p.media_url,
      video_url: p.video_url,
      reel_url: p.reel_url,
      media_urls: Array.isArray(p.media_urls) ? p.media_urls : [],
      media_type: p.media_type,
      type: p.type,
      user_id: p.user_id,
      user: p.user ? { id: p.user.id, name: p.user.name, username: p.user.username, profile_image_url: p.user.profile_image_url } : undefined,
      author: p.author ? { id: p.author.id, name: p.author.name, username: p.author.username, profile_image_url: p.author.profile_image_url } : undefined,
      reactions_count: p.reactions_count || 0,
      comments_count: p.comments_count || 0,
      shares_count: p.shares_count || 0,
      created_at: p.created_at || new Date().toISOString(),
    };
  }
};

/**
 * Toggle saved status for a post. Returns true if now saved, false if removed.
 */
export const toggleSavePost = (post: any, explicitIsVideo?: boolean): boolean => {
  if (!post || post.id === undefined || post.id === null) return false;
  const list = getSavedPosts();
  const idStr = String(post.id);
  const existingIndex = list.findIndex((item) => String(item.id) === idStr);

  let nowSaved = false;
  let updatedList: SavedPostItem[];

  if (existingIndex >= 0) {
    // Remove from saved
    updatedList = list.filter((_, idx) => idx !== existingIndex);
    nowSaved = false;
  } else {
    // Add to saved
    const isVideo = detectIsVideoPost(post, explicitIsVideo);
    const newItem: SavedPostItem = {
      id: post.id,
      type: isVideo ? 'video' : 'normal',
      savedAt: Date.now(),
      post: sanitizePostForStorage(post),
    };
    updatedList = [newItem, ...list];
    nowSaved = true;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, {
          detail: { id: post.id, isSaved: nowSaved },
        })
      );
    }
  } catch (e) {
    console.error('Failed to save posts to localStorage:', e);
  }

  return nowSaved;
};

/**
 * Remove a post from saved posts
 */
export const removeSavedPost = (id: string | number): void => {
  if (id === undefined || id === null) return;
  const list = getSavedPosts();
  const updatedList = list.filter((item) => String(item.id) !== String(id));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, {
          detail: { id, isSaved: false },
        })
      );
    }
  } catch (e) {
    console.error('Failed to remove saved post:', e);
  }
};

/**
 * React hook to reactively track if a specific post is saved
 */
export const useIsPostSaved = (id: string | number): boolean => {
  const [saved, setSaved] = useState<boolean>(() => isPostSaved(id));

  useEffect(() => {
    setSaved(isPostSaved(id));

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail || String(customEvent.detail.id) === String(id)) {
        setSaved(isPostSaved(id));
      }
    };

    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [id]);

  return saved;
};

/**
 * React hook to track all saved posts reactively
 */
export const useSavedPosts = () => {
  const [savedPosts, setSavedPosts] = useState<SavedPostItem[]>(() => getSavedPosts());

  const refresh = useCallback(() => {
    setSavedPosts(getSavedPosts());
  }, []);

  useEffect(() => {
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  return {
    savedPosts,
    refresh,
    remove: removeSavedPost,
    toggle: toggleSavePost,
    isSaved: isPostSaved,
  };
};
