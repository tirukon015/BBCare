import type { Evidence } from "./prompts";

/** The verified flow shape the application hands over (already filtered to published, verified, sourced flows). */
export interface VerifiedFlowInput {
  id: string;
  title: string;
  modelName: string;
  steps: { key: string; prompt: string; expected: string | null; warning: string | null; safetyLevel: "normal" | "caution" | "danger" }[];
  sources: { title: string; locator: string | null }[];
}

/**
 * Turn a verified router flow into evidence passages for retrieval-augmented generation.
 * The application decides what is eligible (server side); this only formats it. Each step becomes
 * one passage so citations point at a specific step, and the source titles travel with the text.
 */
export function routerFlowEvidence(flow: VerifiedFlowInput, startRef = 1): Evidence[] {
  const sourceLine = flow.sources.map((s) => (s.locator ? `${s.title} (${s.locator})` : s.title)).join("; ");
  return flow.steps.map((s, i) => ({
    ref: `E${startRef + i}`,
    chunkId: `flow:${flow.id}:${s.key}`,
    revisionId: flow.id,
    title: `${flow.modelName}: ${flow.title}`,
    heading: `Step ${i + 1}`,
    text: [s.prompt, s.expected ? `Expected result: ${s.expected}` : null, s.warning ? `Warning: ${s.warning}` : null, sourceLine ? `Source: ${sourceLine}` : null]
      .filter(Boolean).join("\n"),
    safetyLevel: s.safetyLevel,
  }));
}
