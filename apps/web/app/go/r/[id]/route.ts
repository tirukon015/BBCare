import { resolveReferral } from "@/modules/commerce/service";
import { recordServerEvent } from "@/modules/analytics/ingest";

export const dynamic = "force-dynamic";

/**
 * Referral redirect. Looks up the stored listing by recommendation id only (no user-supplied
 * URLs, so it cannot be used as an open redirect) and records an outbound click. A click is a
 * referral, not a purchase.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = await resolveReferral(id);
  if (!target) return new Response("This link is no longer available.", { status: 410, headers: { "content-type": "text/plain; charset=utf-8" } });
  await recordServerEvent("shopee_outbound_click", { recommendation_id: id, listing_id: target.listingId }, { userAgent: req.headers.get("user-agent") ?? "" }).catch(() => {});
  return new Response(null, { status: 302, headers: { location: target.url, "cache-control": "no-store", "referrer-policy": "strict-origin-when-cross-origin" } });
}
