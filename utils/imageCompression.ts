export const fileToImageBitmap = async (file: File): Promise<ImageBitmap> => {
  return await createImageBitmap(file);
};

// Fallback HTMLImageElement loader for environments where createImageBitmap fails
const fileToImageElement = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};

export const resizeImageToBlob = async (
  file: File,
  maxWidth: number,
  quality = 0.84,
  mimeType = 'image/jpeg'
): Promise<Blob> => {
  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource;

  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    drawSource = bitmap;
  } catch {
    const img = await fileToImageElement(file);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    drawSource = img;
  }

  const scale = Math.min(1, maxWidth / width);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);

  if ('close' in drawSource && typeof (drawSource as any).close === 'function') {
    (drawSource as any).close();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error('Failed to create blob'));
      else resolve(b);
    }, mimeType, quality);
  });

  return blob;
};

export const buildCompressedImageFile = async (
  file: File,
  maxWidth: number,
  quality: number,
  suffix: string
): Promise<File> => {
  const blob = await resizeImageToBlob(file, maxWidth, quality, 'image/jpeg');
  const safeName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${safeName}_${suffix}.jpg`, { type: 'image/jpeg' });
};

export const buildImageUploadBundle = async (file: File) => {
  const thumb = await buildCompressedImageFile(file, 320, 0.72, 'thumb');
  const feed = await buildCompressedImageFile(file, 1080, 0.82, 'feed');
  const full = await buildCompressedImageFile(file, 1600, 0.86, 'full');

  return { thumb, feed, full };
};

/**
 * High-performance profile picture compressor:
 * - Square center-crop or proportional downscale to max 720px
 * - High-fidelity bicubic smoothing
 * - Lightweight output (typically 40KB - 95KB) for instant network upload and rendering
 */
export const compressProfileImage = async (file: File): Promise<File> => {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let source: CanvasImageSource;

    try {
      const bitmap = await createImageBitmap(file);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      source = bitmap;
    } catch {
      const img = await fileToImageElement(file);
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
      source = img;
    }

    // Target avatar dimensions: 720x720 max square for crystal clear display on all screens
    const targetDim = 720;
    const minSide = Math.min(sourceWidth, sourceHeight);
    
    // Center-crop to 1:1 square
    const sx = Math.max(0, Math.floor((sourceWidth - minSide) / 2));
    const sy = Math.max(0, Math.floor((sourceHeight - minSide) / 2));
    const outDim = Math.min(targetDim, minSide);

    const canvas = document.createElement('canvas');
    canvas.width = outDim;
    canvas.height = outDim;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, minSide, minSide, 0, 0, outDim, outDim);

    if ('close' in source && typeof (source as any).close === 'function') {
      (source as any).close();
    }

    let quality = 0.86;
    let blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) reject(new Error('Failed to compress avatar'));
        else resolve(b);
      }, 'image/jpeg', quality);
    });

    // If still over 160KB, run a fast second pass to ensure it stays ultra-lightweight
    if (blob.size > 160 * 1024) {
      quality = 0.78;
      const secondBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
      if (secondBlob) blob = secondBlob;
    }

    const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return new File([blob], `${safeName}_avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('Profile image compression fallback:', err);
    return file;
  }
};

export const compressCoverImage = async (file: File): Promise<File> => {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  try {
    // Cover banner photo: max 1920px, high quality 0.88
    const blob = await resizeImageToBlob(file, 1920, 0.88, 'image/jpeg');
    const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return new File([blob], `${safeName}_cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('Cover image compression fallback:', err);
    return file;
  }
};

