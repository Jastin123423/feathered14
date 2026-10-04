// api/messages/conversations/[id].ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const safeStr = (v: any) => (typeof v === "string" ? v : "");
const safeNum = (v: any, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

const getAuthUserId = async (request: Request): Promise<number> => {
  const hdr = request.headers.get("x-user-id");
  const id = safeNum(hdr, 0);
  return id > 0 ? id : 0;
};

/* ============================================================
   ✅ Attachment normalization (same idea as send.ts)
============================================================ */

const urlExt = (url: string) => {
  const u = (url || "").split("?")[0].toLowerCase();
  const dot = u.lastIndexOf(".");
  if (dot === -1) return "";
  return u.slice(dot + 1);
};

const mimeFromExt = (ext: string) => {
  const e = (ext || "").toLowerCase();
  if (e === "mp3") return "audio/mpeg";
  if (e === "wav") return "audio/wav";
  if (e === "ogg" || e === "oga") return "audio/ogg";
  if (e === "aac") return "audio/aac";
  if (e === "m4a") return "audio/mp4";
  if (e === "webm") return "audio/webm"; // ✅ voice notes commonly
  if (e === "mp4") return "video/mp4";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  if (e === "pdf") return "application/pdf";
  return "";
};

const inferFileType = (mime: string, url: string, provided: string) => {
  const m = (mime || "").toLowerCase();
  const p = (provided || "").toLowerCase();
  const ext = urlExt(url);

  if (p === "audio" || p === "voice" || p === "voicenote") return "audio";

  if (
    m.startsWith("audio/") ||
    m.includes("opus") ||
    ["webm", "mp3", "wav", "ogg", "aac", "m4a"].includes(ext)
  ) {
    return "audio";
  }

  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (m.includes("gif") || ext === "gif") return "gif";
  if (m.startsWith("video/") || ["mp4", "mov"].includes(ext)) return "video";

  if (m === "application/pdf" || ext === "pdf") return "document";
  if (m.includes("officedocument") || m.includes("msword")) return "document";

  return p || "other";
};

const normalizeOneAttachment = (a: any) => {
  const url = safeStr(a?.url ?? a?.attachment_url ?? a?.attachmentUrl ?? "").trim();
  if (!url) return null;

  let mime_type = safeStr(a?.mime_type ?? a?.mimeType ?? a?.mime ?? "").trim();
  const providedType = safeStr(a?.file_type ?? a?.fileType ?? a?.type ?? a?.attachment_type ?? "").trim();

  // backfill mime if missing
  if (!mime_type) {
    const guessed = mimeFromExt(urlExt(url));
    if (guessed) mime_type = guessed;
  }

  const file_type = inferFileType(mime_type, url, providedType);

  const filename = safeStr(a?.filename ?? a?.name ?? "").trim();
  const size_bytes =
    a?.size_bytes != null ? safeNum(a.size_bytes, 0) : a?.size != null ? safeNum(a.size, 0) : null;

  return {
    id: a?.id != null ? safeNum(a.id, 0) : undefined,
    message_id: a?.message_id != null ? safeNum(a.message_id, 0) : undefined,
    url,
    mime_type: mime_type || null,
    file_type: file_type || "other",
    filename: filename || null,
    size_bytes,
    width: a?.width != null ? safeNum(a.width, 0) : null,
    height: a?.height != null ? safeNum(a.height, 0) : null,
    duration_ms: a?.duration_ms != null ? safeNum(a.duration_ms, 0) : null,
    page_count: a?.page_count != null ? safeNum(a.page_count, 0) : null,
    metadata:
      a?.metadata != null
        ? typeof a.metadata === "string"
          ? a.metadata
          : JSON.stringify(a.metadata)
        : null,
    created_at: a?.created_at ?? undefined,
  };
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing (DB)" }, 500);

    const userId = await getAuthUserId(request);
    if (!userId) return json({ success: false, error: "Unauthorized" }, 401);

    const conversationId = safeNum((params as any)?.id, 0);
    if (!conversationId) return json({ success: false, error: "Invalid conversation id" }, 400);

    // must be participant
    const chk = await env.DB
      .prepare(`SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`)
      .bind(conversationId, userId)
      .first();

    if (!chk) return json({ success: false, error: "Forbidden" }, 403);

    // fetch messages, excluding ones "deleted for me"
    const rows = await env.DB
      .prepare(
        `
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          m.parent_message_id,
          m.text_content,
          m.attachment_url,
          m.attachment_type,
          m.attachment_metadata,
          m.created_at,
          m.edited_at
        FROM messages m
        LEFT JOIN message_deletes md
          ON md.message_id = m.id AND md.user_id = ?
        WHERE m.conversation_id = ?
          AND md.message_id IS NULL
        ORDER BY m.created_at ASC, m.id ASC
        `
      )
      .bind(userId, conversationId)
      .all();

    const messages = (rows.results || []) as any[];
    if (!messages.length) return json([]);

    // Pull attachments for all messages in one query
    const ids = messages.map((m) => safeNum(m.id, 0)).filter((n) => n > 0);
    if (!ids.length) return json(messages);

    const placeholders = ids.map(() => "?").join(",");

    let attResults: any[] = [];
    try {
      const aRes = await env.DB
        .prepare(
          `SELECT
             id, message_id, url, mime_type, file_type, filename, size_bytes,
             width, height, duration_ms, page_count, metadata, created_at
           FROM message_attachments
           WHERE message_id IN (${placeholders})
           ORDER BY id ASC`
        )
        .bind(...ids)
        .all();
      attResults = (aRes.results || []) as any[];
    } catch {
      attResults = [];
    }

    const byMsg: Record<string, any[]> = {};
    for (const a of attResults) {
      const norm = normalizeOneAttachment(a);
      if (!norm) continue;
      const mid = String(norm.message_id || a.message_id);
      (byMsg[mid] ||= []).push(norm);
    }

    // Attach normalized attachments (and legacy fallback if empty)
    for (const m of messages) {
      const mid = String(m.id);
      const list = byMsg[mid] || [];

      // ✅ legacy fallback -> convert to attachment if attachments table empty
      if (!list.length) {
        const legacyUrl = safeStr(m.attachment_url).trim();
        if (legacyUrl) {
          const legacyAtt = normalizeOneAttachment({
            url: legacyUrl,
            file_type: safeStr(m.attachment_type).trim(),
            metadata: m.attachment_metadata ?? null,
            message_id: m.id,
          });
          if (legacyAtt) list.push(legacyAtt);
        }
      }

      m.attachments = list;
    }

    return json(messages);
  } catch (e: any) {
    return json({ success: false, error: e?.message || "Server error" }, 500);
  }
};
