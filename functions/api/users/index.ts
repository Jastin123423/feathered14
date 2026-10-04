// functions/api/users/index.ts
import type { PagesFunction } from '@cloudflare/workers-types';

type Env = { DB: D1Database };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const pickSafeUserFields = (u: any) => {
  if (!u) return u;
  const { password_hash, ...rest } = u;
  return rest;
};

const isBase64DataUrl = (v: any) =>
  typeof v === 'string' && v.trim().toLowerCase().startsWith('data:');
const isTooLong = (v: any, max = 300) => typeof v === 'string' && v.length > max;

const normalizeImageUrlForOutput = (v: any) => {
  // Never return base64 or huge strings to clients
  if (isBase64DataUrl(v)) return null;
  if (isTooLong(v, 300)) return null;
  return typeof v === 'string' ? v : null;
};

const validateUrlOrNull = (value: any, fieldName: string) => {
  if (value === undefined) return { ok: true, value: undefined as undefined }; // do not change
  if (value === null || value === '') return { ok: true, value: null as null }; // allow clearing

  if (isBase64DataUrl(value)) {
    return {
      ok: false,
      status: 413,
      error: `${fieldName} cannot be base64 (data:...). Upload to R2 and save an https URL.`,
    };
  }

  if (typeof value !== 'string') {
    return { ok: false, status: 400, error: `${fieldName} must be a string URL or null.` };
  }

  if (isTooLong(value, 300)) {
    return { ok: false, status: 413, error: `${fieldName} is too long. Use a normal https URL.` };
  }

  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
  } catch {
    return { ok: false, status: 400, error: `${fieldName} must be a valid http/https URL.` };
  }

  return { ok: true, value };
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const method = request.method;
  const url = new URL(request.url);

  try {
    // ================================
    // GET USERS (LIST) OR GET USER (ONE)
    // ================================
    if (method === 'GET') {
      const id = url.searchParams.get('id');
      const username = url.searchParams.get('username');

      // ✅ LIST: /api/users
      if (!id && !username) {
        try {
          await env.DB.prepare(`ALTER TABLE users ADD COLUMN name TEXT`).run();
        } catch (_) {}

        const { results } = await env.DB
          .prepare(
            `
            SELECT
              id, name, username, email,
              profile_image_url, cover_image_url,
              bio, work, education, location, website,
              birth_date, gender, nationality,
              is_verified, role,
              joined_date, created_at
            FROM users
            ORDER BY COALESCE(created_at, joined_date) DESC
          `
          )
          .all();

        const safe = (results || []).map((u: any) => {
          const x = pickSafeUserFields(u);
          return {
            ...x,
            profile_image_url: normalizeImageUrlForOutput(x?.profile_image_url),
            cover_image_url: normalizeImageUrlForOutput(x?.cover_image_url),
          };
        });

        return json(safe);
      }

      // ✅ ONE: /api/users?id=... OR ?username=...
      let query = '';
      let param: any = null;

      if (id) {
        query = 'SELECT * FROM users WHERE id = ?';
        param = id;
      } else {
        query = 'SELECT * FROM users WHERE username = ?';
        param = username;
      }

      const user = await env.DB.prepare(query).bind(param).first();
      if (!user) return json({ error: 'User not found' }, 404);

      const safe = pickSafeUserFields(user);
      return json({
        ...safe,
        profile_image_url: normalizeImageUrlForOutput(safe?.profile_image_url),
        cover_image_url: normalizeImageUrlForOutput(safe?.cover_image_url),
      });
    }

    // ================================
    // UPDATE USER  (PUT /api/users)
    // ================================
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));

      const id = body?.id;
      if (!id) return json({ error: 'User id required' }, 400);

      const { bio, work, education, website, location } = body;

      // ✅ Validate image URLs (block base64)
      const p1 = validateUrlOrNull(body.profile_image_url, 'profile_image_url');
      if (!p1.ok) return json({ error: p1.error }, p1.status);

      const p2 = validateUrlOrNull(body.cover_image_url, 'cover_image_url');
      if (!p2.ok) return json({ error: p2.error }, p2.status);

      const profile_image_url = p1.value; // string | null | undefined
      const cover_image_url = p2.value; // string | null | undefined

      await env.DB
        .prepare(
          `
          UPDATE users SET
            bio = COALESCE(?, bio),
            work = COALESCE(?, work),
            education = COALESCE(?, education),
            website = COALESCE(?, website),
            location = COALESCE(?, location),

            profile_image_url =
              CASE
                WHEN ? = 0 THEN profile_image_url
                ELSE ?
              END,

            cover_image_url =
              CASE
                WHEN ? = 0 THEN cover_image_url
                ELSE ?
              END

          WHERE id = ?
        `
        )
        .bind(
          bio ?? null,
          work ?? null,
          education ?? null,
          website ?? null,
          location ?? null,

          // profile provided flag + value
          profile_image_url === undefined ? 0 : 1,
          profile_image_url === undefined ? null : profile_image_url,

          // cover provided flag + value
          cover_image_url === undefined ? 0 : 1,
          cover_image_url === undefined ? null : cover_image_url,

          id
        )
        .run();

      const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      const safe = pickSafeUserFields(updated);

      return json({
        success: true,
        user: {
          ...safe,
          profile_image_url: normalizeImageUrlForOutput(safe?.profile_image_url),
          cover_image_url: normalizeImageUrlForOutput(safe?.cover_image_url),
        },
      });
    }

    // ================================
    // DELETE USER  (DELETE /api/users?id=...)
    // ================================
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'User id required' }, 400);

      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return json({ success: true });
    }

    return json({ error: 'Method Not Allowed' }, 405);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE')) {
      return json({ error: 'Username or email already exists' }, 409);
    }
    return json({ error: msg || 'Server error' }, 500);
  }
};
