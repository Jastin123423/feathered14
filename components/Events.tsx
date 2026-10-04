// Events.tsx - Complete file with native app integration (no loader)

import React, { useState, useRef, useEffect } from 'react';
import { User, Event } from '../types';

/* =========================================================
   NATIVE APP DETECTION
========================================================= */

const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative || 
    (window as any).UNERA_IS_NATIVE_APP
  );
};

const openNativeImagePicker = (): boolean => {
  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ action: 'pick_image' })
    );
    return true;
  }
  return false;
};

/* =========================================================
   EVENT COVER COMPRESSION HELPERS
========================================================= */

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, type, quality);
  });

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

const calcContainSize = (w: number, h: number, max: number) => {
  if (!w || !h) return { width: max, height: max };
  if (Math.max(w, h) <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
};

const compressEventCoverImage = async (file: File): Promise<File> => {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const targetSize = calcContainSize(img.naturalWidth, img.naturalHeight, 1600);

    const canvas = document.createElement('canvas');
    canvas.width = targetSize.width;
    canvas.height = targetSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    ctx.drawImage(img, 0, 0, targetSize.width, targetSize.height);

    const blob = await canvasToBlob(canvas, 'image/webp', 0.84);
    const ts = Date.now();

    return new File([blob], `${ts}-event-cover.webp`, {
      type: 'image/webp',
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

/* =========================================================
   UPLOAD HELPER WITH COMPRESSION (UPDATED with native support)
========================================================= */

const uploadToCloudflareR2 = async (
  file: File,
  folder = 'events'
): Promise<{ url: string; type: string; filename: string }> => {
  try {
    let uploadFile = file;

    if (file.type.startsWith('image/')) {
      uploadFile = await compressEventCoverImage(file);
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('filename', uploadFile.name);
    formData.append('type', uploadFile.type);
    formData.append('folder', folder);
    formData.append('timestamp', Date.now().toString());

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    if (!result.url) throw new Error('No URL returned from upload');

    return {
      url: result.url,
      type: uploadFile.type,
      filename: uploadFile.name,
    };
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

/* =========================================================
   LOCATION HELPERS
========================================================= */

const detectCountryFromText = (text: string): string | null => {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return null;

  const tanzaniaTerms = [
    'tanzania',
    'dar es salaam',
    'dar',
    'dsm',
    'arusha',
    'mwanza',
    'mbeya',
    'dodoma',
    'zanzibar',
    'moshi',
    'morogoro',
    'tanga',
    'tz',
  ];

  if (tanzaniaTerms.some((term) => raw.includes(term))) return 'Tanzania';
  if (raw.includes('kenya') || raw.includes('nairobi') || raw.includes('mombasa')) return 'Kenya';
  if (raw.includes('uganda') || raw.includes('kampala')) return 'Uganda';
  if (raw.includes('rwanda') || raw.includes('kigali')) return 'Rwanda';
  if (raw.includes('burundi') || raw.includes('bujumbura')) return 'Burundi';
  if (raw.includes('south africa') || raw.includes('johannesburg') || raw.includes('cape town')) return 'South Africa';
  if (raw.includes('nigeria') || raw.includes('lagos') || raw.includes('abuja')) return 'Nigeria';
  if (raw.includes('ghana') || raw.includes('accra')) return 'Ghana';
  if (raw.includes('usa') || raw.includes('united states') || raw.includes('new york')) return 'USA';
  if (raw.includes('uk') || raw.includes('united kingdom') || raw.includes('london')) return 'UK';

  return null;
};

const getUserLocationFallback = (user: User | null): string => {
  if (!user) return '';
  return String(
    (user as any).location ||
      (user as any).city ||
      (user as any).country ||
      (user as any).region ||
      ''
  ).trim();
};

/* =========================================================
   LOCATION SEARCH COMPONENT
   - manual typing always works
   - API suggestions are optional help only
========================================================= */

const LocationSearch: React.FC<{
  value: string;
  onChangeText: (val: string) => void;
  onSelect: (val: string) => void;
  userFallbackLocation?: string;
}> = ({ value, onChangeText, onSelect, userFallbackLocation = '' }) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const searchTimeout = useRef<any>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setShowResults(false);
    };

    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const handleSearch = async (q: string) => {
    const qq = String(q || '').trim();
    if (qq.length < 3) {
      setResults([]);
      setSearchFailed(false);
      return;
    }

    setLoading(true);
    setSearchFailed(false);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          qq
        )}&addressdetails=1&limit=5`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!res.ok) throw new Error(`Location search failed: ${res.status}`);

      const data = await res.json().catch(() => []);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Location search failed', err);
      setResults([]);
      setSearchFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChangeText(val);
    setShowResults(true);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(val), 500);
  };

  const placeholder =
    userFallbackLocation && !query
      ? `Type location or search... (${userFallbackLocation})`
      : 'Type location or search city, venue, or address...';

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="relative">
        <input
          className="w-full bg-[#1E293B] border border-[#1E293B] rounded-xl p-3.5 text-[#F8FAFC] outline-none focus:border-[#1877F2] text-sm pl-11 pr-10"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onFocus={() => setShowResults(true)}
        />
        <i className="fas fa-map-marker-alt absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
        {loading && (
          <i className="fas fa-spinner fa-spin absolute right-4 top-1/2 -translate-y-1/2 text-[#1877F2]"></i>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[#0B1120] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map((res, i) => (
            <div
              key={i}
              className="p-3 hover:bg-[#1E293B] cursor-pointer text-white text-sm border-b border-[#1E293B] last:border-0 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const label = String(res?.display_name || '').trim();
                if (!label) return;
                onSelect(label);
                setQuery(label);
                setShowResults(false);
              }}
            >
              <i className="fas fa-location-dot mr-2 text-[#94A3B8]"></i>
              {res.display_name}
            </div>
          ))}
        </div>
      )}

      {showResults && !loading && results.length === 0 && query.trim().length >= 3 && (
        <div className="absolute top-full left-0 right-0 z-[60] mt-2 bg-[#0B1120] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-3 text-sm text-[#94A3B8]">
            <i className={`fas ${searchFailed ? 'fa-triangle-exclamation text-[#F7B928]' : 'fa-keyboard'} mr-2`}></i>
            {searchFailed
              ? 'Search failed. Your typed location will still be used.'
              : 'No suggestion found. Your typed location will still be used.'}
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================
   TYPES
========================================================= */

interface CreateEventModalProps {
  currentUser: User;
  onClose: () => void;
  onCreate: (event: Partial<Event>) => Promise<void>;
  groupId?: number;
  groupName?: string;
}

/* =========================================================
   CREATE EVENT PAGE
   - full-page style, not floating popup
   - WITH NATIVE IMAGE PICKER SUPPORT (no loader)
========================================================= */

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  currentUser,
  onClose,
  onCreate,
  groupId,
  groupName,
}) => {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<'worldwide' | 'targeted'>('worldwide');
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverTouched, setCoverTouched] = useState(false);
  
  // Native upload state
  const [nativeImageUrl, setNativeImageUrl] = useState<string>('');
  const [nativeImageMeta, setNativeImageMeta] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const userFallbackLocation = getUserLocationFallback(currentUser);

  // Listen for native image upload
  useEffect(() => {
    const handleNativeUpload = (event: any) => {
      const media = event.detail;
      if (!media || media.type !== 'image') return;
      
      const imageUrl = media.full || media.feed || media.url;
      if (!imageUrl) return;
      
      setNativeImageUrl(imageUrl);
      setNativeImageMeta({
        thumb: media.thumb || imageUrl,
        feed: media.feed || imageUrl,
        full: media.full || imageUrl,
        type: 'image',
      });
      
      // Set preview image
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }
      setImage(imageUrl);
      setCoverTouched(true);
    };

    window.addEventListener('uneraNativeUpload', handleNativeUpload);
    return () => {
      window.removeEventListener('uneraNativeUpload', handleNativeUpload);
    };
  }, [image]);

  // Handle picking image - opens gallery quietly
  const handlePickImage = () => {
    if (isUneraNativeApp()) {
      openNativeImagePicker(); // Gallery opens quietly
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('image/')) {
      setError('Only image files are allowed');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (f.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    setCoverTouched(true);
    setImageFile(f);
    setNativeImageUrl('');
    setNativeImageMeta(null);

    if (image && image.startsWith('blob:')) {
      URL.revokeObjectURL(image);
    }

    const previewUrl = URL.createObjectURL(f);
    setImage(previewUrl);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearImage = () => {
    if (image && image.startsWith('blob:')) {
      URL.revokeObjectURL(image);
    }
    setImage(null);
    setImageFile(null);
    setNativeImageUrl('');
    setNativeImageMeta(null);
    setCoverTouched(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resolveEventLocation = () => {
    const typed = String(location || '').trim();
    if (typed) return typed;
    if (userFallbackLocation) return userFallbackLocation;
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Event name is required');
      return;
    }

    if (!date) {
      setError('Date is required');
      return;
    }

    if (!time) {
      setError('Time is required');
      return;
    }

    const finalLocation = resolveEventLocation();
    if (!finalLocation) {
      setError('Location is required');
      return;
    }

    try {
      setIsUploading(true);

      let coverUrl = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1500&q=80';

      // Handle native uploaded image
      if (nativeImageUrl && nativeImageMeta) {
        console.log('📱 Using native uploaded image:', nativeImageUrl);
        coverUrl = nativeImageUrl;
      } 
      // Handle web uploaded image
      else if (imageFile) {
        try {
          const uploadResult = await uploadToCloudflareR2(imageFile, 'events');
          coverUrl = uploadResult.url;
        } catch (uploadError: any) {
          console.error('Image upload failed:', uploadError);
          setError('Cover upload failed. Event will be created with default cover.');
          setTimeout(() => setError(null), 3000);
        }
      }

      const eventData = {
        title: title.trim(),
        description: desc.trim(),
        event_date: date,
        event_time: time,
        location: finalLocation,
        visibility,
        cover_url: coverUrl,
        ...(groupId ? { group_id: groupId } : {}),
      };

      console.log('Creating event with data:', eventData);
      if (groupId) {
        console.log(`Creating event for group: ${groupName} (ID: ${groupId})`);
      }

      await onCreate(eventData as any);

      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }

      onClose();
    } catch (error: any) {
      console.error('Failed to create event:', error);
      setError(error?.message || 'Failed to create event. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (image && image.startsWith('blob:')) {
        URL.revokeObjectURL(image);
      }
    };
  }, [image]);

  const pageTitle = groupId ? `Create Event in ${groupName || 'Group'}` : 'Create event';

  return (
    <div className="fixed inset-0 z-[150] bg-[#050B18] flex flex-col font-sans">
      {/* Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-[#1E293B] bg-[#0B1120] sticky top-0 z-20">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-[#1E293B] flex items-center justify-center transition-colors"
        >
          <i className="fas fa-arrow-left text-[#F8FAFC] text-xl"></i>
        </button>

        <div className="text-[#F8FAFC] font-bold text-[20px] truncate px-3">
          {pageTitle}
        </div>

        <button
          type="submit"
          form="create-event-form"
          disabled={isUploading}
          className={`text-[17px] font-semibold ${
            isUploading ? 'text-[#64748B]' : 'text-[#1877F2]'
          }`}
        >
          {isUploading ? 'Creating...' : 'Create'}
        </button>
      </div>

      <form
        id="create-event-form"
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto bg-[#050B18]"
      >
        <div className="px-4 py-4 space-y-6">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-200 text-sm">
              <div className="flex items-center gap-2">
                <i className="fas fa-exclamation-triangle"></i>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Cover - Opens gallery quietly */}
          <section>
            <div className="text-[#F8FAFC] font-semibold text-[17px] mb-3">Cover photo</div>

            <div
              onClick={handlePickImage}
              className="w-full h-52 rounded-2xl overflow-hidden border border-[#1E293B] bg-[#0B1120] cursor-pointer group relative"
            >
              {image ? (
                <>
                  <img
                    src={image}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    alt="Event Cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 bg-black/60 text-white text-sm font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm">
                    Change cover
                  </div>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      clearImage();
                    }}
                    className="absolute top-3 right-3 bg-black/60 hover:bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-14 h-14 rounded-full bg-[#1E293B] flex items-center justify-center mb-3 group-hover:bg-[#334155] transition-colors">
                    <i className="fas fa-images text-[#F8FAFC] text-xl"></i>
                  </div>
                  <div className="text-[#F8FAFC] font-semibold text-base">Add cover photo</div>
                  <div className="text-[#94A3B8] text-sm mt-1">
                    Optional, max 5MB
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>

            <div className="mt-2 text-sm text-[#94A3B8]">
              {imageFile || nativeImageUrl ? '1 cover selected' : 'No cover selected'}
            </div>
          </section>

          {/* Event Type / Group context */}
          <section className="bg-[#0B1120] rounded-2xl border border-[#1E293B] p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#1E293B] flex items-center justify-center text-[#F8FAFC]">
                <i className={`fas ${groupId ? 'fa-users' : 'fa-globe'} text-lg`}></i>
              </div>
              <div className="min-w-0">
                <div className="text-[#F8FAFC] font-semibold">
                  {groupId ? `Posting in ${groupName || 'Group'}` : 'Public Event'}
                </div>
                <div className="text-[#94A3B8] text-sm">
                  {groupId
                    ? 'Members of this group can discover and engage with this event.'
                    : 'Create an event for the UNERA community.'}
                </div>
              </div>
            </div>
          </section>

          {/* Title */}
          <section>
            <label className="block text-[#94A3B8] text-[15px] mb-2">Event name</label>
            <input
              type="text"
              className="w-full h-12 px-4 rounded-xl bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is your event called?"
              disabled={isUploading}
            />
          </section>

          {/* Date + Time */}
          <section>
            <label className="block text-[#94A3B8] text-[15px] mb-2">Start date & time</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="date"
                className="w-full h-12 px-4 rounded-xl bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isUploading}
              />
              <input
                type="time"
                className="w-full h-12 px-4 rounded-xl bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </section>

          {/* Location */}
          <section>
            <label className="block text-[#94A3B8] text-[15px] mb-2">Location</label>
            <LocationSearch
              value={location}
              onChangeText={setLocation}
              onSelect={setLocation}
              userFallbackLocation={userFallbackLocation}
            />
            <div className="mt-2 text-xs text-[#94A3B8]">
              You can type manually even if location search does not work.
            </div>
          </section>

          {/* Visibility */}
          <section>
            <label className="block text-[#94A3B8] text-[15px] mb-2">Audience</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('worldwide')}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  visibility === 'worldwide'
                    ? 'border-[#1877F2] bg-[#1877F2]/10'
                    : 'border-[#1E293B] bg-[#0B1120] hover:bg-[#162032]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="fas fa-globe text-[#1877F2]"></i>
                  <span className="text-[#F8FAFC] font-semibold">Worldwide</span>
                </div>
                <div className="text-[#94A3B8] text-sm">
                  Visible broadly across UNERA.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('targeted')}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  visibility === 'targeted'
                    ? 'border-[#1877F2] bg-[#1877F2]/10'
                    : 'border-[#1E293B] bg-[#0B1120] hover:bg-[#162032]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="fas fa-location-dot text-[#F02849]"></i>
                  <span className="text-[#F8FAFC] font-semibold">Local Only</span>
                </div>
                <div className="text-[#94A3B8] text-sm">
                  Prioritize people near this location.
                </div>
              </button>
            </div>

            {visibility === 'targeted' && (
              <p className="text-[12px] text-[#94A3B8] mt-2 italic">
                The system will try to target users near the location you entered.
              </p>
            )}
          </section>

          {/* Description */}
          <section>
            <label className="block text-[#94A3B8] text-[15px] mb-2">Description</label>
            <textarea
              className="w-full min-h-[140px] px-4 py-3 rounded-xl bg-[#1E293B] border border-[#1E293B] text-[#F8FAFC] outline-none resize-none focus:border-[#1877F2]"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Tell people more about this event..."
              disabled={isUploading}
            />
            <p className="text-xs text-[#94A3B8] mt-2">
              Add important details like dress code, speakers, link, or agenda.
            </p>
          </section>

          {/* Organizer */}
          <section className="bg-[#0B1120] rounded-2xl border border-[#1E293B] p-4">
            <div className="flex items-center gap-3">
              <img
                src={
                  String(
                    (currentUser as any)?.profile_image_url ||
                      (currentUser as any)?.profileImage ||
                      (currentUser as any)?.avatar ||
                      ''
                  ).trim() ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    String((currentUser as any)?.name || 'User')
                  )}&background=1877F2&color=fff&bold=true`
                }
                alt="Organizer"
                className="w-12 h-12 rounded-full object-cover bg-[#1E293B]"
              />
              <div className="min-w-0">
                <div className="text-[#F8FAFC] font-semibold truncate">
                  {(currentUser as any)?.name || 'UNERA User'}
                </div>
                <div className="text-[#94A3B8] text-sm">
                  Event organizer
                </div>
              </div>
            </div>
          </section>

          {/* Bottom create button */}
          <div className="pt-2 pb-6">
            <button
              type="submit"
              disabled={isUploading}
              className={`w-full h-12 rounded-xl font-bold text-white ${
                isUploading ? 'bg-[#1E293B] text-[#94A3B8]' : 'bg-[#1877F2] hover:bg-[#166FE5]'
              } transition-colors`}
            >
              {isUploading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
