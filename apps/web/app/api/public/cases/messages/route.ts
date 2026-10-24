import { z } from "zod";
import { addCustomerCaseMessage } from "@/modules/support/service";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ reference: z.string().trim().toUpperCase().max(20), code: z.string().trim().max(40), text: z.string().trim().min(2).max(2000) });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("caseLookup", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req, 8_000).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const r = await addCustomerCaseMessage(parsed.data.reference, parsed.data.code, parsed.data.text);
  if (!r.ok) return jsonError(404, "not_found");
  return Response.json({ ok: true, redacted: r.redacted }, { status: 201 });
}
