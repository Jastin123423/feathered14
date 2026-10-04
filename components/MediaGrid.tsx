import React, { useState } from 'react';

interface MediaItem {
  url: string;
  alt?: string;
}

interface MediaGridProps {
  media: MediaItem[];
  onOpen?: (url: string) => void;
  maxHeight?: string;
}

export const MediaGrid: React.FC<MediaGridProps> = ({ 
  media, 
  onOpen, 
  maxHeight = '420px' 
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!media || media.length === 0) return null;

  const handleClick = (url: string, index: number) => {
    setActiveIndex(index);
    if (onOpen) onOpen(url);
  };

  // Handle different grid layouts based on number of images
  const getGridClass = () => {
    switch (media.length) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2 gap-1';
      case 3:
        return 'grid-cols-2 gap-1';
      case 4:
        return 'grid-cols-2 gap-1';
      default:
        return 'grid-cols-2 gap-1';
    }
  };

  // For 3 images, special layout
  const isThreeImages = media.length === 3;

  return (
    <div className="w-full">
      {/* Single image */}
      {media.length === 1 && (
        <div className="w-full">
          <img
            src={media[0].url}
            alt={media[0].alt || 'Post image'}
            className="w-full h-auto object-contain bg-black cursor-pointer"
            style={{ maxHeight }}
            onClick={() => handleClick(media[0].url, 0)}
            loading="lazy"
          />
        </div>
      )}

      {/* Two images */}
      {media.length === 2 && (
        <div className="grid grid-cols-2 gap-1">
          {media.map((item, index) => (
            <div key={index} className="aspect-square overflow-hidden">
              <img
                src={item.url}
                alt={item.alt || `Post image ${index + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => handleClick(item.url, index)}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* Three images - special layout */}
      {isThreeImages && (
        <div className="grid grid-cols-2 gap-1">
          <div className="row-span-2 aspect-square overflow-hidden">
            <img
              src={media[0].url}
              alt={media[0].alt || 'Post image 1'}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => handleClick(media[0].url, 0)}
              loading="lazy"
            />
          </div>
          <div className="aspect-square overflow-hidden">
            <img
              src={media[1].url}
              alt={media[1].alt || 'Post image 2'}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => handleClick(media[1].url, 1)}
              loading="lazy"
            />
          </div>
          <div className="aspect-square overflow-hidden">
            <img
              src={media[2].url}
              alt={media[2].alt || 'Post image 3'}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => handleClick(media[2].url, 2)}
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Four or more images */}
      {media.length >= 4 && (
        <div className="grid grid-cols-2 gap-1">
          {media.slice(0, 4).map((item, index) => (
            <div key={index} className="aspect-square overflow-hidden relative">
              <img
                src={item.url}
                alt={item.alt || `Post image ${index + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => handleClick(item.url, index)}
                loading="lazy"
              />
              {/* Show "+X" overlay for the 4th image if there are more */}
              {index === 3 && media.length > 4 && (
                <div 
                  className="absolute inset-0 bg-black/70 flex items-center justify-center cursor-pointer"
                  onClick={() => handleClick(media[3].url, 3)}
                >
                  <span className="text-white text-2xl font-bold">
                    +{media.length - 4}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image preview modal */}
      {activeIndex !== null && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setActiveIndex(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              className="absolute top-4 right-4 text-white text-2xl z-10"
              onClick={() => setActiveIndex(null)}
            >
              ✕
            </button>
            <img
              src={media[activeIndex].url}
              alt={media[activeIndex].alt || `Post image ${activeIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain"
            />
            
            {/* Navigation arrows */}
            {media.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-2xl bg-black/50 p-2 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndex(prev => prev === 0 ? media.length - 1 : (prev! - 1));
                  }}
                >
                  ←
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-2xl bg-black/50 p-2 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndex(prev => prev === media.length - 1 ? 0 : (prev! + 1));
                  }}
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaGrid;
