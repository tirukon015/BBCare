import { z } from "zod";
import { authorizeSession, handleCustomerMessage } from "@/modules/support/service";
import { readSupportCookie } from "@/modules/support/cookies";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { clientIpFrom, isSameOrigin, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

const contextSchema = z.strictObject({ mode: z.enum(["mesh", "ap"]), scenario: z.string().regex(/^[a-z0-9_]{3,40}$/).nullish(), step: z.string().regex(/^[a-z0-9_-]{1,40}$/).nullish() });
const schema = z.strictObject({ text: z.string().trim().min(1).max(1000), model: z.string().regex(/^[a-z0-9-]{1,80}$/).nullish(), context: contextSchema.nullish() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  const { id } = await params;
  const session = await authorizeSession(id, await readSupportCookie());
  if (!session) return jsonError(404, "session_not_found");
  const ip = clientIpFrom(req.headers);
  if (!(await rateLimit("supportMessage", `${ip}:${session.id}`))) return jsonError(429, "rate_limited");
  const parsed = schema.safeParse(await readJson(req, 8_000).catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid");
  try {
    const result = await handleCustomerMessage(session, parsed.data.text, { modelSlug: parsed.data.model, context: parsed.data.context ?? null });
    return Response.json(result);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : "unknown", session: session.public_id }, "support message failed");
    return jsonError(500, "internal_error");
  }
}
