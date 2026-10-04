import React from 'react';

export interface PostUploadState {
  isUploading: boolean;
  progress: number; // 0 - 100
  title: string;
  secondaryStatus: string;
  previewUrl?: string;
  isSuccess: boolean;
  error?: string;
}

interface PostUploadBannerProps {
  uploadState: PostUploadState | null;
  onDismiss?: () => void;
}

/**
 * Top feed upload banner matching the Facebook mobile upload interface
 */
export const PostUploadProgressBanner: React.FC<PostUploadBannerProps> = ({
  uploadState,
  onDismiss,
}) => {
  if (!uploadState) return null;

  const pct = Math.round(Math.min(100, Math.max(0, uploadState.progress)));

  return (
    <div className="w-full bg-[#0F172A] border-b-[8px] border-[#050B18] px-3.5 sm:px-4 py-3 transition-all duration-300 animate-fade-in">
      <div className="flex items-center gap-3">
        {/* Visual thumbnail or Icon */}
        <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#141E33] border border-[#1E293B] flex items-center justify-center">
          {uploadState.previewUrl ? (
            <img
              src={uploadState.previewUrl}
              alt="Upload preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[#1877F2] flex items-center justify-center text-white">
              <i className="fas fa-images text-lg"></i>
            </div>
          )}

          {uploadState.isUploading && (
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
            </div>
          )}

          {uploadState.isSuccess && (
            <div className="absolute inset-0 bg-[#10B981] flex items-center justify-center text-white">
              <i className="fas fa-check text-base"></i>
            </div>
          )}
        </div>

        {/* Text & Progress Bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h4 className="font-bold text-[#F8FAFC] text-[15px] sm:text-[16px] truncate">
              {uploadState.title}
            </h4>
            <span
              className={`text-[13px] font-bold shrink-0 ${
                uploadState.isSuccess ? 'text-[#10B981]' : 'text-[#1877F2]'
              }`}
            >
              {uploadState.isSuccess ? 'Done' : `${pct}%`}
            </span>
          </div>

          <p className="text-[#94A3B8] text-[13px] truncate mb-2">
            {uploadState.secondaryStatus}
          </p>

          {/* Facebook-style animated progress bar */}
          <div className="w-full h-1.5 sm:h-2 bg-[#1E293B] rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 rounded-full relative ${
                uploadState.isSuccess ? 'bg-[#10B981]' : 'bg-[#1877F2]'
              }`}
              style={{ width: `${Math.max(4, pct)}%` }}
            >
              {uploadState.isUploading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-[shimmer_1.5s_infinite]"></div>
              )}
            </div>
          </div>
        </div>

        {uploadState.isSuccess && onDismiss && (
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-full hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <i className="fas fa-times text-sm"></i>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Floating bottom progress pill shown when scrolling through timeline
 */
export const PostUploadBottomPill: React.FC<PostUploadBannerProps> = ({
  uploadState,
}) => {
  if (!uploadState) return null;

  const pct = Math.round(Math.min(100, Math.max(0, uploadState.progress)));

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[250] pointer-events-none max-w-[92vw] w-[330px] transition-all duration-300 animate-fade-in">
      <div className="bg-[#0F172A]/95 border border-[#1E293B] shadow-[0_8px_30px_rgba(0,0,0,0.7)] backdrop-blur-md rounded-2xl px-3.5 py-2.5 flex items-center gap-3 overflow-hidden relative">
        <div className="w-8 h-8 rounded-lg bg-[#1877F2]/15 border border-[#1877F2]/30 flex items-center justify-center text-[#1877F2] shrink-0">
          {uploadState.isSuccess ? (
            <i className="fas fa-check text-[#10B981]"></i>
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-[#1877F2]/30 border-t-[#1877F2] animate-spin"></div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[13px] font-semibold">
            <span className="text-white truncate">{uploadState.title}</span>
            <span
              className={
                uploadState.isSuccess
                  ? 'text-[#10B981] font-bold ml-2'
                  : 'text-[#1877F2] font-bold ml-2'
              }
            >
              {uploadState.isSuccess ? '100%' : `${pct}%`}
            </span>
          </div>
          <div className="text-[11px] text-[#94A3B8] truncate">
            {uploadState.secondaryStatus}
          </div>
        </div>

        {/* Mini progress line at bottom of pill */}
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#1E293B]">
          <div
            className={`h-full transition-all duration-300 ${
              uploadState.isSuccess ? 'bg-[#10B981]' : 'bg-[#1877F2]'
            }`}
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
