export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { conversation_id, user_id } = await request.json()

    if (!conversation_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
    }

    await env.DB.prepare(`
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES (?, ?)
    `)
      .bind(conversation_id, user_id)
      .run()

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })

  } catch (e: any) {
    if (e.message.includes("UNIQUE")) {
      return new Response(JSON.stringify({ error: "User already in conversation" }), { status: 409 })
    }
    if (e.message.includes("FOREIGN KEY")) {
      return new Response(JSON.stringify({ error: "Invalid conversation_id or user_id" }), { status: 400 })
    }
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
