import { CallRoom } from "./durable/CallRoom";

export { CallRoom };

export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);

    if (url.pathname === "/api/calls/ws") {
      const callId = url.searchParams.get("call_id") || "";
      if (!callId) return new Response("Missing call_id", { status: 400 });

      const id = env.CALL_ROOM.idFromName(`call:${callId}`);
      const stub = env.CALL_ROOM.get(id);

      return stub.fetch(request);
    }

    return new Response("OK");
  }
};
