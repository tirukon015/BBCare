import "server-only";
import { routerFlowEvidence, type Evidence } from "@bbcare/ai";
import type { SupportMode } from "@bbcare/core";
import type { Locale } from "@/i18n";
import { getRouterModel, getVerifiedRouterFlow } from "./service";

/**
 * Retrieval for the future router assistant. Runs on the server only and returns evidence from
 * the single verified flow for the customer's selected model, mode and problem. It never reads
 * support history, cases or other customers' data; conversation history is passed separately,
 * scoped to the caller's own session. An empty result means the assistant must abstain and
 * offer escalation (generateGroundedAnswer does this without calling the model).
 */
export async function routerEvidence(modelSlug: string, mode: SupportMode, scenarioKey: string, locale: Locale): Promise<Evidence[]> {
  const model = await getRouterModel(modelSlug);
  if (!model) return [];
  const flow = await getVerifiedRouterFlow(model.id, mode, scenarioKey, locale);
  if (!flow) return [];
  return routerFlowEvidence({ id: flow.id, title: flow.title, modelName: model.name, steps: flow.steps, sources: flow.sources });
}
