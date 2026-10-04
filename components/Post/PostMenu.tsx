import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { performPostAction } from "../../postActionRegistry";
import { EditPostModal } from "./EditPostModal";
import { Edit, Trash2, Share2, Flag, AlertCircle, Loader2, ArrowLeft, Link2, Check } from "lucide-react";

export type PostMenuProps = {
  item: any;
  currentUser?: any;
  onShare?: (post: any) => void;
  onDeleteSuccess?: (deletedId: number | string) => void;
  onEditSuccess?: (updatedItem: any) => void;
  className?: string;
  align?: "left" | "right";
};

export const PostMenu: React.FC<PostMenuProps> = ({
  item,
  currentUser,
  onShare,
  onDeleteSuccess,
  onEditSuccess,
  className = "",
  align = "right",
}) => {
  const [open, setOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const itemId = item.id || item.post_id || item.event_id || item.song_id;
  const currentUserId = currentUser ? Number(currentUser.id) : null;
  const itemOwnerId = Number(
    item.user_id ?? item.creator_id ?? item.author_id ?? item.userId ?? item.author?.id ?? 0
  );

  const isOwner = Boolean(currentUserId && currentUserId === itemOwnerId);
  const isEvent = item.type === "event" || Boolean(item.event_date);
  const isSong = item.type === "song" || Boolean(item.song_url || item.audio_url);
  const isProduct =
    item.type === "product" ||
    Boolean(item.product_id) ||
    Boolean(item.seller_id) ||
    Boolean(item.main_price !== undefined || item.price !== undefined);
  const isStory = item.type === "story" || Boolean(item.story_id);
  const canEdit = isOwner && !isSong && !isStory;

  // Close menu when clicking outside
  // Lock body scroll when delete full-page is open
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDeleteConfirm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDeleteConfirm]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  // ----------------------------
  // Edit
  // ----------------------------
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setIsEditModalOpen(true);
  };

  const handleEditSaved = (updated: any) => {
    onEditSuccess?.(updated);
    try {
      performPostAction(item.type || "post", "edit", {
        id: itemId,
        ...updated,
      });
    } catch {
      // ignore if registry not populated
    }
  };

  // ----------------------------
  // Delete
  // ----------------------------
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const uid = currentUserId || itemOwnerId;

    // Trigger visual deleting animation immediately on the feed item card
    window.dispatchEvent(new CustomEvent("post-deleting", { detail: { id: itemId } }));
    window.dispatchEvent(new CustomEvent("product-deleting", { detail: { id: itemId } }));
    window.dispatchEvent(new CustomEvent("event-deleting", { detail: { id: itemId } }));
    window.dispatchEvent(new CustomEvent("song-deleting", { detail: { id: itemId } }));

    // Keep confirm modal open briefly to show the deleting animation feedback
    await new Promise((res) => setTimeout(res, 260));
    setShowDeleteConfirm(false);

    // Trigger optimistic removal
    onDeleteSuccess?.(itemId);

    try {
      if (isSong) {
        // Songs posts: DELETE /api/songs?id=${songId}&user_id=${userId}
        window.dispatchEvent(new CustomEvent("song-deleted", { detail: { id: itemId } }));
        await fetch(`/api/songs?id=${itemId}&user_id=${uid}`, {
          method: "DELETE",
          headers: {
            "x-user-id": String(uid),
          },
        });
      } else if (isProduct) {
        // Products posts: DELETE /api/products?id=${productId}&user_id=${userId}
        window.dispatchEvent(new CustomEvent("product-deleted", { detail: { id: itemId } }));
        window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id: itemId } }));
        await fetch(`/api/products?id=${itemId}&user_id=${uid}`, {
          method: "DELETE",
          headers: {
            "x-user-id": String(uid),
          },
        });
      } else if (isStory) {
        // Stories: DELETE /api/stories/:id?user_id=X
        window.dispatchEvent(new CustomEvent("story-deleted", { detail: { id: itemId } }));
        await fetch(`/api/stories/${itemId}?user_id=${uid}`, {
          method: "DELETE",
          headers: {
            "x-user-id": String(uid),
          },
        });
      } else if (isEvent) {
        // Events posts: DELETE /api/events/${event.id}?user_id=${currentUserId}
        window.dispatchEvent(new CustomEvent("event-deleted", { detail: { id: itemId } }));
        window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id: itemId } }));
        await fetch(`/api/events/${itemId}?user_id=${uid}`, {
          method: "DELETE",
          headers: {
            "x-user-id": String(uid),
          },
        });
      } else {
        // Normal Post/Videos: DELETE /api/posts/:id?user_id=X
        window.dispatchEvent(new CustomEvent("post-deleted", { detail: { id: itemId } }));
        await fetch(`/api/posts/${itemId}?user_id=${uid}`, {
          method: "DELETE",
          headers: {
            "x-user-id": String(uid),
          },
        });
      }

      // Also invoke registry if configured
      try {
        performPostAction(item.type || "post", "delete", {
          id: itemId,
          groupId: item.group_id,
        });
      } catch {
        // fallback
      }
    } catch (err) {
      console.error("Failed to delete post:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // ----------------------------
  // Share
  // ----------------------------
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (onShare) {
      onShare(item);
    } else {
      try {
        performPostAction(item.type || "post", "share", { id: itemId });
      } catch {
        // fallback
      }
    }
  };

  // ----------------------------
  // Report
  // ----------------------------
  const handleReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    try {
      performPostAction(item.type || "post", "report", {
        id: itemId,
        type: item.type || "post",
      });
    } catch {
      // fallback
    }
    alert("Thank you. This report has been submitted to moderators.");
  };

  // ----------------------------
  // Copy Link
  // ----------------------------
  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://featheredsocial.site/post/${itemId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
        setOpen(false);
      }, 1200);
    }).catch(() => {
      setOpen(false);
    });
  };

  return (
    <>
      <div className={`relative ${className}`} ref={menuRef} onClick={(e) => e.stopPropagation()}>
        {/* Three dot button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] transition active:scale-95"
          aria-label="Post actions"
        >
          <i className="fas fa-ellipsis-h text-sm"></i>
        </button>

        {open && (
          <div
            className={`absolute ${
              align === "left" ? "left-0" : "right-0"
            } mt-1.5 w-48 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-150`}
          >
            {/* Edit (Post Owner Only, not allowed for Songs/Stories) */}
            {canEdit && (
              <button
                type="button"
                onClick={handleEditClick}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[#1E293B] text-[#F8FAFC] transition-colors group"
              >
                <Edit className="w-4 h-4 text-[#1877F2] group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">
                  {isProduct ? "Edit Product" : isEvent ? "Edit Event" : "Edit Post"}
                </span>
              </button>
            )}

            {/* Delete (Post Owner Only) */}
            {isOwner && (
              <button
                type="button"
                onClick={handleDeleteClick}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-rose-500/10 text-rose-400 transition-colors group"
              >
                <Trash2 className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">
                  {isProduct ? "Delete Product" : isSong ? "Delete Song" : isStory ? "Delete Story" : isEvent ? "Delete Event" : "Delete Post"}
                </span>
              </button>
            )}

            {/* Divider if owner */}
            {isOwner && <div className="h-[1px] bg-[#1E293B] my-1"></div>}

            {/* Share (Available to everyone) */}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[#1E293B] text-[#F8FAFC] transition-colors group"
            >
              <Share2 className="w-4 h-4 text-[#94A3B8] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium">Share</span>
            </button>

            {/* Copy Link (Canonical shareable URL) */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[#1E293B] text-[#F8FAFC] transition-colors group"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 scale-110 transition-transform" />
                  <span className="text-sm font-medium text-emerald-400">Link Copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 text-[#38BDF8] group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Copy Link</span>
                </>
              )}
            </button>

            {/* Report Post (Non-Owner Only) */}
            {!isOwner && (
              <button
                type="button"
                onClick={handleReport}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[#1E293B] text-amber-400 transition-colors group"
              >
                <Flag className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">Report Post</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Professional Instagram-Style Edit Modal */}
      {isEditModalOpen && (
        <EditPostModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          post={item}
          currentUser={currentUser}
          onSaveSuccess={handleEditSaved}
        />
      )}

      {/* Full-Page Delete Screen */}
      {showDeleteConfirm &&
        createPortal(
          <div
            id="delete-post-fullpage-panel"
            className="fixed inset-0 z-[99999] bg-[#050B18] text-[#F8FAFC] flex flex-col w-full h-full overflow-hidden animate-in fade-in duration-150"
          >
            {/* Top Navigation Bar */}
            <header className="h-16 px-4 sm:px-8 border-b border-[#1E293B] bg-[#0A0F1D]/95 backdrop-blur-md flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  id="delete-post-back-btn"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>

              <h1 className="text-base sm:text-lg font-bold text-[#F8FAFC] tracking-tight">
                {isProduct
                  ? "Delete Product"
                  : isSong
                  ? "Delete Song"
                  : isStory
                  ? "Delete Story"
                  : isEvent
                  ? "Delete Event"
                  : "Delete Post"}
              </h1>

              <button
                type="button"
                id="delete-post-header-btn"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-lg shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 max-w-2xl w-full mx-auto flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shadow-2xl shadow-rose-500/10">
                <Trash2 className="w-10 h-10 text-rose-500" />
              </div>

              <div className="text-center space-y-2 max-w-lg">
                <h2 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">
                  Permanently Delete this{" "}
                  {isProduct
                    ? "Product"
                    : isSong
                    ? "Song"
                    : isStory
                    ? "Story"
                    : isEvent
                    ? "Event"
                    : "Post"}
                  ?
                </h2>
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  Are you sure you want to permanently delete this{" "}
                  {isProduct
                    ? "product"
                    : isSong
                    ? "song"
                    : isStory
                    ? "story"
                    : isEvent
                    ? "event"
                    : "post"}
                  ? This action is immediate and cannot be undone. All associated
                  comments, reactions, and media will be wiped.
                </p>
              </div>

              {/* Item Preview Card */}
              <div className="w-full bg-[#0F172A] border border-[#1E293B] rounded-2xl p-4 sm:p-5 text-left space-y-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      item.author?.profile_image_url ||
                      item.user?.profile_image_url ||
                      item.seller_avatar ||
                      currentUser?.profile_image_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        String(item.author?.name || item.user?.name || item.seller_name || currentUser?.name || "User")
                      )}&background=1877F2&color=fff`
                    }
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-[#334155]"
                  />
                  <div>
                    <div className="font-bold text-[#F8FAFC] text-sm leading-tight">
                      {item.author?.name ||
                        item.user?.name ||
                        item.seller_name ||
                        currentUser?.name ||
                        "User"}
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {isProduct
                        ? "MarketPoint Item"
                        : isEvent
                        ? "Event"
                        : isSong
                        ? "Song / Audio"
                        : "Feed Post"}
                    </div>
                  </div>
                </div>

                {(item.title || item.song_name || item.name) && (
                  <div className="font-bold text-[#F8FAFC] text-base leading-snug">
                    {item.title || item.song_name || item.name}
                  </div>
                )}

                {(item.content || item.caption || item.description || item.text) && (
                  <p className="text-xs sm:text-sm text-[#CBD5E1] line-clamp-3 leading-relaxed">
                    {item.content || item.caption || item.description || item.text}
                  </p>
                )}

                {(item.media_url ||
                  item.image_url ||
                  item.cover_url ||
                  (Array.isArray(item.images) && item.images[0]) ||
                  (Array.isArray(item.media) &&
                    (item.media[0]?.url || item.media[0]?.full || item.media[0]?.feed))) && (
                  <div className="rounded-xl overflow-hidden max-h-52 w-full bg-black/40 border border-[#1E293B]">
                    <img
                      src={
                        item.media_url ||
                        item.image_url ||
                        item.cover_url ||
                        (Array.isArray(item.images) ? item.images[0] : null) ||
                        (Array.isArray(item.media)
                          ? item.media[0]?.url || item.media[0]?.full || item.media[0]?.feed
                          : null)
                      }
                      alt="Preview"
                      className="w-full h-52 object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-[#1E293B] hover:bg-[#27354D] text-[#CBD5E1] text-sm font-bold transition-all text-center"
                >
                  Cancel and Keep
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-lg shadow-rose-600/25 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </main>
          </div>,
          document.body
        )}
    </>
  );
};
