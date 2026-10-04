// api/ads/push.ts
import type { PagesFunction } from "@cloudflare/workers-types";

type Env = { DB: D1Database };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeJsonArray = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [s];
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ success: false, error: "DB binding missing" }, 500);

    const userId = toNum(request.headers.get("x-user-id"), 0);
    if (!userId) return json({ success: false, error: "Missing user id" }, 400);

    const body: any = await request.json().catch(() => ({}));

    const {
      post_id,
      budget,
      days,
      name,
      link,
      phone,
      email,
      cta,
      location,
    } = body;

    const postId = toNum(post_id, 0);
    if (!postId) return json({ success: false, error: "post_id is required" }, 400);

    // ---------- Load post ----------
    const post = await env.DB
      .prepare(`SELECT * FROM posts WHERE id = ? LIMIT 1`)
      .bind(postId)
      .first<any>();

    if (!post) return json({ success: false, error: "Post not found" }, 404);

    // ---------- Ownership / admin check ----------
    const isOwner = toNum(post.user_id, 0) === userId;

    if (!isOwner) {
      const user = await env.DB
        .prepare(`SELECT role FROM users WHERE id = ? LIMIT 1`)
        .bind(userId)
        .first<any>();

      const role = String(user?.role || "").toLowerCase();
      const isAdmin = role === "admin" || role === "superadmin" || role === "moderator";

      if (!isAdmin) {
        return json(
          { success: false, error: "You can only boost your own posts" },
          403
        );
      }
    }

    // ---------- Media ----------
    const rawMediaUrls = safeJsonArray(post.media_urls);
    const mediaUrls =
      rawMediaUrls.length > 0
        ? rawMediaUrls
        : post.media_url
        ? [post.media_url]
        : [];

    const rawMediaTypes = safeJsonArray(post.media_types);
    const mediaTypes =
      rawMediaTypes.length > 0
        ? rawMediaTypes
        : post.media_type
        ? [post.media_type]
        : ["image"];

    // ---------- Contact ----------
    let contact_type = "link";
    let destination_url = link ? String(link).trim() : null;
    let phone_number: string | null = null;
    let email_address: string | null = null;

    if (phone) {
      contact_type = "phone";
      phone_number = String(phone).trim();
      destination_url = null;
    } else if (email) {
      contact_type = "email";
      email_address = String(email).trim();
      destination_url = null;
    } else if (link) {
      contact_type = "link";
      destination_url = String(link).trim();
    }

    // ---------- Dates ----------
    const daysNum = Math.max(1, toNum(days, 3));
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + daysNum);

    const start_date = start.toISOString();
    const end_date = end.toISOString();

    const budgetNum = toNum(budget, 0);

    // ---------- Insert ----------
    const result = await env.DB.prepare(
      `INSERT INTO ads (
        advertiser_id,
        post_id,
        campaign_name,
        title,
        description,
        media_url,
        media_urls,
        media_type,
        media_types,
        contact_type,
        destination_url,
        phone_number,
        email_address,
        cta_button,
        target_location,
        budget,
        spent,
        daily_budget,
        bid_per_click,
        start_date,
        end_date,
        duration_days,
        status,
        is_free,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        userId,
        postId,
        String(name || post.content?.slice(0, 30) || "Boosted Post"),
        post.title || null,
        post.content || null,
        mediaUrls[0] || null,
        JSON.stringify(mediaUrls),
        mediaTypes[0] || "image",
        JSON.stringify(mediaTypes),
        contact_type,
        destination_url,
        phone_number,
        email_address,
        String(cta || "Learn More"),
        String(location || "Global"),
        budgetNum,
        0,
        budgetNum,
        0,
        start_date,
        end_date,
        daysNum,
        "active",
        1,
        start_date,
        start_date
      )
      .run();

    const adId = toNum(result.meta?.last_row_id, 0);

    // ---------- Return fresh campaign ----------
    const campaign = await env.DB
      .prepare(`SELECT * FROM ads WHERE id = ? LIMIT 1`)
      .bind(adId)
      .first<any>();

    const parsedCampaign = campaign
      ? {
          ...campaign,
          media_urls: safeJsonArray(campaign.media_urls),
          media_types: safeJsonArray(campaign.media_types),
          is_free: campaign.is_free === 1,
        }
      : null;

    return json({
      success: true,
      ad_id: adId,
      campaign: parsedCampaign,
      message: "Campaign created successfully",
      is_free: true,
    });
  } catch (err: any) {
    console.error("Error creating ad campaign:", err);
    return json(
      { success: false, error: err?.message || "Failed to create campaign" },
      500
    );
  }
};
