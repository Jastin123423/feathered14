import React, { useState, useRef, useCallback } from 'react';
import { Eye, EyeOff, Trash2, Copy, Check, CornerDownLeft, AlertCircle } from 'lucide-react';

export interface CommentActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  comment: any | null;
  authorName: string;
  authorAvatar: string;
  commentText: string;
  isHidden: boolean;
  canHide: boolean;
  canDelete: boolean;
  onToggleHide: (comment: any) => Promise<void> | void;
  onDelete: (comment: any) => Promise<void> | void;
  onReply?: (comment: any) => void;
}

export const CommentActionModal: React.FC<CommentActionModalProps> = ({
  isOpen,
  onClose,
  comment,
  authorName,
  authorAvatar,
  commentText,
  isHidden,
  canHide,
  canDelete,
  onToggleHide,
  onDelete,
  onReply,
}) => {
  const [copied, setCopied] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'hide' | 'delete' | null>(null);

  // Reset internal states when closed or opened with new comment
  React.useEffect(() => {
    if (!isOpen) {
      setIsConfirmingDelete(false);
      setCopied(false);
      setLoadingAction(null);
    }
  }, [isOpen]);

  if (!isOpen || !comment) return null;

  const handleCopy = async () => {
    try {
      if (commentText) {
        await navigator.clipboard.writeText(commentText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error('Failed to copy text', e);
    }
  };

  const handleHideClick = () => {
    onClose();
    try {
      onToggleHide(comment);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteClick = () => {
    onClose();
    try {
      onDelete(comment);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#0D1527] border border-[#1E293B] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-transform animate-in slide-in-from-bottom-5 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-12 h-1.5 rounded-full bg-[#334155]/80" />
        </div>

        {/* Header Preview of the Comment */}
        <div className="p-4 border-b border-[#1E293B] bg-[#0F172A]/80">
          <div className="flex items-center gap-3 mb-2">
            <img
              src={authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=1877F2&color=fff`}
              alt={authorName}
              className="w-10 h-10 rounded-full object-cover border border-[#1E293B] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[#F8FAFC] font-bold text-[21px] leading-tight truncate">{authorName}</span>
                {isHidden && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    Hidden
                  </span>
                )}
              </div>
              <p className="text-[#94A3B8] text-xs mt-0.5">Discussion options</p>
            </div>
          </div>

          {/* Comment text snippet */}
          {commentText && (
            <div className="bg-[#162137]/80 rounded-xl px-3 py-2 text-xs text-[#CBD5E1] line-clamp-2 italic border border-[#1E293B]/60">
              &ldquo;{commentText}&rdquo;
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-3 space-y-1.5 overflow-y-auto">
          {/* Unhide / Hide Option */}
          {canHide && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={handleHideClick}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left hover:bg-[#1E293B] active:bg-[#27354D] transition-colors group"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  isHidden
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:bg-sky-500/25'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:bg-amber-500/25'
                }`}
              >
                {isHidden ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#F8FAFC] font-semibold text-[19px] leading-tight">
                  {isHidden ? 'Unhide Discussion' : 'Hide Discussion'}
                </div>
                <div className="text-[#94A3B8] text-xs mt-0.5">
                  {isHidden
                    ? 'Make this discussion visible to everyone again'
                    : 'Hide this discussion from public view'}
                </div>
              </div>
              {loadingAction === 'hide' && (
                <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </button>
          )}

          {/* Delete Option */}
          {canDelete && !isConfirmingDelete && (
            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => setIsConfirmingDelete(true)}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 group-hover:bg-rose-500/25">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-rose-400 font-semibold text-[19px] leading-tight">Delete Discussion</div>
                <div className="text-[#94A3B8] text-xs mt-0.5">Permanently remove this discussion</div>
              </div>
            </button>
          )}

          {/* Inline Delete Confirmation */}
          {canDelete && isConfirmingDelete && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-[19px]">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>Delete permanently?</span>
              </div>
              <p className="text-xs text-[#CBD5E1]">
                This discussion and its replies will be permanently deleted. This action cannot be undone.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={loadingAction !== null}
                  onClick={() => setIsConfirmingDelete(false)}
                  className="flex-1 py-2 rounded-lg bg-[#1E293B] hover:bg-[#27354D] text-[#CBD5E1] text-[19px] font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loadingAction !== null}
                  onClick={handleDeleteClick}
                  className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[19px] font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 transition-colors"
                >
                  {loadingAction === 'delete' ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Yes, Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Reply Option */}
          {onReply && !isConfirmingDelete && (
            <button
              type="button"
              onClick={() => {
                onReply(comment);
                onClose();
              }}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left hover:bg-[#1E293B] active:bg-[#27354D] transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 text-[#CBD5E1] border border-[#1E293B] flex items-center justify-center shrink-0 group-hover:bg-slate-700">
                <CornerDownLeft className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#F8FAFC] font-semibold text-[19px] leading-tight">Reply to Discussion</div>
                <div className="text-[#94A3B8] text-xs mt-0.5">Post a reply to {authorName}</div>
              </div>
            </button>
          )}

          {/* Copy Text */}
          {commentText && !isConfirmingDelete && (
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left hover:bg-[#1E293B] active:bg-[#27354D] transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 text-[#CBD5E1] border border-[#1E293B] flex items-center justify-center shrink-0 group-hover:bg-slate-700">
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#F8FAFC] font-semibold text-[19px] leading-tight">
                  {copied ? 'Copied to Clipboard!' : 'Copy Text'}
                </div>
                <div className="text-[#94A3B8] text-xs mt-0.5">Copy discussion text</div>
              </div>
            </button>
          )}

          {/* If user cannot hide or delete */}
          {!canHide && !canDelete && (
            <div className="p-3 text-center text-xs text-[#94A3B8] bg-[#162137]/40 rounded-xl border border-[#1E293B]/40">
              Only discussion author or content owner can hide or delete this discussion.
            </div>
          )}
        </div>

        {/* Footer Cancel */}
        <div className="p-3 border-t border-[#1E293B] bg-[#0A0F1D]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#1E293B] hover:bg-[#27354D] text-[#CBD5E1] font-semibold text-[19px] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Reusable Long Press hook with scroll protection and visual feedback.
 */
export function useCommentLongPress(
  onLongPress: (comment: any, targetEl?: HTMLElement) => void,
  options: { delay?: number; moveThreshold?: number } = {}
) {
  const { delay = 450, moveThreshold = 10 } = options;
  const timerRef = useRef<any>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const start = useCallback(
    (comment: any, e: React.TouchEvent | React.MouseEvent) => {
      clearTimeout(timerRef.current);
      isLongPressTriggeredRef.current = false;

      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      startPosRef.current = { x: clientX, y: clientY };

      const currentTarget = e.currentTarget as HTMLElement;

      timerRef.current = setTimeout(() => {
        isLongPressTriggeredRef.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40);
          } catch (_) {}
        }
        onLongPress(comment, currentTarget);
      }, delay);
    },
    [onLongPress, delay]
  );

  const move = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!startPosRef.current) return;
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }

      const dx = Math.abs(clientX - startPosRef.current.x);
      const dy = Math.abs(clientY - startPosRef.current.y);
      if (dx > moveThreshold || dy > moveThreshold) {
        clearTimeout(timerRef.current);
        startPosRef.current = null;
      }
    },
    [moveThreshold]
  );

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    startPosRef.current = null;
  }, []);

  const getHandlers = useCallback(
    (comment: any) => ({
      onTouchStart: (e: React.TouchEvent) => start(comment, e),
      onTouchMove: (e: React.TouchEvent) => move(e),
      onTouchEnd: () => clear(),
      onTouchCancel: () => clear(),
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button === 0) {
          // Left click hold
          start(comment, e);
        }
      },
      onMouseMove: (e: React.MouseEvent) => move(e),
      onMouseUp: () => clear(),
      onMouseLeave: () => clear(),
      onContextMenu: (e: React.MouseEvent) => {
        // Prevent default browser context menu if long pressed or if right clicked
        e.preventDefault();
        onLongPress(comment, e.currentTarget as HTMLElement);
      },
    }),
    [start, move, clear, onLongPress]
  );

  return { getHandlers, clear };
}
