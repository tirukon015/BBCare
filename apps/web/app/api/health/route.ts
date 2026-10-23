export const dynamic = "force-dynamic";

/** Liveness: the process is up. Never touches dependencies. */
export function GET() {
  return Response.json({ status: "ok", service: "bbcare-web" }, { headers: { "cache-control": "no-store" } });
}
