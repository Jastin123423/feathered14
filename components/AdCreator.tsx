import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faImage,
  faVideo,
  faMapMarkerAlt,
  faCalendar,
  faLink,
  faFont,
  faMousePointer,
  faCheckCircle,
  faDollarSign,
  faSpinner,
  faPlayCircle,
  faFileImage,
  faClock,
  faHeart,
  faChevronLeft,
  faChevronRight,
  faTimes,
  faPlus,
  faPhone,
  faEnvelope,
  faGlobe,
  faStore,
  faUsers,
  faThLarge,
  faList,
  faSync,
  faRedo,
  faChartLine,
  faBullhorn,
  faChartBar,
  faArrowLeft,
  faStar
} from '@fortawesome/free-solid-svg-icons';
import { AdType, CTAButton, Post } from '../types';
import AdPreview from './AdPreview';

interface AdCreatorProps {
  onSuccess: () => void;
  userPosts?: Post[];
  onCreateCampaign: (postId: number, campaignData: {
    name: string;
    link?: string;
    phone?: string;
    email?: string;
    cta: CTAButton;
    location: string;
    budget: number;
    days: number;
  }) => Promise<boolean>;
  currentUser: any;
  onBack?: () => void;
  initialPost?: Post | null;
}

const CTA_OPTIONS: CTAButton[] = [
  'Learn More', 'Sign Up', 'Subscribe', 'Shop Now', 
  'Contact Us', 'Call Now', 'Email Us', 'WhatsApp', 
  'Download', 'Get Quote', 'Book Now'
];

// Contact type options
const CONTACT_TYPES = [
  { value: 'link', label: 'Website Link', icon: faLink, placeholder: 'https://example.com' },
  { value: 'phone', label: 'Phone Number', icon: faPhone, placeholder: '+255 123 456 789' },
  { value: 'email', label: 'Email Address', icon: faEnvelope, placeholder: 'contact@example.com' }
];

// Cache key for posts
const POSTS_CACHE_KEY = 'unera_ads_posts_cache';
const POSTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export default function AdCreator({ 
  onSuccess, 
  userPosts = [], 
  onCreateCampaign, 
  currentUser, 
  onBack,
  initialPost 
}: AdCreatorProps) {
  const [step, setStep] = useState(1);
  const [selectedPost, setSelectedPost] = useState<Post | null>(initialPost || null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [cachedPosts, setCachedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage] = useState(10);
  const [totalPosts, setTotalPosts] = useState(0);
  
  // Contact type selection
  const [contactType, setContactType] = useState<'link' | 'phone' | 'email'>('link');
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'image' as AdType,
    mediaUrl: '',
    mediaUrls: [] as string[],
    description: '',
    link: '',
    phone: '',
    email: '',
    cta: 'Learn More' as CTAButton,
    location: '',
    budget: 5,
    days: 7,
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialLoadDone = useRef(false);
  const initialPostProcessed = useRef(false);

  // Handle initial post if provided
  useEffect(() => {
    if (initialPost && !initialPostProcessed.current) {
      console.log("Initial post detected:", initialPost);
      setSelectedPost(initialPost);
      
      // Get all media URLs
      const mediaUrls = initialPost.media_urls || (initialPost.media_url ? [initialPost.media_url] : []);
      const mediaUrl = mediaUrls[0] || '';
      
      setFormData({
        ...formData,
        name: initialPost.content?.substring(0, 30) || 'New Campaign',
        type: initialPost.type === 'video' ? 'video' : 'image',
        mediaUrl: mediaUrl,
        mediaUrls: mediaUrls,
        description: initialPost.content || '',
      });
      
      setStep(2);
      initialPostProcessed.current = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [initialPost]);

  // Handle browser back button
  useEffect(() => {
    const handleBackButton = (event: PopStateEvent) => {
      event.preventDefault();
      
      if (step > 1) {
        handleBack();
      } else if (onBack) {
        onBack();
      }
    };

    window.addEventListener('popstate', handleBackButton);

    if (step > 1) {
      window.history.pushState({ step }, '');
    }

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [step, onBack]);

  // Update history when step changes
  useEffect(() => {
    if (step > 1) {
      window.history.pushState({ step }, '');
    }
  }, [step]);

  // Handle back navigation
  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setSelectedPost(null);
    } else if (step === 3) {
      setStep(2);
    } else if (step === 1 && onBack) {
      onBack();
    }
  };

  // Load cached posts on mount
  useEffect(() => {
    loadCachedPosts();
  }, []);

  // Update when userPosts changes (new posts from App.tsx)
  useEffect(() => {
    if (userPosts.length > 0 && !initialLoadDone.current) {
      updatePostsCache(userPosts);
      setTotalPosts(userPosts.length);
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [userPosts]);

  // Load from cache
  const loadCachedPosts = () => {
    try {
      const cached = localStorage.getItem(POSTS_CACHE_KEY);
      if (cached) {
        const { posts, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        if (age < POSTS_CACHE_TTL) {
          setCachedPosts(posts);
          setTotalPosts(posts.length);
          setLoading(false);
          initialLoadDone.current = true;
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading cached posts:', error);
    }
    return false;
  };

  // Update cache
  const updatePostsCache = (posts: Post[]) => {
    try {
      const cacheData = {
        posts,
        timestamp: Date.now()
      };
      localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(cacheData));
      setCachedPosts(posts);
    } catch (error) {
      console.error('Error caching posts:', error);
    }
  };

  // Refresh posts
  const refreshPosts = () => {
    setLoading(true);
    localStorage.removeItem(POSTS_CACHE_KEY);
    setCachedPosts([]);
    setCurrentPage(1);
    if (userPosts.length > 0) {
      updatePostsCache(userPosts);
      setTotalPosts(userPosts.length);
    }
    setLoading(false);
  };

  // Get current posts for pagination
  const getCurrentPosts = () => {
    const posts = cachedPosts.length > 0 ? cachedPosts : userPosts;
    const sortedPosts = [...posts].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const indexOfLastPost = currentPage * postsPerPage;
    const indexOfFirstPost = indexOfLastPost - postsPerPage;
    return sortedPosts.slice(indexOfFirstPost, indexOfLastPost);
  };

  // Handle contact type change
  const handleContactTypeChange = (type: 'link' | 'phone' | 'email') => {
    setContactType(type);
    setFormData({
      ...formData,
      link: '',
      phone: '',
      email: ''
    });
  };

  // Handle contact input change
  const handleContactInputChange = (value: string) => {
    if (contactType === 'link') {
      setFormData({ ...formData, link: value });
    } else if (contactType === 'phone') {
      setFormData({ ...formData, phone: value });
    } else if (contactType === 'email') {
      setFormData({ ...formData, email: value });
    }
  };

  // Get current contact value
  const getContactValue = () => {
    if (contactType === 'link') return formData.link;
    if (contactType === 'phone') return formData.phone;
    if (contactType === 'email') return formData.email;
    return '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    if (!selectedPost) return;
    
    setIsSubmitting(true);
    const success = await onCreateCampaign(
      selectedPost.id,
      {
        name: formData.name,
        link: formData.link || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        cta: formData.cta,
        location: formData.location,
        budget: formData.budget,
        days: formData.days
      }
    );
    setIsSubmitting(false);
    
    if (success) {
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }
  };

  const selectPost = (post: Post) => {
    setSelectedPost(post);
    
    // Get all media URLs
    const mediaUrls = post.media_urls || (post.media_url ? [post.media_url] : []);
    const mediaUrl = mediaUrls[0] || '';
    
    setFormData({
      ...formData,
      name: post.content?.substring(0, 30) || 'New Campaign',
      type: post.type === 'video' ? 'video' : 'image',
      mediaUrl: mediaUrl,
      mediaUrls: mediaUrls,
      description: post.content || '',
    });
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pagination handlers
  const nextPage = () => {
    const totalPages = Math.ceil(totalPosts / postsPerPage);
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown date';
    }
  };

  // Get all media from post
  const getPostMedia = (post: Post) => {
    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      return post.media_urls;
    }
    if (post.media_url) {
      return [post.media_url];
    }
    return [];
  };

  // Check if post has video
  const isVideoPost = (post: Post) => {
    if (post.type === 'video') return true;
    if (post.media_types && Array.isArray(post.media_types)) {
      return post.media_types.some(type => type?.startsWith('video/'));
    }
    return post.media_type?.startsWith('video/') || false;
  };

  const currentPosts = getCurrentPosts();
  const totalPages = Math.ceil(totalPosts / postsPerPage);

  // If we have an initial post and we're still on step 1, go to step 2
  useEffect(() => {
    if (initialPost && step === 1 && selectedPost) {
      setStep(2);
    }
  }, [initialPost, step, selectedPost]);

  // Empty state
  if (!loading && userPosts.length === 0 && cachedPosts.length === 0 && !initialPost) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faImage} className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400">No posts yet</p>
            <p className="text-zinc-600 text-sm mt-1">Create a post first to boost it</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Post
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-in slide-in-from-bottom-4 duration-500 px-4 py-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        {(step > 1 || onBack) && (
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
            aria-label="Go back"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-white" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            {initialPost ? 'Boost Your Post' : 'Create New Campaign'}
          </h2>
          <p className="text-zinc-400 mt-1 text-sm md:text-base">
            {initialPost ? 'Configure your ad settings below' : 'Boost your posts and reach more people for FREE'}
          </p>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          {[1, 2, 3, 4].map((s) => (
            <div 
              key={s}
              className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm font-bold transition-colors ${
                step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {step > s ? <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4 md:w-5 md:h-5" /> : s}
            </div>
          ))}
        </div>
      </div>

      {/* Free Promotion Banner */}
      {!initialPost && (
        <div className="mb-6 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <FontAwesomeIcon icon={faStar} className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-emerald-400 font-bold">Free Promotion on UNERA</h3>
              <p className="text-sm text-zinc-400">All ad campaigns are completely free. No costs, no hidden fees!</p>
            </div>
          </div>
        </div>
      )}

      {/* Selected Post Banner (when coming from push more) */}
      {initialPost && selectedPost && step === 2 && (
        <div className="mb-6 bg-blue-600/10 border border-blue-600/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
              {selectedPost.media_url ? (
                <img 
                  src={selectedPost.media_url} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faImage} className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-blue-400 font-bold">Selected Post</h3>
              <p className="text-sm text-zinc-300 line-clamp-1">{selectedPost.content || 'Post content'}</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-sm text-zinc-400 hover:text-white px-3 py-1 rounded-lg hover:bg-zinc-800"
            >
              Change
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        {step === 1 && !initialPost && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Select a post to boost</h3>
              <div className="flex items-center gap-2">
                {/* Display mode toggle */}
                <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
                  <button
                    onClick={() => setDisplayMode('grid')}
                    className={`p-2 rounded-lg transition-colors ${
                      displayMode === 'grid' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Grid view"
                  >
                    <FontAwesomeIcon icon={faThLarge} className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDisplayMode('list')}
                    className={`p-2 rounded-lg transition-colors ${
                      displayMode === 'list' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="List view"
                  >
                    <FontAwesomeIcon icon={faList} className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Refresh button */}
                <button
                  onClick={refreshPosts}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                  title="Refresh posts"
                >
                  <FontAwesomeIcon icon={faRedo} className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {loading ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <FontAwesomeIcon icon={faSpinner} className="w-10 h-10 text-blue-500 animate-spin" />
                  <p className="text-zinc-400">Loading your posts...</p>
                </div>
              </div>
            ) : currentPosts.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center">
                    <FontAwesomeIcon icon={faImage} className="w-8 h-8 text-zinc-600" />
                  </div>
                  <p className="text-zinc-400">No posts available</p>
                </div>
              </div>
            ) : (
              <>
                {/* Posts display - Grid or List */}
                {displayMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {currentPosts.map((post) => {
                      const mediaUrls = getPostMedia(post);
                      const hasMultipleMedia = mediaUrls.length > 1;
                      const isVideo = isVideoPost(post);
                      const reactionCount = post.reactions?.length || post.reactions_count || 0;
                      
                      return (
                        <button
                          key={post.id}
                          onClick={() => selectPost(post)}
                          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-blue-600/50 hover:shadow-lg hover:shadow-blue-900/20 transition-all group text-left relative"
                        >
                          {/* Media Grid */}
                          <div className="relative">
                            {mediaUrls.length > 0 ? (
                              <>
                                {mediaUrls.length === 1 ? (
                                  // Single media
                                  <div className="aspect-video bg-zinc-800 relative overflow-hidden">
                                    {isVideo ? (
                                      <div className="relative w-full h-full">
                                        <video 
                                          src={mediaUrls[0]} 
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                          muted
                                        />
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                          <FontAwesomeIcon icon={faPlayCircle} className="w-10 h-10 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                                        </div>
                                      </div>
                                    ) : (
                                      <img 
                                        src={mediaUrls[0]} 
                                        alt="" 
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                          e.currentTarget.src = 'https://via.placeholder.com/400x225?text=Image+Error';
                                        }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  // Multiple media grid
                                  <div className="grid grid-cols-2 gap-0.5 bg-black">
                                    {mediaUrls.slice(0, 4).map((url, idx) => (
                                      <div key={idx} className="aspect-video bg-zinc-800 relative overflow-hidden">
                                        {idx === 3 && mediaUrls.length > 4 ? (
                                          <div className="w-full h-full bg-black/70 flex items-center justify-center">
                                            <span className="text-white font-bold text-lg">+{mediaUrls.length - 3}</span>
                                          </div>
                                        ) : (
                                          <img 
                                            src={url} 
                                            alt="" 
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none';
                                            }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Media count badge */}
                                {hasMultipleMedia && (
                                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs text-white flex items-center gap-1">
                                    <FontAwesomeIcon icon={faImage} className="w-3 h-3" />
                                    <span>{mediaUrls.length}</span>
                                  </div>
                                )}
                                
                                {/* Video badge */}
                                {isVideo && (
                                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs text-white flex items-center gap-1">
                                    <FontAwesomeIcon icon={faVideo} className="w-3 h-3" />
                                    <span>Video</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="aspect-video bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                                <FontAwesomeIcon icon={faFileImage} className="w-12 h-12 text-zinc-600" />
                              </div>
                            )}
                          </div>
                          
                          {/* Post Info */}
                          <div className="p-3">
                            <p className="text-white font-medium text-sm line-clamp-2 mb-2 min-h-[40px]">
                              {post.content || 'Untitled post'}
                            </p>
                            
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-zinc-500">
                                <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                                <span>{formatDate(post.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-zinc-500">
                                <FontAwesomeIcon icon={faHeart} className="w-3 h-3" />
                                <span>{reactionCount}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-all pointer-events-none rounded-xl"></div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // List view
                  <div className="space-y-3">
                    {currentPosts.map((post) => {
                      const mediaUrls = getPostMedia(post);
                      const isVideo = isVideoPost(post);
                      const reactionCount = post.reactions?.length || post.reactions_count || 0;
                      
                      return (
                        <button
                          key={post.id}
                          onClick={() => selectPost(post)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-blue-600/50 hover:bg-zinc-800/80 transition-all group text-left flex"
                        >
                          {/* Thumbnail */}
                          <div className="w-24 h-24 bg-zinc-800 relative flex-shrink-0">
                            {mediaUrls.length > 0 ? (
                              <>
                                {isVideo ? (
                                  <div className="relative w-full h-full">
                                    <img 
                                      src={mediaUrls[0]} 
                                      alt="" 
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                      <FontAwesomeIcon icon={faPlayCircle} className="w-6 h-6 text-white" />
                                    </div>
                                  </div>
                                ) : (
                                  <img 
                                    src={mediaUrls[0]} 
                                    alt="" 
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                {mediaUrls.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/60 text-xs text-white px-1.5 py-0.5 rounded">
                                    +{mediaUrls.length}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                <FontAwesomeIcon icon={faFileImage} className="w-6 h-6 text-zinc-600" />
                              </div>
                            )}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 p-3 min-w-0">
                            <p className="text-white font-medium text-sm line-clamp-2 mb-2">
                              {post.content || 'Untitled post'}
                            </p>
                            
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <span>{formatDate(post.created_at)}</span>
                              <span>•</span>
                              <span>{reactionCount} reactions</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-8">
                    <button
                      onClick={prevPage}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        currentPage === 1
                          ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                          : 'bg-zinc-800 text-white hover:bg-zinc-700'
                      }`}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4" />
                      Previous
                    </button>
                    
                    <span className="text-zinc-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    
                    <button
                      onClick={nextPage}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        currentPage === totalPages
                          ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                          : 'bg-zinc-800 text-white hover:bg-zinc-700'
                      }`}
                    >
                      Next
                      <FontAwesomeIcon icon={faChevronRight} className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                {/* Posts count */}
                <div className="text-center text-sm text-zinc-600">
                  Showing {Math.min(currentPosts.length, postsPerPage)} of {totalPosts} posts
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && selectedPost && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <FontAwesomeIcon icon={faFont} className="w-4 h-4" /> Campaign Name
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Summer Sale 2024"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* Contact Type Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Contact Method</label>
                  <div className="flex gap-2">
                    {CONTACT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => handleContactTypeChange(type.value as any)}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${
                          contactType === type.value
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        <FontAwesomeIcon icon={type.icon} className="w-4 h-4" />
                        <span className="text-sm">{type.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Contact Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <FontAwesomeIcon icon={CONTACT_TYPES.find(t => t.value === contactType)!.icon} className="w-4 h-4" />
                    {CONTACT_TYPES.find(t => t.value === contactType)!.label}
                  </label>
                  <input 
                    type={contactType === 'email' ? 'email' : contactType === 'phone' ? 'tel' : 'url'}
                    required
                    placeholder={CONTACT_TYPES.find(t => t.value === contactType)!.placeholder}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    value={getContactValue()}
                    onChange={(e) => handleContactInputChange(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <FontAwesomeIcon icon={faMousePointer} className="w-4 h-4" /> Call to Action
                  </label>
                  <select 
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all appearance-none"
                    value={formData.cta}
                    onChange={(e) => setFormData({ ...formData, cta: e.target.value as CTAButton })}
                  >
                    {CTA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="w-4 h-4" /> Target Location
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. United States, London, Global"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <FontAwesomeIcon icon={faDollarSign} className="w-4 h-4" /> Daily Budget ($)
                    </label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range"
                        min="1"
                        max="100"
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        value={formData.budget}
                        onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) })}
                      />
                      <span className="bg-zinc-900 px-3 md:px-4 py-2 rounded-lg border border-zinc-800 text-white font-bold w-20 text-center">
                        ${formData.budget}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-400 mt-1">✨ Free promotion - No actual charges</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCalendar} className="w-4 h-4" /> Duration (Days)
                    </label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range"
                        min="1"
                        max="30"
                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        value={formData.days}
                        onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) })}
                      />
                      <span className="bg-zinc-900 px-3 md:px-4 py-2 rounded-lg border border-zinc-800 text-white font-bold w-16 text-center">
                        {formData.days}d
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-emerald-600/10 border border-emerald-600/20 rounded-xl p-4">
                  <p className="text-sm text-emerald-400 font-medium mb-1">Total Campaign Cost</p>
                  <p className="text-2xl font-bold text-white">$0.00</p>
                  <p className="text-xs text-emerald-400 mt-1">✨ Completely free on UNERA</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-3 block">Preview</label>
                <AdPreview 
                  data={{
                    ...formData,
                    link: formData.link || undefined,
                    phone: formData.phone || undefined,
                    email: formData.email || undefined
                  }}
                  advertiserName={currentUser?.name || "Sponsored"}
                  advertiserAvatar={currentUser?.profile_image_url}
                  isVerified={currentUser?.is_verified}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                type="button"
                onClick={handleBack}
                className="flex-1 bg-zinc-800 text-white font-bold py-3 md:py-4 rounded-xl hover:bg-zinc-700 transition-all"
              >
                Back
              </button>
              <button 
                type="submit"
                className="flex-[2] bg-blue-600 text-white font-bold py-3 md:py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
              >
                Review Campaign
              </button>
            </div>
          </form>
        )}

        {step === 3 && selectedPost && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-white">Review Your Campaign</h3>
              <p className="text-zinc-400">Review your ad settings before launching.</p>
            </div>
            
            <div className="flex justify-center">
              <AdPreview 
                data={{
                  ...formData,
                  link: formData.link || undefined,
                  phone: formData.phone || undefined,
                  email: formData.email || undefined
                }}
                advertiserName={currentUser?.name || "Sponsored"}
                advertiserAvatar={currentUser?.profile_image_url}
                isVerified={currentUser?.is_verified}
                isFullView 
              />
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Campaign Name</p>
                  <p className="text-white font-medium">{formData.name}</p>
                </div>
                <div>
                  <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Contact Method</p>
                  <p className="text-white font-medium">
                    {contactType === 'link' && formData.link}
                    {contactType === 'phone' && formData.phone}
                    {contactType === 'email' && formData.email}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Budget & Duration</p>
                  <p className="text-white font-medium">${formData.budget}/day • {formData.days} days</p>
                </div>
                <div>
                  <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Target Location</p>
                  <p className="text-white font-medium">{formData.location}</p>
                </div>
                <div>
                  <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider">Call to Action</p>
                  <p className="text-white font-medium">{formData.cta}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider mb-1">Total Cost</p>
                <p className="text-2xl font-bold text-white">$0.00</p>
                <p className="text-xs text-emerald-400 mt-1">✨ Free promotion on UNERA</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleBack}
                className="flex-1 bg-zinc-800 text-white font-bold py-4 rounded-xl hover:bg-zinc-700 transition-all"
                disabled={isSubmitting}
              >
                Edit Details
              </button>
              <button 
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="flex-[2] bg-emerald-600 text-white font-bold py-4 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 animate-spin" />
                    <span>Launching...</span>
                  </>
                ) : (
                  'Launch Free Campaign'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col items-center justify-center text-center space-y-6 py-12 md:py-20 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl shadow-emerald-900/40">
              <FontAwesomeIcon icon={faCheckCircle} className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </div>
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-white">Campaign Launched!</h3>
              <p className="text-zinc-400 mt-2 max-w-sm text-sm md:text-base">Your free ad is now live and reaching people. Redirecting to dashboard...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
