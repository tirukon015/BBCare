import { z } from "zod";
import { authorizeSession, recordMessageFeedback } from "@/modules/support/service";
import { readSupportCookie } from "@/modules/support/cookies";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  messageId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.enum(["incorrect", "unclear", "not_my_model", "did_not_work", "helpful", "other"]).nullish(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  const session = await authorizeSession((await params).id, await readSupportCookie());
  if (!session) return jsonError(404, "session_not_found");
  if (!(await rateLimit("feedback", clientIpFrom(req.headers)))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  const ok = await recordMessageFeedback(session, parsed.data.messageId, parsed.data.rating, parsed.data.reason ?? null);
  return ok ? Response.json({ ok: true }) : jsonError(404, "message_not_found");
}
