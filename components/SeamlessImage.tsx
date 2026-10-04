// components/SeamlessImage.tsx
import React, { useState, useEffect, useRef, memo } from 'react';
import { imagePreloader } from '../utils/imagePreloader';
import { ImageVersions } from '../types/media';

interface SeamlessImageProps {
  urls: ImageVersions;
  alt: string;
  className?: string;
  aspectRatio?: number;
  priority?: 'high' | 'low' | 'auto';
  onLoad?: () => void;
}

export const SeamlessImage = memo(({
  urls,
  alt,
  className = '',
  aspectRatio,
  priority = 'auto',
  onLoad
}: SeamlessImageProps) => {
  const [currentSrc, setCurrentSrc] = useState(urls.placeholder);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const lowLoadedRef = useRef(false);
  const highLoadedRef = useRef(false);
  
  // Load low quality immediately after mount
  useEffect(() => {
    if (!urls.low) return;
    
    const lowImg = new Image();
    lowImg.src = urls.low;
    lowImg.fetchPriority = 'low';
    
    lowImg.decode()
      .then(() => {
        if (!lowLoadedRef.current && imgRef.current) {
          lowLoadedRef.current = true;
          requestAnimationFrame(() => {
            if (imgRef.current) {
              imgRef.current.src = urls.low;
              setCurrentSrc(urls.low);
            }
          });
        }
      })
      .catch(() => {});
      
    return () => { lowImg.src = ''; };
  }, [urls.low]);
  
  // Track for high quality when in viewport
  useEffect(() => {
    if (!imgRef.current || !urls.high) return;
    
    imagePreloader.trackImage(imgRef.current, urls.high);
    
    return () => {
      if (imgRef.current) {
        imagePreloader.untrackImage(imgRef.current);
      }
    };
  }, [urls.high]);
  
  // High priority preloading
  useEffect(() => {
    if (priority === 'high') {
      const highImg = new Image();
      highImg.src = urls.high;
      highImg.fetchPriority = 'high';
      highImg.decode()
        .then(() => {
          if (!highLoadedRef.current && imgRef.current) {
            highLoadedRef.current = true;
            if (isElementInViewport(imgRef.current)) {
              requestAnimationFrame(() => {
                if (imgRef.current) {
                  imgRef.current.src = urls.high;
                  setCurrentSrc(urls.high);
                }
              });
            }
          }
        })
        .catch(() => {});
    }
  }, [priority, urls.high]);
  
  const handleLoad = () => {
    setLoaded(true);
    onLoad?.();
  };
  
  const getBlurAmount = () => {
    if (currentSrc === urls.placeholder) return 'blur(20px)';
    if (currentSrc === urls.low) return 'blur(5px)';
    return 'blur(0)';
  };
  
  return (
    <div 
      className={`seamless-image-container ${className}`}
      style={{
        aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
        backgroundColor: '#1a1a1a',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: aspectRatio ? 'auto' : '200px'
      }}
    >
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        onLoad={handleLoad}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: getBlurAmount(),
          transition: 'filter 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: 'translateZ(0)',
          willChange: 'filter, transform',
          backfaceVisibility: 'hidden'
        }}
        loading="lazy"
      />
      
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.02)',
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease',
          opacity: loaded ? 0 : 1
        }}
      />
    </div>
  );
});

const isElementInViewport = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight + 100 &&
    rect.bottom > -100
  );
};
