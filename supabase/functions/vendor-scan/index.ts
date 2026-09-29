// Stores a bill photo, extracts items (placeholder OCR: a structured QR payload or items
// sent by the client), prices them with app_settings PRICE_RULES and saves a
// vendor_purchases row as the calling user.
import "@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { getSetting, requestUser, userClient } from "../_shared/supabase.ts";

interface Item {
  name: string;
  qty: number;
  rate: number;
  amount?: number;
}

interface ScanRequest {
  shop_id: string;
  vendor_id?: string | null;
  purchase_date?: string;
  image_base64?: string;
  content_type?: string;
  qr_text?: string;
  items?: Item[];
}

interface PriceRules {
  tax_percent?: number;
  round_to?: number;
}

/** Placeholder OCR: accepts a JSON QR payload ({ items: [...] } or [...]). */
function extractItems(qrText?: string): Item[] {
  if (!qrText) return [];
  try {
    const parsed = JSON.parse(qrText);
    const list = Array.isArray(parsed) ? parsed : parsed?.items;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function price(items: Item[], rules: PriceRules): { items: Item[]; total: number } {
  const priced = items.map((i) => ({ ...i, amount: Number(i.qty) * Number(i.rate) }));
  const subtotal = priced.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  let total = subtotal * (1 + (rules.tax_percent ?? 0) / 100);
  if (rules.round_to) total = Math.round(total / rules.round_to) * rules.round_to;
  return { items: priced, total };
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const caller = await requestUser(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  const body = await req.json() as ScanRequest;
  if (!body.shop_id) return json({ error: "shop_id_required" }, 400);

  const db = userClient(caller.token);
  let photoPath: string | null = null;

  if (body.image_base64) {
    const bucket = await getSetting<string>("BILLS_BUCKET");
    if (!bucket) return json({ error: "BILLS_BUCKET not configured" }, 500);
    const contentType = body.content_type ?? "image/jpeg";
    const ext = contentType.split("/")[1] ?? "jpg";
    photoPath = `${body.shop_id}/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(body.image_base64), (c) => c.charCodeAt(0));
    const { error } = await db.storage.from(bucket).upload(photoPath, bytes, { contentType });
    if (error) return json({ error: error.message }, 400);
  }

  const scanned = extractItems(body.qr_text);
  const rules = (await getSetting<PriceRules>("PRICE_RULES")) ?? {};
  const { items, total } = price(body.items?.length ? body.items : scanned, rules);

  const { data, error } = await db
    .from("vendor_purchases")
    .insert({
      shop_id: body.shop_id,
      vendor_id: body.vendor_id ?? null,
      items,
      total_price: total,
      bill_photo_url: photoPath,
      scanned_data: { qr_text: body.qr_text ?? null, items: scanned },
      ...(body.purchase_date ? { purchase_date: body.purchase_date } : {}),
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 400);
  return json(data);
});
