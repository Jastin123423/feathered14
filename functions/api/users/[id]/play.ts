import type { PagesFunction } from "@cloudflare/workers-types";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const safeNum = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const safeStr = (v: any) => String(v ?? "").trim();

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  try {
    const songId = safeNum((params as any)?.id);
    if (!songId) {
      return Response.json({ error: "Invalid song id" }, { status: 400, headers: cors });
    }

    // ✅ 1) Ensure song exists (prevents FK constraint errors)
    const song = await env.DB.prepare(`SELECT id, plays_count FROM songs WHERE id = ?`)
      .bind(songId)
      .first();

    if (!song) {
      return Response.json({ error: "Song not found" }, { status: 404, headers: cors });
    }

    const body = await request.json().catch(() => ({} as any));
    const user_id = body.user_id == null ? null : safeNum(body.user_id) || null;
    const guest_key = safeStr(body.guest_key) || null;

    // ✅ Your requirement: same person can play many times (YouTube-like)
    // We still prevent double-increment from accidental double "playing" events.
    const WINDOW = 5; // small anti-double-fire window
    const identityOk = Boolean(user_id) || Boolean(guest_key);

    if (identityOk) {
      const recent = await env.DB.prepare(
        `
        SELECT id FROM audio_play_events
        WHERE track_type = 'music'
          AND track_id = ?
          AND (
            (user_id IS NOT NULL AND user_id = ?)
            OR
            (guest_key IS NOT NULL AND guest_key = ?)
          )
          AND created_at > datetime('now', ?)
        LIMIT 1
      `
      )
        .bind(songId, user_id, guest_key, `-${WINDOW} seconds`)
        .first();

      if (recent) {
        return Response.json(
          { success: true, plays_count: Number((song as any)?.plays_count || 0), deduped: true },
          { status: 200, headers: cors }
        );
      }
    }

    // ✅ 2) Record play event (user can be null -> guest)
    // If your table has FOREIGN KEY(user_id) -> users(id), NULL is OK.
    // If it has FOREIGN KEY(track_id) -> songs(id), this now passes because we verified song exists.
    await env.DB.prepare(
      `
      INSERT INTO audio_play_events (track_type, track_id, user_id, guest_key, ip_hash)
      VALUES ('music', ?, ?, ?, ?)
    `
    )
      .bind(songId, user_id, guest_key, null)
      .run();

    // ✅ 3) Increment counter (what UI reads)
    await env.DB.prepare(`UPDATE songs SET plays_count = plays_count + 1 WHERE id = ?`)
      .bind(songId)
      .run();

    const updated = await env.DB.prepare(`SELECT plays_count FROM songs WHERE id = ?`)
      .bind(songId)
      .first();

    return Response.json(
      { success: true, plays_count: Number((updated as any)?.plays_count || 0) },
      { status: 200, headers: cors }
    );
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500, headers: cors });
  }
};
