export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { user_id, episode_id, parent_comment_id, text } = await request.json()

    if (!user_id || !episode_id || !text) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
    }

    await env.DB.prepare(`
      INSERT INTO podcast_episode_comments
      (user_id, episode_id, parent_comment_id, text)
      VALUES (?, ?, ?, ?)
    `)
      .bind(user_id, episode_id, parent_comment_id ?? null, text)
      .run()

    return new Response(JSON.stringify({ success: true }))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
