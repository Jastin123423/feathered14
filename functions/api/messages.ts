export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { conversation_id, sender_id, parent_message_id, text_content, attachment_url, attachment_type, attachment_metadata } = await request.json()

    if (!conversation_id || !sender_id || (!text_content && !attachment_url)) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 })
    }

    const result = await env.DB.prepare(`
      INSERT INTO messages
      (conversation_id, sender_id, parent_message_id, text_content, attachment_url, attachment_type, attachment_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        conversation_id,
        sender_id,
        parent_message_id ?? null,
        text_content ?? null,
        attachment_url ?? null,
        attachment_type ?? null,
        attachment_metadata ?? null
      )
      .run()

    // Update conversation's last_message_at
    await env.DB.prepare(`
      UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(conversation_id).run()

    return new Response(JSON.stringify({ success: true, message_id: result.lastInsertRowid }), { headers: { "Content-Type": "application/json" } })

  } catch (e: any) {
    if (e.message.includes("FOREIGN KEY")) {
      return new Response(JSON.stringify({ error: "Invalid conversation_id, sender_id, or parent_message_id" }), { status: 400 })
    }
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
