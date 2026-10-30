import { currentStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, geoRegion, geoSummary, parsePeriod } from "@/modules/analytics/intelligence";
import { audit } from "@/modules/audit/service";
import { geoStatus } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Aggregated geography for the admin map. Staff with analytics.read and a verified second factor
 * only; every state drill-down is written to the audit log. Nothing here is per visitor.
 */
export async function GET(req: Request) {
  const user = await currentStaff();
  if (!user || !user.mfaVerified || !user.permissions.has("analytics.read")) return Response.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const period = parsePeriod({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const region = sp.get("region");
  try {
    await ensureFreshAggregates();
    if (region) {
      if (!/^MY-\d{2}$/.test(region)) return Response.json({ error: "invalid_region" }, { status: 400 });
      const detail = await geoRegion(period, region);
      if (!detail) return Response.json({ error: "unknown_region" }, { status: 404 });
      await audit({ actorId: user.id, action: "analytics.geo.region", summary: { region, from: period.from, to: period.to } });
      return Response.json(detail, { headers: { "cache-control": "no-store" } });
    }
    const summary = await geoSummary(period);
    return Response.json({ ...summary, geo: geoStatus() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
