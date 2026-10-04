import React, { useState, useRef, useMemo, useEffect } from 'react';
import { User, Brand, Post as PostType, Event, LinkPreview, AudioTrack } from '../types';
import { Post, CreatePostModal } from './Feed';
import { BRAND_CATEGORIES, LOCATIONS_DATA } from '../constants';
import { CreateEventModal } from './Events';
import { VerifiedBadge } from './VerifiedBadge';

// --- Cloudflare R2 Upload Helper (UPDATED to match App.tsx) ---
const uploadToCloudflareR2 = async (file: File): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);
    formData.append('type', file.type);
    
    // Add metadata for organization
    formData.append('folder', 'brand-images');
    formData.append('timestamp', Date.now().toString());
    
    // ✅ FIXED: Use media.unera.social domain to match App.tsx
    const response = await fetch('https://media.unera.social/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.url) {
      throw new Error('No URL returned from upload');
    }
    
    return result.url;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};

// --- Image Upload Component ---
interface ImageUploadOverlayProps {
  type: 'cover' | 'profile';
  isUploading: boolean;
  onClick: () => void;
}

const ImageUploadOverlay: React.FC<ImageUploadOverlayProps> = ({ type, isUploading, onClick }) => {
  if (type === 'cover') {
    return (
      <div 
        className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/20 font-bold text-white text-sm flex items-center gap-2" 
        onClick={onClick}
      >
        {isUploading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Uploading...
          </>
        ) : (
          <>
            <i className="fas fa-camera"></i> Edit Cover
          </>
        )}
      </div>
    );
  }

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" 
      onClick={onClick}
    >
      {isUploading ? (
        <span className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></span>
      ) : (
        <i className="fas fa-camera text-white text-2xl"></i>
      )}
    </div>
  );
};

// --- CREATE BRAND MODAL ---
interface CreateBrandModalProps {
    currentUser: User;
    onClose: () => void;
    onCreate: (brand: Partial<Brand>) => void;
}

const CreateBrandModal: React.FC<CreateBrandModalProps> = ({ currentUser, onClose, onCreate }) => {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [website, setWebsite] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    
    const handleSubmit = async () => {
        if (!name.trim() || !category || !location) return;
        
        setIsCreating(true);
        try {
            // ✅ Match App.tsx expected format
            onCreate({
                name,
                category,
                description,
                website,
                location,
                contact_email: contactEmail,
                contact_phone: contactPhone,
                admin_id: currentUser.id,
                owner_id: currentUser.id, // For backend
                profile_image_url: `https://ui-avatars.com/api/?name=${name.replace(/\s/g, '+')}&background=random`,
                cover_image_url: 'https://images.unsplash.com/photo-1557683316-973673baf926?ixlib=rb-1.2.1&auto=format&fit=crop&w=1500&q=80',
            });
            onClose();
        } catch (error) {
            console.error('Failed to create brand:', error);
            alert('Failed to create brand. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 animate-fade-in font-sans">
            <div className="bg-[#0F172A] w-full max-w-[500px] rounded-xl border border-[#1E293B] shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[#1E293B] flex justify-between items-center">
                    <h3 className="text-xl font-bold text-[#F8FAFC]">{step === 1 ? 'Create a Page' : 'Contact Info'}</h3>
                    <div onClick={onClose} className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center cursor-pointer">
                        <i className="fas fa-times text-[#94A3B8]"></i>
                    </div>
                </div>
                
                <div className="p-4 overflow-y-auto space-y-4">
                    {step === 1 ? (
                        <>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Page Name <span className="text-red-500">*</span></label>
                                <input type="text" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" placeholder="Business or Brand Name" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Category <span className="text-red-500">*</span></label>
                                <select className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" value={category} onChange={e => setCategory(e.target.value)}>
                                    <option value="">Select a Category</option>
                                    {BRAND_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Description</label>
                                <textarea className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2] resize-none h-24" placeholder="Describe your brand..." value={description} onChange={e => setDescription(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Location (Country/Region) <span className="text-red-500">*</span></label>
                                <input type="text" list="locations" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" placeholder="e.g. Dar es Salaam, Tanzania" value={location} onChange={e => setLocation(e.target.value)} />
                                <datalist id="locations">
                                    {LOCATIONS_DATA.map(l => <option key={l.name} value={l.name} />)}
                                </datalist>
                            </div>
                            <button 
                                onClick={() => setStep(2)} 
                                disabled={!name.trim() || !category || !location} 
                                className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                            >
                                Next
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-[#94A3B8] mb-2">Add contact details to help people reach you (Optional).</p>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Website</label>
                                <input type="text" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" placeholder="https://example.com" value={website} onChange={e => setWebsite(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Business Email</label>
                                <input type="email" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" placeholder="contact@brand.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-[#94A3B8] text-sm font-bold mb-1">Business Phone</label>
                                <input type="tel" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none focus:border-[#1877F2]" placeholder="+255..." value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setStep(1)} 
                                    className="flex-1 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] py-2.5 rounded-lg font-bold transition-colors"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={handleSubmit} 
                                    disabled={isCreating}
                                    className="flex-1 bg-[#42B72A] hover:bg-[#36A420] text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {isCreating ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Page'
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- EDIT BRAND MODAL ---
interface EditBrandModalProps {
    brand: Brand;
    onClose: () => void;
    onUpdate: (updatedData: Partial<Brand>) => void;
}

const EditBrandModal: React.FC<EditBrandModalProps> = ({ brand, onClose, onUpdate }) => {
    const [description, setDescription] = useState(brand.description || '');
    const [website, setWebsite] = useState(brand.website || '');
    const [location, setLocation] = useState(brand.location || '');
    const [contactEmail, setContactEmail] = useState(brand.contact_email || '');
    const [contactPhone, setContactPhone] = useState(brand.contact_phone || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onUpdate({ description, website, location, contact_email: contactEmail, contact_phone: contactPhone });
            onClose();
        } catch (error) {
            console.error('Failed to update brand:', error);
            alert('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 animate-fade-in font-sans">
            <div className="bg-[#0F172A] w-full max-w-[600px] rounded-xl border border-[#1E293B] shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[#1E293B] flex justify-between items-center">
                    <h2 className="text-xl font-bold text-[#F8FAFC]">Edit Page Info</h2>
                    <div onClick={onClose} className="w-8 h-8 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center cursor-pointer">
                        <i className="fas fa-times text-[#94A3B8]"></i>
                    </div>
                </div>
                <div className="p-4 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-[#94A3B8] text-sm font-bold mb-1">Description</label>
                        <textarea className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none h-24 resize-none" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-[#94A3B8] text-sm font-bold mb-1">Location</label>
                        <input type="text" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none" value={location} onChange={e => setLocation(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-[#94A3B8] text-sm font-bold mb-1">Website</label>
                        <input type="text" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none" value={website} onChange={e => setWebsite(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-[#94A3B8] text-sm font-bold mb-1">Contact Email</label>
                        <input type="email" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-[#94A3B8] text-sm font-bold mb-1">Contact Phone</label>
                        <input type="tel" className="w-full bg-[#1E293B] border border-[#1E293B] rounded-lg p-2.5 text-[#F8FAFC] outline-none" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- BRANDS PAGE COMPONENT ---
interface BrandsPageProps {
    currentUser: User | null;
    brands: Brand[];
    posts: PostType[];
    users: User[]; 
    onCreateBrand: (brand: Partial<Brand>) => void;
    onFollowBrand: (brandId: number) => void;
    onProfileClick: (id: number) => void;
    onPostAsBrand: (brandId: number, content: any) => void;
    onReact: (postId: number, type: any) => void;
    onShare: (postId: number) => void;
    onOpenComments: (postId: number) => void;
    onUpdateBrand?: (brandId: number, data: Partial<Brand>) => void;
    onDeleteBrand: (brandId: number) => void;
    onMessage?: (brandId: number) => void;
    onCreateEvent?: (brandId: number, event: Partial<Event>) => void;
    initialBrandId?: number | null;
    onPlayAudioTrack?: (track: AudioTrack) => void;
    checkIsFollowing?: (userId: number) => boolean;
}

export const BrandsPage: React.FC<BrandsPageProps> = ({ 
    currentUser, brands, posts, users, onCreateBrand, onFollowBrand, 
    onProfileClick, onPostAsBrand, onReact, onShare, onOpenComments,
    onUpdateBrand, onDeleteBrand, onMessage, onCreateEvent, initialBrandId, onPlayAudioTrack,
    checkIsFollowing
}) => {
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showCreatePostModal, setShowCreatePostModal] = useState(false);
    const [showEditBrandModal, setShowEditBrandModal] = useState(false);
    const [showCreateEventModal, setShowCreateEventModal] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [activeTab, setActiveTab] = useState<'Posts' | 'About' | 'Photos'>('Posts');
    const [searchQuery, setSearchQuery] = useState('');
    const [listSection, setListSection] = useState<'all' | 'mine'>('all');
    const [isUploadingImage, setIsUploadingImage] = useState<'cover' | 'profile' | null>(null);
    const [previousImageUrl, setPreviousImageUrl] = useState<{cover?: string, profile?: string}>({});

    const profileInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialBrandId) {
            const brand = brands.find(b => b.id === initialBrandId);
            if (brand) {
                setActiveBrandId(brand.id);
                setView('detail');
                setActiveTab('Posts');
            }
        } else {
            setView('list');
            setActiveBrandId(null);
        }
    }, [initialBrandId, brands]);

    const activeBrand = useMemo(() => brands.find(b => b.id === activeBrandId), [brands, activeBrandId]);
    const isOwner = currentUser && activeBrand && activeBrand.admin_id === currentUser.id;
    const isPlatformAdmin = currentUser?.role === 'admin';
    const canManage = isOwner || isPlatformAdmin;
    
    // ✅ FIXED: Use brand_user_id for follow checks (matches App.tsx checkIsFollowing)
    const isFollowing = useMemo(() => {
        if (!currentUser || !activeBrand || !checkIsFollowing) return false;
        // Follow status is based on brand_user_id (which points to users.id)
        return checkIsFollowing(activeBrand.brand_user_id || activeBrand.id);
    }, [currentUser, activeBrand, checkIsFollowing]);

    // ✅ FIXED: Added defensive check for undefined brand_id
    const brandPosts = useMemo(() => {
        if (!activeBrand) return [];
        
        // ✅ Add defensive check for undefined brand_id
        const filtered = posts.filter(p => {
            // Handle case where brand_id might be undefined or null
            const postBrandId = p.brand_id || (p as any).brand_id;
            return postBrandId === activeBrand.id;
        });
        
        return filtered.sort((a,b) => 
            (new Date(b.created_at).getTime() || 0) - (new Date(a.created_at).getTime() || 0)
        );
    }, [posts, activeBrand]);

    const handleBrandClick = (brandId: number) => {
        setActiveBrandId(brandId);
        setView('detail');
        setActiveTab('Posts');
        window.scrollTo(0, 0);
    };

    const handleCreatePost = (text: string, file: File | null, type: any, visibility: any, location?: string, feeling?: string, taggedUsers?: number[], background?: string, linkPreview?: LinkPreview) => {
        if (!activeBrand) return;
        // ✅ Pass data in format expected by App.tsx postAsBrand
        onPostAsBrand(activeBrand.id, { 
            text, 
            file, 
            type, 
            visibility, 
            location, 
            feeling, 
            taggedUsers, 
            background, 
            linkPreview 
        });
        setShowCreatePostModal(false);
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'profile') => {
        if (!e.target.files || !e.target.files[0] || !activeBrand || !onUpdateBrand) return;

        const file = e.target.files[0];
        const fileSizeMB = file.size / (1024 * 1024);
        
        // Validate file size (5MB max)
        if (fileSizeMB > 5) {
            alert('File size should be less than 5MB');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        setIsUploadingImage(type);
        
        // Store current image URL for fallback
        setPreviousImageUrl(prev => ({
            ...prev,
            [type]: type === 'cover' ? activeBrand.cover_image_url : activeBrand.profile_image_url
        }));

        // Create temporary preview URL for immediate UI feedback
        const previewUrl = URL.createObjectURL(file);
        
        try {
            // Show optimistic update with preview URL
            onUpdateBrand(activeBrand.id, type === 'cover' ? { cover_image_url: previewUrl } : { profile_image_url: previewUrl });
            
            // ✅ Upload to Cloudflare R2 using the updated function (matches App.tsx)
            const permanentUrl = await uploadToCloudflareR2(file);
            
            // Update with permanent Cloudflare R2 URL
            onUpdateBrand(activeBrand.id, type === 'cover' ? { cover_image_url: permanentUrl } : { profile_image_url: permanentUrl });
        } catch (error: any) {
            console.error('Failed to upload brand image:', error);
            alert(`Failed to upload ${type} image: ${error.message || 'Please try again'}`);
            
            // Revert to previous image on error
            const previousUrl = type === 'cover' 
                ? previousImageUrl.cover 
                : previousImageUrl.profile;
            
            if (previousUrl) {
                onUpdateBrand(activeBrand.id, type === 'cover' ? { cover_image_url: previousUrl } : { profile_image_url: previousUrl });
            }
        } finally {
            setIsUploadingImage(null);
            // Clean up the preview URL
            URL.revokeObjectURL(previewUrl);
            
            // Clear file input
            if (type === 'cover' && coverInputRef.current) {
                coverInputRef.current.value = '';
            }
            if (type === 'profile' && profileInputRef.current) {
                profileInputRef.current.value = '';
            }
        }
    };

    // ✅ FIXED: Helper to check if user follows a brand (using brand_user_id)
    const isUserFollowingBrand = (brand: Brand): boolean => {
        if (!currentUser || !checkIsFollowing) return false;
        return checkIsFollowing(brand.brand_user_id || brand.id);
    };

    if (view === 'list' || !activeBrand) {
        return (
            <div className="w-full max-w-[900px] mx-auto p-3 sm:p-4 font-sans pb-20">
                {/* Header + Section Buttons */}
                <div className="mb-3 bg-[#0F172A] rounded-xl border border-[#1E293B] overflow-hidden">
                    <div className="p-4 border-b border-[#1E293B] flex items-center justify-between">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-[#F8FAFC]">Brands</h2>
                            <p className="text-[#94A3B8] text-sm">Discover businesses and creators.</p>
                        </div>
                    </div>

                    {/* 3 buttons row (scrollable on mobile) */}
                    <div className="px-3 pb-3 pt-3">
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                            {currentUser && (
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="shrink-0 px-4 h-10 rounded-full font-bold flex items-center gap-2
                                             bg-[#1877F2] hover:bg-[#166FE5] text-white transition-colors"
                                >
                                    <i className="fas fa-plus"></i>
                                    Create Brand
                                </button>
                            )}

                            <button
                                onClick={() => setListSection('all')}
                                className={`shrink-0 px-4 h-10 rounded-full font-bold transition-colors
                                    ${listSection === 'all'
                                        ? 'bg-[#1E293B] text-[#F8FAFC] border border-[#1877F2]'
                                        : 'bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] border border-transparent'
                                    }`}
                            >
                                All Brands
                            </button>

                            <button
                                onClick={() => setListSection('mine')}
                                className={`shrink-0 px-4 h-10 rounded-full font-bold transition-colors
                                    ${listSection === 'mine'
                                        ? 'bg-[#1E293B] text-[#F8FAFC] border border-[#1877F2]'
                                        : 'bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] border border-transparent'
                                    }`}
                            >
                                Your Brands
                            </button>
                        </div>

                        {/* Search */}
                        <div className="mt-3 relative">
                            <input
                                type="text"
                                className="w-full bg-[#1E293B] border border-[#1E293B] rounded-xl p-2.5 pl-10 text-[#F8FAFC] outline-none focus:border-[#1877F2]"
                                placeholder="Search brands..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"></i>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC]"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* LIST (Followed Pages style) */}
                <div className="bg-[#0F172A] rounded-xl border border-[#1E293B] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1E293B]">
                        <h3 className="text-[#F8FAFC] font-bold">
                            {listSection === 'mine' ? 'Your Brands' : 'All Brands'}
                        </h3>
                    </div>

                    {(() => {
                        const myBrands = currentUser ? brands.filter((b) => b.admin_id === currentUser.id) : [];
                        const allBrands = brands;

                        const base = listSection === 'mine' ? myBrands : allBrands;

                        const filtered = searchQuery.trim()
                            ? base.filter((b) => {
                                const q = searchQuery.toLowerCase();
                                return (
                                    b.name.toLowerCase().includes(q) ||
                                    (b.category || '').toLowerCase().includes(q) ||
                                    (b.location || '').toLowerCase().includes(q) ||
                                    (b.description || '').toLowerCase().includes(q)
                                );
                            })
                            : base;

                        if (filtered.length === 0) {
                            return (
                                <div className="p-8 text-center">
                                    <i className="fas fa-search text-[#94A3B8] text-4xl mb-4"></i>
                                    <p className="text-[#94A3B8] text-lg mb-1">No brands found</p>
                                    <p className="text-[#94A3B8] text-sm">Try a different search.</p>
                                </div>
                            );
                        }

                        return (
                            <div className="divide-y divide-[#1E293B]">
                                {filtered.map((brand) => {
                                    // ✅ FIXED: Use brand_user_id for follow check
                                    const followed = isUserFollowingBrand(brand);

                                    return (
                                        <div
                                            key={brand.id}
                                            onClick={() => handleBrandClick(brand.id)}
                                            className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#1E293B]/60 transition-colors"
                                        >
                                            {/* Avatar */}
                                            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#1E293B] border border-[#1E293B] flex-shrink-0">
                                                <img
                                                    src={brand.profile_image_url}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>

                                            {/* Text */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <p className="text-[#F8FAFC] font-bold truncate">
                                                        {brand.name}
                                                    </p>
                                                    {brand.is_verified && (
                                                        <VerifiedBadge size={15} className="flex-shrink-0" />
                                                    )}
                                                </div>

                                                <p className="text-[#94A3B8] text-sm truncate">
                                                    {(brand.category || 'Brand')}{brand.location ? ` • ${brand.location}` : ''} • {brand.followers.length} followers
                                                </p>
                                            </div>

                                            {/* Follow button - uses brand.brand_user_id (matches App.tsx followUser) */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!currentUser) return alert('Login to follow');
                                                    // ✅ FIXED: Pass brand_user_id to follow function (App.tsx expects users.id)
                                                    const followId = brand.brand_user_id || brand.id;
                                                    onFollowBrand(followId);
                                                }}
                                                className={`h-9 px-4 rounded-lg font-bold text-sm flex-shrink-0 transition-colors
                                                    ${followed
                                                        ? 'bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC]'
                                                        : 'bg-[#1877F2] hover:bg-[#166FE5] text-white'
                                                    }`}
                                            >
                                                {followed ? 'Following' : 'Follow'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>

                {showCreateModal && currentUser && (
                    <CreateBrandModal
                        currentUser={currentUser}
                        onClose={() => setShowCreateModal(false)}
                        onCreate={onCreateBrand}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="w-full bg-[#050B18] min-h-screen pb-10 font-sans">
            <input 
                type="file" 
                ref={profileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => handleImageChange(e, 'profile')} 
            />
            <input 
                type="file" 
                ref={coverInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => handleImageChange(e, 'cover')} 
            />

            <div className="bg-[#0F172A] border-b border-[#1E293B] shadow-sm mb-4">
                <div className="max-w-[1100px] mx-auto">
                    <div className="h-[200px] md:h-[350px] relative group bg-[#1E293B] overflow-hidden">
                        <img 
                            src={activeBrand.cover_image_url} 
                            className="w-full h-full object-cover md:rounded-b-xl" 
                            alt="Cover" 
                        />
                        {canManage && (
                            <ImageUploadOverlay 
                                type="cover"
                                isUploading={isUploadingImage === 'cover'}
                                onClick={() => coverInputRef.current?.click()}
                            />
                        )}
                    </div>
                    <div className="px-4 pb-0">
                        <div className="flex flex-col md:flex-row items-start md:items-end -mt-[40px] md:-mt-[30px] relative z-10 gap-4 mb-4">
                            <div className="relative group">
                                <div className="w-[100px] h-[100px] md:w-[140px] md:h-[140px] rounded-full border-4 border-[#0F172A] overflow-hidden bg-[#0F172A]">
                                    <img src={activeBrand.profile_image_url} className="w-full h-full object-cover" alt="" />
                                </div>
                                {canManage && (
                                    <ImageUploadOverlay 
                                        type="profile"
                                        isUploading={isUploadingImage === 'profile'}
                                        onClick={() => profileInputRef.current?.click()}
                                    />
                                )}
                            </div>
                            
                            <div className="flex-1 mt-2">
                                <h1 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] leading-tight mb-1 flex items-center gap-2">
                                    {activeBrand.name} 
                                    {activeBrand.is_verified && <VerifiedBadge size={22} className="flex-shrink-0" />}
                                </h1>
                                <p className="text-[#94A3B8] font-semibold text-[15px]">
                                    {activeBrand.category} • {activeBrand.location} • {activeBrand.followers.length} followers
                                </p>
                            </div>

                            <div className="flex gap-2 mt-4 md:mt-0 w-full md:w-auto relative">
                                {canManage ? (
                                    <>
                                        <button 
                                            onClick={() => setShowCreateEventModal(true)} 
                                            className="bg-[#1E293B] text-[#F8FAFC] px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#334155] flex-1 md:flex-none transition-colors"
                                        >
                                            <i className="fas fa-plus"></i> Event
                                        </button>
                                        <button 
                                            onClick={() => setShowEditBrandModal(true)} 
                                            className="bg-[#1E293B] text-[#F8FAFC] px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#334155] flex-1 md:flex-none transition-colors"
                                        >
                                            <i className="fas fa-pen"></i> Edit Page
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {/* ✅ FIXED: Follow button uses brand_user_id (matches App.tsx followUser) */}
                                        <button 
                                            onClick={() => {
                                                if (!currentUser) return alert("Login to follow");
                                                const followId = activeBrand.brand_user_id || activeBrand.id;
                                                onFollowBrand(followId);
                                            }} 
                                            className={`${isFollowing ? 'bg-[#1E293B] text-[#F8FAFC]' : 'bg-[#1877F2] text-white'} px-6 py-2 rounded-lg font-bold text-base hover:opacity-90 flex-1 md:flex-none transition-colors flex items-center justify-center gap-2`}
                                        >
                                            <i className={`fas ${isFollowing ? 'fa-user-check' : 'fa-user-plus'}`}></i>
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </button>
                                        <button 
                                            onClick={() => onMessage && onMessage(activeBrand.id)} 
                                            className="bg-[#1E293B] text-[#F8FAFC] px-4 py-2 rounded-lg font-bold text-base hover:bg-[#334155] flex-1 md:flex-none transition-colors flex items-center justify-center gap-2"
                                        >
                                            <i className="fab fa-facebook-messenger"></i> Message
                                        </button>
                                        {activeBrand.contact_phone && (
                                            <a 
                                                href={`tel:${activeBrand.contact_phone}`} 
                                                className="bg-[#25D366] text-white px-4 py-2 rounded-lg font-bold text-base hover:bg-[#20bd5a] flex items-center justify-center gap-2 flex-1 md:flex-none no-underline transition-colors"
                                            >
                                                <i className="fab fa-whatsapp"></i> WhatsApp
                                            </a>
                                        )}
                                    </>
                                )}
                                <button 
                                    onClick={() => setShowOptionsMenu(!showOptionsMenu)} 
                                    className="bg-[#1E293B] text-[#F8FAFC] px-3 py-2 rounded-lg font-bold hover:bg-[#334155] transition-colors"
                                >
                                    <i className="fas fa-ellipsis-h"></i>
                                </button>
                                {showOptionsMenu && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#0F172A] border border-[#1E293B] rounded-lg shadow-xl z-20 py-1">
                                        {isPlatformAdmin && (
                                            <div 
                                                onClick={() => { onDeleteBrand(activeBrand.id); setShowOptionsMenu(false); }} 
                                                className="px-4 py-2 hover:bg-[#1E293B] text-red-500 cursor-pointer flex items-center gap-2 transition-colors"
                                            >
                                                <i className="fas fa-trash-alt"></i> Delete Page
                                            </div>
                                        )}
                                        <div 
                                            onClick={() => { setShowOptionsMenu(false); }} 
                                            className="px-4 py-2 hover:bg-[#1E293B] text-[#F8FAFC] cursor-pointer flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-flag"></i> Report Page
                                        </div>
                                        <div 
                                            onClick={() => { setShowOptionsMenu(false); }} 
                                            className="px-4 py-2 hover:bg-[#1E293B] text-[#F8FAFC] cursor-pointer flex items-center gap-2 transition-colors"
                                        >
                                            <i className="fas fa-ban"></i> Block Page
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-[#1E293B] mt-4"></div>
                        <div className="flex items-center gap-1 pt-1 overflow-x-auto">
                            {['Posts', 'About', 'Photos'].map(tab => (
                                <div 
                                    key={tab} 
                                    onClick={() => setActiveTab(tab as any)} 
                                    className={`px-4 py-3 cursor-pointer font-semibold text-base border-b-[3px] transition-colors whitespace-nowrap ${activeTab === tab ? 'text-[#1877F2] border-[#1877F2]' : 'text-[#94A3B8] border-transparent hover:bg-[#1E293B] rounded-t-lg'}`}
                                >
                                    {tab}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1000px] mx-auto w-full flex flex-col md:flex-row gap-4 px-0 md:px-4">
                <div className="w-full md:w-[360px] flex-shrink-0 flex flex-col gap-4 px-4 md:px-0">
                    <div className="bg-[#0F172A] rounded-xl p-4 shadow-sm border border-[#1E293B]">
                        <h2 className="text-xl font-bold text-[#F8FAFC] mb-4">About</h2>
                        <div className="flex flex-col gap-3 text-[#F8FAFC] text-[15px]">
                            <p className="text-[#94A3B8]">{activeBrand.description || 'No description provided'}</p>
                            <div className="h-[1px] bg-[#1E293B] w-full my-2"></div>
                            <div className="flex items-center gap-3 text-[#94A3B8]">
                                <i className="fas fa-info-circle w-5 text-center"></i>
                                <span>{activeBrand.category}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[#94A3B8]">
                                <i className="fas fa-map-marker-alt w-5 text-center"></i>
                                <span>{activeBrand.location || 'Location not added'}</span>
                            </div>
                            {activeBrand.website && (
                                <div className="flex items-center gap-3 text-[#94A3B8]">
                                    <i className="fas fa-globe w-5 text-center"></i>
                                    <a 
                                        href={activeBrand.website.startsWith('http') ? activeBrand.website : `https://${activeBrand.website}`} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="text-[#1877F2] hover:underline truncate"
                                    >
                                        {activeBrand.website}
                                    </a>
                                </div>
                            )}
                            {activeBrand.contact_email && (
                                <div className="flex items-center gap-3 text-[#94A3B8]">
                                    <i className="fas fa-envelope w-5 text-center"></i>
                                    <span>{activeBrand.contact_email}</span>
                                </div>
                            )}
                            {activeBrand.contact_phone && (
                                <div className="flex items-center gap-3 text-[#94A3B8]">
                                    <i className="fas fa-phone w-5 text-center"></i>
                                    <span>{activeBrand.contact_phone}</span>
                                </div>
                            )}
                            {canManage && (
                                <button 
                                    className="w-full bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] font-semibold py-2 rounded-md transition-colors text-sm mt-2" 
                                    onClick={() => setShowEditBrandModal(true)}
                                >
                                    Edit Details
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    {activeTab === 'Posts' && (
                        <>
                            {canManage && currentUser && (
                                <>
                                    <div className="bg-[#0F172A] rounded-xl p-3 md:p-4 mb-4 shadow-sm border border-[#1E293B]">
                                        <div className="flex gap-2 mb-3">
                                            <img 
                                                src={activeBrand.profile_image_url} 
                                                alt="" 
                                                className="w-10 h-10 rounded-full object-cover cursor-pointer border border-[#1E293B] hover:opacity-90 transition-opacity" 
                                            />
                                            <div 
                                                className="flex-1 bg-[#1E293B] rounded-full px-3 md:px-4 py-2 hover:bg-[#334155] cursor-pointer flex items-center transition-colors" 
                                                onClick={() => setShowCreatePostModal(true)}
                                            >
                                                <span className="text-[#94A3B8] text-[17px] truncate">What's new with your brand today?</span>
                                            </div>
                                        </div>
                                        <div className="border-t border-[#1E293B] pt-2 flex justify-between">
                                            <div 
                                                className="flex items-center justify-center flex-1 gap-2 p-2 hover:bg-[#1E293B] rounded-lg cursor-pointer transition-colors" 
                                                onClick={() => setShowCreatePostModal(true)}
                                            >
                                                <i className="fas fa-video text-[#F3425F] text-[24px]"></i>
                                                <span className="text-[#94A3B8] font-semibold text-[15px] hidden sm:block">Live Video</span>
                                            </div>
                                            <div 
                                                className="flex items-center justify-center flex-1 gap-2 p-2 hover:bg-[#1E293B] rounded-lg cursor-pointer transition-colors" 
                                                onClick={() => setShowCreatePostModal(true)}
                                            >
                                                <i className="fas fa-images text-[#45BD62] text-[24px]"></i>
                                                <span className="text-[#94A3B8] font-semibold text-[15px] hidden sm:block">Photo/Video</span>
                                            </div>
                                            <div 
                                                className="flex items-center justify-center flex-1 gap-2 p-2 hover:bg-[#1E293B] rounded-lg cursor-pointer transition-colors" 
                                                onClick={() => setShowCreateEventModal(true)}
                                            >
                                                <i className="fas fa-calendar-plus text-[#F7B928] text-[24px]"></i>
                                                <span className="text-[#94A3B8] font-semibold text-[15px] hidden sm:block">Event</span>
                                            </div>
                                        </div>
                                    </div>

                                    {showCreatePostModal && (
                                        <CreatePostModal 
                                            currentUser={{
                                                ...currentUser, 
                                                name: activeBrand.name, 
                                                profile_image_url: activeBrand.profile_image_url
                                            } as User} 
                                            users={users} 
                                            onClose={() => setShowCreatePostModal(false)}
                                            onCreatePost={handleCreatePost}
                                        />
                                    )}
                                </>
                            )}
                            <div className="space-y-4">
                                {brandPosts.length > 0 ? brandPosts.map(post => (
                                    <Post 
                                        key={post.id}
                                        post={post}
                                        author={activeBrand as any} 
                                        currentUser={currentUser}
                                        users={users} 
                                        onProfileClick={onProfileClick}
                                        onReact={onReact}
                                        onShare={onShare}
                                        onOpenComments={onOpenComments}
                                        onVideoClick={() => {}}
                                        onViewImage={() => {}}
                                        onPlayAudioTrack={onPlayAudioTrack}
                                    />
                                )) : (
                                    <div className="bg-[#0F172A] rounded-xl p-8 text-center border border-[#1E293B] mx-4 md:mx-0">
                                        <i className="fas fa-newspaper text-[#94A3B8] text-4xl mb-4"></i>
                                        <p className="text-[#94A3B8] text-lg">No posts yet</p>
                                        <p className="text-[#94A3B8] text-sm mt-2">
                                            {canManage ? 'Start sharing updates with your followers!' : 'Check back later for updates'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {activeTab === 'Photos' && (
                        <div className="bg-[#0F172A] rounded-xl p-4 border border-[#1E293B] mx-4 md:mx-0">
                            <h2 className="text-xl font-bold text-[#F8FAFC] mb-4">Photos</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {brandPosts
                                    .filter(p => p.type === 'image' && p.media_url)
                                    .map(p => (
                                        <div key={p.id} className="aspect-square overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
                                            <img 
                                                src={p.media_url} 
                                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                                                alt="" 
                                            />
                                        </div>
                                    ))
                                }
                            </div>
                            {brandPosts.filter(p => p.type === 'image').length === 0 && (
                                <div className="text-center py-8">
                                    <i className="fas fa-images text-[#94A3B8] text-4xl mb-4"></i>
                                    <p className="text-[#94A3B8]">No photos available</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showEditBrandModal && activeBrand && (
                <EditBrandModal 
                    brand={activeBrand} 
                    onClose={() => setShowEditBrandModal(false)} 
                    onUpdate={(data) => onUpdateBrand && onUpdateBrand(activeBrand.id, data)} 
                />
            )}

            {showCreateEventModal && currentUser && onCreateEvent && (
                <CreateEventModal 
                    currentUser={currentUser}
                    onClose={() => setShowCreateEventModal(false)}
                    onCreate={(e) => onCreateEvent(activeBrand.id, e)}
                />
            )}
        </div>
    );
};
