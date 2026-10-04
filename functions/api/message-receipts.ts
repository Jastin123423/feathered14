export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { message_id, user_id } = await request.json()

    if (!message_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
    }

    await env.DB.prepare(`
      INSERT INTO message_receipts (message_id, user_id)
      VALUES (?, ?)
    `)
      .bind(message_id, user_id)
      .run()

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })

  } catch (e: any) {
    if (e.message.includes("UNIQUE")) {
      return new Response(JSON.stringify({ error: "Already marked as read" }), { status: 409 })
    }
    if (e.message.includes("FOREIGN KEY")) {
      return new Response(JSON.stringify({ error: "Invalid message_id or user_id" }), { status: 400 })
    }
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
