/**
 * utils/videoThumbnail.ts
 *
 * Professional, high-quality, fast client-side video thumbnail extractor.
 * 1. Waits for "loadedmetadata" to read video dimensions and duration.
 * 2. Seeks to ~1.0 second (or 25% of the video duration if shorter).
 * 3. Waits for "seeked" event before drawing the video frame to canvas.
 * 4. Generates a crisp WebP thumbnail file.
 * 5. Runs quietly in the background with zero UI changes and no delay.
 */

export interface VideoThumbnailResult {
  file: File;
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  duration: number;
}

export interface VideoThumbnailOptions {
  seekTime?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/webp' | 'image/jpeg';
}

/**
 * Generates a high-quality WebP thumbnail file from a video File, Blob, or URL.
 * Waits for "loadedmetadata" and "seeked" before drawing the video frame to canvas.
 */
export const generateVideoThumbnail = (
  source: File | Blob | string,
  options?: VideoThumbnailOptions
): Promise<VideoThumbnailResult> => {
  return new Promise((resolve, reject) => {
    let blobUrl = '';
    let isCreatedUrl = false;

    if (typeof source === 'string') {
      blobUrl = source;
    } else if (source instanceof Blob) {
      try {
        blobUrl = URL.createObjectURL(source);
        isCreatedUrl = true;
      } catch (err) {
        return reject(new Error('Failed to create object URL from video source'));
      }
    } else {
      return reject(new Error('Invalid video source provided'));
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.crossOrigin = 'anonymous';

    const quality = options?.quality ?? 0.90;
    const maxWidth = options?.maxWidth ?? 1280;
    const maxHeight = options?.maxHeight ?? 1280;
    const format = options?.format ?? 'image/webp';

    let isCleanedUp = false;
    let seekTimer: any = null;
    let overallTimeoutTimer: any = null;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearTimeout(seekTimer);
      clearTimeout(overallTimeoutTimer);

      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}

      if (isCreatedUrl && blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }
    };

    // Overall safety timeout (6 seconds max)
    overallTimeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Video thumbnail extraction timed out'));
    }, 6000);

    video.onerror = () => {
      cleanup();
      reject(new Error(video.error?.message || 'Error loading video for thumbnail extraction'));
    };

    // 1. Wait for "loadedmetadata" before calculating seek time and dimensions
    video.onloadedmetadata = () => {
      if (isCleanedUp) return;

      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

        // Target around 1 second (or 25% of the video duration if shorter)
        let targetTime = 1.0;
        if (options?.seekTime !== undefined) {
          targetTime = options.seekTime;
        } else if (duration > 0 && duration < 1.0) {
          targetTime = Math.max(0.05, duration * 0.25);
        } else if (duration > 0 && duration < 1.5) {
          targetTime = Math.min(1.0, Math.max(0.1, duration * 0.25));
        } else {
          targetTime = 1.0;
        }

        // 2. Wait for "seeked" event before drawing the video frame to canvas
        const onSeeked = () => {
          clearTimeout(seekTimer);
          if (isCleanedUp) return;

          const capture = () => {
            if (isCleanedUp) return;

            try {
              const vWidth = video.videoWidth || 1280;
              const vHeight = video.videoHeight || 720;

              // Scale proportionally preserving aspect ratio
              const scale = Math.min(1, maxWidth / vWidth, maxHeight / vHeight);
              const width = Math.max(1, Math.round(vWidth * scale));
              const height = Math.max(1, Math.round(vHeight * scale));

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;

              const ctx = canvas.getContext('2d', { alpha: false });
              if (!ctx) {
                cleanup();
                return reject(new Error('Failed to create canvas 2D context'));
              }

              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';

              // Draw decoded frame to canvas
              ctx.drawImage(video, 0, 0, width, height);

              const tryExport = (exportFormat: string) => {
                canvas.toBlob(
                  (blob) => {
                    if (!blob) {
                      if (exportFormat === 'image/webp') {
                        // Fallback to jpeg if webp export failed in browser
                        tryExport('image/jpeg');
                        return;
                      }
                      cleanup();
                      return reject(new Error('Failed to generate image blob from canvas'));
                    }

                    let dataUrl = '';
                    try {
                      dataUrl = canvas.toDataURL(exportFormat, quality);
                    } catch {}

                    const isWebp = blob.type.includes('webp');
                    const ext = isWebp ? 'webp' : 'jpg';

                    let baseName = 'video_thumb';
                    if (source instanceof File && source.name) {
                      baseName = source.name.replace(/\.[^.]+$/, '');
                    }

                    const thumbFile = new File([blob], `${baseName}_thumb.${ext}`, {
                      type: blob.type || (isWebp ? 'image/webp' : 'image/jpeg'),
                      lastModified: Date.now(),
                    });

                    cleanup();
                    resolve({
                      file: thumbFile,
                      blob,
                      dataUrl,
                      width,
                      height,
                      duration,
                    });
                  },
                  exportFormat,
                  quality
                );
              };

              tryExport(format);
            } catch (err: any) {
              cleanup();
              reject(err);
            }
          };

          // Use requestVideoFrameCallback if available to ensure frame buffer is decoded and rendered
          if ('requestVideoFrameCallback' in video && typeof (video as any).requestVideoFrameCallback === 'function') {
            (video as any).requestVideoFrameCallback(() => {
              capture();
            });
          } else {
            // A short delay after seeked ensures the video decoder has flushed the frame pixels
            setTimeout(capture, 50);
          }
        };

        video.onseeked = onSeeked;

        // Safety fallback: if seeked event doesn't fire within 1500ms, force capture
        seekTimer = setTimeout(() => {
          if (!isCleanedUp) {
            onSeeked();
          }
        }, 1500);

        try {
          video.currentTime = targetTime;
        } catch {
          onSeeked();
        }
      } catch (err: any) {
        cleanup();
        reject(err);
      }
    };

    video.src = blobUrl;
  });
};
