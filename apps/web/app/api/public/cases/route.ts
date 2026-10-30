import { z } from "zod";
import { authorizeSession, escalate } from "@/modules/support/service";
import { readSupportCookie } from "@/modules/support/cookies";
import { storeAttribution } from "@/modules/support/attribution";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z
  .strictObject({
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/).nullish(),
    locale: z.enum(["en", "ms"]),
    name: z.string().trim().min(1).max(120),
    channel: z.enum(["email", "whatsapp", "phone"]),
    contact: z.string().trim().min(5).max(200),
    subject: z.string().trim().min(3).max(200),
    description: z.string().trim().max(4000).optional(),
    consent: z.literal(true),
    router: z.strictObject({
      model: z.string().regex(/^[A-Z0-9]{2,6}$/),
      mode: z.enum(["mesh", "ap"]),
      scenario: z.string().regex(/^[a-z0-9_]{3,40}$/),
      answers: z.record(z.string().max(40), z.string().max(40)).refine((a) => Object.keys(a).length <= 12),
      flowId: z.string().max(40).nullish(),
      outcome: z.enum(["not_verified", "steps_failed"]).optional(),
    }).nullish(),
    attribution: z.unknown().optional(),
  })
  .refine((v) => (v.channel === "email" ? z.email().safeParse(v.contact).success : /^\+?[\d\s-]{8,20}$/.test(v.contact)), { path: ["contact"], message: "invalid_contact" });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  if (!(await rateLimit("escalation", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req, 16_000).catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", fields: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  const session = parsed.data.sessionId ? await authorizeSession(parsed.data.sessionId, await readSupportCookie()) : null;
  const c = await escalate(session, parsed.data, { attribution: parsed.data.attribution, req });
  return Response.json({ reference: c.reference, followUpCode: c.followUpCode, redacted: c.redacted }, { status: 201 });
}
