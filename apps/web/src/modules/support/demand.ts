import "server-only";
import { randomUUID } from "node:crypto";
import { inferResourceType, redactSecrets, scenarioByKey, scrubPersonalData, type ResourceType, type SupportChannel, type SupportMode } from "@bbcare/core";
import { attributionFor, loadVerifiedRouterFlow, recordDemand, resourceExists } from "@bbcare/db";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Missing-resource detection. Called wherever BBCare learns what a customer wants for a known
 * router model, mode and problem. It checks the approved knowledge and media library and records
 * a demand only for what is missing. It never creates or promises a resource.
 */
export interface DemandContext {
  modelId: string;
  hardwareRevision?: string | null;
  supportMode: SupportMode;
  scenarioKey: string;
  locale: "en" | "ms";
  /** Raw customer text; scrubbed and secret-redacted here before storage. */
  question: string;
  origin: "router_page" | "assistant" | "escalation" | "describe_box";
  sessionId?: string | null;
  caseId?: string | null;
  /** Internal customer reference: the support session's public id, or the case id when there is no session. "anon" assigns a one-off reference. */
  customerRef: string;
  /** Resource types to check in addition to the one the question asks for (for example a text guide on escalation). */
  alsoCheck?: ResourceType[];
}

export interface DemandOutcome { hasTextGuide: boolean; missing: ResourceType[]; recorded: string[] }

export async function detectAndRecordDemand(ctx: DemandContext): Promise<DemandOutcome> {
  const sql = db();
  const scenario = scenarioByKey(ctx.scenarioKey);
  if (!scenario || !scenario.modes.includes(ctx.supportMode)) return { hasTextGuide: false, missing: [], recorded: [] };
  const question = redactSecrets(scrubPersonalData(ctx.question.trim())).text.slice(0, 1000) || scenario.en;
  const asked = inferResourceType(question);
  const types = [...new Set<ResourceType>([asked, ...(ctx.alsoCheck ?? [])])];
  const hasTextGuide = !!(await loadVerifiedRouterFlow(sql, ctx.modelId, ctx.supportMode, ctx.scenarioKey));
  const channel = await channelFor(ctx);
  const customerRef = ctx.customerRef === "anon" ? `anon:${randomUUID()}` : ctx.customerRef;
  const missing: ResourceType[] = [];
  const recorded: string[] = [];
  for (const type of types) {
    const exists = type === "text_guide" ? hasTextGuide : await resourceExists(sql, { modelId: ctx.modelId, supportMode: ctx.supportMode, scenarioKey: ctx.scenarioKey, resourceType: type, locale: ctx.locale });
    if (exists) continue;
    missing.push(type);
    try {
      const r = await recordDemand(sql, {
        modelId: ctx.modelId, hardwareRevision: ctx.hardwareRevision, supportMode: ctx.supportMode, scenarioKey: ctx.scenarioKey, resourceType: type, locale: ctx.locale,
        question, origin: ctx.origin, customerRef, sessionId: ctx.sessionId, caseId: ctx.caseId, channel, hadTextGuide: hasTextGuide,
      });
      if (r) recorded.push(r.demandId);
    } catch (err) {
      // Demand recording must never break the customer's request.
      logger.warn({ err: err instanceof Error ? err.message : String(err), scenario: ctx.scenarioKey }, "demand recording failed");
    }
  }
  return { hasTextGuide, missing, recorded };
}

async function channelFor(ctx: DemandContext): Promise<SupportChannel> {
  if (!ctx.sessionId && !ctx.caseId) return "unknown";
  const a = await attributionFor(db(), { sessionId: ctx.sessionId, caseId: ctx.caseId });
  return a?.channel ?? "unknown";
}
