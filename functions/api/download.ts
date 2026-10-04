import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { R2: R2Bucket };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

const toJson = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.R2) return toJson({ success: false, error: "R2 binding missing (env.R2)" }, 500);

    const url = new URL(request.url);
    const key = (url.searchParams.get("key") || "").trim();

    if (!key) return toJson({ success: false, error: "Missing key" }, 400);

    // ✅ simple safety (only allow your uploads folder)
    if (!key.startsWith("uploads/")) return toJson({ success: false, error: "Invalid key" }, 400);

    const obj = await env.R2.get(key);
    if (!obj) return toJson({ success: false, error: "Not found" }, 404);

    const filename =
      obj.customMetadata?.filename ||
      key.split("/").pop() ||
      "download";

    const contentType = obj.httpMetadata?.contentType || "application/octet-stream";

    return new Response(obj.body, {
      headers: {
        ...cors,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${String(filename).replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (e: any) {
    return toJson({ success: false, error: e?.message || "Download failed" }, 500);
  }
};
