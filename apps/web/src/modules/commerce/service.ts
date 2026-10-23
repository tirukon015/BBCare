import "server-only";
import { isAllowedListingUrl, listingEligibility } from "@bbcare/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Locale } from "@/i18n";

export interface RecommendationCard {
  recommendationId: string;
  productId: string;
  name: string;
  summary: string | null;
  kind: string;
  channel: "bbtech_shop" | "shopee";
  href: string;
  fitsModel: string | null;
}

type Context = "chat" | "article" | "product" | "search";

/**
 * Eligible listings for products that fit a model (verified compatibility, or the model's own
 * device product). Each card shown is recorded as an impression; the link goes through the
 * referral redirect, never directly to the store.
 */
export async function getRecommendations(opts: {
  modelId: string;
  locale: Locale;
  context: Context;
  supportSessionId?: string | null;
  productIds?: string[];
  limit?: number;
}): Promise<RecommendationCard[]> {
  const sql = db();
  const rows = await sql<{
    product_id: string; name_en: string; name_ms: string; summary_en: string | null; summary_ms: string | null; kind: string;
    listing_id: string; channel: "bbtech_shop" | "shopee"; url: string; status: "unverified" | "active" | "broken" | "delisted";
    last_verified_at: Date | null; compat_verified: boolean; model_name: string;
  }[]>`
    SELECT p.id AS product_id, p.name_en, p.name_ms, p.summary_en, p.summary_ms, p.kind,
           l.id AS listing_id, l.channel, l.url, l.status, l.last_verified_at,
           (p.model_id = ${opts.modelId}::uuid OR EXISTS (
              SELECT 1 FROM commerce.product_compatibility pc
              WHERE pc.product_id = p.id AND pc.model_id = ${opts.modelId}::uuid AND pc.verified_at IS NOT NULL)) AS compat_verified,
           m.display_name AS model_name
    FROM commerce.products p
    JOIN commerce.product_listings l ON l.product_id = p.id
    JOIN catalog.product_models m ON m.id = ${opts.modelId}::uuid
    WHERE p.status = 'active'
      AND (p.model_id = ${opts.modelId}::uuid OR EXISTS (SELECT 1 FROM commerce.product_compatibility pc WHERE pc.product_id = p.id AND pc.model_id = ${opts.modelId}::uuid))
      AND (${opts.productIds ?? null}::uuid[] IS NULL OR p.id = ANY (${opts.productIds ?? null}::uuid[]))
    ORDER BY (l.channel = 'shopee') DESC, p.kind, p.name_en
    LIMIT 20`;
  const windowDays = env().BBCARE_LISTING_VERIFICATION_DAYS;
  const seen = new Set<string>();
  const eligible = rows.filter((r) => {
    if (seen.has(r.product_id)) return false;
    const ok = listingEligibility({ status: r.status, url: r.url, lastVerifiedAt: r.last_verified_at }, r.compat_verified, { verificationWindowDays: windowDays }).eligible;
    if (ok) seen.add(r.product_id);
    return ok;
  }).slice(0, opts.limit ?? 3);

  const cards: RecommendationCard[] = [];
  for (const [position, r] of eligible.entries()) {
    const [rec] = await sql<{ id: string }[]>`
      INSERT INTO commerce.recommendations (product_id, listing_id, context, support_session_id, position)
      VALUES (${r.product_id}, ${r.listing_id}, ${opts.context}, ${opts.supportSessionId ?? null}, ${position}) RETURNING id`;
    cards.push({
      recommendationId: rec!.id, productId: r.product_id, name: opts.locale === "ms" ? r.name_ms : r.name_en,
      summary: opts.locale === "ms" ? (r.summary_ms ?? r.summary_en) : r.summary_en, kind: r.kind, channel: r.channel,
      href: `/go/r/${rec!.id}`, fitsModel: r.model_name,
    });
  }
  return cards;
}

/** Resolve a referral redirect. Returns null if the listing is no longer eligible. */
export async function resolveReferral(recommendationId: string): Promise<{ url: string; listingId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(recommendationId)) return null;
  const sql = db();
  const [row] = await sql<{ url: string; listing_id: string; status: string }[]>`
    SELECT l.url, l.id AS listing_id, l.status FROM commerce.recommendations r JOIN commerce.product_listings l ON l.id = r.listing_id
    WHERE r.id = ${recommendationId} AND r.created_at > now() - interval '7 days'`;
  if (!row || row.status !== "active" || !isAllowedListingUrl(row.url)) return null;
  await sql`UPDATE commerce.recommendations SET clicked_at = COALESCE(clicked_at, now()) WHERE id = ${recommendationId}`;
  return { url: row.url, listingId: row.listing_id };
}
