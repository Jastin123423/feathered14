// EventsPage.tsx - Updated with API integration
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Event } from '../types';

// --- HELPER FUNCTIONS ---
const linkify = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
        if (part.match(urlRegex)) {
            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#1877F2] hover:underline" onClick={e => e.stopPropagation()}>{part}</a>;
        }
        return part;
    });
};

const shuffleArray = (array: any[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// --- NORMALIZATION HELPER ---
const safeArr = (v: any): number[] => (Array.isArray(v) ? v.map(Number) : []);

const normalizeEvent = (e: any) => {
  const dateStr = e?.event_date ?? e?.date ?? "";
  return {
    ...e,
    // ID safety
    id: Number(e?.id ?? 0),

    // unify date
    date: dateStr,

    // unify image
    image: e?.cover_url ?? e?.image ?? e?.cover_image ?? "",

    // unify attendance arrays
    attendees: safeArr(e?.attendees ?? e?.attendee_ids),
    interestedIds: safeArr(e?.interestedIds ?? e?.interested_ids),

    // unify organizer
    organizerId: Number(e?.organizerId ?? e?.creator_id ?? e?.user_id ?? 0),

    // fallback fields used in UI
    time: e?.time ?? e?.event_time ?? "",
    location: e?.location ?? "",
    title: e?.title ?? "Untitled event",
    description: e?.description ?? "",
    visibility: e?.visibility ?? "worldwide",
  };
};

interface EventsPageProps { 
    events: Event[]; 
    currentUser: User | null; 
    onJoinEvent: (eventId: number) => Promise<void>; 
    onInterestedEvent: (eventId: number) => Promise<void>;
    onCreateEventClick: () => void; 
    onProfileClick: (id: number) => void;
    onFollow: (id: number) => Promise<void>;
    checkIsFollowing: (id: number) => boolean;
}

const CompactEventCard: React.FC<{ 
    event: any, // Changed to any to accept normalized events
    currentUser: User | null, 
    onClick: () => void,
    onJoin: (e: React.MouseEvent) => void,
    onInterested: (e: React.MouseEvent) => void,
    isWide?: boolean
}> = ({ event, currentUser, onClick, onJoin, onInterested, isWide }) => {
    // Safe date parsing
    const date = new Date(event.date || event.event_date || event.created_at || Date.now());
    
    // Safe array access
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const interestedIds = Array.isArray(event.interestedIds) ? event.interestedIds : [];
    
    const isAttending = currentUser && attendees.includes(currentUser.id);
    const isInterested = currentUser && interestedIds.includes(currentUser.id);

    return (
        <div 
            onClick={onClick}
            className={`bg-[#0F172A] rounded-xl overflow-hidden border border-[#1E293B] flex flex-col hover:bg-[#1E293B] transition-all cursor-pointer shadow-md group ${isWide ? 'w-[260px] shrink-0' : 'w-full'}`}
        >
            <div className="h-32 relative overflow-hidden">
                <img src={event.image || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                <div className="absolute top-2 left-2 bg-white/95 text-black rounded-lg px-2 py-1 text-center shadow-lg min-w-[36px]">
                    <div className="text-[8px] font-black uppercase text-[#1877F2] leading-none">{date.toLocaleString('default', { month: 'short' })}</div>
                    <div className="text-[14px] font-black leading-tight">{date.getDate()}</div>
                </div>
                {event.visibility === 'targeted' && (
                    <div className="absolute top-2 right-2 bg-[#45BD62] text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg uppercase tracking-tighter">
                        Local
                    </div>
                )}
            </div>
            
            <div className="p-3 flex flex-col flex-1">
                <h3 className="text-[14px] font-bold text-[#F8FAFC] line-clamp-1 mb-1 leading-tight group-hover:text-[#1877F2] transition-colors">{event.title}</h3>
                <p className="text-[11px] text-[#94A3B8] font-medium truncate mb-1">
                    {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {event.time}
                </p>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#94A3B8] mb-3">
                    <i className="fas fa-users text-[#45BD62] text-[9px]"></i>
                    <span>{attendees.length} going • {interestedIds.length} interested</span>
                </div>

                <div className="mt-auto flex gap-1.5">
                    <button 
                        onClick={onInterested}
                        disabled={!!isAttending}
                        className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1 border ${
                            isInterested 
                            ? 'bg-[#FAB400]/20 text-[#FAB400] border-[#FAB400]/30' 
                            : isAttending 
                                ? 'opacity-30 cursor-not-allowed' 
                                : 'bg-[#1E293B] text-[#F8FAFC] border-transparent hover:bg-[#334155]'
                        }`}
                    >
                        <i className={`${isInterested ? 'fas' : 'far'} fa-star text-[9px]`}></i>
                        <span>Interested</span>
                    </button>
                    <button 
                        onClick={onJoin}
                        className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition-all flex items-center justify-center gap-1 shadow-md ${
                            isAttending 
                            ? 'bg-[#45BD62] text-white' 
                            : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                        }`}
                    >
                        <i className={`fas ${isAttending ? 'fa-check' : 'fa-plus'} text-[9px]`}></i>
                        <span>{isAttending ? 'Going' : 'Going'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export const EventDetailsModal: React.FC<{ 
    event: any, // Accepts normalized events or feed event objects
    currentUser: User | null, 
    onClose: () => void, 
    onJoin: () => void, 
    onInterested: () => void,
    onProfileClick: (id: number) => void 
}> = ({ event, currentUser, onClose, onJoin, onInterested, onProfileClick }) => {
    // Safe date parsing
    const date = new Date(event.date || event.event_date || event.created_at || Date.now());
    
    // Safe array access & counts
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    const interestedIds = Array.isArray(event.interestedIds) ? event.interestedIds : [];
    const attendeesCount = attendees.length > 0 ? attendees.length : Number(event.attendees_count || event.attending_count || 0);
    const interestedCount = interestedIds.length > 0 ? interestedIds.length : Number(event.interested_count || 0);
    
    const isAttending = (currentUser && attendees.includes(currentUser.id)) || event.user_rsvp_status === 'going' || event.my_rsvp_status === 'going';
    const isInterested = (currentUser && interestedIds.includes(currentUser.id)) || event.user_rsvp_status === 'interested' || event.my_rsvp_status === 'interested';
    const eventImage = event.image || event.cover_url || event.media_url || '';

    return (
        <div className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center p-0 sm:p-4 animate-fade-in backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#0F172A] w-full max-w-[700px] h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-[#1E293B]" onClick={e => e.stopPropagation()}>
                <div className="relative h-[250px] sm:h-[350px] shrink-0 bg-[#050B18]">
                    {eventImage ? (
                        <img src={eventImage} className="w-full h-full object-cover" alt={event.title || 'Event'} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-[#0F172A] to-[#1E293B]">
                            <i className="fas fa-calendar-alt text-[#1877F2] text-6xl opacity-50"></i>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-transparent"></div>
                    <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all border border-white/10 cursor-pointer z-10" aria-label="Close">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                        <div>
                            <p className="text-[#F3425F] font-black uppercase text-sm tracking-widest mb-1">
                                {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                            <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">{event.title}</h2>
                            {event.location && (
                                <div className="flex items-center gap-2 text-[#B0B3B8] font-bold mt-2">
                                    <i className="fas fa-location-dot text-[#1877F2]"></i>
                                    <span>{event.location}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button 
                                onClick={onInterested}
                                disabled={!!isAttending}
                                className={`flex-1 sm:px-6 py-2.5 rounded-xl font-black text-[15px] transition-all flex items-center justify-center gap-2 ${
                                    isInterested 
                                    ? 'bg-[#FAB400]/20 text-[#FAB400] border border-[#FAB400]/30' 
                                    : isAttending ? 'opacity-30 cursor-not-allowed' : 'bg-[#1E293B] text-[#F8FAFC] hover:bg-[#334155]'
                                }`}
                            >
                                <i className={`${isInterested ? 'fas' : 'far'} fa-star`}></i>
                                <span>{isInterested ? 'Interested' : 'Interested'}</span>
                            </button>
                            <button 
                                onClick={onJoin}
                                className={`flex-1 sm:px-8 py-2.5 rounded-xl font-black text-[15px] transition-all flex items-center justify-center gap-2 shadow-lg ${
                                    isAttending 
                                    ? 'bg-[#45BD62] text-white' 
                                    : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                                }`}
                            >
                                <i className={`fas ${isAttending ? 'fa-check' : 'fa-plus'}`}></i>
                                <span>{isAttending ? 'Going' : 'Going'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-6">
                            <div>
                                <h3 className="text-white font-black uppercase text-xs tracking-widest mb-3 pb-2 border-b border-[#1E293B] w-fit pr-8">Description</h3>
                                <p className="text-[#F8FAFC] text-[16px] leading-relaxed whitespace-pre-wrap">
                                    {event.description ? linkify(event.description) : 'No description provided for this event.'}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-[#050B18] p-4 rounded-xl border border-[#1E293B]">
                                <h4 className="text-xs font-black text-[#94A3B8] uppercase tracking-widest mb-4">Event Details</h4>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center"><i className="fas fa-clock text-[#1877F2]"></i></div>
                                        <div>
                                            <p className="text-white text-sm font-bold">{event.time || date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            <p className="text-[10px] text-[#94A3B8] font-bold">Standard Time</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center"><i className="fas fa-users text-[#45BD62]"></i></div>
                                        <div>
                                            <p className="text-white text-sm font-bold">{attendeesCount} Attendees</p>
                                            <p className="text-[10px] text-[#94A3B8] font-bold">{interestedCount} interested</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#1E293B] flex items-center justify-center"><i className="fas fa-globe text-[#A033FF]"></i></div>
                                        <div>
                                            <p className="text-white text-sm font-bold capitalize">{event.visibility || 'Worldwide'}</p>
                                            <p className="text-[10px] text-[#94A3B8] font-bold">Visibility Scope</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EventsPage: React.FC<EventsPageProps> = ({ 
    events, 
    currentUser, 
    onJoinEvent, 
    onInterestedEvent, 
    onCreateEventClick,
    onProfileClick,
    onFollow,
    checkIsFollowing 
}) => {
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedEvent, setSelectedEvent] = useState<any | null>(null); // Changed to any
    const [shuffledEvents, setShuffledEvents] = useState<any[]>([]); // Changed to any[]
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const categories = ['All', 'Discover', 'Hosting', 'Upcoming'];

    // Normalize events
    const safeEvents = useMemo(() => {
        const list = Array.isArray(events) ? events : [];
        return list.map(normalizeEvent);
    }, [events]);

    // Filter logic with normalized events
    const filteredEvents = useMemo(() => {
        let visible = safeEvents.filter(event => {
            if (!event.visibility || event.visibility === 'worldwide') return true;
            if (event.visibility === 'targeted') {
                if (!currentUser) return false;
                const userLoc = currentUser.location?.toLowerCase() || '';
                const eventLoc = event.location?.toLowerCase() || '';
                const userRegion = userLoc.split(',').pop()?.trim() || userLoc;
                const eventRegion = eventLoc.split(',').pop()?.trim() || eventLoc;
                return userLoc.includes(eventRegion) || eventLoc.includes(userRegion) || userRegion === eventRegion;
            }
            return true;
        });

        if (selectedCategory === 'Hosting' && currentUser) {
            return visible.filter(e => e.organizerId === currentUser.id);
        }
        if (selectedCategory === 'Upcoming' && currentUser) {
            return visible.filter(e =>
                e.attendees.includes(currentUser.id) ||
                e.interestedIds.includes(currentUser.id)
            );
        }
        return visible;
    }, [safeEvents, selectedCategory, currentUser]);

    // Shuffle only on category change to create the "rotating" feel
    useEffect(() => {
        setShuffledEvents(shuffleArray(filteredEvents));
    }, [filteredEvents]);

    // Split events into chunks for alternating layout
    const alternatingChunks = useMemo(() => {
        const chunks = [];
        let i = 0;
        let isGrid = true;
        
        while (i < shuffledEvents.length) {
            const count = isGrid ? 4 : 4;
            chunks.push({
                type: isGrid ? 'grid' : 'slider',
                items: shuffledEvents.slice(i, i + count)
            });
            i += count;
            isGrid = !isGrid;
        }
        return chunks;
    }, [shuffledEvents]);

    const handleJoinEvent = async (e: React.MouseEvent, eventId: number) => {
        e.stopPropagation();
        if (!currentUser) return;
        
        setLoading(true);
        try {
            await onJoinEvent(eventId);
        } catch (err: any) {
            setError(err.message || 'Failed to join event');
        } finally {
            setLoading(false);
        }
    };

    const handleInterestedEvent = async (e: React.MouseEvent, eventId: number) => {
        e.stopPropagation();
        if (!currentUser) return;
        
        setLoading(true);
        try {
            await onInterestedEvent(eventId);
        } catch (err: any) {
            setError(err.message || 'Failed to mark interest');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-[1000px] mx-auto p-4 font-sans pb-24 animate-fade-in">
            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-200 text-sm">
                    <div className="flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{error}</span>
                        <button 
                            onClick={() => setError('')} 
                            className="ml-auto text-xs hover:text-white"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                    <div className="bg-[#0F172A] p-6 rounded-xl border border-[#1E293B] flex items-center gap-3">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-white font-medium">Processing...</span>
                    </div>
                </div>
            )}

            {/* Minimal Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-[#0F172A] p-6 rounded-2xl border border-[#1E293B] shadow-xl">
                <div>
                    <h1 className="text-3xl font-black text-[#F8FAFC]">Events</h1>
                    <p className="text-[#94A3B8] text-sm font-bold uppercase tracking-widest mt-1">Happening in your community</p>
                </div>
                {currentUser && (
                    <button 
                        onClick={onCreateEventClick}
                        disabled={loading}
                        className="bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-2xl font-black flex items-center gap-3 transition-all shadow-lg active:scale-95"
                    >
                        <i className="fas fa-calendar-plus text-xl"></i>
                        <span>Create Event</span>
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-10 overflow-x-auto scrollbar-hide">
                {categories.map(cat => (
                    <button 
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        disabled={loading}
                        className={`px-6 py-2.5 rounded-full font-black text-xs uppercase tracking-widest border transition-all ${
                            selectedCategory === cat 
                            ? 'bg-[#1877F2] border-[#1877F2] text-white shadow-lg' 
                            : 'bg-[#0F172A] border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B]'
                        } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {shuffledEvents.length > 0 ? (
                <div className="space-y-16">
                    {alternatingChunks.map((chunk, idx) => (
                        <div key={idx} className="animate-fade-in">
                            {chunk.type === 'slider' ? (
                                <div className="relative">
                                    <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide">
                                        {chunk.items.map((event: any) => (
                                            <CompactEventCard 
                                                key={event.id}
                                                event={event}
                                                currentUser={currentUser}
                                                isWide={true}
                                                onClick={() => setSelectedEvent(event)}
                                                onJoin={(e) => handleJoinEvent(e, event.id)}
                                                onInterested={(e) => handleInterestedEvent(e, event.id)}
                                            />
                                        ))}
                                    </div>
                                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0F172A] rounded-full flex items-center justify-center shadow-lg border border-[#1E293B] hidden md:flex opacity-50"><i className="fas fa-chevron-left text-[10px]"></i></div>
                                    <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0F172A] rounded-full flex items-center justify-center shadow-lg border border-[#1E293B] hidden md:flex opacity-50"><i className="fas fa-chevron-right text-[10px]"></i></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {chunk.items.map((event: any) => (
                                        <CompactEventCard 
                                            key={event.id}
                                            event={event}
                                            currentUser={currentUser}
                                            onClick={() => setSelectedEvent(event)}
                                            onJoin={(e) => handleJoinEvent(e, event.id)}
                                            onInterested={(e) => handleInterestedEvent(e, event.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-20 text-center text-[#94A3B8] bg-[#0F172A] rounded-3xl border border-[#1E293B] shadow-inner">
                    <div className="w-24 h-24 bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fas fa-calendar-xmark text-5xl opacity-20"></i>
                    </div>
                    <h3 className="text-xl font-black text-[#F8FAFC] mb-2">No events found</h3>
                    <p className="max-w-xs mx-auto font-medium">
                        {selectedCategory === 'Hosting' 
                            ? 'You haven\'t created any events yet.' 
                            : selectedCategory === 'Upcoming'
                            ? 'You\'re not attending or interested in any upcoming events.'
                            : 'Try changing your filters or check back later for new gatherings.'}
                    </p>
                    {selectedCategory !== 'All' && (
                        <button 
                            onClick={() => setSelectedCategory('All')}
                            className="mt-4 px-6 py-2 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-lg font-medium transition-colors"
                        >
                            View All Events
                        </button>
                    )}
                </div>
            )}

            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventDetailsModal 
                    event={selectedEvent}
                    currentUser={currentUser}
                    onClose={() => setSelectedEvent(null)}
                    onJoin={() => onJoinEvent(selectedEvent.id)}
                    onInterested={() => onInterestedEvent(selectedEvent.id)}
                    onProfileClick={onProfileClick}
                />
            )}
        </div>
    );
};

// Export both named and default (Pattern B)
export { EventsPage };
export default EventsPage;
