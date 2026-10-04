
import React, { useState } from 'react';

interface Article {
    id: string;
    title: string;
    category: string;
    content: React.ReactNode;
}

const HELP_ARTICLES: Article[] = [
    {
        id: 'create-account',
        title: 'How to create an account',
        category: 'Account',
        content: (
            <div className="space-y-4">
                <p className="text-[16px] leading-relaxed text-[#94A3B8]">Joining UNERA is quick and easy. Follow these steps to get started connecting with your community.</p>
                
                <div className="my-6 rounded-xl overflow-hidden border border-[#1E293B]">
                    <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80" alt="Connecting" className="w-full h-48 object-cover" />
                </div>

                <div className="bg-[#0F172A] p-4 rounded-lg border border-[#1E293B] my-4">
                    <h4 className="font-bold text-white mb-2">Step-by-Step Guide</h4>
                    <ol className="list-decimal list-inside space-y-3 text-[#F8FAFC] text-[15px]">
                        <li>Open the <strong>UNERA</strong> website or app.</li>
                        <li>On the login screen, click the green <strong>"Create New Account"</strong> button.</li>
                        <li>A registration form will appear. Enter your <strong>First Name</strong>, <strong>Surname</strong>, and <strong>Email Address</strong>.</li>
                        <li>Create a secure <strong>Password</strong> (must be at least 6 digits/characters).</li>
                        <li>Select your <strong>Date of Birth</strong> and <strong>Gender</strong>.</li>
                        <li>Click <strong>Sign Up</strong> to complete the process.</li>
                    </ol>
                </div>

                <div className="bg-[#263951] p-4 rounded-lg text-[15px] text-[#F8FAFC] border border-[#2D88FF]/30 flex gap-3 items-start">
                    <i className="fas fa-info-circle text-[#2D88FF] mt-1"></i>
                    <div>
                        <strong>Tip:</strong> Use an email address you have access to. This will be needed if you ever need to reset your password.
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'upload-profile',
        title: 'How to upload profile & cover photos',
        category: 'Profile',
        content: (
            <div className="space-y-4">
                <p className="text-[16px] leading-relaxed text-[#94A3B8]">Personalize your profile to let friends know it's you. Your profile picture and cover photo are the first things people see.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div className="bg-[#0F172A] p-4 rounded-xl border border-[#1E293B]">
                        <img src="https://images.unsplash.com/photo-1511367461989-f85a21fda167?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" className="w-full h-32 object-cover rounded-lg mb-3" alt="Profile" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-[#1E293B] flex items-center justify-center text-[#1877F2]"><i className="fas fa-camera"></i></div>
                            <h4 className="font-bold text-white text-lg">Profile Picture</h4>
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-[#F8FAFC] text-sm">
                            <li>Go to your profile by clicking your name.</li>
                            <li>Click the <strong>Camera Icon</strong> on your circular picture.</li>
                            <li>Select <strong>Upload Photo</strong>.</li>
                        </ol>
                    </div>

                    <div className="bg-[#0F172A] p-4 rounded-xl border border-[#1E293B]">
                        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" className="w-full h-32 object-cover rounded-lg mb-3" alt="Cover" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-[#1E293B] flex items-center justify-center text-[#1877F2]"><i className="fas fa-image"></i></div>
                            <h4 className="font-bold text-white text-lg">Cover Photo</h4>
                        </div>
                        <ol className="list-decimal list-inside space-y-2 text-[#F8FAFC] text-sm">
                            <li>Go to your profile page.</li>
                            <li>Click <strong>"Edit Cover Photo"</strong> in the banner area.</li>
                            <li>Choose an image that represents you.</li>
                        </ol>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'music',
        title: 'F-Music & Podcasts',
        category: 'Music',
        content: (
            <div className="space-y-6">
                <p className="text-[16px] text-[#B0B3B8]">F-Music is a platform for artists and listeners alike. Enjoy high-quality streaming directly in your feed.</p>
                
                <div className="bg-gradient-to-br from-[#1877F2] to-[#00A400] p-6 rounded-xl relative overflow-hidden">
                    <div className="relative z-10">
                        <h4 className="font-bold text-white text-xl mb-2">Listen & Upload</h4>
                        <p className="text-white/90 text-sm mb-4">Discover the latest tracks or share your own talent with the world.</p>
                        <img src="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" className="w-full h-40 object-cover rounded-lg shadow-2xl border border-white/20" alt="Music" />
                    </div>
                </div>
                
                <div>
                    <h4 className="font-bold text-white text-lg mb-3">For Artists & Creators</h4>
                    <div className="bg-[#0F172A] border border-[#1E293B] rounded-lg p-4">
                        <ol className="list-decimal list-inside space-y-3 text-[#F8FAFC]">
                            <li>Go to <strong>Music</strong> and click <strong>Dashboard</strong>.</li>
                            <li>Click <strong>Upload New Content</strong>.</li>
                            <li>Select <strong>Single</strong>, <strong>Album</strong>, or <strong>Podcast</strong>.</li>
                            <li>Upload your audio and artwork.</li>
                        </ol>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'marketplace',
        title: 'Buying & Selling on Marketplace',
        category: 'Marketplace',
        content: (
            <div className="space-y-6">
                <p className="text-[16px] text-[#94A3B8]">Discover items nearby or sell things you no longer need using UNERA Marketplace.</p>
                
                <div className="rounded-xl overflow-hidden mb-4">
                    <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80" className="w-full h-48 object-cover" alt="Shopping" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#0F172A] p-5 rounded-xl border border-[#1E293B]">
                        <div className="w-10 h-10 bg-[#45BD62]/20 rounded-full flex items-center justify-center mb-3 text-[#45BD62]"><i className="fas fa-shopping-bag text-xl"></i></div>
                        <h4 className="font-bold text-white text-lg mb-2">How to Buy</h4>
                        <ul className="text-sm text-[#F8FAFC] space-y-2">
                            <li>Browse categories or search for items.</li>
                            <li>Click <strong>Message</strong> to contact the seller.</li>
                            <li>Agree on a meeting place for the transaction.</li>
                        </ul>
                    </div>

                    <div className="bg-[#0F172A] p-5 rounded-xl border border-[#1E293B]">
                        <div className="w-10 h-10 bg-[#1877F2]/20 rounded-full flex items-center justify-center mb-3 text-[#1877F2]"><i className="fas fa-tag text-xl"></i></div>
                        <h4 className="font-bold text-white text-lg mb-2">How to Sell</h4>
                        <ul className="text-sm text-[#F8FAFC] space-y-2">
                            <li>Click <strong>Sell</strong> in the header.</li>
                            <li>Upload clear photos (max 4).</li>
                            <li>Set price, description, and location.</li>
                        </ul>
                    </div>
                </div>
            </div>
        )
    }
];

const CATEGORIES = [
    { id: 'Account', icon: 'fas fa-user-circle', label: 'Account Settings', desc: 'Login, Password, Security' },
    { id: 'Profile', icon: 'fas fa-id-card', label: 'Profile & Content', desc: 'Photos, Bio, Posts' },
    { id: 'Groups', icon: 'fas fa-users', label: 'Groups', desc: 'Join, Create, Manage' },
    { id: 'Music', icon: 'fas fa-music', label: 'F-Music', desc: 'Streaming, Uploading' },
    { id: 'Marketplace', icon: 'fas fa-store', label: 'Marketplace', desc: 'Buying, Selling' },
    { id: 'Privacy', icon: 'fas fa-shield-alt', label: 'Privacy & Safety', desc: 'Blocking, Reporting' },
];

export const HelpSupportPage: React.FC<{ onNavigateHome: () => void }> = ({ onNavigateHome }) => {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [activeArticle, setActiveArticle] = useState<Article | null>(null);

    const filteredArticles = search 
        ? HELP_ARTICLES.filter(a => a.title.toLowerCase().includes(search.toLowerCase()) || a.category.toLowerCase().includes(search.toLowerCase()))
        : activeCategory 
            ? HELP_ARTICLES.filter(a => a.category === activeCategory)
            : HELP_ARTICLES.slice(0, 4);

    const handleCategoryClick = (catId: string) => {
        setActiveCategory(catId);
        setActiveArticle(null);
        setSearch('');
    };

    const handleArticleClick = (article: Article) => {
        setActiveArticle(article);
        window.scrollTo(0, 0);
    };

    return (
        <div className="w-full min-h-screen bg-[#050B18] font-sans text-[#F8FAFC] pb-20">
            <div className="bg-gradient-to-r from-[#1877F2] to-[#0062E3] py-16 px-4 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                <div className="relative z-10 max-w-[700px] mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Help Center</h1>
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Search help articles..." 
                            className="w-full h-14 pl-12 pr-4 rounded-full bg-white text-gray-900 text-lg outline-none shadow-2xl placeholder-gray-500"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setActiveArticle(null); if(e.target.value) setActiveCategory(null); }}
                        />
                        <i className="fas fa-search absolute left-5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl"></i>
                    </div>
                </div>
            </div>

            <div className="max-w-[1000px] mx-auto px-4 py-8">
                <div className="flex items-center gap-2 mb-6 text-sm text-[#94A3B8]">
                    <span className="cursor-pointer hover:underline" onClick={() => { setActiveCategory(null); setActiveArticle(null); setSearch(''); }}>Help Center</span>
                    {(activeCategory || activeArticle || search) && (
                        <>
                            <i className="fas fa-chevron-right text-xs"></i>
                            {activeArticle ? (
                                <>
                                    <span className="cursor-pointer hover:underline" onClick={() => { setActiveArticle(null); }}>{articleCategory(activeArticle)}</span>
                                    <i className="fas fa-chevron-right text-xs"></i>
                                    <span className="text-white font-semibold truncate max-w-[200px]">{activeArticle.title}</span>
                                </>
                            ) : (
                                <span className="text-white font-semibold">{search ? `Results for "${search}"` : activeCategory}</span>
                            )}
                        </>
                    )}
                </div>

                {activeArticle ? (
                    <div className="bg-[#0F172A] rounded-xl border border-[#1E293B] overflow-hidden shadow-sm animate-fade-in max-w-[800px] mx-auto">
                        <div className="p-6 border-b border-[#1E293B] flex items-center gap-4">
                            <button onClick={() => setActiveArticle(null)} className="w-9 h-9 rounded-full bg-[#1E293B] hover:bg-[#334155] flex items-center justify-center transition-colors">
                                <i className="fas fa-arrow-left text-[#F8FAFC]"></i>
                            </button>
                            <h2 className="text-2xl font-bold text-[#F8FAFC]">{activeArticle.title}</h2>
                        </div>
                        <div className="p-6 md:p-10">{activeArticle.content}</div>
                        <div className="p-6 bg-[#0B1120] border-t border-[#1E293B] text-center">
                            <p className="text-[#94A3B8] mb-4">Was this article helpful?</p>
                            <div className="flex justify-center gap-4">
                                <button className="bg-[#1E293B] hover:bg-[#1877F2] hover:text-white px-6 py-2 rounded-full font-semibold transition-all">Yes</button>
                                <button className="bg-[#1E293B] hover:bg-red-500 hover:text-white px-6 py-2 rounded-full font-semibold transition-all">No</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="animate-fade-in">
                        {!search && !activeCategory && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                                {CATEGORIES.map(cat => (
                                    <div 
                                        key={cat.id} 
                                        className="bg-[#0F172A] p-6 rounded-xl border border-[#1E293B] cursor-pointer hover:bg-[#1E293B] hover:border-[#1877F2] transition-all group shadow-sm"
                                        onClick={() => handleCategoryClick(cat.id)}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#1E293B] group-hover:bg-[#1877F2] flex items-center justify-center mb-4 transition-colors">
                                            <i className={`${cat.icon} text-xl text-[#F8FAFC] group-hover:text-white`}></i>
                                        </div>
                                        <h3 className="text-xl font-bold text-[#F8FAFC] mb-2">{cat.label}</h3>
                                        <p className="text-[#94A3B8] text-sm">{cat.desc}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-[#0F172A] rounded-xl border border-[#1E293B] overflow-hidden max-w-[800px] mx-auto">
                            <div className="p-4 border-b border-[#1E293B] bg-[#0B1120]">
                                <h3 className="font-bold text-lg text-[#F8FAFC]">
                                    {search ? 'Search Results' : activeCategory ? `${activeCategory} Articles` : 'Popular Articles'}
                                </h3>
                            </div>
                            <div className="divide-y divide-[#1E293B]">
                                {filteredArticles.length > 0 ? filteredArticles.map(article => (
                                    <div 
                                        key={article.id} 
                                        className="p-4 hover:bg-[#1E293B] cursor-pointer transition-colors flex items-center justify-between group"
                                        onClick={() => handleArticleClick(article)}
                                    >
                                        <div>
                                            <h4 className="text-[#1877F2] font-semibold text-[17px] group-hover:underline mb-1">{article.title}</h4>
                                            <p className="text-[#94A3B8] text-sm line-clamp-1">{article.category} • Click to read</p>
                                        </div>
                                        <i className="fas fa-chevron-right text-[#94A3B8]"></i>
                                    </div>
                                )) : (
                                    <div className="p-8 text-center text-[#94A3B8]">
                                        <p>No articles found.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

function articleCategory(article: Article) {
    return article.category;
}
