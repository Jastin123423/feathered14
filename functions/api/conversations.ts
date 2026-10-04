export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { type, group_name, group_avatar_url } = await request.json()

    if (!type || (type === "group" && !group_name)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      )
    }

    const result = await env.DB.prepare(`
      INSERT INTO conversations (type, group_name, group_avatar_url, last_message_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(type, group_name ?? null, group_avatar_url ?? null)
      .run()

    return new Response(
      JSON.stringify({ success: true, conversation_id: result.lastInsertRowid }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
