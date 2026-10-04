// functions/api/proxy-audio.ts
import type { PagesFunction } from '@cloudflare/workers-types';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: cors });
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return new Response(JSON.stringify({ success: false, error: 'Missing url param' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Basic allow-list so people can’t use it to proxy anything on the internet
    const targetUrl = new URL(target);
    const allowedHosts = new Set(['media.unera.social']);
    if (!allowedHosts.has(targetUrl.hostname)) {
      return new Response(JSON.stringify({ success: false, error: 'Host not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Forward Range header if present (helps some audio loaders)
    const range = request.headers.get('range') || request.headers.get('Range');

    const res = await fetch(target, {
      headers: range ? { Range: range } : undefined,
    });

    const contentType = res.headers.get('content-type') || 'audio/mpeg';
    const acceptRanges = res.headers.get('accept-ranges') || 'bytes';
    const contentRange = res.headers.get('content-range') || '';
    const contentLength = res.headers.get('content-length') || '';

    const headers: Record<string, string> = {
      ...cors,
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
    };
    if (contentRange) headers['Content-Range'] = contentRange;
    if (contentLength) headers['Content-Length'] = contentLength;

    return new Response(res.body, {
      status: res.status,
      headers,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Proxy failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
};
