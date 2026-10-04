// functions/api/songs/[id]/share.ts
import type { PagesFunction } from "@cloudflare/workers-types";
import { createNotification } from "../../../utils/createNotification";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (v: any, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;

const ALLOWED_DESTINATIONS = new Set([
  "feed",
  "story",
  "message",
  "copy_link",
  "group",
  "external",
]);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.DB) {
      return json({ success: false, error: "DB binding missing (DB)" }, 500);
    }

    // ✅ song id from URL path
    const songId = toNum((params as any)?.id, 0);
    if (!songId) {
      return json({ success: false, error: "Invalid song id" }, 400);
    }

    const body: any = await request.json().catch(() => ({}));

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!userId) {
      return json({ success: false, error: "user_id missing" }, 400);
    }

    const destination = (toText(body.destination, "feed").toLowerCase() || "feed");
    if (!ALLOWED_DESTINATIONS.has(destination)) {
      return json({ success: false, error: "Invalid destination" }, 400);
    }

    const itemType = toText(body.item_type, "music").toLowerCase() || "music";
    const message = toText(body.message) || null;

    // ✅ correct owner column is uploader_id
    const song = await env.DB
      .prepare(
        `SELECT id, uploader_id FROM songs
         WHERE id = ? AND COALESCE(is_deleted, 0) = 0
         LIMIT 1`
      )
      .bind(songId)
      .first<any>();

    if (!song) {
      return json({ success: false, error: "Song not found" }, 404);
    }

    const songOwnerId = toNum(song.uploader_id, 0);

    // Insert share (shared_at handled by DB default)
    const ins = await env.DB
      .prepare(
        `INSERT INTO song_shares (song_id, user_id, destination, item_type, message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(songId, userId, destination, itemType, message)
      .run();

    const shareId = toNum(ins.meta?.last_row_id, 0);

    const share = await env.DB
      .prepare(
        `SELECT id, song_id, user_id, destination, item_type, shared_at, message
         FROM song_shares WHERE id = ? LIMIT 1`
      )
      .bind(shareId)
      .first();

    // Notify owner (never self)
    if (songOwnerId && songOwnerId !== userId) {
      try {
        await createNotification(
          env,
          songOwnerId,
          userId,
          "share",
          "song",
          songId,
          `song:${songId}:share`,
          "shared your song"
        );
      } catch (_) {}
    }

    // Count from source of truth
    const countRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM song_shares WHERE song_id = ?`)
      .bind(songId)
      .first<{ c: number }>();

    const sharesCount = toNum(countRow?.c, 0);

    return json({
      success: true,
      share_id: shareId,
      song_id: songId,
      destination,
      share: share ?? null,
      shares_count: sharesCount,
      shares: sharesCount,
      share_count: sharesCount,
    });
  } catch (err: any) {
    return json(
      { success: false, error: err?.message || "Failed to share song" },
      500
    );
  }
};
