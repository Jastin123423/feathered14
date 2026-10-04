import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { R2: R2Bucket };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const PUBLIC_BASE = "https://media.featheredsocial.site";
const LONG_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const safeExtFromType = (ct: string) => {
  const t = (ct || "").toLowerCase();

  if (t.includes("jpeg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("avif")) return "avif";

  if (t.includes("mp4")) return "mp4";
  if (t.includes("webm")) return "webm";
  if (t.includes("quicktime")) return "mov";

  if (t.includes("opus")) return "webm";
  if (t.includes("audio/webm")) return "webm";
  if (t === "audio/mpeg" || t.includes("mpeg")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("aac")) return "aac";
  if (t.includes("m4a")) return "m4a";
  if (t.includes("audio/mp4")) return "m4a";

  if (t.includes("pdf")) return "pdf";
  if (t.includes("msword")) return "doc";
  if (t.includes("officedocument.wordprocessingml")) return "docx";
  if (t.includes("officedocument.spreadsheetml")) return "xlsx";
  if (t.includes("officedocument.presentationml")) return "pptx";
  if (t.includes("text/plain")) return "txt";

  if (t.includes("zip")) return "zip";

  return "bin";
};

const contentTypeFromExt = (ext: string) => {
  const e = (ext || "").toLowerCase();

  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  if (e === "avif") return "image/avif";

  if (e === "mp4") return "video/mp4";
  if (e === "webm") return "video/webm";
  if (e === "mov") return "video/quicktime";

  if (e === "mp3") return "audio/mpeg";
  if (e === "wav") return "audio/wav";
  if (e === "ogg") return "audio/ogg";
  if (e === "aac") return "audio/aac";
  if (e === "m4a") return "audio/mp4";

  if (e === "pdf") return "application/pdf";
  if (e === "txt") return "text/plain; charset=utf-8";
  if (e === "doc") return "application/msword";
  if (e === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (e === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (e === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }

  if (e === "zip") return "application/zip";

  return "application/octet-stream";
};

const fileTypeFromMimeOrExt = (mime: string, ext: string) => {
  const m = (mime || "").toLowerCase();
  const e = (ext || "").toLowerCase();

  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "avif"].includes(e)) return "image";
  if (m.includes("gif") || e === "gif") return "gif";
  if (m.startsWith("video/") || ["mp4", "webm", "mov"].includes(e)) return "video";
  if (
    m.startsWith("audio/") ||
    m.includes("opus") ||
    ["mp3", "wav", "ogg", "aac", "m4a", "webm"].includes(e)
  ) {
    return "audio";
  }

  if (m === "application/pdf" || e === "pdf") return "document";

  if (
    m.includes("officedocument") ||
    m.includes("msword") ||
    ["doc", "docx", "xlsx", "pptx", "txt"].includes(e)
  ) {
    return "document";
  }

  return "other";
};

const safeVariantKey = (base: string, variant: string, ext: string) =>
  `${base}_${variant}.${ext || "bin"}`;

const safeKey = (ext: string, prefix = "uploads") =>
  `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext || "bin"}`;

const publicUrl = (key: string) => `${PUBLIC_BASE}/${key}`;

const toJson = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const getFileInfo = async (file: File) => {
  const filename = String(file.name || "").trim();
  const nameExt = filename && filename.includes(".") ? filename.split(".").pop() || "" : "";
  const fallbackExt = safeExtFromType(file.type || "");
  const ext = String(nameExt || fallbackExt || "bin").toLowerCase();

  let mime_type = (file.type || "").trim();
  if (!mime_type || mime_type === "application/octet-stream") {
    mime_type = contentTypeFromExt(ext);
  }

  const file_type = fileTypeFromMimeOrExt(mime_type, ext);
  const bytes = new Uint8Array(await file.arrayBuffer());

  return {
    filename,
    ext,
    mime_type,
    file_type,
    bytes,
  };
};

const putObject = async (
  env: Env,
  {
    key,
    bytes,
    mime_type,
    filename,
    file_type,
  }: {
    key: string;
    bytes: Uint8Array;
    mime_type: string;
    filename: string;
    file_type: string;
  }
) => {
  await env.R2.put(key, bytes, {
    httpMetadata: {
      contentType: mime_type,
      cacheControl: LONG_CACHE_CONTROL,
    },
    customMetadata: {
      filename: filename || "upload",
      mime_type,
      file_type,
    },
  });

  return publicUrl(key);
};

const tryCfImageTransform = async (
  originalBuffer: Uint8Array,
  opts: {
    width: number;
    fit?: "cover" | "contain" | "scale-down";
    quality?: number;
    format?: "webp" | "avif" | "jpeg" | "png";
  }
): Promise<Uint8Array | null> => {
  try {
    const res = await fetch("https://dummy", {
      method: "POST",
      body: originalBuffer,
      // @ts-ignore
      cf: {
        image: {
          width: opts.width,
          fit: opts.fit || "cover",
          quality: opts.quality ?? 78,
          format: opts.format || "webp",
        },
      },
    });

    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const tryCfVideoPoster = async (originalBuffer: Uint8Array): Promise<Uint8Array | null> => {
  try {
    const res = await fetch("https://dummy", {
      method: "POST",
      body: originalBuffer,
      // @ts-ignore
      cf: {
        image: {
          format: "webp",
          width: 320,
          fit: "cover",
          quality: 70,
        },
      },
    });

    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

const processImageVariants = async (
  env: Env,
  file: File,
  baseFolder = "uploads/images"
) => {
  const originalInfo = await getFileInfo(file);
  const { filename, bytes, file_type } = originalInfo;

  const baseKey = `${baseFolder}/${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const fullKey = safeVariantKey(baseKey, "original", originalInfo.ext);
  const fullUrl = await putObject(env, {
    key: fullKey,
    bytes: originalInfo.bytes,
    mime_type: originalInfo.mime_type,
    filename: originalInfo.filename || `original.${originalInfo.ext}`,
    file_type: originalInfo.file_type,
  });

  const transformedFeed = await tryCfImageTransform(bytes, {
    width: 1080,
    fit: "cover",
    quality: 80,
    format: "webp",
  });

  const transformedThumb = await tryCfImageTransform(bytes, {
    width: 320,
    fit: "cover",
    quality: 70,
    format: "webp",
  });

  const feedKey = safeVariantKey(baseKey, "feed", transformedFeed ? "webp" : originalInfo.ext);
  const thumbKey = safeVariantKey(baseKey, "thumbnail", transformedThumb ? "webp" : originalInfo.ext);

  const feedUrl = await putObject(env, {
    key: feedKey,
    bytes: transformedFeed || originalInfo.bytes,
    mime_type: transformedFeed ? "image/webp" : originalInfo.mime_type,
    filename: transformedFeed ? "feed.webp" : `feed.${originalInfo.ext}`,
    file_type,
  });

  const thumbUrl = await putObject(env, {
    key: thumbKey,
    bytes: transformedThumb || originalInfo.bytes,
    mime_type: transformedThumb ? "image/webp" : originalInfo.mime_type,
    filename: transformedThumb ? "thumbnail.webp" : `thumbnail.${originalInfo.ext}`,
    file_type,
  });

  return {
    success: true,
    media_type: "image",
    media_urls: {
      thumb: thumbUrl,
      feed: feedUrl,
      full: fullUrl,
    },
    key: fullKey,
    url: fullUrl,
    filename: filename || null,
    size_bytes: originalInfo.bytes.byteLength,
    mime_type: originalInfo.mime_type,
    file_type: originalInfo.file_type,
    metadata: {
      cache_control: LONG_CACHE_CONTROL,
      transform_used: Boolean(transformedFeed || transformedThumb),
    },
  };
};

const processVideoVariants = async (
  env: Env,
  file: File,
  baseFolder = "uploads/videos"
) => {
  const originalInfo = await getFileInfo(file);
  const { filename, bytes } = originalInfo;

  const originalExt = originalInfo.ext === "mp4" ? "mp4" : originalInfo.ext;
  const baseKey = `${baseFolder}/${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const fullKey = safeVariantKey(baseKey, "original", originalExt);
  const fullMime = originalExt === "mp4" ? "video/mp4" : originalInfo.mime_type;

  const fullUrl = await putObject(env, {
    key: fullKey,
    bytes: originalInfo.bytes,
    mime_type: fullMime,
    filename: filename || `original.${originalExt}`,
    file_type: "video",
  });

  const transformedThumb = await tryCfVideoPoster(bytes);
  const thumbExt = transformedThumb ? "webp" : "jpg";
  const thumbMime = transformedThumb ? "image/webp" : "image/jpeg";
  const thumbBytes = transformedThumb || new Uint8Array();

  let thumbUrl: string | null = null;

  if (thumbBytes.byteLength > 0) {
    const thumbKey = safeVariantKey(baseKey, "thumbnail", thumbExt);
    thumbUrl = await putObject(env, {
      key: thumbKey,
      bytes: thumbBytes,
      mime_type: thumbMime,
      filename: transformedThumb ? "thumbnail.webp" : "thumbnail.jpg",
      file_type: "image",
    });
  }

  return {
    success: true,
    media_type: "video",
    media_urls: {
      thumb: thumbUrl,
      feed: null,
      full: fullUrl,
    },
    key: fullKey,
    url: fullUrl,
    filename: filename || null,
    size_bytes: originalInfo.bytes.byteLength,
    mime_type: fullMime,
    file_type: "video",
    metadata: {
      cache_control: LONG_CACHE_CONTROL,
      transform_used: Boolean(transformedThumb),
    },
  };
};

const uploadBundlePart = async (
  env: Env,
  file: File,
  baseFolder: string,
  variant: string
) => {
  const info = await getFileInfo(file);
  const key = safeVariantKey(baseFolder, variant, info.ext);
  const url = await putObject(env, {
    key,
    bytes: info.bytes,
    mime_type: info.mime_type,
    filename: info.filename || `${variant}.${info.ext}`,
    file_type: info.file_type,
  });

  return {
    key,
    url,
    filename: info.filename || null,
    size_bytes: info.bytes.byteLength,
    mime_type: info.mime_type,
    file_type: info.file_type,
    cache_control: LONG_CACHE_CONTROL,
  };
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.R2) {
      return toJson({ success: false, error: "R2 binding missing (env.R2)" }, 500);
    }

    const ct = request.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();

      const singleFile = form.get("file");

      const originalFile = form.get("original");
      const feedFile = form.get("feed");
      const playFile = form.get("play");
      const thumbnailFile = form.get("thumbnail");
      const audioFile = form.get("audio");

      if (
        originalFile instanceof File ||
        feedFile instanceof File ||
        playFile instanceof File ||
        thumbnailFile instanceof File ||
        audioFile instanceof File
      ) {
        const baseFolder = `uploads/${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const uploaded: Record<string, any> = {};

        if (thumbnailFile instanceof File) {
          uploaded.thumbnail = await uploadBundlePart(env, thumbnailFile, baseFolder, "thumbnail");
        }

        if (feedFile instanceof File) {
          uploaded.feed = await uploadBundlePart(env, feedFile, baseFolder, "feed");
        }

        if (playFile instanceof File) {
          uploaded.play = await uploadBundlePart(env, playFile, baseFolder, "play");
        }

        if (audioFile instanceof File) {
          uploaded.audio = await uploadBundlePart(env, audioFile, baseFolder, "audio");
        }

        if (originalFile instanceof File) {
          uploaded.original = await uploadBundlePart(env, originalFile, baseFolder, "original");
        }

        const fullUrl =
          uploaded.original?.url ||
          uploaded.feed?.url ||
          uploaded.play?.url ||
          uploaded.thumbnail?.url ||
          null;
        const thumbUrl = uploaded.thumbnail?.url || null;
        const videoUrl = uploaded.original?.url || uploaded.feed?.url || null;

        return toJson({
          success: true,
          media_type: uploaded.original || uploaded.feed ? "video" : "bundle",
          url: fullUrl,
          video_url: videoUrl,
          thumbnail_url: thumbUrl,
          uploaded,
          media_urls: {
            thumb: thumbUrl,
            feed: uploaded.feed?.url || null,
            play: uploaded.play?.url || null,
            audio: uploaded.audio?.url || null,
            full: fullUrl,
          },
          metadata: {
            cache_control: LONG_CACHE_CONTROL,
            bundle_mode: true,
          },
        });
      }

      if (!(singleFile instanceof File)) {
        return toJson(
          {
            success: false,
            error:
              "file is required (multipart field name: file), or send original/feed/play/thumbnail/audio fields",
          },
          400
        );
      }

      const { filename, ext, mime_type, file_type, bytes } = await getFileInfo(singleFile);
      const requestedFolder = String(form.get("folder") || "").trim();

      // If uploaded as thumbnail (e.g. posts/thumbnails or _thumb in filename)
      if (requestedFolder === "posts/thumbnails" || filename.includes("_thumb") || filename.includes("thumbnail")) {
        const thumbKey = safeKey(ext || "webp", "posts/thumbnails");
        const thumbUrl = await putObject(env, {
          key: thumbKey,
          bytes,
          mime_type: mime_type || "image/webp",
          filename: filename || "thumbnail.webp",
          file_type: "image",
        });

        return toJson({
          success: true,
          url: thumbUrl,
          thumbnail_url: thumbUrl,
          media_type: "image",
          media_urls: {
            thumb: thumbUrl,
            feed: thumbUrl,
            full: thumbUrl,
          },
          key: thumbKey,
          filename: filename || null,
          size_bytes: bytes.byteLength,
          mime_type: mime_type || "image/webp",
          file_type: "image",
          metadata: {
            cache_control: LONG_CACHE_CONTROL,
          },
        });
      }

      // If uploaded as video (e.g. posts/videos)
      if (requestedFolder === "posts/videos" || (file_type === "video" && requestedFolder.includes("videos"))) {
        const vidKey = safeKey(ext || "mp4", requestedFolder || "posts/videos");
        const vidUrl = await putObject(env, {
          key: vidKey,
          bytes,
          mime_type: mime_type || "video/mp4",
          filename: filename || `original.${ext || "mp4"}`,
          file_type: "video",
        });

        return toJson({
          success: true,
          url: vidUrl,
          video_url: vidUrl,
          media_type: "video",
          media_urls: {
            thumb: null,
            feed: vidUrl,
            full: vidUrl,
          },
          key: vidKey,
          filename: filename || null,
          size_bytes: bytes.byteLength,
          mime_type: mime_type || "video/mp4",
          file_type: "video",
          metadata: {
            cache_control: LONG_CACHE_CONTROL,
          },
        });
      }

      if (file_type === "image" || file_type === "gif") {
        const imageResult = await processImageVariants(env, singleFile);
        return toJson({
          ...imageResult,
          media_urls: JSON.stringify(imageResult.media_urls),
        });
      }

      if (file_type === "video") {
        const videoResult = await processVideoVariants(env, singleFile);
        return toJson({
          ...videoResult,
          media_urls: JSON.stringify(videoResult.media_urls),
        });
      }

      const folder =
        file_type === "audio"
          ? "uploads/audio"
          : file_type === "document"
            ? "uploads/documents"
            : "uploads/files";

      const key = safeKey(ext, folder);
      const url = await putObject(env, {
        key,
        bytes,
        mime_type,
        filename: filename || `upload.${ext}`,
        file_type,
      });

      return toJson({
        success: true,
        key,
        url,
        filename: filename || null,
        size_bytes: bytes.byteLength,
        mime_type,
        file_type,
        metadata: {
          cache_control: LONG_CACHE_CONTROL,
        },
      });
    }

    const body = await request.json().catch(() => ({} as any));
    const filename = String(body.filename || "").trim();
    const incomingType = String(body.contentType || body.mime_type || "").trim();
    const dataBase64 = String(body.dataBase64 || "").trim();

    if (!dataBase64) {
      return toJson({ success: false, error: "dataBase64 is required" }, 400);
    }

    const base64 = dataBase64.includes("base64,")
      ? dataBase64.split("base64,")[1]
      : dataBase64;

    let bin: string;
    try {
      bin = atob(base64);
    } catch {
      return toJson({ success: false, error: "Invalid base64 data" }, 400);
    }

    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const nameExt = filename && filename.includes(".") ? filename.split(".").pop() || "" : "";
    const fallbackExt = safeExtFromType(incomingType);
    const ext = String(nameExt || fallbackExt || "bin").toLowerCase();

    let mime_type = incomingType;
    if (!mime_type || mime_type === "application/octet-stream") {
      mime_type = contentTypeFromExt(ext);
    }

    const file_type = fileTypeFromMimeOrExt(mime_type, ext);

    if (file_type === "image" || file_type === "gif") {
      const originalFile = new File([bytes], filename || `upload.${ext}`, { type: mime_type });
      const imageResult = await processImageVariants(env, originalFile);

      return toJson({
        ...imageResult,
        media_urls: JSON.stringify(imageResult.media_urls),
      });
    }

    if (file_type === "video") {
      const originalFile = new File([bytes], filename || `upload.${ext}`, { type: mime_type });
      const videoResult = await processVideoVariants(env, originalFile);

      return toJson({
        ...videoResult,
        media_urls: JSON.stringify(videoResult.media_urls),
      });
    }

    const folder =
      file_type === "audio"
        ? "uploads/audio"
        : file_type === "document"
          ? "uploads/documents"
          : "uploads/files";

    const key = safeKey(ext, folder);
    const url = await putObject(env, {
      key,
      bytes,
      mime_type,
      filename: filename || `upload.${ext}`,
      file_type,
    });

    return toJson({
      success: true,
      key,
      url,
      filename: filename || null,
      size_bytes: bytes.byteLength,
      mime_type,
      file_type,
      metadata: {
        cache_control: LONG_CACHE_CONTROL,
      },
    });
  } catch (e: any) {
    return toJson({ success: false, error: e?.message || "Upload failed" }, 500);
  }
};
