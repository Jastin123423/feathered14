import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Image as ImageIcon,
  Film,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  Globe,
  Loader2,
  Check,
  Tag,
  DollarSign,
  ArrowLeft,
} from 'lucide-react';
import { User } from '../../types';

interface EditPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: any;
  currentUser: User | null;
  onSaveSuccess?: (updatedPost: any) => void;
}

const safeParseJsonArray = <T = any>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const EditPostModal: React.FC<EditPostModalProps> = ({
  isOpen,
  onClose,
  post,
  currentUser,
  onSaveSuccess,
}) => {
  if (!isOpen || !post) return null;

  const isEvent = post.type === 'event' || post.item_type === 'event' || Boolean(post.event_date);
  const isProduct =
    post.type === 'product' ||
    post.item_type === 'product' ||
    Boolean(post.product_id) ||
    Boolean(post.seller_id) ||
    Boolean(post.main_price !== undefined || post.price !== undefined);

  const postId = post.id || post.post_id || post.event_id || post.product_id;

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Text / Caption state
  const [content, setContent] = useState<string>(() => {
    return String(post.content || post.caption || post.description || post.text || '');
  });

  // Product specific fields
  const [productTitle, setProductTitle] = useState<string>(() => String(post.title || ''));
  const [productCategory, setProductCategory] = useState<string>(() => String(post.category || 'Other'));
  const [productMainPrice, setProductMainPrice] = useState<string>(() =>
    post.main_price !== undefined ? String(post.main_price) : post.price !== undefined ? String(post.price) : ''
  );
  const [productDiscountPrice, setProductDiscountPrice] = useState<string>(() =>
    post.discount_price !== undefined && post.discount_price !== null ? String(post.discount_price) : ''
  );
  const [productCountry, setProductCountry] = useState<string>(() => String(post.country || ''));
  const [productAddress, setProductAddress] = useState<string>(() => String(post.address || ''));
  const [productQuantity, setProductQuantity] = useState<string>(() =>
    post.quantity !== undefined ? String(post.quantity) : '1'
  );

  // Event specific fields
  const [eventTitle, setEventTitle] = useState<string>(() => String(post.title || ''));
  const [eventDate, setEventDate] = useState<string>(() => {
    if (!post.event_date) return '';
    try {
      const d = new Date(post.event_date);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 16);
      }
    } catch {
      // fallback
    }
    return String(post.event_date || '');
  });
  const [eventLocation, setEventLocation] = useState<string>(() => String(post.location || ''));
  const [eventVisibility, setEventVisibility] = useState<string>(() => String(post.visibility || 'public'));
  const [eventCoverUrl, setEventCoverUrl] = useState<string>(() => String(post.cover_url || post.coverUrl || ''));

  // Media items state (for posts, videos, and products)
  const [existingMedia, setExistingMedia] = useState<any[]>(() => {
    const parsedMedia = safeParseJsonArray(post.media);
    if (parsedMedia.length > 0) return parsedMedia;

    const parsedUrls = safeParseJsonArray(post.media_urls || post.images);
    if (parsedUrls.length > 0) {
      return parsedUrls.map((url: any) => {
        if (typeof url === 'object' && url !== null && url.url) return url;
        const u = String(url ?? '').toLowerCase();
        return {
          url: String(url ?? ''),
          type:
            u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') || u.includes('video')
              ? 'video'
              : 'image',
        };
      });
    }

    if (post.video_url || post.videoUrl) {
      return [{ url: String(post.video_url || post.videoUrl), type: 'video' }];
    }
    if (post.image_url || post.imageUrl || post.media_url) {
      const u = String(post.image_url || post.imageUrl || post.media_url);
      const isVid =
        u.toLowerCase().endsWith('.mp4') ||
        u.toLowerCase().endsWith('.mov') ||
        u.toLowerCase().includes('video');
      return [{ url: u, type: isVid ? 'video' : 'image' }];
    }
    return [];
  });

  // Newly attached local files
  const [newFiles, setNewFiles] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      newFiles.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, [newFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const added: { file: File; preview: string; type: 'image' | 'video' }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      const preview = URL.createObjectURL(file);
      added.push({ file, preview, type: isVideo ? 'video' : 'image' });
    }
    setNewFiles((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        const uploadedUrl =
          data.url || data.media_urls?.full || data.uploaded?.original?.url || '';
        if (uploadedUrl) {
          setEventCoverUrl(uploadedUrl);
        }
      }
    } catch {
      // local preview fallback
      setEventCoverUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveExistingMedia = (index: number) => {
    setExistingMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewFile = (index: number) => {
    setNewFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Upload helper for newly attached files
  const uploadNewFiles = async (): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    for (const item of newFiles) {
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          const url =
            data.url || data.media_urls?.full || data.uploaded?.original?.url || item.preview;
          uploadedUrls.push(String(url));
        } else {
          uploadedUrls.push(item.preview);
        }
      } catch {
        uploadedUrls.push(item.preview);
      }
    }
    return uploadedUrls;
  };

  const handleSave = async () => {
    setIsUploading(true);
    setErrorMsg(null);

    const userId = currentUser ? currentUser.id : post.user_id || post.seller_id;

    try {
      if (isEvent) {
        // Event Edit Endpoint: PATCH /api/events/${event.id}
        const eventPayload = {
          title: eventTitle.trim() || String(post.title || 'Untitled Event'),
          description: content.trim(),
          event_date: eventDate || post.event_date,
          location: eventLocation.trim(),
          cover_url: eventCoverUrl || post.cover_url,
          visibility: eventVisibility,
          media_url: eventCoverUrl || post.cover_url || null,
        };

        await fetch(`/api/events/${postId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(userId ? { 'x-user-id': String(userId) } : {}),
          },
          body: JSON.stringify(eventPayload),
        });

        const updatedEvent = {
          ...post,
          ...eventPayload,
          id: postId,
        };

        onSaveSuccess?.(updatedEvent);
        window.dispatchEvent(new CustomEvent('event-updated', { detail: updatedEvent }));
        window.dispatchEvent(new CustomEvent('post-updated', { detail: updatedEvent }));
        onClose();
        return;
      }

      if (isProduct) {
        // Product Edit Endpoint: PATCH /api/products?id=${productId}
        const uploadedMediaUrls = await uploadNewFiles();
        const preservedMedia = existingMedia
          .map((m) => (typeof m === 'string' ? m : m?.url || m))
          .filter(Boolean)
          .map((m) => String(m));
        const allMediaUrls = [...preservedMedia, ...uploadedMediaUrls];

        const productPayload: any = {
          id: postId,
          title: productTitle.trim() || String(post.title || 'Product'),
          description: content.trim(),
          category: productCategory,
          country: productCountry,
          address: productAddress,
          quantity: Number(productQuantity) || 1,
          main_price: Number(productMainPrice) || 0,
          discount_price:
            productDiscountPrice !== '' && !isNaN(Number(productDiscountPrice))
              ? Number(productDiscountPrice)
              : null,
          images: allMediaUrls,
          media_urls: allMediaUrls,
          media_url: allMediaUrls[0] || null,
        };

        await fetch(`/api/products?id=${postId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(userId ? { 'x-user-id': String(userId) } : {}),
          },
          body: JSON.stringify(productPayload),
        });

        const updatedProduct = {
          ...post,
          ...productPayload,
          price: productPayload.main_price,
          id: postId,
        };

        onSaveSuccess?.(updatedProduct);
        window.dispatchEvent(new CustomEvent('product-updated', { detail: updatedProduct }));
        window.dispatchEvent(new CustomEvent('post-updated', { detail: updatedProduct }));
        onClose();
        return;
      }

      // Regular Post / Video Edit
      // Upload any new media attachments first
      const uploadedMediaUrls = await uploadNewFiles();
      const preservedMedia = existingMedia
        .map((m) => (typeof m === 'string' ? m : m?.url || m))
        .filter(Boolean)
        .map((m) => String(m));
      const allMediaUrls = [...preservedMedia, ...uploadedMediaUrls];

      const mediaTypes = allMediaUrls.map((url) => {
        const u = String(url || '').toLowerCase();
        return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') || u.includes('video')
          ? 'video'
          : 'image';
      });

      const postPayload: any = {
        content: content.trim(),
        caption: content.trim(),
        media_urls: allMediaUrls,
        media_types: mediaTypes,
        media_url: allMediaUrls[0] || null,
        media: allMediaUrls.map((url, i) => ({
          url,
          type: mediaTypes[i],
        })),
      };

      // PATCH /api/posts/:id (Author only)
      await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': String(userId) } : {}),
        },
        body: JSON.stringify(postPayload),
      });

      const updatedPost = {
        ...post,
        ...postPayload,
        id: postId,
      };

      onSaveSuccess?.(updatedPost);
      window.dispatchEvent(new CustomEvent('post-updated', { detail: updatedPost }));
      onClose();
    } catch (err: any) {
      console.error('Failed to update:', err);
      setErrorMsg(err.message || 'Failed to update. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const authorName =
    post.author?.name || post.user?.name || post.seller_name || currentUser?.name || 'You';
  const authorAvatar =
    post.author?.profile_image_url ||
    post.user?.profile_image_url ||
    post.seller_avatar ||
    currentUser?.profile_image_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(String(authorName))}&background=1877F2&color=fff`;

  const pageTitle = isProduct ? 'Edit Product' : isEvent ? 'Edit Event' : 'Edit Post';

  return createPortal(
    <div
      id="edit-post-fullpage-panel"
      className="fixed inset-0 z-[99999] bg-[#050B18] text-[#F8FAFC] flex flex-col w-full h-full overflow-hidden animate-in fade-in duration-150"
    >
      {/* Full-Page Top Navigation Bar */}
      <header className="h-16 px-4 sm:px-8 border-b border-[#1E293B] bg-[#0A0F1D]/95 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id="edit-post-back-btn"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>

        <h1 className="text-base sm:text-lg font-bold text-[#F8FAFC] tracking-tight">
          {pageTitle}
        </h1>

        <button
          type="button"
          id="edit-post-save-btn"
          onClick={handleSave}
          disabled={isUploading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </header>

      {/* Full-Page Scrollable Content Body */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-3xl w-full mx-auto space-y-6">
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {/* Author / Seller Information */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#0F172A] border border-[#1E293B]">
          <img
            src={authorAvatar}
            alt={authorName}
            className="w-12 h-12 rounded-full object-cover border border-[#334155]"
          />
          <div>
            <div className="font-bold text-[#F8FAFC] text-base leading-snug">{authorName}</div>
            <div className="text-xs text-[#94A3B8]">
              {isProduct ? 'Product Seller' : isEvent ? 'Event Organizer' : 'Post Author'}
            </div>
          </div>
        </div>

        {/* PRODUCT Specific Editable Fields */}
        {isProduct && (
          <div className="space-y-4 p-5 rounded-2xl bg-[#0F172A] border border-[#1E293B]">
            <h2 className="text-sm font-bold text-[#CBD5E1] uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#1877F2]" />
              <span>Product Details</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Product Title
              </label>
              <input
                type="text"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                placeholder="e.g. iPhone 15 Pro Max 256GB"
                className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Main Price ($)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={productMainPrice}
                  onChange={(e) => setProductMainPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Discount Price ($) (Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={productDiscountPrice}
                  onChange={(e) => setProductDiscountPrice(e.target.value)}
                  placeholder="Leave empty if none"
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Category
                </label>
                <select
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                >
                  <option value="Electronics">Electronics</option>
                  <option value="Vehicles">Vehicles</option>
                  <option value="Apparel">Apparel</option>
                  <option value="Home & Garden">Home & Garden</option>
                  <option value="Sports">Sports</option>
                  <option value="Books">Books</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  value={productCountry}
                  onChange={(e) => setProductCountry(e.target.value)}
                  placeholder="e.g. United States"
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Address / City
                </label>
                <input
                  type="text"
                  value={productAddress}
                  onChange={(e) => setProductAddress(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>
            </div>
          </div>
        )}

        {/* EVENT Specific Editable Fields */}
        {isEvent && (
          <div className="space-y-4 p-5 rounded-2xl bg-[#0F172A] border border-[#1E293B]">
            <h2 className="text-sm font-bold text-[#CBD5E1] uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1877F2]" />
              <span>Event Details</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Event Title
              </label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="What is the event called?"
                className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#1877F2]" />
                  <span>Date & Time</span>
                </label>
                <input
                  type="datetime-local"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  <span>Location</span>
                </label>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="City, venue or online"
                  className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>Visibility</span>
              </label>
              <select
                value={eventVisibility}
                onChange={(e) => setEventVisibility(e.target.value)}
                className="w-full bg-[#1E293B]/70 border border-[#334155] rounded-xl px-3 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#1877F2]"
              >
                <option value="public">Public (Everyone)</option>
                <option value="targeted">Targeted (Nearby / Following)</option>
                <option value="private">Private</option>
              </select>
            </div>

            {/* Event Cover Photo Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-[#94A3B8]">Cover Image</label>
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="text-xs text-[#1877F2] hover:underline font-semibold"
                >
                  Change Cover
                </button>
                <input
                  type="file"
                  ref={coverInputRef}
                  accept="image/*"
                  onChange={handleCoverSelect}
                  className="hidden"
                />
              </div>
              {eventCoverUrl ? (
                <div className="relative h-44 rounded-xl overflow-hidden border border-[#334155]">
                  <img src={eventCoverUrl} alt="Cover" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEventCoverUrl('')}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/75 hover:bg-black text-rose-400 transition"
                    title="Remove cover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => coverInputRef.current?.click()}
                  className="h-32 rounded-xl border-2 border-dashed border-[#334155] flex flex-col items-center justify-center cursor-pointer hover:border-[#1877F2] transition text-[#94A3B8]"
                >
                  <ImageIcon className="w-6 h-6 mb-1.5" />
                  <span className="text-xs font-medium">Add Event Cover Photo</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content / Description Input */}
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-[#1E293B] space-y-2">
          <label className="block text-xs font-bold text-[#CBD5E1] uppercase tracking-wider">
            {isProduct ? 'Product Description' : isEvent ? 'Event Description' : 'Caption / Text'}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isProduct
                ? 'Describe your item, condition, specifications...'
                : isEvent
                ? 'Describe the event schedule and details...'
                : 'What would you like to share...'
            }
            rows={5}
            className="w-full bg-[#1E293B]/60 border border-[#334155] rounded-xl p-4 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#1877F2] transition-colors resize-none leading-relaxed"
          />
        </div>

        {/* Media Attachments Section (for Regular Posts, Videos, and Products) */}
        {!isEvent && (
          <div className="p-5 rounded-2xl bg-[#0F172A] border border-[#1E293B] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#CBD5E1] uppercase tracking-wider">
                {isProduct ? 'Product Images' : 'Attached Media'} ({existingMedia.length + newFiles.length})
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2]/15 text-[#1877F2] hover:bg-[#1877F2]/25 font-bold text-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Media</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept={isProduct ? 'image/*' : 'image/*,video/*'}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {existingMedia.length === 0 && newFiles.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="py-10 rounded-xl border-2 border-dashed border-[#1E293B] hover:border-[#1877F2]/60 transition flex flex-col items-center justify-center cursor-pointer bg-[#1E293B]/20 group"
              >
                <div className="flex items-center gap-2 text-[#94A3B8] group-hover:text-[#F8FAFC] transition">
                  <ImageIcon className="w-6 h-6 text-[#1877F2]" />
                  {!isProduct && <Film className="w-6 h-6 text-sky-400" />}
                  <span className="text-sm font-semibold">
                    {isProduct ? 'Click to add product photos' : 'Click to attach photos or video'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {/* Existing media items */}
                {existingMedia.map((m, idx) => {
                  const url = typeof m === 'string' ? m : String(m?.url ?? '');
                  const isVideo =
                    String(url).toLowerCase().endsWith('.mp4') ||
                    String(url).toLowerCase().endsWith('.mov') ||
                    String(url).toLowerCase().includes('video') ||
                    m?.type === 'video';
                  return (
                    <div
                      key={`existing-${idx}`}
                      className="relative group rounded-xl overflow-hidden border border-[#1E293B] aspect-square bg-black shadow-sm"
                    >
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingMedia(idx)}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/75 hover:bg-rose-600 text-white flex items-center justify-center transition shadow"
                        title="Remove media"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {isVideo && (
                        <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white flex items-center gap-1">
                          <Film className="w-3 h-3" />
                          <span>Video</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Newly selected files */}
                {newFiles.map((item, idx) => (
                  <div
                    key={`new-${idx}`}
                    className="relative group rounded-xl overflow-hidden border-2 border-[#1877F2] aspect-square bg-black shadow-sm"
                  >
                    {item.type === 'video' ? (
                      <video src={item.preview} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveNewFile(idx)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/75 hover:bg-rose-600 text-white flex items-center justify-center transition shadow"
                      title="Remove attached file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-[#1877F2] text-[10px] font-bold text-white">
                      New
                    </div>
                  </div>
                ))}

                {/* Add more button tile */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-[#334155] hover:border-[#1877F2] aspect-square flex flex-col items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition bg-[#1E293B]/30"
                >
                  <Plus className="w-6 h-6 mb-1 text-[#1877F2]" />
                  <span className="text-xs font-semibold">Add More</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>,
    document.body
  );
};
