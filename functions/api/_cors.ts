// functions/api/_cors.ts
export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const json = (data: any, init: ResponseInit = {}) =>
  Response.json(data, { ...init, headers: { ...(init.headers || {}), ...cors } });

export const ok = (data: any) => json({ success: true, ...data });
export const bad = (error: string, status = 400) => json({ success: false, error }, { status });
export const server = (error: string, status = 500) => json({ success: false, error }, { status });
