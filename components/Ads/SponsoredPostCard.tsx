import React, { useEffect, useState } from "react";
import { User } from "../../types";
import { VerifiedBadge } from "../VerifiedBadge";

interface SponsoredPostCardProps {
  ad: any;
  currentUser?: User | null;
  onProfileClick?: (id: number) => void;
  onAnalyticsClick?: (adId: number) => void;
  onClick?: () => void;
  onHideAd?: (adId: number) => void;
  onReportAd?: (adId: number) => void;
  onOpenComments?: (post: any) => void;
  onReact?: (post: any, type: string) => void;
  onShare?: (post: any) => void;
}

export const SponsoredPostCard: React.FC<SponsoredPostCardProps> = ({
  ad,
  currentUser,
  onProfileClick,
  onAnalyticsClick,
  onClick,
  onHideAd,
  onReportAd,
  onOpenComments,
  onReact,
  onShare,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [imageError, setImageError] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const isOwner = currentUser?.id === ad.user_id || currentUser?.id === ad.advertiser_id;

  // Handle clicks outside menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Record impression and view
  useEffect(() => {
    if (!ad?.id) return;
    const uid = String(currentUser?.id || 0);
    fetch("/api/ads/impression", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": uid,
      },
      body: JSON.stringify({
        ad_id: Number(ad.id),
        user_id: currentUser?.id || 0,
      }),
    }).catch(err => console.error('Failed to record impression:', err));

    fetch("/api/ads/view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": uid,
      },
      body: JSON.stringify({
        ad_id: Number(ad.id),
        user_id: currentUser?.id || 0,
      }),
    }).catch(() => {});
  }, [ad?.id, currentUser?.id]);

  const handleClick = () => {
    if (!ad?.id) return;
    fetch("/api/ads/click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": String(currentUser?.id || 0),
      },
      body: JSON.stringify({
        ad_id: Number(ad.id),
        user_id: currentUser?.id || 0,
      }),
    }).catch(err => console.error('Failed to record click:', err));

    const targetUrl = ad.destination_url || ad.cta_url;
    if (targetUrl) {
      const dest = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
      window.open(dest, '_blank', 'noopener,noreferrer');
    }
    
    onClick?.();
  };

  const handleCTAClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClick();
  };

  // Get CTA button text based on type
  const getCTAText = () => {
    if (ad.cta_text) return ad.cta_text;
    if (ad.cta_button) return ad.cta_button;
    
    switch(ad.cta_type) {
      case 'phone': return 'Call Now';
      case 'email': return 'Email Us';
      case 'link': return 'Learn More';
      default: return 'Learn More';
    }
  };

  // Get media URL (either from media_url or first item in media_urls)
  const mediaUrl = !imageError ? (ad.media_url || (ad.media_urls && ad.media_urls[0]) || null) : null;

  // Get title/headline
  const title = ad.headline || ad.title || ad.campaign_name || 'Sponsored';

  // Get description
  const description = ad.description || ad.content || '';

  // Get advertiser name
  const advertiserName = ad.name || ad.advertiser_name || 'Sponsored';

  // Get profile image
  const profileImage = ad.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(advertiserName)}&background=1877F2&color=fff`;

  // Determine if it's video
  const isVideo = ad.type === 'video' || ad.media_type === 'video' || Boolean(ad.video_url) || Boolean(mediaUrl && typeof mediaUrl === 'string' && mediaUrl.match(/\.(mp4|webm|mov|m4v|ogg)/i));

  return (
    <div className="w-full bg-[#0F172A] border-b-[8px] border-[#050B18] overflow-hidden">
      {/* HEADER */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center">
          <img
            src={profileImage}
            className="w-10 h-10 rounded-full mr-3 object-cover"
            alt={advertiserName}
            onError={(e) => {
              const target = e.currentTarget;
              target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(advertiserName)}&background=1877F2&color=fff`;
            }}
          />

          <div>
            <div
              className="font-semibold text-[#F8FAFC] text-[17px] cursor-pointer hover:underline"
              onClick={() => onProfileClick?.(ad.user_id || ad.advertiser_id)}
            >
              {advertiserName}
              {Boolean(ad.is_verified) && (
                <VerifiedBadge size={14} className="ml-1.5 shrink-0" />
              )}
            </div>

            <div className="flex items-center text-xs text-[#94A3B8] gap-1.5 mt-0.5">
              <span className="font-medium text-[#B0B3B8]">Ad</span>
              <span>·</span>
              <i className="fas fa-globe-americas text-[11px] text-[#94A3B8]" title="Public"></i>
              {ad.reason && (
                <>
                  <span>·</span>
                  <span className="text-[#94A3B8] truncate max-w-[160px]">{ad.reason}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-8 h-8 rounded-full hover:bg-[#1E293B] flex items-center justify-center transition-colors"
          >
            <i className="fas fa-ellipsis-h text-[#94A3B8]"></i>
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-10 w-56 bg-[#0F172A] rounded-xl shadow-2xl border border-[#1E293B] z-50 py-2">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onHideAd?.(ad.id);
                }}
                className="w-full px-4 py-2 hover:bg-[#1E293B] text-left text-[#F8FAFC] text-sm flex items-center gap-2"
              >
                <i className="fas fa-eye-slash text-[#94A3B8] w-5"></i>
                Hide ad
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onReportAd?.(ad.id);
                }}
                className="w-full px-4 py-2 hover:bg-[#1E293B] text-left text-[#F8FAFC] text-sm flex items-center gap-2"
              >
                <i className="fas fa-flag text-[#94A3B8] w-5"></i>
                Report ad
              </button>
              <div className="border-t border-[#1E293B] my-2"></div>
              <div className="px-4 py-2 text-[#94A3B8] text-xs">
                Ad ID: {ad.id}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TITLE */}
      {title && (
        <div className="px-3 pb-1">
          <h3 className="text-[#E4E6EB] font-bold text-[20px]">
            {title}
          </h3>
        </div>
      )}

      {/* DESCRIPTION */}
      {description && (
        <div className="px-3 pb-3 text-[#B0B3B8] text-[16px]">
          {description}
        </div>
      )}

      {/* MEDIA - Video or Image */}
      {mediaUrl && isVideo ? (
        <div className="w-full bg-black relative">
          <video
            src={mediaUrl}
            controls
            playsInline
            muted
            preload="metadata"
            className="w-full max-h-[460px] object-contain bg-black"
            onPlay={() => {
              fetch("/api/ads/view", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-user-id": String(currentUser?.id || 0) },
                body: JSON.stringify({ ad_id: Number(ad.id), user_id: currentUser?.id || 0 }),
              }).catch(() => {});
            }}
          />
        </div>
      ) : mediaUrl ? (
        <div 
          onClick={handleClick}
          className="cursor-pointer"
        >
          <img
            src={mediaUrl}
            alt={title}
            className="w-full max-h-[400px] object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div 
          onClick={handleClick}
          className="cursor-pointer bg-gradient-to-r from-[#1877F2] to-[#166FE5] h-32 flex items-center justify-center"
        >
          <i className="fas fa-ad text-white text-5xl opacity-50"></i>
        </div>
      )}

      {/* CTA BUTTON - Slim Facebook blue professional style */}
      {(ad.destination_url || ad.cta_url || ad.cta_text || ad.cta_button) && (
        <div className="px-3.5 py-2.5 bg-[#0B1120] border-t border-[#1E293B] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] uppercase tracking-wider text-[#94A3B8] font-bold block truncate">
              {(() => {
                try {
                  const target = ad.destination_url || ad.cta_url;
                  if (!target) return 'VISIT WEBSITE';
                  return new URL(target.startsWith('http') ? target : `https://${target}`).hostname.replace('www.', '');
                } catch {
                  return 'VISIT WEBSITE';
                }
              })()}
            </span>
            <span className="text-[14px] text-[#F8FAFC] font-semibold block truncate leading-tight">
              {title}
            </span>
          </div>
          <button
            onClick={handleCTAClick}
            className="shrink-0 bg-[#1877F2] hover:bg-[#166FE5] active:scale-[0.98] text-white font-semibold text-[13.5px] px-4 py-2 rounded-md transition-all shadow-sm flex items-center gap-1.5 focus:outline-none"
          >
            <span>{getCTAText()}</span>
            <i className="fas fa-chevron-right text-[10px] opacity-80"></i>
          </button>
        </div>
      )}

      {/* ACTIONS - Facebook style actions */}
      <div className="flex justify-between text-sm px-4 py-3 border-t border-[#3E4042] text-[#B0B3B8]">
        <button
          onClick={() => onReact?.(ad, 'like')}
          className="hover:text-[#E4E6EB] flex items-center gap-1 flex-1 justify-center py-1 cursor-pointer transition-colors"
        >
          <i className="far fa-thumbs-up text-[18px]"></i>
          <span className="text-[15px]">Like</span>
        </button>

        <button
          onClick={() => onOpenComments?.(ad)}
          className="hover:text-[#E4E6EB] flex items-center gap-1 flex-1 justify-center py-1 cursor-pointer transition-colors"
        >
          <i className="far fa-comment text-[18px]"></i>
          <span className="text-[15px]">Comment</span>
        </button>

        <button
          onClick={() => onShare?.(ad)}
          className="hover:text-[#E4E6EB] flex items-center gap-1 flex-1 justify-center py-1 cursor-pointer transition-colors"
        >
          <i className="fas fa-share text-[18px]"></i>
          <span className="text-[15px]">Share</span>
        </button>

        {/* Advertiser analytics */}
        {isOwner && (
          <button
            onClick={() => onAnalyticsClick?.(ad.id)}
            className="text-green-500 font-semibold hover:text-green-400 flex items-center gap-1 flex-1 justify-center py-1"
          >
            <i className="fas fa-chart-bar text-[18px]"></i>
            <span className="text-[15px]">Analytics</span>
          </button>
        )}
      </div>

      {/* Campaign info */}
      {ad.campaign_name && (
        <div className="px-4 pb-2 text-[#B0B3B8] text-[13px] border-t border-[#3E4042] pt-2">
          <i className="fas fa-bullhorn mr-1"></i>
          Campaign: {ad.campaign_name}
          {ad.target_location && (
            <>
              <span className="mx-1">·</span>
              <i className="fas fa-map-marker-alt mr-1"></i>
              {ad.target_location}
            </>
          )}
        </div>
      )}
    </div>
  );
};
