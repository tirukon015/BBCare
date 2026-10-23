import "server-only";
import { isAllowedListingUrl } from "@bbcare/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export async function listProductsAdmin() {
  return db()<{ id: string; sku: string; name_en: string; kind: string; status: string; category: string; listings: number; active_listings: number; stale: number; compat: number }[]>`
    SELECT p.id, p.sku, p.name_en, p.kind, p.status, c.name_en AS category,
      (SELECT count(*)::int FROM commerce.product_listings l WHERE l.product_id = p.id) AS listings,
      (SELECT count(*)::int FROM commerce.product_listings l WHERE l.product_id = p.id AND l.status = 'active') AS active_listings,
      (SELECT count(*)::int FROM commerce.product_listings l WHERE l.product_id = p.id AND l.status = 'active' AND (l.last_verified_at IS NULL OR l.last_verified_at < now() - make_interval(days => ${env().BBCARE_LISTING_VERIFICATION_DAYS}))) AS stale,
      (SELECT count(*)::int FROM commerce.product_compatibility pc WHERE pc.product_id = p.id AND pc.verified_at IS NOT NULL) AS compat
    FROM commerce.products p JOIN catalog.categories c ON c.id = p.category_id ORDER BY p.name_en LIMIT 1000`;
}

export async function createProduct(user: StaffUser, input: { sku: string; categoryId: string; brandId: string | null; modelId: string | null; kind: string; nameEn: string; nameMs: string; summaryEn?: string; summaryMs?: string }) {
  const [p] = await db()<{ id: string }[]>`
    INSERT INTO commerce.products (sku, category_id, brand_id, model_id, kind, name_en, name_ms, summary_en, summary_ms)
    VALUES (${input.sku}, ${input.categoryId}, ${input.brandId}, ${input.modelId}, ${input.kind}, ${input.nameEn}, ${input.nameMs}, ${input.summaryEn ?? null}, ${input.summaryMs ?? null}) RETURNING id`;
  await audit({ actorId: user.id, action: "commerce.product_create", entityType: "product", entityId: p!.id, summary: { sku: input.sku } });
  return p!.id;
}

export async function getProductAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [p] = await sql<{ id: string; sku: string; name_en: string; name_ms: string; kind: string; status: string; category_id: string; model: string | null }[]>`
    SELECT p.id, p.sku, p.name_en, p.name_ms, p.kind, p.status, p.category_id, m.display_name AS model FROM commerce.products p LEFT JOIN catalog.product_models m ON m.id = p.model_id WHERE p.id = ${id}`;
  if (!p) return null;
  const [listings, compat, history] = await Promise.all([
    sql<{ id: string; channel: string; url: string; status: string; last_verified_at: Date | null; external_item_id: string | null; verifier: string | null }[]>`
      SELECT l.id, l.channel, l.url, l.status, l.last_verified_at, l.external_item_id, u.display_name AS verifier FROM commerce.product_listings l LEFT JOIN identity.users u ON u.id = l.verified_by WHERE l.product_id = ${id} ORDER BY l.channel`,
    sql<{ id: string; model: string; relation: string; verified_at: Date | null; verifier: string | null }[]>`
      SELECT pc.id, m.display_name AS model, pc.relation, pc.verified_at, u.display_name AS verifier FROM commerce.product_compatibility pc
      JOIN catalog.product_models m ON m.id = pc.model_id LEFT JOIN identity.users u ON u.id = pc.verified_by WHERE pc.product_id = ${id} ORDER BY m.display_name`,
    sql<{ listing_id: string; checked_at: Date; method: string; result: string; note: string | null; checker: string | null }[]>`
      SELECT v.listing_id, v.checked_at, v.method, v.result, v.note, u.display_name AS checker FROM commerce.listing_verifications v
      JOIN commerce.product_listings l ON l.id = v.listing_id LEFT JOIN identity.users u ON u.id = v.checked_by WHERE l.product_id = ${id} ORDER BY v.checked_at DESC LIMIT 50`,
  ]);
  return { ...p, listings, compat, history };
}

export type ListingResult = { ok: true } | { ok: false; reason: "domain_not_allowed" | "duplicate" };

export async function addListing(user: StaffUser, productId: string, input: { channel: "bbtech_shop" | "shopee"; url: string; externalItemId?: string; externalShopId?: string }): Promise<ListingResult> {
  if (!isAllowedListingUrl(input.url)) return { ok: false, reason: "domain_not_allowed" };
  const host = new URL(input.url).hostname;
  if ((input.channel === "shopee") !== (host === "shopee.com.my")) return { ok: false, reason: "domain_not_allowed" };
  try {
    const [l] = await db()<{ id: string }[]>`
      INSERT INTO commerce.product_listings (product_id, channel, url, external_item_id, external_shop_id, created_by)
      VALUES (${productId}, ${input.channel}, ${input.url}, ${input.externalItemId ?? null}, ${input.externalShopId ?? null}, ${user.id}) RETURNING id`;
    await audit({ actorId: user.id, action: "commerce.listing_add", entityType: "listing", entityId: l!.id, summary: { channel: input.channel } });
    return { ok: true };
  } catch {
    return { ok: false, reason: "duplicate" };
  }
}

/** Manual verification: a reviewer opened the listing and confirmed it is the right, live product. */
export async function verifyListing(user: StaffUser, listingId: string, result: "ok" | "broken" | "not_found", note: string | null) {
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO commerce.listing_verifications (listing_id, method, result, note, checked_by) VALUES (${listingId}, 'manual', ${result}, ${note}, ${user.id})`;
    if (result === "ok") await tx`UPDATE commerce.product_listings SET status = 'active', last_verified_at = now(), verified_by = ${user.id} WHERE id = ${listingId}`;
    else await tx`UPDATE commerce.product_listings SET status = ${result === "not_found" ? "delisted" : "broken"} WHERE id = ${listingId}`;
    await audit({ actorId: user.id, action: "commerce.listing_verify", entityType: "listing", entityId: listingId, summary: { result } }, tx);
  });
}

export async function addCompatibility(user: StaffUser, productId: string, modelId: string, relation: string, verified: boolean) {
  await db()`
    INSERT INTO commerce.product_compatibility (product_id, model_id, relation, verified_by, verified_at)
    VALUES (${productId}, ${modelId}, ${relation}, ${verified ? user.id : null}, ${verified ? new Date() : null})
    ON CONFLICT (product_id, model_id, variant_id, relation) DO UPDATE SET verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`;
  await audit({ actorId: user.id, action: "commerce.compatibility_set", entityType: "product", entityId: productId, summary: { modelId, relation, verified } });
}
