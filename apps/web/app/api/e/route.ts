import { cookies } from "next/headers";
import { eventBatchSchema, validateClientEvent, type ValidatedEvent } from "@bbcare/core";
import { ingestEvents } from "@/modules/analytics/ingest";
import { ownHosts } from "@/modules/support/attribution";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom, jsonError, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIpFrom(req.headers);
  if (!(await rateLimit("events", ip))) return new Response(null, { status: 429 });
  let body: unknown;
  try {
    body = await readJson(req, 64_000);
  } catch {
    return jsonError(400, "invalid_body");
  }
  const batch = eventBatchSchema.safeParse(body);
  if (!batch.success) return jsonError(400, "invalid_batch");
  const valid = batch.data.events.map(validateClientEvent).filter((e): e is ValidatedEvent => e !== null);
  const consentCookie = (await cookies()).get("bbcare_consent")?.value ?? "";
  const consent = decodeURIComponent(consentCookie).endsWith(":analytics") ? "analytics" : "essential";
  const stored = await ingestEvents(valid, { ip, userAgent: req.headers.get("user-agent") ?? "", consent, ownHosts: ownHosts(req) });
  return Response.json({ accepted: stored, rejected: batch.data.events.length - valid.length }, { status: 202 });
}
