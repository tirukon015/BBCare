import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness: the database is reachable and migrated. AI status never affects readiness. */
export async function GET() {
  try {
    const [row] = await db()<{ n: number }[]>`SELECT count(*)::int AS n FROM public.schema_migrations`;
    return Response.json({ status: "ready", migrations: row?.n ?? 0 }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
