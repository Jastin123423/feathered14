import type { PagesFunction } from "@cloudflare/workers-types";
import { sendPushToUser } from "../../utils/pushNotifications";

type Env = {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({} as any));

    const userId = Number(body.user_id || body.userId || 0);

    if (!userId) {
      return json({ success: false, error: "user_id required" }, 400);
    }

    const result = await sendPushToUser(env, {
      userId,
      title: body.title || "UNERA Notification",
      body: body.body || "This is a test notification from UNERA.",
      data: {
        type: "test",
        entity_type: "notification",
        entity_id: "0",
      },
    });

    return json({
      success: true,
      result,
    });
  } catch (err: any) {
    return json(
      {
        success: false,
        error: "Push test failed",
        message: String(err?.message ?? err),
      },
      500
    );
  }
};
