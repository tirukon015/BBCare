import { z } from "zod";
import { getCaseForCustomer } from "@/modules/support/service";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ reference: z.string().trim().toUpperCase().max(20), code: z.string().trim().max(40) });

/** Customer case lookup. POST so the follow-up code never appears in URLs or logs. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("caseLookup", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req, 2_000).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const view = await getCaseForCustomer(parsed.data.reference, parsed.data.code);
  if (!view) return jsonError(404, "not_found");
  return Response.json(view, { headers: { "cache-control": "no-store" } });
}
