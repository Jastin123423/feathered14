import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { R2: R2Bucket };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.R2) return new Response("R2 binding missing", { status: 500 });
  const listed = await env.R2.list({ limit: 5 });
  return Response.json({ ok: true, keys: listed.objects.map((o) => o.key) });
};
