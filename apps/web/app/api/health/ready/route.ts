import { ROUTER_ECR_CODES } from "@bbcare/core";
import { db } from "@/lib/db";
import { geoStatus } from "@/lib/geo";

export const dynamic = "force-dynamic";

/**
 * Readiness: the database is reachable, migrated, and the router catalogue is complete (the
 * customer homepage depends on it). AI status never affects readiness.
 */
export async function GET() {
  try {
    const [row] = await db()<{ n: number; routers: number }[]>`
      SELECT (SELECT count(*)::int FROM public.schema_migrations) AS n,
             (SELECT count(*)::int FROM catalog.product_models m JOIN catalog.categories c ON c.id = m.category_id
               WHERE m.ecr_code IS NOT NULL AND m.status = 'active' AND c.slug = 'router' AND c.active) AS routers`;
    const complete = (row?.routers ?? 0) === ROUTER_ECR_CODES.length;
    return Response.json(
      { status: complete ? "ready" : "router_catalogue_incomplete", migrations: row?.n ?? 0, routerModels: row?.routers ?? 0, geo: geoStatus().ranges > 0 ? "configured" : "not_configured" },
      { status: complete ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
