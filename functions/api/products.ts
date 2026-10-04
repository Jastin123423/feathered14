// functions/api/products.ts
import { withNewContentId } from "../utils/ids";

type PagesFunction = any;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: cors });

const safeArray = (v: any) => (Array.isArray(v) ? v : []);
const toNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeParseJsonArray = (value: any) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeImageVariants = (input: any) => {
  const arr = safeParseJsonArray(input);
  return arr
    .map((item: any) => {
      if (!item || typeof item !== "object") return null;
      const thumb = String(item.thumb || item.thumbnail || "").trim();
      const feed = String(item.feed || item.url || item.full || "").trim();
      if (!feed) return null;
      return { thumb: thumb || feed, feed, full: feed, type: "image" };
    })
    .filter(Boolean);
};

const normalizeImagesFromBody = (images: any, imageVariants: any) => {
  const variants = normalizeImageVariants(imageVariants);
  if (variants.length > 0) return variants.map((v: any) => v.feed).filter(Boolean);
  const imgs = safeParseJsonArray(images)
    .map((x: any) => String(x || "").trim())
    .filter(Boolean);
  return imgs;
};

const buildReturnedProduct = (row: any) => {
  const image_variants = normalizeImageVariants(row?.image_variants);
  let images: string[] = [];
  try {
    const rawImages = typeof row?.images === "string" ? JSON.parse(row.images) : row?.images;
    images = Array.isArray(rawImages)
      ? rawImages.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];
  } catch {
    images = [];
  }
  if (!images.length && image_variants.length) {
    images = image_variants.map((v: any) => v.feed).filter(Boolean);
  }
  return { ...row, images, image_variants };
};

/* =========================================================
   POST — create product
   ========================================================= */
export const onRequestPost: PagesFunction = async ({ request, env }: any) => {
  try {
    const body = await request.json().catch(() => ({}));

    const seller_id = Number(body.seller_id || 0);
    const title = String(body.title || "").trim();
    const category = String(body.category || "").trim();
    const description = String(body.description || "").trim();
    const country = String(body.country || "").trim();
    const address = String(body.address || "").trim();
    const main_price = Number(body.main_price);
    const discount_price =
      body.discount_price === null || body.discount_price === undefined
        ? null
        : Number(body.discount_price);
    const quantity = Number(body.quantity ?? 1);
    const phone_number = body.phone_number ? String(body.phone_number).trim() : null;

    const image_variants = normalizeImageVariants(body.image_variants);
    const images = normalizeImagesFromBody(body.images, image_variants);

    if (!seller_id || !title || !category || !description || !country || !address) {
      return Response.json(
        { success: false, error: "Missing required fields" },
        { status: 400, headers: cors }
      );
    }
    if (!Number.isFinite(main_price)) {
      return Response.json(
        { success: false, error: "Invalid main_price" },
        { status: 400, headers: cors }
      );
    }

    const { id } = await withNewContentId(async (id) => {
      return await env.DB.prepare(`
        INSERT INTO products
        (id, seller_id, title, category, description, country, address,
         main_price, discount_price, quantity, phone_number, images, image_variants)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id, seller_id, title, category, description, country, address,
          main_price, discount_price, quantity, phone_number,
          JSON.stringify(images), JSON.stringify(image_variants)
        )
        .run();
    });

    const created = await env.DB.prepare(`
      SELECT p.*, u.name AS seller_name, u.username AS seller_username,
             u.profile_image_url AS seller_avatar, u.is_verified AS seller_is_verified
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE p.id = ?
    `).bind(id).first();

    return Response.json(
      { success: true, product: buildReturnedProduct(created) },
      { headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { success: false, error: e?.message || "Failed to create product" },
      { status: 500, headers: cors }
    );
  }
};

/* =========================================================
   GET — list products (excludes deleted)
   ========================================================= */
export const onRequestGet: PagesFunction = async ({ env }: any) => {
  try {
    const { results } = await env.DB.prepare(`
      SELECT p.*, u.name AS seller_name, u.username AS seller_username,
             u.profile_image_url AS seller_avatar, u.is_verified AS seller_is_verified
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.created_at DESC
    `).all();

    const normalized = safeArray(results).map((row: any) => buildReturnedProduct(row));
    return Response.json(normalized, { headers: cors });
  } catch (e: any) {
    return Response.json(
      { success: false, error: e?.message || "Failed to fetch products" },
      { status: 500, headers: cors }
    );
  }
};

/* =========================================================
   PATCH / PUT — edit product (seller only)
   Body: any subset of editable fields
   ========================================================= */
const handleEditProduct = async (request: Request, env: any): Promise<Response> => {
  try {
    const url = new URL(request.url);
    const productId = toNum(url.searchParams.get("id"), 0);

    const body: any = await request.json().catch(() => ({}));
    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const bodyUserId = toNum(body.user_id ?? body.seller_id, 0);
    const userId = headerUserId || bodyUserId || 0;

    if (!productId) {
      return Response.json(
        { success: false, error: "Invalid product id" },
        { status: 400, headers: cors }
      );
    }
    if (!userId) {
      return Response.json(
        { success: false, error: "Login required" },
        { status: 401, headers: cors }
      );
    }

    const product = await env.DB.prepare(
      `SELECT id, seller_id FROM products
       WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
    ).bind(productId).first();

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found" },
        { status: 404, headers: cors }
      );
    }
    if (toNum(product.seller_id) !== userId) {
      return Response.json(
        { success: false, error: "Not allowed" },
        { status: 403, headers: cors }
      );
    }

    const updates: string[] = [];
    const bindings: any[] = [];

    // Text fields
    const textFields = ["title", "category", "description", "country", "address"];
    for (const field of textFields) {
      if (body[field] !== undefined) {
        const value = String(body[field] || "").trim();
        if (!value) {
          return Response.json(
            { success: false, error: `${field} cannot be empty` },
            { status: 400, headers: cors }
          );
        }
        updates.push(`${field} = ?`);
        bindings.push(value);
      }
    }

    // Numbers
    if (body.main_price !== undefined) {
      const main_price = Number(body.main_price);
      if (!Number.isFinite(main_price)) {
        return Response.json(
          { success: false, error: "Invalid main_price" },
          { status: 400, headers: cors }
        );
      }
      updates.push("main_price = ?");
      bindings.push(main_price);
    }
    if (body.discount_price !== undefined) {
      const discount_price =
        body.discount_price === null || body.discount_price === ""
          ? null
          : Number(body.discount_price);
      updates.push("discount_price = ?");
      bindings.push(discount_price);
    }
    if (body.quantity !== undefined) {
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return Response.json(
          { success: false, error: "Invalid quantity" },
          { status: 400, headers: cors }
        );
      }
      updates.push("quantity = ?");
      bindings.push(quantity);
    }

    // Optional text
    if (body.phone_number !== undefined) {
      updates.push("phone_number = ?");
      bindings.push(body.phone_number ? String(body.phone_number).trim() : null);
    }

    // Images / variants — must be kept in sync
    if (body.images !== undefined || body.image_variants !== undefined) {
      const image_variants = normalizeImageVariants(body.image_variants);
      const images = normalizeImagesFromBody(body.images, image_variants);

      updates.push("images = ?");
      bindings.push(JSON.stringify(images));

      updates.push("image_variants = ?");
      bindings.push(JSON.stringify(image_variants));
    }

    if (!updates.length) {
      return Response.json(
        { success: false, error: "Nothing to update" },
        { status: 400, headers: cors }
      );
    }

    const sql = `UPDATE products SET ${updates.join(", ")} WHERE id = ?`;
    bindings.push(productId);

    await env.DB.prepare(sql).bind(...bindings).run();

    const updated = await env.DB.prepare(`
      SELECT p.*, u.name AS seller_name, u.username AS seller_username,
             u.profile_image_url AS seller_avatar, u.is_verified AS seller_is_verified
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE p.id = ?
    `).bind(productId).first();

    return Response.json(
      { success: true, product: buildReturnedProduct(updated) },
      { headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { success: false, error: e?.message || "Failed to edit product" },
      { status: 500, headers: cors }
    );
  }
};

export const onRequestPatch: PagesFunction = async ({ request, env }: any) =>
  handleEditProduct(request, env);

export const onRequestPut: PagesFunction = async ({ request, env }: any) =>
  handleEditProduct(request, env);

/* =========================================================
   DELETE — soft delete (seller only)
   Query params: ?id=X&user_id=Y
   ========================================================= */
export const onRequestDelete: PagesFunction = async ({ request, env }: any) => {
  try {
    const url = new URL(request.url);
    const productId = toNum(url.searchParams.get("id"), 0);

    const headerUserId = toNum(request.headers.get("x-user-id"), 0);
    const queryUserId = toNum(url.searchParams.get("user_id"), 0);
    const userId = headerUserId || queryUserId || 0;

    if (!productId) {
      return Response.json(
        { success: false, error: "Invalid product id" },
        { status: 400, headers: cors }
      );
    }
    if (!userId) {
      return Response.json(
        { success: false, error: "Login required" },
        { status: 401, headers: cors }
      );
    }

    const product = await env.DB.prepare(
      `SELECT id, seller_id FROM products
       WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1`
    ).bind(productId).first();

    if (!product) {
      return Response.json(
        { success: false, error: "Product not found" },
        { status: 404, headers: cors }
      );
    }
    if (toNum(product.seller_id) !== userId) {
      return Response.json(
        { success: false, error: "Not allowed" },
        { status: 403, headers: cors }
      );
    }

    await env.DB.prepare(
      `UPDATE products
       SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(userId, productId).run();

    return Response.json(
      {
        success: true,
        product_id: productId,
        deleted: true,
        deleted_by: userId,
      },
      { headers: cors }
    );
  } catch (e: any) {
    return Response.json(
      { success: false, error: e?.message || "Failed to delete product" },
      { status: 500, headers: cors }
    );
  }
};
