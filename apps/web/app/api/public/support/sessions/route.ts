import { z } from "zod";
import { createSession } from "@/modules/support/service";
import { setSupportCookie } from "@/modules/support/cookies";
import { storeAttribution } from "@/modules/support/attribution";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  locale: z.enum(["en", "ms"]),
  category: z.enum(["router", "laptop"]).nullish(),
  model: z.string().regex(/^[a-z0-9-]{1,80}$/).nullish(),
  attribution: z.unknown().optional(),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("supportSession", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const s = await createSession({ locale: parsed.data.locale, categorySlug: parsed.data.category, modelSlug: parsed.data.model });
  await storeAttribution(req, { sessionId: s.id }, parsed.data.attribution);
  await setSupportCookie(s.publicId, s.token, s.maxAgeSeconds);
  return Response.json({ sessionId: s.publicId }, { status: 201 });
}
