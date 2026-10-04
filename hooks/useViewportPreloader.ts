// hooks/useViewportPreloader.ts
import { useEffect, useRef } from 'react';
import { imagePreloader } from '../utils/imagePreloader';

export const useViewportPreloader = (feedItems: any[], options = {
  batchSize: 5,
  preloadAhead: 3
}) => {
  const observerRef = useRef<IntersectionObserver>();
  const preloadQueueRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const postId = entry.target.getAttribute('data-post-id');
            if (postId) {
              const post = feedItems.find(item => item.id === Number(postId));
              if (post?.media_urls) {
                preloadPostImages(post);
              }
              
              const currentIndex = feedItems.findIndex(item => item.id === Number(postId));
              for (let i = 1; i <= options.preloadAhead; i++) {
                const nextPost = feedItems[currentIndex + i];
                if (nextPost?.media_urls) {
                  preloadPostImages(nextPost, 'low');
                }
              }
            }
          }
        });
      },
      {
        rootMargin: '100px',
        threshold: 0.01
      }
    );
    
    document.querySelectorAll('[data-post-id]').forEach(el => {
      observerRef.current?.observe(el);
    });
    
    return () => observerRef.current?.disconnect();
  }, [feedItems]);
  
  const preloadPostImages = (post: any, priority: 'high' | 'low' = 'high') => {
    if (!post.media_urls) return;
    
    const urls = post.media_urls;
    const key = urls.high;
    
    if (preloadQueueRef.current.has(key)) return;
    preloadQueueRef.current.add(key);
    
    imagePreloader.preloadImageSet({
      placeholder: urls.placeholder,
      low: urls.low,
      high: urls.high
    }, priority);
  };
  
  return { preloadPostImages };
};
