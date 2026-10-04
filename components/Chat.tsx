// components/Chat.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { User, Message } from "../types";
import { StickerPicker, EmojiPicker } from "./Pickers";
import { CallScreen } from "./CallScreen";

/* ============================================================
   ✅ CACHE HELPERS FOR LOCAL ATTACHMENT CACHING
============================================================ */
const CHAT_CACHE = "unera-chat-files-v1";

const getCachedFileUrl = async (url: string): Promise<string> => {
  const cache = await caches.open(CHAT_CACHE);
  const cached = await cache.match(url);
  
  if (cached) {
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed");
  await cache.put(url, res.clone());
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

/* ============================================================
   ✅ CACHE HELPERS FOR MESSAGE HISTORY & CONVERSATION IDS
   Prevents re-requesting and reloading on every open.
============================================================ */
const MSGS_CACHE_KEY_PREFIX = "unera_chat_msgs_v3_";
const CID_CACHE_KEY_PREFIX = "unera_chat_cid_v3_";
const inMemoryChatCache = new Map<string, any[]>();
const inMemoryCidCache = new Map<string, number>();

export const getCachedMessages = (userId: number, recipientId: number): any[] => {
  if (!userId || !recipientId) return [];
  const key = `${userId}_${recipientId}`;
  if (inMemoryChatCache.has(key)) {
    return inMemoryChatCache.get(key)!;
  }
  try {
    const raw = localStorage.getItem(`${MSGS_CACHE_KEY_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryChatCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {}
  return [];
};

export const setCachedMessages = (userId: number, recipientId: number, messages: any[]) => {
  if (!userId || !recipientId) return;
  const key = `${userId}_${recipientId}`;
  const slice = messages.slice(-200);
  inMemoryChatCache.set(key, slice);
  try {
    localStorage.setItem(`${MSGS_CACHE_KEY_PREFIX}${key}`, JSON.stringify(slice));
  } catch {}
};

export const getCachedCid = (userId: number, recipientId: number): number => {
  if (!userId || !recipientId) return 0;
  const key = `${userId}_${recipientId}`;
  if (inMemoryCidCache.has(key)) return inMemoryCidCache.get(key)!;
  try {
    const raw = localStorage.getItem(`${CID_CACHE_KEY_PREFIX}${key}`);
    if (raw) {
      const val = Number(raw);
      if (Number.isFinite(val) && val > 0) {
        inMemoryCidCache.set(key, val);
        return val;
      }
    }
  } catch {}
  return 0;
};

export const setCachedCid = (userId: number, recipientId: number, cid: number) => {
  if (!userId || !recipientId || !cid) return;
  const key = `${userId}_${recipientId}`;
  inMemoryCidCache.set(key, cid);
  try {
    localStorage.setItem(`${CID_CACHE_KEY_PREFIX}${key}`, String(cid));
  } catch {}
};

/* ============================================================
   ✅ NATIVE APP DETECTION & PICKER HELPERS
============================================================ */
const isUneraNativeApp = (): boolean => {
  return Boolean(
    (window as any).UneraNative || 
    (window as any).UNERA_IS_NATIVE_APP ||
    (window as any).ReactNativeWebView
  );
};

const callNativePicker = (fileType: 'image' | 'video' | 'audio' | 'document' | 'any'): boolean => {
  if (!isUneraNativeApp()) return false;

  const action = 
    fileType === 'image' ? 'pick_image' :
    fileType === 'video' ? 'pick_video' :
    'pick_file';

  if ((window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({ action, fileType })
    );
    return true;
  }

  if ((window as any).ReactNativeWebView?.postMessage) {
    (window as any).ReactNativeWebView.postMessage(
      JSON.stringify({ action, fileType })
    );
    return true;
  }

  return false;
};

/* ============================================================
   ✅ FORCE DOWNLOAD - FIX FOR BLOB URL IN WEBVIEW
============================================================ */
const forceDownload = async (url: string, filename = "download") => {
  if (!url) return;
  
  const cleanName = (filename || "download").replace(/[\/\\?%*:|"<>]/g, "_");
  
  // ✅ Native app: let Flutter download/open/cache it
  if (isUneraNativeApp() && (window as any).UneraNative?.postMessage) {
    (window as any).UneraNative.postMessage(
      JSON.stringify({
        action: "download_file",
        url,
        fileName: cleanName,
      })
    );
    return;
  }
  
  // ✅ Web browser fallback - try blob download first
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  } catch {
    // Fallback: direct download with target="_blank"
    const a = document.createElement("a");
    a.href = url;
    a.download = cleanName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

/* ============================================================
   ✅ Upload function for R2 (returns rich data)
============================================================ */
const uploadToR2 = async (file: File, folder = "chat"): Promise<any> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", file.name);
  formData.append("type", file.type);
  formData.append("folder", folder);
  formData.append("timestamp", Date.now().toString());

  const token = localStorage.getItem("unera_token");
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Upload failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result?.url) throw new Error("No URL returned from upload");

  return {
    url: result.url,
    file_type: result.file_type || "other",
    mime_type: result.mime_type || result.contentType || file.type || "",
    filename: result.filename || file.name || "Attachment",
    size_bytes: result.size_bytes ?? file.size ?? null,
    metadata: result.metadata || {},
  };
};

/* ============================================================
   ✅ Helpers
============================================================ */
const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const safeDuration = (n: any): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
};

const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.floor(safeDuration(seconds) || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss < 10 ? "0" : ""}${ss}`;
};

const getFileIcon = (mime: string): string => {
  if (mime.startsWith("image/")) return "fas fa-image";
  if (mime.startsWith("video/")) return "fas fa-video";
  if (mime.startsWith("audio/")) return "fas fa-music";
  if (mime.startsWith("application/pdf")) return "fas fa-file-pdf";
  if (mime.includes("word")) return "fas fa-file-word";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "fas fa-file-excel";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "fas fa-file-powerpoint";
  if (mime.startsWith("text/")) return "fas fa-file-lines";
  return "fas fa-file";
};

const extractUrls = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
};

const stripUrlsFromText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text || "").replace(urlRegex, "").replace(/\s+/g, " ").trim();
};

const parseProductInMessage = (text: string): { productId: number; productTitle?: string; cleanText: string } | null => {
  if (!text) return null;
  const match = text.match(/\[product(?::|\s+#?)\s*(\d+)\]/i);
  if (match) {
    const productId = Number(match[1]);
    const withoutTag = text.replace(match[0], '').trim();
    const colonMatch = withoutTag.match(/^([^:\n]{1,80}):\s*([\s\S]*)$/);
    const productTitle = colonMatch ? colonMatch[1].trim() : undefined;
    return { productId, productTitle, cleanText: withoutTag };
  }
  return null;
};

const isGifUrl = (url: string) => {
  const u = (url || "").toLowerCase();
  if (!u) return false;

  if (u.split("?")[0].endsWith(".gif")) return true;
  if (u.includes("media.tenor.com") || u.includes("c.tenor.com")) return true;
  if (u.includes("i.giphy.com") || u.includes("media.giphy.com")) return true;
  if (u.includes("tenor.com/view/")) return true;
  if (u.includes("giphy.com/gifs/")) return true;

  return false;
};

const apiFetch = async (url: string, options: RequestInit = {}, userId?: number) => {
  const token = localStorage.getItem("unera_token");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (userId) headers["x-user-id"] = String(userId);

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = "API Error";
    try {
      const j = await res.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
};

const safeStr = (v: any) => (typeof v === "string" ? v : "");
const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const parseDate = (v: any) => {
  const s = safeStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
const formatTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const isMsgSeen = (m: any): boolean => {
  return !!m?.read_at ||
    !!m?.seen_at ||
    m?.is_read === 1 ||
    m?.is_read === true ||
    m?.read === 1 ||
    m?.read === true;
};

const isMsgDelivered = (m: any): boolean => {
  return !!m?.delivered_at ||
    m?.is_delivered === 1 ||
    m?.is_delivered === true ||
    m?.delivered === 1 ||
    m?.delivered === true;
};

const DeliveryTicks: React.FC<{ msg: any; mine: boolean }> = ({ msg, mine }) => {
  if (!mine) return null;

  const seen = isMsgSeen(msg);
  const delivered = isMsgDelivered(msg);

  if (seen) {
    return <i className="fas fa-check-double text-[11px] text-[#0084FF]" />;
  }

  if (delivered) {
    return <i className="fas fa-check-double text-[11px] text-[#8E8E93]" />;
  }

  return <i className="fas fa-check text-[11px] text-[#8E8E93]" />;
};

const formatLastSeen = (iso: string) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "Offline";
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Last seen just now";
  if (diffMins < 60) return `Last seen ${diffMins} min ago`;
  if (diffHours < 24) return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return "Last seen yesterday";
  
  const day = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `Last seen ${day}, ${time}`;
};

/* ============================================================
   ✅ URL Preview Component
============================================================ */
const URLPreview: React.FC<{ url: string }> = ({ url }) => {
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        setPreviewData({ domain, url });
      } catch {
        setPreviewData({ domain: url.substring(0, 30), url });
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [url]);

  if (loading) {
    return (
      <div className="mt-1 p-3 rounded-xl border border-[#242526] bg-[#18191A] animate-pulse w-full max-w-full overflow-hidden">
        <div className="h-4 bg-[#2C2D30] rounded w-3/4" />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 p-3 rounded-xl border border-[#242526] bg-[#18191A] flex items-center gap-3 hover:bg-[#222325] transition-colors no-underline w-full max-w-full overflow-hidden"
      onClick={(e) => e.stopPropagation()}
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
    >
      <i className="fas fa-link text-xl text-[#0084FF] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{previewData?.domain || "Link"}</div>
        <div className="text-[#8E8E93] text-xs truncate">{url}</div>
      </div>
      <i className="fas fa-external-link-alt text-[#8E8E93] shrink-0" />
    </a>
  );
};

/* ============================================================
   ✅ GIF Preview with download indicator
============================================================ */
const GIFPreview: React.FC<{
  url: string;
  onView: () => void;
  onHold: (evt: any) => void;
  downloadState?: any;
  onDownload?: (url: string, name: string) => void;
}> = ({ url, onView, onHold, downloadState, onDownload }) => {
  const u = (url || "").toLowerCase();

  const directGif =
    u.split("?")[0].endsWith(".gif") ||
    u.includes("media.tenor.com") ||
    u.includes("i.giphy.com") ||
    u.includes("media.giphy.com") ||
    u.includes("c.tenor.com");

  const isTenorPage = u.includes("tenor.com/view/");
  const isGiphyPage = u.includes("giphy.com/gifs/");

  const getEmbedUrl = () => {
    if (isTenorPage) {
      const match = url.match(/tenor\.com\/view\/([^\/]+)/);
      if (match) return `https://tenor.com/embed/${match[1]}`;
    }
    if (isGiphyPage) {
      const match = url.match(/giphy\.com\/gifs\/([^\/]+)/);
      if (match) return `https://giphy.com/embed/${match[1]}`;
    }
    return null;
  };

  const embedUrl = getEmbedUrl();
  const wrapCls = "mt-1 rounded-2xl overflow-hidden border border-[#242526] bg-[#18191A] w-[220px] max-w-full relative";

  const DownloadButton = () => {
    if (!onDownload) return null;
    const isDownloading = downloadState?.downloading;
    const progress = downloadState?.progress || 0;
    const isCompleted = downloadState?.completed;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownload(url, "gif.gif");
        }}
        className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors z-10"
      >
        {isDownloading ? (
          <span className="text-white text-xs font-bold">{progress}%</span>
        ) : isCompleted ? (
          <i className="fas fa-check text-green-500 text-sm" />
        ) : (
          <i className="fas fa-download text-white text-sm" />
        )}
      </button>
    );
  };

  if (directGif) {
    return (
      <div
        className={wrapCls}
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
        onTouchStart={onHold}
        onMouseDown={onHold}
      >
        <img src={url} alt="GIF" className="w-full h-[150px] object-cover" />
        <DownloadButton />
      </div>
    );
  }

  if (embedUrl) {
    return (
      <div className={wrapCls} onClick={(e) => e.stopPropagation()} onTouchStart={onHold} onMouseDown={onHold}>
        <iframe src={embedUrl} className="w-full h-[150px]" frameBorder="0" allowFullScreen title="GIF" />
        <DownloadButton />
      </div>
    );
  }

  return <URLPreview url={url} />;
};

/* ============================================================
   ✅ Voice Note Player with download indicator
============================================================ */
const hashToWave = (key: string, count = 28) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const v = 18 + (h % 70);
    out.push(v);
  }
  return out;
};

const audioManager = {
  currentAudio: null as HTMLAudioElement | null,
  currentKey: null as string | null,
  listeners: new Map<string, (isPlaying: boolean) => void>(),
  
  register(key: string, audio: HTMLAudioElement, onPlayStateChange: (isPlaying: boolean) => void) {
    this.listeners.set(key, onPlayStateChange);
    
    const originalPlay = audio.play;
    audio.play = function() {
      if (audioManager.currentAudio && audioManager.currentAudio !== audio) {
        audioManager.currentAudio.pause();
        audioManager.currentAudio.currentTime = 0;
        if (audioManager.currentKey) {
          const listener = audioManager.listeners.get(audioManager.currentKey);
          listener?.(false);
        }
      }
      audioManager.currentAudio = audio;
      audioManager.currentKey = key;
      onPlayStateChange(true);
      return originalPlay.call(this);
    }.bind(audio);
    
    const originalPause = audio.pause;
    audio.pause = function() {
      if (audioManager.currentAudio === audio) {
        audioManager.currentAudio = null;
        audioManager.currentKey = null;
        onPlayStateChange(false);
      }
      return originalPause.call(this);
    }.bind(audio);
  },
  
  unregister(key: string) {
    this.listeners.delete(key);
    if (this.currentKey === key) {
      this.currentAudio = null;
      this.currentKey = null;
    }
  }
};

const VoiceNoteWA: React.FC<{
  src: string;
  isMine?: boolean;
  durationHint?: number;
  downloadState?: any;
  onDownload?: (url: string, name: string) => void;
}> = ({ src, isMine = true, durationHint, downloadState, onDownload }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keyRef = useRef<string>(`voice-${src}-${Math.random()}`);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(safeDuration(durationHint));
  const [current, setCurrent] = useState(0);

  const wave = useMemo(() => hashToWave(src), [src]);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setCurrent(a.currentTime || 0);
    if (!a.paused) rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioManager.unregister(keyRef.current);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const pct = safeDuration(duration) > 0 ? Math.min(1, Math.max(0, current / safeDuration(duration))) : 0;
  const activeBars = Math.floor(pct * wave.length);

  const bg = isMine ? "#0084FF" : "#242526";
  const waveOff = "rgba(255,255,255,0.35)";
  const waveOn = "rgba(255,255,255,0.95)";
  const isDownloading = downloadState?.downloading;
  const progress = downloadState?.progress || 0;
  const isCompleted = downloadState?.completed;

  return (
    <div className="w-full max-w-full relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-3 py-2 rounded-2xl w-full" style={{ background: bg }}>
        <button
          type="button"
          onClick={toggle}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.18)" }}
          aria-label={playing ? "Pause" : "Play"}
        >
          <i className={`fas ${playing ? "fa-pause" : "fa-play"} text-[16px]`} style={{ color: "#fff" }} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[2px] h-[24px]">
            {wave.map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full"
                style={{
                  height: `${Math.min(24, Math.max(6, Math.round(h / 3.2)))}px`,
                  background: i <= activeBars ? waveOn : waveOff,
                  transition: "background 120ms linear",
                }}
              />
            ))}
          </div>
        </div>

        <div className="text-[13px] font-semibold tabular-nums shrink-0 text-white">
          {formatDuration(safeDuration(duration))}
        </div>

        {onDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(src, `voice-${Date.now()}.mp3`);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            {isDownloading ? (
              <span className="text-white text-xs font-bold">{progress}%</span>
            ) : isCompleted ? (
              <i className="fas fa-check text-green-400 text-sm" />
            ) : (
              <i className="fas fa-download text-white text-sm" />
            )}
          </button>
        )}
      </div>

      <audio
        ref={(el) => {
          audioRef.current = el;
          if (el) {
            audioManager.register(keyRef.current, el, setPlaying);
          }
        }}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          setDuration(safeDuration(a.duration || durationHint || 0));
        }}
        onPlay={() => {
          setPlaying(true);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(tick);
        }}
        onPause={() => {
          setPlaying(false);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          const a = audioRef.current;
          if (a) a.currentTime = 0;
        }}
      />
    </div>
  );
};

/* ============================================================
   ✅ Attachment Preview with cached URL support & download progress
============================================================ */
const AttachmentPreview: React.FC<{ 
  attachment: any; 
  onView: () => void; 
  isMine?: boolean;
  downloadState?: any;
  onDownload?: (url: string, name: string) => void;
}> = ({ attachment, onView, isMine, downloadState, onDownload }) => {
  const url = attachment?.cached_url || attachment?.url || attachment?.attachment_url || attachment?.attachmentUrl;
  const mime = attachment?.mime_type || attachment?.mimeType || attachment?.type || attachment?.attachment_type || "";
  const fileType = attachment?.file_type || attachment?.fileType || attachment?.attachment_type || attachment?.attachmentType || "";

  const name = attachment?.filename || attachment?.name || "Attachment";
  const size = attachment?.size_bytes ?? attachment?.size ?? attachment?.file_size;
  const isDownloading = downloadState?.downloading;
  const progress = downloadState?.progress || 0;
  const isCompleted = downloadState?.completed;

  if (!url) return null;

  const isImage = fileType === "image" || String(mime).startsWith("image/");
  const isVideo = fileType === "video" || String(mime).startsWith("video/");
  const isAudio = fileType === "audio" || fileType === "voice" || String(mime).startsWith("audio/") ||
    String(mime).includes("opus") || String(url).toLowerCase().includes(".webm") ||
    String(url).toLowerCase().includes(".m4a") || String(url).toLowerCase().includes(".mp3") ||
    String(url).toLowerCase().includes(".aac");

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const originalUrl = attachment?.url || attachment?.attachment_url;
    if (originalUrl && onDownload) {
      onDownload(originalUrl, attachment?.filename || "download");
    }
  };

  if (isImage) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-[#242526] cursor-pointer hover:opacity-95 transition-opacity w-full max-w-full">
        <img src={url} alt={name} className="w-full max-h-[400px] object-contain bg-black/40" onClick={onView} />
        {onDownload && (
          <button
            onClick={handleDownload}
            className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors z-10"
          >
            {isDownloading ? (
              <span className="text-white text-xs font-bold">{progress}%</span>
            ) : isCompleted ? (
              <i className="fas fa-check text-green-500 text-sm" />
            ) : (
              <i className="fas fa-download text-white text-sm" />
            )}
          </button>
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-[#242526] cursor-pointer w-full max-w-full">
        <video src={url} className="w-full max-h-[400px] object-contain bg-black/40" controls onClick={onView} />
        {onDownload && (
          <button
            onClick={handleDownload}
            className="absolute bottom-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors z-10"
          >
            {isDownloading ? (
              <span className="text-white text-xs font-bold">{progress}%</span>
            ) : isCompleted ? (
              <i className="fas fa-check text-green-500 text-sm" />
            ) : (
              <i className="fas fa-download text-white text-sm" />
            )}
          </button>
        )}
      </div>
    );
  }

  if (isAudio) {
    return <VoiceNoteWA src={url} isMine={isMine} downloadState={downloadState} onDownload={onDownload} />;
  }

  return (
    <div
      className={[
        "p-3.5 rounded-2xl border bg-[#18191A] flex items-center gap-3 cursor-pointer hover:bg-[#222325] transition-colors w-full max-w-full overflow-hidden",
        isMine ? "border-[#0084FF]/30" : "border-[#242526]",
      ].join(" ")}
      onClick={onView}
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
    >
      <i className={`${getFileIcon(mime || "")} text-3xl text-[#0084FF] shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{name}</div>
        {size ? <div className="text-[#8E8E93] text-xs">{formatFileSize(size)}</div> : null}
      </div>
      {onDownload && (
        <button
          onClick={handleDownload}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
        >
          {isDownloading ? (
            <span className="text-[#0084FF] text-xs font-bold">{progress}%</span>
          ) : isCompleted ? (
            <i className="fas fa-check text-green-500 text-sm" />
          ) : (
            <i className="fas fa-download text-[#8E8E93] text-sm hover:text-[#0084FF] transition-colors" />
          )}
        </button>
      )}
    </div>
  );
};

/* ============================================================
   ✅ Avatar
============================================================ */
const Avatar: React.FC<{ src?: string | null; name?: string; size?: number; className?: string }> = ({
  src,
  name = "",
  size = 40,
  className = "",
}) => {
  const url = safeStr(src);
  const initials =
    (safeStr(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U").slice(0, 2);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover border border-[#242526] bg-[#1C1E21] ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          const img = e.currentTarget;
          img.onerror = null;
          img.src =
            "data:image/svg+xml;charset=utf-8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
                <rect width="100%" height="100%" fill="#242526"/>
                <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${Math.max(
                  14,
                  Math.floor(size * 0.38)
                )}" font-family="Arial" fill="#E4E6EB">${initials}</text>
              </svg>`
            );
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-[#242526] flex items-center justify-center text-white font-bold border border-[#2D3035] ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(14, Math.floor(size * 0.38)) }}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
};

/* ============================================================
   ✅ GIF Panel
============================================================ */
const QUICK_GIFS: Array<{ title: string; url: string }> = [
  { title: "Love", url: "https://media.tenor.com/5tQq5R6kB6YAAAAC/love-hearts.gif" },
  { title: "Kiss", url: "https://media.tenor.com/2b8y0xKx2j0AAAAC/kiss-love.gif" },
  { title: "Hug", url: "https://media.tenor.com/0Qy2Z4nC7yEAAAAC/hug.gif" },
  { title: "Flowers", url: "https://media.tenor.com/HX1k6yJwTQkAAAAC/flowers-rose.gif" },
  { title: "Rose", url: "https://media.tenor.com/2q4m8Qj0pGkAAAAC/rose.gif" },
  { title: "Birthday", url: "https://media.tenor.com/9u1bQ0nPZfEAAAAC/happy-birthday.gif" },
  { title: "Cake", url: "https://media.tenor.com/Q9y6jB4yG2QAAAAC/birthday-cake.gif" },
  { title: "Clap", url: "https://media.tenor.com/6Y5bRr7x0ZgAAAAC/clap-applause.gif" },
  { title: "Hype", url: "https://media.tenor.com/5F3p8Gv6k9AAAAAC/hype-excited.gif" },
  { title: "Fire", url: "https://media.tenor.com/0fQm8q2x2qkAAAAC/fire-lit.gif" },
  { title: "Sad", url: "https://media.tenor.com/eJ2s8a4mYt0AAAAC/crying-sad.gif" },
  { title: "Sorry", url: "https://media.tenor.com/3j5cN3j9h8AAAAAC/sorry.gif" },
  { title: "LOL", url: "https://media.tenor.com/2roX3uxz_68AAAAC/lol-laugh.gif" },
  { title: "Wow", url: "https://media.tenor.com/3k9VQqvK9xgAAAAC/wow-amazed.gif" },
  { title: "Yes", url: "https://media.tenor.com/7j4fB4bDgqQAAAAC/yes-nod.gif" },
  { title: "No", url: "https://media.tenor.com/9tQyE0wQmQ8AAAAC/no-nope.gif" },
];

const GifPanel: React.FC<{ onSelect: (url: string) => void }> = ({ onSelect }) => {
  return (
    <div className="p-3 bg-[#121212]">
      <div className="text-[12px] text-[#8E8E93] mb-2 font-semibold">Trending GIFs</div>
      <div className="grid grid-cols-3 gap-2">
        {QUICK_GIFS.map((g) => (
          <button
            key={g.url}
            type="button"
            className="rounded-xl overflow-hidden border border-[#242526] bg-[#18191A] hover:opacity-90 active:scale-95 transition-all"
            onClick={() => onSelect(g.url)}
          >
            <img src={g.url} alt={g.title} className="w-full h-[86px] object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
};

const CallMessage: React.FC<{ 
  msg: any; 
  mine: boolean;
  onCallBack?: (mode: "voice" | "video") => void;
}> = ({ msg, mine, onCallBack }) => {
  const text = safeStr(msg?.text_content || "");
  const isMissed = text.includes("Missed");
  const isVideo = text.includes("video") || text.includes("🎥");
  const isVoice = text.includes("voice") || text.includes("📞");
  
  const icon = isVideo ? "🎥" : "📞";
  const callType = isVideo ? "video" : "voice";
  
  const cleanText = text
    .replace(/[⬆️⬇️]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl ${
      mine ? "bg-[#0084FF] text-white" : "bg-[#242526] text-[#F0F2F5]"
    }`}>
      <span className="text-sm">{icon}</span>
      <span className="text-xs flex-1">{cleanText}</span>
      {isMissed && onCallBack && (
        <button
          onClick={() => onCallBack(callType)}
          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            mine ? "bg-white/20 hover:bg-white/30 text-white" : "bg-[#0084FF] hover:bg-[#0073E6] text-white"
          } transition-colors`}
        >
          Call back
        </button>
      )}
    </div>
  );
};

type ChatWindowProps = {
  currentUser: User;
  recipient: User;
  onClose: () => void;
  onSendMessage?: (t: string, s?: string) => void;
  onViewProduct?: (productId: number) => void;
};

type ActionModalState =
  | null
  | {
      mine: boolean;
      msg: any;
      kind: "message" | "attachment" | "gif";
      attachment?: any;
      gifUrl?: string;
      x: number;
      y: number;
    };

/* ============================================================
   ✅ Main ChatWindow
============================================================ */
export const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, recipient, onClose, onSendMessage, onViewProduct }) => {
  const currentUserId = safeNum((currentUser as any)?.id);
  const recipientId = safeNum((recipient as any)?.id);

  // Initialize immediately from cached message history
  const initialMsgs = useMemo(() => {
    return getCachedMessages(currentUserId, recipientId);
  }, [currentUserId, recipientId]);

  const initialCid = useMemo(() => {
    return getCachedCid(currentUserId, recipientId);
  }, [currentUserId, recipientId]);

  const [inputText, setInputText] = useState("");
  const [msgs, setMsgs] = useState<Message[]>(initialMsgs);
  const [loading, setLoading] = useState<boolean>(() => initialMsgs.length === 0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [conversationId, setConversationId] = useState<number>(initialCid);
  const [viewingAttachment, setViewingAttachment] = useState<any>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showGifs, setShowGifs] = useState(false);

  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const [actionModal, setActionModal] = useState<ActionModalState>(null);
  const [recipientOnline, setRecipientOnline] = useState(false);
  const [recipientLastSeen, setRecipientLastSeen] = useState<string>("");
  
  // ✅ Native download tracking
  const [nativeDownloads, setNativeDownloads] = useState<Record<string, {
    progress: number;
    downloading: boolean;
    completed: boolean;
    cached?: boolean;
    localPath?: string;
    error?: string;
  }>>({});

  // Call states
  const [callOpen, setCallOpen] = useState(false);
  const [callMode, setCallMode] = useState<"voice" | "video">("voice");
  const [callPhase, setCallPhase] = useState<"incoming" | "outgoing" | "connecting" | "active" | "ended">("ended");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callPeerId, setCallPeerId] = useState<number>(0);
  const [callPeerName, setCallPeerName] = useState<string>("");
  const [callPeerAvatar, setCallPeerAvatar] = useState<string | null>(null);
  const callPeerIdRef = useRef(0);
  useEffect(() => { callPeerIdRef.current = callPeerId; }, [callPeerId]);

  const setCallPeer = (id: number, name?: string, avatar?: string | null) => {
    setCallPeerId(id);
    setCallPeerName((name && String(name).trim()) ? String(name).trim() : "User");
    setCallPeerAvatar(avatar ?? null);
  };

  const [callSeconds, setCallSeconds] = useState(0);
  const callTimerRef = useRef<number | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const ringRef = useRef<AudioContext | null>(null);
  const ringOscRef = useRef<OscillatorNode | null>(null);
  const ringGainRef = useRef<GainNode | null>(null);
  const callEndReasonRef = useRef<"declined" | "hangup" | "remote_hangup" | "none">("none");
  const callInitiatorRef = useRef<"me" | "them" | "none">("none");
  const missedLoggedRef = useRef<Set<string>>(new Set());
  const lastIncomingShownRef = useRef<string | null>(null);
  const callPhaseRef = useRef(callPhase);
  useEffect(() => { callPhaseRef.current = callPhase; }, [callPhase]);

  const [swapVideoViews, setSwapVideoViews] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callCursor, setCallCursor] = useState(0);
  const [incomingPopup, setIncomingPopup] = useState<any>(null);
  
  const callCursorRef = useRef(0);
  const callIdRef = useRef<string | null>(null);
  const incomingPopupRef = useRef<any>(null);
  const recipientIdRef = useRef<number>(0);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callPollRef = useRef<number | null>(null);
  const remoteDescSetRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const disconnectGraceRef = useRef<number | null>(null);

  const clearDisconnectGrace = () => {
    if (disconnectGraceRef.current) window.clearTimeout(disconnectGraceRef.current);
    disconnectGraceRef.current = null;
  };

  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { incomingPopupRef.current = incomingPopup; }, [incomingPopup]);
  useEffect(() => { recipientIdRef.current = safeNum((recipient as any)?.id); }, [recipient]);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordingWave, setRecordingWave] = useState<number[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const waveIntervalRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ SCROLL STATE - Don't force scroll when user is reading old messages
  const shouldStickToBottomRef = useRef(true);
  
  const isNearBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 260;
  };
  
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      shouldStickToBottomRef.current = isNearBottom();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  
  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgs.length]);

  /* ============================================================
     ✅ NATIVE DOWNLOAD EVENT LISTENERS
  ============================================================ */
  useEffect(() => {
    const keyOf = (d: any) => d?.url || d?.fileName || '';

    const onStart = (e: any) => {
      const d = e.detail || {};
      const key = keyOf(d);
      if (!key) return;

      setNativeDownloads(prev => ({
        ...prev,
        [key]: {
          progress: 0,
          downloading: true,
          completed: false,
        },
      }));
    };

    const onProgress = (e: any) => {
      const d = e.detail || {};
      const key = keyOf(d);
      if (!key) return;

      setNativeDownloads(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          progress: Number(d.progress || 0),
          downloading: true,
          completed: false,
          cached: Boolean(d.cached),
        },
      }));
    };

    const onComplete = (e: any) => {
      const d = e.detail || {};
      const key = keyOf(d);
      if (!key) return;

      setNativeDownloads(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          progress: 100,
          downloading: false,
          completed: true,
          cached: Boolean(d.cached),
          localPath: d.localPath,
        },
      }));
      
      // Reset after 3 seconds
      setTimeout(() => {
        setNativeDownloads(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
      }, 3000);
    };

    const onError = (e: any) => {
      const d = e.detail || {};
      const key = keyOf(d);
      if (!key) return;

      setNativeDownloads(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          progress: 0,
          downloading: false,
          completed: false,
          error: d.message || 'Download failed',
        },
      }));
      
      // Reset after 3 seconds
      setTimeout(() => {
        setNativeDownloads(prev => {
          const newState = { ...prev };
          delete newState[key];
          return newState;
        });
      }, 3000);
    };

    window.addEventListener('uneraNativeDownloadStart', onStart as EventListener);
    window.addEventListener('uneraNativeDownloadProgress', onProgress as EventListener);
    window.addEventListener('uneraNativeDownloadComplete', onComplete as EventListener);
    window.addEventListener('uneraNativeDownloadError', onError as EventListener);

    return () => {
      window.removeEventListener('uneraNativeDownloadStart', onStart as EventListener);
      window.removeEventListener('uneraNativeDownloadProgress', onProgress as EventListener);
      window.removeEventListener('uneraNativeDownloadComplete', onComplete as EventListener);
      window.removeEventListener('uneraNativeDownloadError', onError as EventListener);
    };
  }, []);

  /* ============================================================
     ✅ NATIVE DOWNLOAD TRIGGER
  ============================================================ */
  const handleNativeDownload = useCallback((url: string, fileName?: string) => {
    if (isUneraNativeApp() && (window as any).UneraNative?.postMessage) {
      (window as any).UneraNative.postMessage(
        JSON.stringify({
          action: "download_file",
          url,
          fileName: fileName || 'download',
        })
      );
      return;
    }
    
    // Fallback to web download
    forceDownload(url, fileName);
  }, []);

  /* ============================================================
     ✅ NATIVE UPLOAD LISTENER
  ============================================================ */
  useEffect(() => {
    const handleNativeUpload = async (event: any) => {
      const media = event.detail;
      if (!media || !media.url || !currentUserId) return;

      try {
        setUploading(true);
        setUploadProgress(5);
        setShowAttachmentMenu(false);

        const mime = media.mimeType || media.mime_type || '';
        const type = media.type || 'file';

        await send({
          recipient_id: (recipient as any)?.id,
          text_content: inputText.trim() || null,
          attachments: [
            {
              url: media.url || media.full || media.feed,
              file_type: type,
              mime_type: mime,
              filename: media.fileName || media.filename || 'Attachment',
              size_bytes: media.sizeBytes || media.size_bytes || null,
              metadata: media.raw || {},
            },
          ],
        });

        setUploadProgress(100);
        setTimeout(() => setUploadProgress(0), 400);
        setInputText('');
      } catch (e: any) {
        alert(e?.message || 'Failed to send native attachment');
      } finally {
        setUploading(false);
      }
    };

    window.addEventListener('uneraNativeUpload', handleNativeUpload);
    return () => {
      window.removeEventListener('uneraNativeUpload', handleNativeUpload);
    };
  }, [currentUserId, recipient, inputText]);

  const fetchUserLite = async (id: number) => {
    try {
      const u = await apiFetch(`/api/users/${id}`, {}, currentUserId);
      return {
        name: safeStr(u?.name || u?.username || "User"),
        avatar: (u?.profile_image_url || u?.avatar_url || null) as string | null,
      };
    } catch {
      return { name: "User", avatar: null as string | null };
    }
  };

  const normalizeMsg = (msg: any) => ({
    ...msg,
    attachments: Array.isArray(msg?.attachments) ? msg.attachments : [],
  });

  const mergeByIdPreserveRefs = useCallback((prev: any[], incoming: any[]) => {
    const map = new Map<number, any>();
    for (const m of prev) map.set(safeNum(m?.id), m);

    for (const raw of incoming) {
      const m = normalizeMsg(raw);
      const id = safeNum(m?.id);
      const old = map.get(id);

      const same =
        old &&
        safeStr(old?.text_content) === safeStr(m?.text_content) &&
        safeStr(old?.edited_at) === safeStr(m?.edited_at) &&
        safeStr(old?.created_at) === safeStr(m?.created_at) &&
        JSON.stringify(old?.attachments || []) === JSON.stringify(m?.attachments || []);

      map.set(id, same ? old : m);
    }

    return Array.from(map.values()).sort((a: any, b: any) => {
      const da = parseDate(a?.created_at);
      const db = parseDate(b?.created_at);
      if (da && db) return da.getTime() - db.getTime();
      return safeNum(a?.id) - safeNum(b?.id);
    });
  }, []);

  const pickBestAudioMime = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/mpeg"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return "";
  };

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 240;
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  const markRead = useCallback(async (convId: number) => {
    if (!convId || !currentUserId) return;
    try {
      await apiFetch(
        "/api/messages/mark-read",
        {
          method: "POST",
          body: JSON.stringify({
            conversation_id: convId,
            user_id: currentUserId,
          }),
        },
        currentUserId
      );
    } catch {}
  }, [currentUserId]);

  const fetchHistory = useCallback(async () => {
    if (!currentUserId || !recipientId) return;

    try {
      if (msgs.length === 0 && initialMsgs.length === 0) {
        setLoading(true);
      }

      let cid = conversationId || getCachedCid(currentUserId, recipientId);

      if (!cid) {
        const conversations = await apiFetch("/api/messages/conversations", {}, currentUserId);
        const conv = Array.isArray(conversations)
          ? conversations.find((c: any) => safeNum(c?.other_user_id) === recipientId)
          : null;

        cid = safeNum(conv?.id, 0);
        if (cid) {
          setConversationId(cid);
          setCachedCid(currentUserId, recipientId, cid);
        }
      }

      if (cid) {
        const history = await apiFetch(`/api/messages/conversations/${cid}`, {}, currentUserId);
        const incoming = Array.isArray(history) ? history : [];
        setMsgs((prev) => {
          const merged = mergeByIdPreserveRefs(prev, incoming);
          setCachedMessages(currentUserId, recipientId, merged);
          return merged;
        });
        markRead(cid);
      } else {
        if (initialMsgs.length === 0) {
          setMsgs([]);
        }
      }

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [recipientId, markRead, currentUserId, mergeByIdPreserveRefs, conversationId, msgs.length, initialMsgs.length]);

  const heartbeat = useCallback(async () => {
    if (!currentUserId) return;
    try {
      await apiFetch(
        "/api/presence/heartbeat",
        { method: "POST", body: JSON.stringify({ user_id: currentUserId }) },
        currentUserId
      );
    } catch {}
  }, [currentUserId]);

  const fetchRecipientPresence = useCallback(async () => {
    const rid = safeNum((recipient as any)?.id);
    if (!rid || !currentUserId) return;

    try {
      const s = await apiFetch(`/api/presence/status?user_id=${rid}`, {}, currentUserId);
      setRecipientOnline(!!s?.online);
      setRecipientLastSeen(s?.last_seen_at || "");
    } catch {}
  }, [recipient, currentUserId]);

  useEffect(() => {
    fetchHistory();

    if (pollRef.current) window.clearInterval(pollRef.current);
    // ✅ Only poll when user is at bottom (not reading old messages)
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible" && shouldStickToBottomRef.current) {
        fetchHistory();
      }
    }, 8000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [recipient?.id, currentUserId, fetchHistory]);

  useEffect(() => {
    heartbeat();
    fetchRecipientPresence();

    const hb = window.setInterval(() => {
      if (document.visibilityState === "visible") heartbeat();
    }, 15000);

    const pr = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchRecipientPresence();
    }, 8000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        heartbeat();
        fetchRecipientPresence();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(hb);
      window.clearInterval(pr);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [heartbeat, fetchRecipientPresence]);

  // Ringtone helpers
  const startRingtone = (type: "incoming" | "outgoing") => {
    stopRingtone();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      ringOscRef.current = osc;
      ringGainRef.current = gain;

      osc.type = "sine";
      osc.frequency.value = type === "incoming" ? 880 : 660;
      gain.gain.value = 0.0001;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      let on = false;
      const tick = () => {
        if (!ringGainRef.current) return;
        on = !on;
        ringGainRef.current.gain.setTargetAtTime(on ? 0.06 : 0.0001, ctx.currentTime, 0.02);
        const delay = type === "incoming" ? 650 : 450;
        window.setTimeout(tick, delay);
      };
      tick();
    } catch {}
  };

  const stopRingtone = () => {
    try { ringOscRef.current?.stop(); } catch {}
    try { ringOscRef.current?.disconnect(); ringGainRef.current?.disconnect(); } catch {}
    ringOscRef.current = null;
    ringGainRef.current = null;
    try { ringRef.current?.close(); } catch {}
    ringRef.current = null;
  };

  const startCallTimer = () => {
    stopCallTimer();
    callStartedAtRef.current = Date.now();
    setCallSeconds(0);
    callTimerRef.current = window.setInterval(() => {
      if (!callStartedAtRef.current) return;
      setCallSeconds(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);
  };

  const stopCallTimer = () => {
    if (callTimerRef.current) window.clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    callStartedAtRef.current = null;
  };

  const formatCallTime = (s: number) => {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss < 10 ? "0" : ""}${ss}`;
  };

  const getRTCConfiguration = (): RTCConfiguration => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10,
  });

  const flushPendingIce = async (pc: RTCPeerConnection) => {
    const list = pendingIceRef.current.splice(0);
    for (const c of list) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  };

  const logMissedOnce = async (callId: string, args: { mode: "voice" | "video"; direction: "incoming" | "outgoing" }) => {
    if (!callId) return;
    if (missedLoggedRef.current.has(callId)) return;
    missedLoggedRef.current.add(callId);
    if (missedLoggedRef.current.size > 200) missedLoggedRef.current = new Set();
    await sendCallLog({ kind: "missed", mode: args.mode, direction: args.direction });
  };

  const sendCallLog = async (args: { kind: "missed" | "ended"; mode: "voice" | "video"; direction: "incoming" | "outgoing" }) => {
    const icon = args.mode === "video" ? "🎥" : "📞";
    const title = args.kind === "missed" ? `Missed ${args.mode} call` : `${args.mode === "video" ? "Video" : "Voice"} call`;
    const text = `${icon} ${title}`;

    try {
      await send({
        recipient_id: (recipient as any)?.id,
        text_content: text,
      });
    } catch {}
  };

  const sendSignal = async (cid: string, toUserId: number, type: string, payload?: any) => {
    await apiFetch(
      "/api/calls/signal",
      {
        method: "POST",
        body: JSON.stringify({
          call_id: cid,
          to_user_id: toUserId,
          type,
          payload: payload ?? null,
        }),
      },
      currentUserId
    );
  };

  const startPollingCallEvents = (cid: string) => {
    if (callPollRef.current) window.clearInterval(callPollRef.current);
    callPollRef.current = window.setInterval(async () => {
      try {
        const after = callCursorRef.current || 0;
        const res = await apiFetch(`/api/calls/poll?call_id=${encodeURIComponent(cid)}&after=${after}`, {}, currentUserId);
        const events = Array.isArray(res?.events) ? res.events : [];
        const cursor = Number(res?.cursor ?? after);
        if (Number.isFinite(cursor)) {
          callCursorRef.current = cursor;
          setCallCursor(cursor);
        }
        for (const ev of events) await handleCallEvent(ev);
      } catch {}
    }, 900);
  };

  const stopPollingCallEvents = () => {
    if (callPollRef.current) window.clearInterval(callPollRef.current);
    callPollRef.current = null;
  };

  const makePeerConnection = (cid: string, otherUserId: number, stream: MediaStream) => {
    const pc = new RTCPeerConnection(getRTCConfiguration());
    peerConnectionRef.current = pc;
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => { setRemoteStream(e.streams?.[0] || null); };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      if (!otherUserId) return;
      sendSignal(cid, otherUserId, "ice", e.candidate.toJSON()).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") { clearDisconnectGrace(); stopRingtone(); setCallPhase("active"); startCallTimer(); }
      if (st === "disconnected") {
        clearDisconnectGrace();
        disconnectGraceRef.current = window.setTimeout(() => {
          const now = pc.connectionState;
          if (now === "disconnected" || now === "failed" || now === "closed") endCall(true);
        }, 6000);
      }
      if (st === "failed" || st === "closed") { clearDisconnectGrace(); endCall(true); }
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "connected" || st === "completed") { clearDisconnectGrace(); stopRingtone(); setCallPhase("active"); startCallTimer(); }
      if (st === "disconnected") {
        clearDisconnectGrace();
        disconnectGraceRef.current = window.setTimeout(() => {
          const now = pc.iceConnectionState;
          if (now === "disconnected" || now === "failed" || now === "closed") endCall(true);
        }, 6000);
      }
      if (st === "failed" || st === "closed") { clearDisconnectGrace(); endCall(true); }
    };

    return pc;
  };

  const handleCallEvent = async (ev: any) => {
    const type = String(ev?.type || "");
    const payload = ev?.payload ?? null;
    const pc = peerConnectionRef.current;

    if (type === "accept") { setCallPhase("connecting"); return; }
    if (type === "decline") {
      callEndReasonRef.current = "declined";
      if (callIdRef.current) await logMissedOnce(callIdRef.current, { mode: callMode, direction: "outgoing" });
      stopRingtone(); setCallOpen(false); setCallPhase("ended"); endCall(true);
      return;
    }
    if (type === "hangup") { stopRingtone(); endCall(true); return; }
    if (!pc) return;

    if (type === "offer") {
      const otherId = safeNum(callPeerIdRef.current) || safeNum(incomingPopupRef.current?.caller_id) || safeNum(incomingPopupRef.current?.callee_id) || 0;
      const cid = String(callIdRef.current || incomingPopupRef.current?.id || "");
      if (!cid || !otherId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      remoteDescSetRef.current = true;
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(cid, otherId, "answer", answer);
      setCallPhase("connecting");
      return;
    }

    if (type === "answer") {
      if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        remoteDescSetRef.current = true;
      }
      await flushPendingIce(pc);
      setCallPhase("connecting");
      return;
    }

    if (type === "ice") {
      if (!remoteDescSetRef.current) { pendingIceRef.current.push(payload); return; }
      try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch {}
    }
  };

  useEffect(() => {
    if (!currentUserId) return;
    const t = window.setInterval(async () => {
      try {
        if (document.visibilityState !== "visible") return;
        if (callOpen && callPhase !== "ended") return;
        const res = await apiFetch("/api/calls/incoming", {}, currentUserId);
        const c = res?.call || null;
        if (c?.id && c?.status === "ringing") {
          const cid = String(c.id);
          if (lastIncomingShownRef.current === cid && callOpen) return;
          lastIncomingShownRef.current = cid;
          setIncomingPopup(c);
          const callerId = safeNum(c.caller_id);
          const callerName = safeStr(c.caller_name || c.caller_username || "");
          const callerAvatar = (c.caller_avatar || c.caller_profile_image_url || null) as string | null;
          setCallPeer(callerId, callerName || "User", callerAvatar);
          if (!callerName) fetchUserLite(callerId).then((u) => setCallPeer(callerId, u.name || "User", u.avatar));
          setCallMode(c.call_type === "video" ? "video" : "voice");
          setCallPhase("incoming");
          setCallOpen(true);
          startRingtone("incoming");
        }
      } catch {}
    }, 1200);
    return () => window.clearInterval(t);
  }, [currentUserId, callOpen, callPhase]);

  const acceptIncomingCall = async () => {
    const c = incomingPopup;
    if (!c?.id) return;
    const cid = String(c.id);
    const otherId = safeNum(callPeerIdRef.current) || safeNum(c.caller_id);
    const mode: "voice" | "video" = c.call_type === "video" ? "video" : "voice";
    try {
      setCallId(cid); callIdRef.current = cid; callCursorRef.current = 0; setCallCursor(0); setCallMode(mode); setCallPhase("connecting");
      await sendSignal(cid, otherId, "accept", { ok: true });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      setLocalStream(stream); setMicOn(true); setCamOn(mode === "video");
      makePeerConnection(cid, otherId, stream);
      stopRingtone();
      startPollingCallEvents(cid);
    } catch (e: any) { stopRingtone(); alert(e?.message || "Failed to accept call"); endCall(true); }
  };

  const declineIncomingCall = async () => {
    const c = incomingPopup;
    if (!c?.id) { stopRingtone(); setCallOpen(false); setIncomingPopup(null); setCallPhase("ended"); return; }
    const cid = String(c.id); const otherId = safeNum(c.caller_id);
    stopRingtone();
    try { await sendSignal(cid, otherId, "decline", { reason: "declined" }); } catch {}
    setIncomingPopup(null); setCallOpen(false); setCallPhase("ended");
  };

  const startOutgoingCall = async (mode: "voice" | "video") => {
    const otherId = safeNum((recipient as any)?.id);
    if (!otherId) return;
    callInitiatorRef.current = "me"; callEndReasonRef.current = "none";
    setCallPeer(otherId, safeStr((recipient as any)?.name || (recipient as any)?.username || "User"), ((recipient as any)?.profile_image_url || null) as string | null);
    try {
      const created = await apiFetch("/api/calls/create", { method: "POST", body: JSON.stringify({ callee_id: otherId, call_type: mode }) }, currentUserId);
      const cid = String(created?.call_id || "");
      if (!cid) throw new Error("No call_id");
      setCallId(cid); callIdRef.current = cid; callCursorRef.current = 0; setCallCursor(0);
      setCallMode(mode); setCallPhase("outgoing"); setCallOpen(true); startRingtone("outgoing");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      setLocalStream(stream); setMicOn(true); setCamOn(mode === "video");
      const pc = makePeerConnection(cid, otherId, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(cid, otherId, "offer", offer);
      startPollingCallEvents(cid);
    } catch (e: any) { stopRingtone(); alert(e?.message || "Call failed"); endCall(true); }
  };

  const endCall = async (silent = false) => {
    stopRingtone(); stopCallTimer(); stopPollingCallEvents(); clearDisconnectGrace();
    const cid = String(callIdRef.current || incomingPopupRef.current?.id || "");
    const otherId = safeNum(callPeerIdRef.current) || safeNum(incomingPopupRef.current?.caller_id) || safeNum(incomingPopupRef.current?.callee_id);
    if (callInitiatorRef.current === "me" && callPhaseRef.current !== "active" && cid) await logMissedOnce(cid, { mode: callMode, direction: "outgoing" });
    if (!silent && cid && otherId) sendSignal(cid, otherId, "hangup", { ok: true }).catch(() => {});
    try { peerConnectionRef.current?.close(); } catch {}
    peerConnectionRef.current = null;
    try { localStream?.getTracks().forEach((t) => t.stop()); } catch {}
    setLocalStream(null); setRemoteStream(null);
    setIncomingPopup(null); setCallId(null); callIdRef.current = null; callCursorRef.current = 0; setCallCursor(0);
    setCallPeer(0, "", null); setSwapVideoViews(false); callEndReasonRef.current = "none"; callInitiatorRef.current = "none";
    lastIncomingShownRef.current = null;
    setCallPhase("ended"); setTimeout(() => setCallOpen(false), 150);
  };

  const toggleMic = () => { if (localStream) { localStream.getAudioTracks().forEach(track => { track.enabled = !micOn; }); } setMicOn(!micOn); };
  const toggleCamera = () => { if (localStream) { localStream.getVideoTracks().forEach(track => { track.enabled = !camOn; }); } setCamOn(!camOn); };
  const toggleSpeaker = () => { setSpeakerOn(!speakerOn); };
  const switchCamera = async () => { if (!localStream || callMode !== 'video') return; try { const videoTrack = localStream.getVideoTracks()[0]; if (!videoTrack) return; const constraints = videoTrack.getConstraints(); const facingMode = constraints.facingMode === 'user' ? 'environment' : 'user'; const newStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode } }); const pc = peerConnectionRef.current; if (pc) { const sender = pc.getSenders().find(s => s.track?.kind === 'video'); if (sender) await sender.replaceTrack(newStream.getVideoTracks()[0]); } localStream.getVideoTracks()[0].stop(); setLocalStream(newStream); } catch (error) { console.error('Failed to switch camera:', error); } };
  const toggleScreenSize = () => { setIsFullScreen(!isFullScreen); };

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (waveIntervalRef.current) window.clearInterval(waveIntervalRef.current);
      try { mediaRecorderRef.current?.stop(); audioContextRef.current?.close(); sourceRef.current?.disconnect(); } catch {}
      try { recordStreamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
      stopPollingCallEvents();
      if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
      if (localStream) { localStream.getTracks().forEach(t => t.stop()); }
    };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "auto" }); }, [recipient?.id]);

  const normalized = useMemo(() => {
    const arr = Array.isArray(msgs) ? [...msgs] : [];
    arr.sort((a: any, b: any) => {
      const da = parseDate((a as any)?.created_at);
      const db = parseDate((b as any)?.created_at);
      if (da && db) return da.getTime() - db.getTime();
      return safeNum((a as any)?.id) - safeNum((b as any)?.id);
    });
    return arr;
  }, [msgs]);

  const msgById = useMemo(() => {
    const map = new Map<number, any>();
    for (const m of normalized as any[]) map.set(safeNum((m as any)?.id), m);
    return map;
  }, [normalized]);

  const rows = useMemo(() => {
    const out: Array<{ type: "day" | "msg"; key: string; day?: string; msg?: any }> = [];
    let lastDay = "";
    for (const m of normalized as any[]) {
      const d = parseDate(m?.created_at) || null;
      const dk = d ? dayKey(d) : "";
      if (dk && dk !== lastDay) { lastDay = dk; out.push({ type: "day", key: `day:${dk}`, day: formatDayLabel(d!) }); }
      out.push({ type: "msg", key: `msg:${safeNum(m?.id)}`, msg: m });
    }
    return out;
  }, [normalized]);

  const cancelLongPress = () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); longPressTimer.current = null; };
  const startLongPressAny = (args: { msg: any; mine: boolean; kind: "message" | "attachment" | "gif"; attachment?: any; gifUrl?: string; evt: any; }) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    const { evt, msg, mine, kind, attachment, gifUrl } = args;
    const { clientX, clientY } = (() => { const t = evt?.touches?.[0] || evt?.changedTouches?.[0]; if (t) return { clientX: t.clientX, clientY: t.clientY }; return { clientX: evt?.clientX ?? 0, clientY: evt?.clientY ?? 0 }; })();
    longPressTimer.current = window.setTimeout(() => { setActionModal({ msg, mine, kind, attachment, gifUrl, x: clientX, y: clientY }); try { (navigator as any).vibrate?.(10); } catch {} }, 420);
  };

  const startVoiceNote = async () => {
    if (uploading) return;
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) { alert("Voice recording not supported on this device/browser."); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      if (waveIntervalRef.current) window.clearInterval(waveIntervalRef.current);
      waveIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = Array.from(dataArray.slice(0, 20)).reduce((a, b) => a + b, 0) / 20;
          const normalizedWave = Math.min(100, Math.max(20, average));
          setRecordingWave((prev) => [...prev.slice(-15), normalizedWave]);
        }
      }, 100);
      recordChunksRef.current = [];
      const mimeType = pickBestAudioMime();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        try {
          if (waveIntervalRef.current) { window.clearInterval(waveIntervalRef.current); waveIntervalRef.current = null; }
          setRecordingWave([]);
          recordStreamRef.current?.getTracks?.().forEach((t) => t.stop());
          audioContextRef.current?.close(); sourceRef.current?.disconnect();
          recordStreamRef.current = null; audioContextRef.current = null; analyserRef.current = null; sourceRef.current = null;
          const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || "audio/webm" });
          recordChunksRef.current = [];
          const ext = (mr.mimeType || "").includes("mp4") ? "m4a" : (mr.mimeType || "").includes("mpeg") ? "mp3" : "webm";
          const filename = `voice-${Date.now()}.${ext}`;
          const file = new File([blob], filename, { type: mr.mimeType || "audio/webm" });
          setUploading(true);
          setUploadProgress(5);
          const up = await uploadToR2(file, "chat");
          setUploadProgress(92);
          await send({ recipient_id: (recipient as any)?.id, text_content: null, attachments: [{ url: up.url, file_type: up.file_type || "audio", mime_type: up.mime_type || file.type, filename: up.filename || filename, size_bytes: up.size_bytes ?? file.size, metadata: up.metadata || {} }] });
          setUploadProgress(100);
          setTimeout(() => setUploadProgress(0), 400);
          setRecordSeconds(0);
        } catch (e: any) { alert(e?.message || "Failed to send voice note"); } finally { setUploading(false); }
      };
      mr.start(250);
      setRecording(true); setRecordSeconds(0);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (e: any) { alert(e?.message || "Microphone permission denied"); try { recordStreamRef.current?.getTracks?.().forEach((t) => t.stop()); audioContextRef.current?.close(); } catch {} recordStreamRef.current = null; audioContextRef.current = null; }
  };

  const stopVoiceNote = async (cancel = false) => {
    try {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
      if (waveIntervalRef.current) { window.clearInterval(waveIntervalRef.current); waveIntervalRef.current = null; }
      setRecordingWave([]); setRecording(false);
      if (cancel) recordChunksRef.current = [];
      const mr = mediaRecorderRef.current; mediaRecorderRef.current = null;
      if (mr && mr.state !== "inactive") mr.stop();
      else { recordStreamRef.current?.getTracks?.().forEach((t) => t.stop()); audioContextRef.current?.close(); sourceRef.current?.disconnect(); recordStreamRef.current = null; audioContextRef.current = null; analyserRef.current = null; sourceRef.current = null; }
    } catch {}
  };

  const send = async (payload: any) => {
    if (!currentUserId) throw new Error("User not authenticated");
    const fullPayload = { sender_id: currentUserId, ...payload };
    const data = await apiFetch("/api/messages/send", { method: "POST", body: JSON.stringify(fullPayload) }, currentUserId);
    const msg = data?.message ? { ...data.message, attachments: Array.isArray(data.attachments) ? data.attachments : [] } : data;
    setMsgs((prev) => {
      const merged = mergeByIdPreserveRefs(prev, [msg]);
      setCachedMessages(currentUserId, recipientId, merged);
      return merged;
    });
    if (!conversationId) fetchHistory();
    return msg;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentUserId) return;
    
    setUploading(true);
    setUploadProgress(5);
    setShowAttachmentMenu(false);
    
    try {
      const uploaded: any[] = [];
      const total = files.length;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(Math.round((i / total) * 80) + 5);
        const up = await uploadToR2(file, "chat");
        uploaded.push(up);
        setUploadProgress(Math.round(((i + 1) / total) * 85));
      }
      
      setUploadProgress(92);
      
      const payload: any = { 
        recipient_id: (recipient as any)?.id, 
        text_content: inputText.trim() || null, 
        attachments: uploaded.map((u) => ({ 
          url: u.url, 
          file_type: u.file_type, 
          mime_type: u.mime_type, 
          filename: u.filename, 
          size_bytes: u.size_bytes, 
          metadata: u.metadata || {} 
        })) 
      };
      
      await send(payload);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 400);
      setInputText("");
    } catch (error: any) { 
      alert(error?.message || "Failed to upload file"); 
    } finally { 
      setUploading(false); 
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  };

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed && !replyTo && !editTarget) return;
    setShowEmoji(false); setShowStickers(false); setShowGifs(false);
    try {
      onSendMessage?.(trimmed);
      if (editTarget?.id) {
        const updated = await apiFetch(`/api/messages/${editTarget.id}`, { method: "PUT", body: JSON.stringify({ text_content: trimmed, user_id: currentUserId }) }, currentUserId);
        const updatedMsg = updated?.message || null;
        if (updatedMsg?.id) {
          setMsgs((prev) => {
            const merged = mergeByIdPreserveRefs(prev, [updatedMsg]);
            setCachedMessages(currentUserId, recipientId, merged);
            return merged;
          });
        }
        setEditTarget(null); setInputText("");
        return;
      }
      const payload: any = { sender_id: currentUserId, recipient_id: (recipient as any)?.id, text_content: trimmed };
      if (replyTo?.id) payload.parent_message_id = replyTo.id;
      await send(payload);
      setInputText(""); setReplyTo(null);
    } catch (e: any) { alert(e?.message || "Failed to send"); }
  };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); await sendText(inputText); };
  const canSend = inputText.trim().length > 0;

  const doDelete = async (m: any, deleteForEveryone: boolean) => {
    if (!currentUserId) return;
    try {
      await apiFetch(`/api/messages/${safeNum(m?.id)}`, { method: "DELETE", body: JSON.stringify({ delete_for_everyone: deleteForEveryone, user_id: currentUserId }) }, currentUserId);
      setMsgs((prev) => {
        const filtered = prev.filter((x: any) => safeNum(x?.id) !== safeNum(m?.id));
        setCachedMessages(currentUserId, recipientId, filtered);
        return filtered;
      });
    } catch (e: any) { alert(e?.message || "Failed to delete"); }
  };

  const openAttachmentWithCache = async (attachment: any) => {
    const url = attachment?.url || attachment?.attachment_url;
    if (!url) return;
    
    try {
      const cachedUrl = await getCachedFileUrl(url);
      setViewingAttachment({ 
        ...attachment, 
        cached_url: cachedUrl,
        original_url: url, // Store original URL for downloads
      });
    } catch {
      setViewingAttachment({ 
        ...attachment,
        original_url: url,
      });
    }
  };

  const actionBtn = (icon: string, label: string, onClick: () => void, danger = false) => (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-[#242526] active:bg-[#2D3035] transition-colors ${danger ? "text-[#ff6b6b]" : "text-[#F0F2F5]"}`}>
      <i className={`${icon} text-[18px]`} /><span className="text-[15px] font-medium">{label}</span>
    </button>
  );

  const closeActionModal = () => setActionModal(null);
  const safeAreaPaddingBottom = "max(env(safe-area-inset-bottom), 8px)";
  const callHasPeer = callPeerIdRef.current > 0 || callPeerId > 0;
  const peerDisplayName = callHasPeer ? (callPeerName && callPeerName.trim() ? callPeerName : "User") : (safeStr((recipient as any)?.name) || safeStr((recipient as any)?.username) || "User");
  const peerDisplayAvatar = callHasPeer ? (callPeerAvatar ?? null) : (((recipient as any)?.profile_image_url || (recipient as any)?.avatar_url || null) as string | null);

  return (
    <div className="fixed inset-0 z-[200] bg-[#000000] flex flex-col font-sans overflow-x-hidden text-white">
      <style>{`html, body { overflow-x: hidden; } .msgText, .msgText a { overflow-wrap: anywhere; word-break: break-word; }`}</style>

      <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleFileSelect} />

      {/* Header with edge-to-edge status bar padding */}
      <div className="pt-[env(safe-area-inset-top,0px)] border-b border-[#1A1A1A] bg-[#000000]">
        <div className="h-14 px-2 sm:px-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-all text-[#0084FF]"
              aria-label="Back"
            >
              <i className="fas fa-arrow-left text-[18px]" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0 cursor-pointer">
              <div className="relative shrink-0">
                <Avatar src={(recipient as any)?.profile_image_url} name={(recipient as any)?.name} size={38} />
                {recipientOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#31A24C] rounded-full ring-2 ring-black" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] sm:text-[16px] font-bold text-white truncate leading-tight">
                  {safeStr((recipient as any)?.name)}
                </div>
                <div className="text-[12px] truncate flex items-center leading-tight">
                  {recipientOnline ? (
                    <span className="text-[#31A24C] font-medium flex items-center gap-1">
                      Active now
                    </span>
                  ) : (
                    <span className="text-[#8E8E93]">
                      {recipientLastSeen ? formatLastSeen(recipientLastSeen) : "Offline"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#0084FF]">
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-all text-[#0084FF]"
              aria-label="Voice Call"
              onClick={() => startOutgoingCall("voice")}
            >
              <i className="fas fa-phone text-[17px]" />
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-all text-[#0084FF]"
              aria-label="Video Call"
              onClick={() => startOutgoingCall("video")}
            >
              <i className="fas fa-video text-[17px]" />
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-all text-[#0084FF]"
              aria-label="Info"
            >
              <i className="fas fa-circle-info text-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Reply/Edit banner */}
      {(replyTo || editTarget) && (
        <div className="px-3 py-2 border-b border-[#1A1A1A] bg-[#121212]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#0084FF]">
                {editTarget ? "Editing message" : "Replying to"}
              </div>
              <div className="text-[13px] text-[#F0F2F5] truncate mt-0.5">
                {safeStr((editTarget || replyTo)?.text_content) || "…"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setReplyTo(null); setEditTarget(null); }}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#242526] text-[#8E8E93] hover:text-white"
              aria-label="Cancel"
            >
              <i className="fas fa-xmark text-sm" />
            </button>
          </div>
        </div>
      )}

      {/* Uploading progress bar */}
      {uploading && (
        <div className="h-[2px] bg-[#1A1A1A] overflow-hidden">
          <div 
            className="h-full bg-[#0084FF] transition-all duration-300" 
            style={{ width: `${Math.max(8, uploadProgress)}%` }} 
          />
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div className="px-3 py-2.5 border-b border-[#1A1A1A] bg-[#121212]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <i className="fas fa-circle text-[#ff4d4d] text-[8px] animate-pulse" />
                <span className="text-white text-sm font-semibold">{recordSeconds}s</span>
              </div>
              <div className="flex items-center gap-[2px] h-6">
                {recordingWave.map((height, i) => (
                  <div
                    key={i}
                    className="w-[3px] bg-[#0084FF] rounded-full transition-all duration-75"
                    style={{ height: `${height / 2}px` }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => stopVoiceNote(true)}
              className="px-3 py-1 rounded-full bg-[#242526] text-[#ff6b6b] text-xs font-semibold hover:bg-[#2D3035] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-3 py-3 bg-[#000000]"
        onClick={() => { setShowEmoji(false); setShowStickers(false); setShowAttachmentMenu(false); setShowGifs(false); }}
      >
        {loading && msgs.length === 0 ? (
          <div className="text-center text-[#8E8E93] text-sm py-8">Loading messages…</div>
        ) : null}
        {rows.map((r, index) => {
          if (r.type === "day") {
            return (
              <div key={r.key} className="flex items-center justify-center my-3">
                <div className="text-[11px] font-semibold text-[#8E8E93] bg-[#141414] border border-[#222222] px-3 py-1 rounded-full">
                  {r.day}
                </div>
              </div>
            );
          }
          const msg = r.msg as any;
          const mine = safeNum(msg?.sender_id) === safeNum((currentUser as any)?.id);
          const rawText = safeStr(msg?.text_content);
          const productRef = parseProductInMessage(rawText);
          const textWithoutProductTag = productRef ? productRef.cleanText : rawText;
          const urls = extractUrls(textWithoutProductTag);
          const gifUrls = urls.filter((u) => isGifUrl(u));
          const otherUrls = urls.filter((u) => !gifUrls.includes(u));
          const text = stripUrlsFromText(textWithoutProductTag);
          const d = parseDate(msg?.created_at);
          const edited = !!msg?.edited_at;
          const attachments = Array.isArray(msg?.attachments) ? msg.attachments : [];
          const parentId = safeNum(msg?.parent_message_id, 0);
          const parent = parentId ? msgById.get(parentId) : null;
          const prevRow = rows[index - 1];
          const nextRow = rows[index + 1];
          const prevMsg = prevRow?.type === "msg" ? (prevRow as any).msg : null;
          const nextMsg = nextRow?.type === "msg" ? (nextRow as any).msg : null;
          const sameAsPrev = !!prevMsg && safeNum(prevMsg?.sender_id) === safeNum(msg?.sender_id);
          const sameAsNext = !!nextMsg && safeNum(nextMsg?.sender_id) === safeNum(msg?.sender_id);
          const rowMb = sameAsNext ? "mb-[2px]" : "mb-[8px]";
          const bubbleRadius = mine
            ? [`rounded-2xl`, sameAsPrev ? "rounded-tr-md" : "rounded-tr-2xl", sameAsNext ? "rounded-br-md" : "rounded-br-2xl"].join(" ")
            : [`rounded-2xl`, sameAsPrev ? "rounded-tl-md" : "rounded-tl-2xl", sameAsNext ? "rounded-bl-md" : "rounded-bl-2xl"].join(" ");
          const isCallMessage = rawText.includes("📞") || rawText.includes("🎥") || rawText.includes("Missed") || rawText.includes("Voice call") || rawText.includes("Video call");
          return (
            <div key={r.key} className={`w-full flex ${mine ? "justify-end" : "justify-start"} ${rowMb}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[65%] flex flex-col ${mine ? "items-end" : "items-start"} min-w-0`}>
                {(text || parent || d || edited) && (
                  <div
                    className={[
                      "px-3.5 py-2 text-[15px] leading-[1.3] break-words overflow-hidden select-none transition-transform active:scale-[0.99]",
                      mine ? "bg-[#0084FF] text-white shadow-sm shadow-[#0084FF]/20" : "bg-[#242526] text-[#F0F2F5]",
                      bubbleRadius,
                    ].join(" ")}
                    onTouchStart={(e) => startLongPressAny({ msg, mine, kind: "message", evt: e })}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={(e) => startLongPressAny({ msg, mine, kind: "message", evt: e })}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                  >
                    {parent && (
                      <div className={`mb-2 px-2.5 py-1.5 rounded-xl border-l-[3px] ${mine ? "bg-black/20 border-white/80" : "bg-black/30 border-[#0084FF]"}`}>
                        <div className={`text-[11px] font-bold ${mine ? "text-white/90" : "text-[#0084FF]"}`}>Reply</div>
                        <div className={`text-[12px] truncate max-w-[200px] ${mine ? "text-white/85" : "text-[#8E8E93]"}`}>
                          {safeStr(parent?.text_content) || (Array.isArray(parent?.attachments) && parent.attachments.length ? "📎 Attachment" : "…")}
                        </div>
                      </div>
                    )}
                    {productRef && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProduct?.(productRef.productId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            onViewProduct?.(productRef.productId);
                          }
                        }}
                        className={`mb-2 p-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 border text-left active:scale-[0.98] ${
                          mine
                            ? 'bg-black/25 hover:bg-black/35 border-white/20 text-white'
                            : 'bg-[#1877F2]/15 hover:bg-[#1877F2]/25 border-[#1877F2]/30 text-white'
                        }`}
                        title="Click to view product on MarketPoint"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#0F172A] border border-white/10 flex items-center justify-center shrink-0 text-[#1877F2]">
                          <i className="fas fa-store text-[18px]"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold text-[#38BDF8] flex items-center gap-1">
                            <span>MarketPoint Listing</span>
                            <i className="fas fa-arrow-up-right-from-square text-[9px]"></i>
                          </div>
                          <div className="text-[13.5px] font-bold text-white truncate">
                            {productRef.productTitle || `Product #${productRef.productId}`}
                          </div>
                        </div>
                      </div>
                    )}
                    {isCallMessage ? (
                      <CallMessage msg={msg} mine={mine} onCallBack={rawText.includes("Missed") ? (mode) => startOutgoingCall(mode) : undefined} />
                    ) : (
                      text && <div className="whitespace-pre-wrap msgText">{text}</div>
                    )}
                    {d && !isCallMessage && (
                      <div className="flex justify-end items-center gap-1 mt-1">
                        <span className={`text-[10px] tabular-nums ${mine ? "text-white/75" : "text-[#8E8E93]"}`}>
                          {formatTime(d)}
                          {edited ? <span className="ml-1 opacity-80">(edited)</span> : null}
                        </span>
                        <DeliveryTicks msg={msg} mine={mine} />
                      </div>
                    )}
                  </div>
                )}
                {gifUrls.length > 0 && gifUrls.map((url, idx) => {
                  const downloadState = nativeDownloads[url];
                  return (
                    <GIFPreview 
                      key={`gif:${url}:${idx}`} 
                      url={url} 
                      onView={() => window.open(url, "_blank")} 
                      onHold={(e) => startLongPressAny({ msg, mine, kind: "gif", gifUrl: url, evt: e })}
                      downloadState={downloadState}
                      onDownload={handleNativeDownload}
                    />
                  );
                })}
                {otherUrls.length > 0 && otherUrls.map((url, idx) => (<URLPreview key={`url:${url}:${idx}`} url={url} />))}
                {attachments.length > 0 && (
                  <div className="mt-[4px] space-y-1.5 w-full max-w-full">
                    {attachments.map((a: any) => {
                      const fileUrl = a?.url || a?.attachment_url;
                      const downloadState = nativeDownloads[fileUrl];
                      return (
                        <div
                          key={`att:${safeNum(a?.id) || 0}:${safeStr(fileUrl)}`}
                          onTouchStart={(e) => startLongPressAny({ msg, mine, kind: "attachment", attachment: a, evt: e })}
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onMouseDown={(e) => startLongPressAny({ msg, mine, kind: "attachment", attachment: a, evt: e })}
                          onMouseUp={cancelLongPress}
                          onMouseLeave={cancelLongPress}
                        >
                          <AttachmentPreview 
                            attachment={a} 
                            onView={() => openAttachmentWithCache(a)} 
                            isMine={mine}
                            downloadState={downloadState}
                            onDownload={handleNativeDownload}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment menu with native picker support */}
      {showAttachmentMenu && (
        <div className="border-t border-[#1A1A1A] bg-[#121212] p-3">
          <div className="grid grid-cols-4 gap-2">
            {/* Photos */}
            <button
              onClick={() => { if (callNativePicker('image')) return; if (fileInputRef.current) { fileInputRef.current.accept = "image/*"; fileInputRef.current.multiple = true; fileInputRef.current.click(); } }}
              className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#242526] active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-[#0084FF]/15 flex items-center justify-center text-[#0084FF]">
                <i className="fas fa-image text-xl" />
              </div>
              <span className="text-[12px] font-medium text-[#8E8E93]">Photos</span>
            </button>
            {/* Videos */}
            <button
              onClick={() => { if (callNativePicker('video')) return; if (fileInputRef.current) { fileInputRef.current.accept = "video/*"; fileInputRef.current.multiple = true; fileInputRef.current.click(); } }}
              className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#242526] active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-[#0084FF]/15 flex items-center justify-center text-[#0084FF]">
                <i className="fas fa-video text-xl" />
              </div>
              <span className="text-[12px] font-medium text-[#8E8E93]">Videos</span>
            </button>
            {/* Audio */}
            <button
              onClick={() => { if (callNativePicker('audio')) return; if (fileInputRef.current) { fileInputRef.current.accept = "audio/*"; fileInputRef.current.multiple = true; fileInputRef.current.click(); } }}
              className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#242526] active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-[#0084FF]/15 flex items-center justify-center text-[#0084FF]">
                <i className="fas fa-music text-xl" />
              </div>
              <span className="text-[12px] font-medium text-[#8E8E93]">Audio</span>
            </button>
            {/* Documents */}
            <button
              onClick={() => { if (callNativePicker('document')) return; if (fileInputRef.current) { fileInputRef.current.accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"; fileInputRef.current.multiple = true; fileInputRef.current.click(); } }}
              className="flex flex-col items-center gap-2 p-2.5 rounded-2xl hover:bg-[#242526] active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-[#0084FF]/15 flex items-center justify-center text-[#0084FF]">
                <i className="fas fa-file text-xl" />
              </div>
              <span className="text-[12px] font-medium text-[#8E8E93]">Documents</span>
            </button>
          </div>
        </div>
      )}

      {/* Emoji / Stickers / GIF panel */}
      {(showEmoji || showStickers || showGifs) && (
        <div className="border-t border-[#1A1A1A] bg-[#121212]">
          {showEmoji && (<div className="p-2"><EmojiPicker onSelect={(emoji: string) => { setInputText((p) => (p ? `${p}${emoji}` : emoji)); }} /></div>)}
          {showStickers && (<div className="p-2"><StickerPicker onSelect={(stickerText: string) => { sendText(stickerText); }} /></div>)}
          {showGifs && (<GifPanel onSelect={(gifUrl) => { sendText(gifUrl); }} />)}
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="border-t border-[#1A1A1A] bg-[#000000] px-2.5 pt-1.5" style={{ paddingBottom: safeAreaPaddingBottom }}>
        <div className="py-1 flex items-end gap-1.5">
          <div className="flex items-center gap-0.5 shrink-0 text-[#0084FF]">
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-transform"
              aria-label="Attach"
              onClick={() => { setShowAttachmentMenu(!showAttachmentMenu); setShowEmoji(false); setShowStickers(false); setShowGifs(false); }}
            >
              <i className="fas fa-circle-plus text-[21px]" />
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-transform"
              aria-label="Photos"
              onClick={() => {
                if (callNativePicker('image')) return;
                if (fileInputRef.current) {
                  fileInputRef.current.accept = "image/*,video/*";
                  fileInputRef.current.multiple = true;
                  fileInputRef.current.click();
                }
              }}
            >
              <i className="fas fa-images text-[19px]" />
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-transform"
              aria-label="Stickers"
              onClick={() => { setShowStickers((v) => !v); setShowEmoji(false); setShowAttachmentMenu(false); setShowGifs(false); }}
            >
              <i className="fas fa-face-smile text-[19px]" />
            </button>
            <button
              type="button"
              className="px-1.5 h-9 rounded-full flex items-center justify-center hover:bg-[#1A1A1A] active:scale-95 transition-transform"
              aria-label="GIF"
              onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); setShowStickers(false); setShowAttachmentMenu(false); }}
            >
              <span className="text-[12px] font-black tracking-tighter bg-[#0084FF]/20 px-1.5 py-0.5 rounded">GIF</span>
            </button>
          </div>

          <div className="flex-1 min-w-0 bg-[#242526] hover:bg-[#2A2B2D] focus-within:bg-[#2A2B2D] rounded-full px-3.5 py-2 flex items-center gap-2 border border-transparent focus-within:border-[#383A40] transition-colors">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={editTarget ? "Edit message" : "Aa"}
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-white placeholder:text-[#8E8E93]"
              disabled={uploading || recording}
            />
            <button
              type="button"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:text-white transition-colors shrink-0 text-[#0084FF]"
              aria-label="Emoji"
              onClick={() => { setShowEmoji((v) => !v); setShowStickers(false); setShowAttachmentMenu(false); setShowGifs(false); }}
            >
              <i className="far fa-smile text-[18px]" />
            </button>
            <button
              type="button"
              className={`w-7 h-7 rounded-full flex items-center justify-center hover:text-white transition-colors shrink-0 ${recording ? "text-[#ff4d4d]" : "text-[#0084FF]"}`}
              aria-label="Voice"
              onClick={() => { if (recording) stopVoiceNote(false); else startVoiceNote(); }}
              disabled={uploading}
            >
              <i className={`fas ${recording ? "fa-stop" : "fa-microphone"} text-[17px]`} />
            </button>
          </div>

          {canSend || editTarget ? (
            <button
              type="submit"
              className="w-9 h-9 rounded-full bg-[#0084FF] hover:bg-[#0073E6] flex items-center justify-center text-white active:scale-95 transition-all shrink-0 shadow-md shadow-[#0084FF]/20"
              aria-label="Send"
              disabled={uploading || recording}
            >
              <i className="fas fa-paper-plane text-[15px]" />
            </button>
          ) : (
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition-transform shrink-0 text-[#0084FF]"
              aria-label="Like"
              onClick={() => sendText("👍")}
              disabled={uploading || recording}
            >
              <i className="fas fa-thumbs-up text-[21px]" />
            </button>
          )}
        </div>
      </form>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[300]" onClick={closeActionModal} onTouchStart={closeActionModal} role="presentation">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-full max-w-md bg-[#18191A] border-t border-[#262626] rounded-t-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#3A3B3C] rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold text-[#8E8E93] truncate pr-2">
                {actionModal.mine ? "Your message" : "Message"}
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#242526] text-[#8E8E93] hover:text-white"
                aria-label="Close"
                onClick={closeActionModal}
              >
                <i className="fas fa-xmark text-[16px]" />
              </button>
            </div>
            <div className="bg-[#121212] border border-[#262626] rounded-2xl p-3 mb-3">
              <div className="text-[14px] text-[#F0F2F5] break-words leading-relaxed" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                {(() => {
                  if (actionModal.kind === "gif") return "🖼️ GIF";
                  if (actionModal.kind === "attachment") return "📎 Attachment";
                  return safeStr(actionModal.msg?.text_content) || "…";
                })()}
              </div>
            </div>
            <div className="space-y-1">
              {actionBtn("fas fa-reply", "Reply", () => { const m = actionModal.msg; closeActionModal(); setEditTarget(null); setReplyTo(m); })}
              {actionModal.kind !== "message" && actionBtn("fas fa-download", "Download", async () => { 
                const url = actionModal.kind === "gif" 
                  ? safeStr(actionModal.gifUrl) 
                  : safeStr(actionModal.attachment?.url || actionModal.attachment?.attachment_url); 
                const name = actionModal.kind === "attachment" 
                  ? safeStr(actionModal.attachment?.filename || actionModal.attachment?.name || "download") 
                  : "gif.gif"; 
                closeActionModal(); 
                if (url) handleNativeDownload(url, name); 
              })}
              {actionModal.mine && actionModal.kind === "message" ? actionBtn("fas fa-pen", "Edit", () => { const m = actionModal.msg; closeActionModal(); setReplyTo(null); setEditTarget(m); setInputText(safeStr(m?.text_content) || ""); setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[placeholder="Edit message"], input[placeholder="Aa"]'); el?.focus?.(); }, 50); }) : null}
              {actionBtn("fas fa-trash", "Delete", async () => { const m = actionModal.msg; closeActionModal(); await doDelete(m, false); }, true)}
              {actionModal.mine ? actionBtn("fas fa-trash-can", "Delete for everyone", async () => { const m = actionModal.msg; closeActionModal(); await doDelete(m, true); }, true) : null}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={closeActionModal}
                className="w-full py-3 rounded-2xl bg-[#242526] text-white font-semibold hover:bg-[#2D3035] active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
            </div>
            <div style={{ height: "max(env(safe-area-inset-bottom), 8px)" }} />
          </div>
        </div>
      )}

      {/* Attachment Viewer Modal with cached URL support */}
      {viewingAttachment && (
        <div className="fixed inset-0 z-[400] bg-black/95 flex items-center justify-center p-4" onClick={() => setViewingAttachment(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <button onClick={() => setViewingAttachment(null)} className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"><i className="fas fa-times text-white text-xl" /></button>
            {(() => { 
              const att = viewingAttachment; 
              const url = att?.cached_url || att?.url || att?.attachment_url; 
              const originalUrl = att?.original_url || att?.url || att?.attachment_url;
              const mime = att?.mime_type || att?.type || att?.attachment_type || ""; 
              const fileType = att?.file_type || ""; 
              const name = att?.filename || att?.name || "Attachment"; 
              const size = att?.size_bytes ?? att?.size ?? att?.file_size; 
              const isImg = fileType === "image" || String(mime).startsWith("image/"); 
              const isVid = fileType === "video" || String(mime).startsWith("video/"); 
              const isAud = fileType === "audio" || String(mime).startsWith("audio/"); 
              if (isImg) return <img src={url} alt={name} className="max-w-full max-h-[90vh] object-contain" />; 
              if (isVid) return <video src={url} controls autoPlay className="max-w-full max-h-[90vh]"><source src={url} type={mime} />Your browser does not support the video tag.</video>; 
              if (isAud) return (
                <div className="bg-[#18191A] border border-[#262626] rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <i className="fas fa-microphone text-3xl text-[#0084FF]" />
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{name}</div>
                        {size ? <div className="text-[#8E8E93] text-sm">{formatFileSize(size)}</div> : null}
                      </div>
                    </div>
                    <VoiceNoteWA src={url} isMine={false} />
                    <button type="button" onClick={() => handleNativeDownload(originalUrl, name)} className="bg-[#0084FF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#0073E6] text-center transition-colors">Download</button>
                  </div>
                </div>
              ); 
              return (
                <div className="bg-[#18191A] border border-[#262626] rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <i className={`${getFileIcon(mime)} text-3xl text-[#0084FF]`} />
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">{name}</div>
                        {size ? <div className="text-[#8E8E93] text-sm">{formatFileSize(size)}</div> : null}
                      </div>
                    </div>
                    {mime.startsWith("text/") || mime === "application/pdf" ? <iframe src={url} className="w-full h-[60vh] rounded-lg" title={name} /> : null}
                    <button type="button" onClick={() => handleNativeDownload(originalUrl, name)} className="bg-[#0084FF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#0073E6] text-center transition-colors">Download</button>
                  </div>
                </div>
              ); 
            })()}
          </div>
        </div>
      )}

      {/* Call Screen */}
      <CallScreen open={callOpen} mode={callMode} phase={callPhase} peerName={peerDisplayName} peerAvatar={peerDisplayAvatar} localStream={localStream} remoteStream={remoteStream} micOn={micOn} camOn={camOn} speakerOn={speakerOn} swapped={swapVideoViews} onSwap={() => setSwapVideoViews((v) => !v)} isFullScreen={isFullScreen} onToggleScreen={toggleScreenSize} subtitle={callPhase === "active" ? formatCallTime(callSeconds) : callPhase === "connecting" ? "Connecting..." : callPhase === "outgoing" ? "Calling..." : callPhase === "incoming" ? "Incoming call..." : ""} onHangup={() => endCall(false)} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} onToggleMic={toggleMic} onToggleCam={toggleCamera} onToggleSpeaker={toggleSpeaker} onFlipCamera={switchCamera} />
    </div>
  );
};

export default ChatWindow;
