import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEllipsisH,
  faGlobe,
  faCheckCircle,
  faPhone,
  faEnvelope,
  faExternalLinkAlt,
  faImage,
  faVideo,
  faChevronLeft,
  faChevronRight,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import { AdType, CTAButton } from '../types';

interface AdPreviewProps {
  data: {
    name?: string;
    type: AdType;
    mediaUrl: string;
    mediaUrls?: string[]; // Add support for multiple media
    description: string;
    cta: CTAButton;
    link?: string;
    phone?: string;
    email?: string;
  };
  advertiserName?: string;
  advertiserAvatar?: string;
  isVerified?: boolean;
  isFullView?: boolean;
}

export default function AdPreview({ 
  data, 
  advertiserName = "Sponsored", 
  advertiserAvatar, 
  isVerified = false,
  isFullView 
}: AdPreviewProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);

  // Get all media URLs
  const mediaUrls = data.mediaUrls && data.mediaUrls.length > 0 
    ? data.mediaUrls 
    : data.mediaUrl 
      ? [data.mediaUrl] 
      : [];

  const hasMultipleMedia = mediaUrls.length > 1;
  const isVideo = data.type === 'video';

  // Extract hostname from link
  const getHostname = (url?: string) => {
    if (!url) return 'example.com';
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      return hostname;
    } catch {
      return 'example.com';
    }
  };

  // Get contact info display
  const getContactDisplay = () => {
    if (data.link) return getHostname(data.link);
    if (data.phone) return data.phone;
    if (data.email) return data.email;
    return 'example.com';
  };

  // Get contact icon
  const getContactIcon = () => {
    if (data.link) return faExternalLinkAlt;
    if (data.phone) return faPhone;
    if (data.email) return faEnvelope;
    return faGlobe;
  };

  // Handle image navigation
  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedImageIndex((prev) => (prev + 1) % mediaUrls.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedImageIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length);
  };

  // Render media grid for multiple images
  const renderMediaGrid = () => {
    if (mediaUrls.length === 0) {
      return (
        <div className="w-full aspect-square bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
          <span className="text-zinc-400 text-sm">Ad Preview</span>
        </div>
      );
    }

    if (isVideo) {
      return (
        <div className="w-full aspect-square bg-black relative">
          <video 
            src={mediaUrls[0]} 
            className="w-full h-full object-cover" 
            controls={false}
            muted 
            loop 
            playsInline
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <FontAwesomeIcon icon={faVideo} className="w-12 h-12 text-white opacity-80" />
          </div>
        </div>
      );
    }

    // Grid layouts based on number of images
    if (mediaUrls.length === 1) {
      return (
        <div className="w-full aspect-square bg-zinc-100">
          <img 
            src={mediaUrls[0]} 
            alt="Ad preview" 
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setShowLightbox(true)}
            onError={(e) => {
              e.currentTarget.src = 'https://via.placeholder.com/500x500?text=Ad+Image';
            }}
          />
        </div>
      );
    }

    if (mediaUrls.length === 2) {
      return (
        <div className="grid grid-cols-2 gap-0.5 bg-black w-full aspect-square">
          {mediaUrls.map((url, idx) => (
            <div key={idx} className="relative overflow-hidden bg-zinc-800">
              <img 
                src={url} 
                alt={`Ad preview ${idx + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => {
                  setSelectedImageIndex(idx);
                  setShowLightbox(true);
                }}
                onError={(e) => {
                  e.currentTarget.src = 'https://via.placeholder.com/250x250?text=Ad';
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    if (mediaUrls.length === 3) {
      return (
        <div className="grid grid-cols-2 gap-0.5 bg-black w-full aspect-square">
          <div className="row-span-2 relative overflow-hidden bg-zinc-800">
            <img 
              src={mediaUrls[0]} 
              alt="Ad preview 1"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => {
                setSelectedImageIndex(0);
                setShowLightbox(true);
              }}
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/250x250?text=Ad';
              }}
            />
          </div>
          <div className="relative overflow-hidden bg-zinc-800">
            <img 
              src={mediaUrls[1]} 
              alt="Ad preview 2"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => {
                setSelectedImageIndex(1);
                setShowLightbox(true);
              }}
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/250x250?text=Ad';
              }}
            />
          </div>
          <div className="relative overflow-hidden bg-zinc-800">
            <img 
              src={mediaUrls[2]} 
              alt="Ad preview 3"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => {
                setSelectedImageIndex(2);
                setShowLightbox(true);
              }}
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/250x250?text=Ad';
              }}
            />
          </div>
        </div>
      );
    }

    // 4 or more images
    return (
      <div className="grid grid-cols-2 gap-0.5 bg-black w-full aspect-square">
        {mediaUrls.slice(0, 4).map((url, idx) => (
          <div key={idx} className="relative overflow-hidden bg-zinc-800">
            <img 
              src={url} 
              alt={`Ad preview ${idx + 1}`}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => {
                setSelectedImageIndex(idx);
                setShowLightbox(true);
              }}
              onError={(e) => {
                e.currentTarget.src = 'https://via.placeholder.com/250x250?text=Ad';
              }}
            />
            {idx === 3 && mediaUrls.length > 4 && (
              <div 
                className="absolute inset-0 bg-black/70 flex items-center justify-center cursor-pointer"
                onClick={() => {
                  setSelectedImageIndex(3);
                  setShowLightbox(true);
                }}
              >
                <span className="text-white font-bold text-lg">+{mediaUrls.length - 3}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Lightbox for fullscreen image viewing
  const renderLightbox = () => {
    if (!showLightbox) return null;

    return (
      <div 
        className="fixed inset-0 bg-black/95 z-[1000] flex items-center justify-center"
        onClick={() => setShowLightbox(false)}
      >
        <button 
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          onClick={() => setShowLightbox(false)}
        >
          <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-white" />
        </button>

        {hasMultipleMedia && (
          <>
            <button 
              className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              onClick={prevImage}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-5 h-5 text-white" />
            </button>
            <button 
              className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              onClick={nextImage}
            >
              <FontAwesomeIcon icon={faChevronRight} className="w-5 h-5 text-white" />
            </button>
          </>
        )}

        <img 
          src={mediaUrls[selectedImageIndex]} 
          alt="Full size preview"
          className="max-w-[90vw] max-h-[90vh] object-contain"
          onClick={(e) => e.stopPropagation()}
        />

        {hasMultipleMedia && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full text-white text-sm">
            {selectedImageIndex + 1} / {mediaUrls.length}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`mx-auto bg-white rounded-lg overflow-hidden shadow-xl text-black font-sans transition-all duration-500 border border-zinc-200 ${
        isFullView ? 'w-full max-w-[500px]' : 'w-[320px] md:w-[380px]'
      }`}>
        {/* Sponsored Label - Free Promotion */}
        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            FREE PROMOTION
          </span>
          <span className="text-xs font-medium text-zinc-500">
            Sponsored
          </span>
        </div>

        {/* Header - Avatar and Name */}
        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-600 flex-shrink-0">
              {advertiserAvatar ? (
                <img 
                  src={advertiserAvatar} 
                  alt={advertiserName} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(advertiserName)}&background=1877F2&color=fff&bold=true`;
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
                  {advertiserName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            
            {/* Name and Verified Badge */}
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-zinc-900">
                {advertiserName}
              </span>
              {isVerified && (
                <FontAwesomeIcon 
                  icon={faCheckCircle} 
                  className="w-4 h-4 text-blue-500" 
                />
              )}
            </div>
          </div>
          
          {/* Three dots menu */}
          <button className="p-1.5 hover:bg-zinc-100 rounded-full transition-colors">
            <FontAwesomeIcon icon={faEllipsisH} className="w-4 h-4 text-zinc-600" />
          </button>
        </div>

        {/* Advertisement Media - Grid Layout */}
        {renderMediaGrid()}

        {/* Ad Description */}
        {data.description && (
          <div className="px-3 py-3">
            <p className="text-sm leading-relaxed text-zinc-800">
              {data.description}
            </p>
          </div>
        )}

        {/* Free Promotion Badge */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <span className="font-medium">✨ Free Promotion</span>
            <span className="text-emerald-400">•</span>
            <span className="text-emerald-600">No cost to boost</span>
          </div>
        </div>

        {/* Link/Contact Info and CTA Button */}
        <div className="px-3 pb-3">
          {/* Website/Contact display */}
          <div className="flex items-center gap-2 mb-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
            <FontAwesomeIcon icon={getContactIcon()} className="w-3 h-3" />
            <span className="truncate font-medium">{getContactDisplay()}</span>
          </div>
          
          {/* CTA Button */}
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
            {data.cta}
          </button>
        </div>

        {/* Free Promotion Footer */}
        <div className="px-3 pb-3 text-center">
          <span className="text-[10px] text-zinc-400">
            Free advertising on UNERA • Reach more people at no cost
          </span>
        </div>
      </div>

      {/* Lightbox for fullscreen viewing */}
      {renderLightbox()}
    </>
  );
}
