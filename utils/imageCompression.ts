export const fileToImageBitmap = async (file: File): Promise<ImageBitmap> => {
  return await createImageBitmap(file);
};

export const resizeImageToBlob = async (
  file: File,
  maxWidth: number,
  quality = 0.82,
  mimeType = 'image/jpeg'
): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

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
