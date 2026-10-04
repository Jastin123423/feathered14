
import React, { useState } from 'react';
import { Notification, User } from '../types';

interface NotificationDropdownProps {
    notifications: Notification[];
    users: User[];
    currentUser?: User | null;
    onNotificationClick: (n: Notification) => void;
    onMarkAllRead: () => void;
    onAcceptGroupInvite?: (inviteId: number, groupId: number) => Promise<any> | void;
    onDeclineGroupInvite?: (inviteId: number, groupId: number) => Promise<any> | void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
    notifications,
    users,
    currentUser,
    onNotificationClick,
    onMarkAllRead,
    onAcceptGroupInvite,
    onDeclineGroupInvite,
}) => {
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [inviteStatus, setInviteStatus] = useState<Record<number, 'joined' | 'rejected'>>({});
    const [inviteLoading, setInviteLoading] = useState<Record<number, boolean>>({});

    const handleJoinInvite = async (e: React.MouseEvent, notif: Notification) => {
        e.stopPropagation();
        const notifId = Number(notif.id || 0);
        const groupId = Number((notif as any).group_id || notif.entity_id || 0);
        const inviteId = Number((notif as any).invite_id || (notif as any).parent_id || 0);

        setInviteLoading((prev) => ({ ...prev, [notifId]: true }));
        try {
            if (onAcceptGroupInvite) {
                await onAcceptGroupInvite(inviteId, groupId);
            } else {
                const targetInviteId = inviteId || 0;
                await fetch(`/api/group-invites?id=${targetInviteId}${groupId ? `&group_id=${groupId}` : ''}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': String(currentUser?.id || ''),
                    },
                    body: JSON.stringify({ user_id: currentUser?.id, status: 'accepted', group_id: groupId }),
                });
            }
            setInviteStatus((prev) => ({ ...prev, [notifId]: 'joined' }));
        } catch (err) {
            console.error('Failed to accept invite:', err);
        } finally {
            setInviteLoading((prev) => ({ ...prev, [notifId]: false }));
        }
    };

    const handleRejectInvite = async (e: React.MouseEvent, notif: Notification) => {
        e.stopPropagation();
        const notifId = Number(notif.id || 0);
        const groupId = Number((notif as any).group_id || notif.entity_id || 0);
        const inviteId = Number((notif as any).invite_id || (notif as any).parent_id || 0);

        setInviteLoading((prev) => ({ ...prev, [notifId]: true }));
        try {
            if (onDeclineGroupInvite) {
                await onDeclineGroupInvite(inviteId, groupId);
            } else {
                const targetInviteId = inviteId || 0;
                await fetch(`/api/group-invites?id=${targetInviteId}${groupId ? `&group_id=${groupId}` : ''}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': String(currentUser?.id || ''),
                    },
                    body: JSON.stringify({ id: targetInviteId, status: 'declined', user_id: currentUser?.id, group_id: groupId }),
                });
            }
            setInviteStatus((prev) => ({ ...prev, [notifId]: 'rejected' }));
        } catch (err) {
            console.error('Failed to decline invite:', err);
        } finally {
            setInviteLoading((prev) => ({ ...prev, [notifId]: false }));
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'like':
                return (
                    <div className="w-5 h-5 bg-[#EF4444] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-heart text-white text-[9px]"></i>
                    </div>
                );
            case 'group_invite':
            case 'invite':
                return (
                    <div className="w-5 h-5 bg-[#1877F2] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-users text-white text-[9px]"></i>
                    </div>
                );
            case 'comment':
                return (
                    <div className="w-5 h-5 bg-[#10B981] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-comment-alt text-white text-[9px]"></i>
                    </div>
                );
            case 'follow':
                return (
                    <div className="w-5 h-5 bg-[#F97316] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-user-plus text-white text-[9px]"></i>
                    </div>
                );
            case 'birthday':
                return (
                    <div className="w-5 h-5 bg-[#F59E0B] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-birthday-cake text-white text-[9px]"></i>
                    </div>
                );
            case 'share':
                return (
                    <div className="w-5 h-5 bg-[#F97316] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-share text-white text-[9px]"></i>
                    </div>
                );
            default:
                return (
                    <div className="w-5 h-5 bg-[#F97316] rounded-full flex items-center justify-center border-2 border-[#0B1120] shadow-sm">
                        <i className="fas fa-bell text-white text-[9px]"></i>
                    </div>
                );
        }
    };

    const getTimeAgo = (timestamp: string) => {
        const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return "Just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const filteredNotifications = filter === 'unread'
        ? notifications.filter((n) => !n.is_read)
        : notifications;

    const unreadTotal = notifications.filter((n) => !n.is_read).length;

    return (
        <div className="fixed sm:absolute top-[58px] right-2 sm:right-0 w-[calc(100vw-16px)] sm:w-[380px] bg-[#0B1120]/95 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-[#334155]/60 z-[200] max-h-[85vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="px-4 py-3.5 flex justify-between items-center border-b border-[#1E293B]">
                <div className="flex items-center gap-2">
                    <h3 className="text-[19px] font-black tracking-tight text-[#F8FAFC]">Notifications</h3>
                    {unreadTotal > 0 && (
                        <span className="px-2 py-0.5 bg-[#F97316]/15 text-[#F97316] border border-[#F97316]/30 rounded-full text-xs font-bold">
                            {unreadTotal} new
                        </span>
                    )}
                </div>
                {unreadTotal > 0 && (
                    <button
                        onClick={onMarkAllRead}
                        className="text-xs font-semibold text-[#94A3B8] hover:text-[#F97316] transition-colors flex items-center gap-1.5 focus:outline-none"
                    >
                        <i className="fas fa-check-double text-[11px]"></i>
                        <span>Mark all read</span>
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="px-4 py-2 bg-[#070D1D]/70 border-b border-[#1E293B]/70 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all focus:outline-none ${
                            filter === 'all'
                                ? 'bg-[#F97316] text-white shadow-sm'
                                : 'bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#334155]/40'
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('unread')}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all focus:outline-none flex items-center gap-1.5 ${
                            filter === 'unread'
                                ? 'bg-[#F97316] text-white shadow-sm'
                                : 'bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#334155]/40'
                        }`}
                    >
                        <span>Unread</span>
                        {unreadTotal > 0 && (
                            <span className={`w-1.5 h-1.5 rounded-full ${filter === 'unread' ? 'bg-white' : 'bg-[#F97316]'}`}></span>
                        )}
                    </button>
                </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-[#1E293B]/30 scrollbar-thin">
                {filteredNotifications.length === 0 ? (
                    <div className="p-10 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#1E293B] flex items-center justify-center text-[#64748B] mb-2.5">
                            <i className="fas fa-bell-slash text-lg"></i>
                        </div>
                        <p className="text-sm font-semibold text-[#F8FAFC]">No notifications here</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">We'll alert you when someone interacts with you.</p>
                    </div>
                ) : (
                    filteredNotifications.map((notif) => {
                        const sender = users.find((u) => u.id === (notif.sender_id || notif.actor_id)) || (notif as any).actor || (notif as any).sender || (notif as any).inviter;
                        const senderName = sender?.name || (notif as any).sender_name || (notif as any).actor_name || "Someone";
                        const senderAvatar = sender?.profile_image_url || (notif as any).sender_avatar || (notif as any).actor_image || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=1877F2&color=fff`;
                        const isInvite = String(notif.type || '').toLowerCase().includes('invite');
                        const notifId = Number(notif.id || 0);

                        return (
                            <div
                                key={notif.id}
                                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                                    notif.is_read
                                        ? 'hover:bg-[#1E293B]/50 text-[#94A3B8]'
                                        : 'bg-[#1E293B]/40 hover:bg-[#1E293B]/80 text-[#F8FAFC] border-l-2 border-l-[#F97316]'
                                }`}
                                onClick={() => onNotificationClick(notif)}
                            >
                                <div className="relative flex-shrink-0">
                                    <img
                                        src={senderAvatar}
                                        alt={senderName}
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=1877F2&color=fff`;
                                        }}
                                        className="w-11 h-11 rounded-full object-cover border border-[#334155]/60 bg-[#1E293B]"
                                    />
                                    <div className="absolute -bottom-1 -right-1">{getIcon(notif.type)}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13.5px] leading-snug text-[#F8FAFC] line-clamp-2">
                                        <span className="font-bold text-[#F8FAFC]">{senderName}</span>{" "}
                                        <span className="text-[#CBD5E1]">{notif.content || notif.message}</span>
                                    </p>

                                    {isInvite && (
                                        <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            {inviteStatus[notifId] === 'joined' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-[#34D399] font-bold">
                                                    <i className="fas fa-check text-[10px]"></i> Joined
                                                </span>
                                            ) : inviteStatus[notifId] === 'rejected' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8]">
                                                    <i className="fas fa-times text-[10px]"></i> Declined
                                                </span>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={inviteLoading[notifId]}
                                                        onClick={(e) => handleJoinInvite(e, notif)}
                                                        className="px-3 py-1 rounded-md bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {inviteLoading[notifId] ? <i className="fas fa-circle-notch fa-spin text-[10px]"></i> : 'Join'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={inviteLoading[notifId]}
                                                        onClick={(e) => handleRejectInvite(e, notif)}
                                                        className="px-2.5 py-1 rounded-md bg-[#1E293B] hover:bg-[#334155] text-[#CBD5E1] text-xs font-medium border border-[#334155] transition-all disabled:opacity-50 cursor-pointer"
                                                    >
                                                        {inviteLoading[notifId] ? <i className="fas fa-circle-notch fa-spin text-[10px]"></i> : 'Decline'}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <span
                                        className={`text-[11.5px] mt-1 block font-medium ${
                                            notif.is_read ? 'text-[#64748B]' : 'text-[#F97316]'
                                        }`}
                                    >
                                        {getTimeAgo(notif.created_at)}
                                    </span>
                                </div>
                                {!notif.is_read && (
                                    <div className="w-2.5 h-2.5 bg-[#F97316] rounded-full self-center flex-shrink-0 shadow-[0_0_8px_rgba(249,115,22,0.8)]"></div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
