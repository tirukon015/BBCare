import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ analytics: z.boolean(), version: z.string().max(20) });

/** Records the consent choice itself (no personal data; a random consent id only). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("feedback", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  await db()`INSERT INTO analytics.consent_records (consent_id, version, analytics) VALUES (${crypto.randomUUID()}, ${parsed.data.version}, ${parsed.data.analytics})`;
  return Response.json({ ok: true });
}
