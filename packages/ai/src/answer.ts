import { buildMessages, PROMPT_VERSION, type Evidence, type ProductCandidate } from "./prompts";
import { AiUnavailableError, type AiProvider, type ChatMessage } from "./provider";
import { validateAnswer, type ValidatedAnswer } from "./validate";

export type AnswerResult =
  | { kind: "answer"; answer: ValidatedAnswer; model: string; latencyMs: number; promptVersion: string; mock: boolean; removed: string[] }
  | { kind: "abstain"; reason: string; model?: string; latencyMs?: number; promptVersion: string }
  | { kind: "unavailable"; reason: string; promptVersion: string };

/** Minimum number of evidence passages before the model is asked at all. */
export const MIN_EVIDENCE = 1;

export async function generateGroundedAnswer(
  provider: AiProvider,
  input: {
    question: string;
    locale: "en" | "ms";
    modelName: string | null;
    evidence: Evidence[];
    products: ProductCandidate[];
    history?: ChatMessage[];
    signal?: AbortSignal;
  },
): Promise<AnswerResult> {
  if (input.evidence.length < MIN_EVIDENCE) return { kind: "abstain", reason: "no_evidence", promptVersion: PROMPT_VERSION };
  try {
    const res = await provider.generate({ messages: buildMessages(input), json: true, temperature: 0.1, maxTokens: 800, signal: input.signal });
    const v = validateAnswer(res.text, input.evidence, input.products);
    if (!v.ok) return { kind: "abstain", reason: v.reason, model: res.model, latencyMs: res.latencyMs, promptVersion: PROMPT_VERSION };
    return { kind: "answer", answer: v.answer, model: res.model, latencyMs: res.latencyMs, promptVersion: PROMPT_VERSION, mock: provider.isMock, removed: v.removed };
  } catch (err) {
    if (err instanceof AiUnavailableError) return { kind: "unavailable", reason: err.message, promptVersion: PROMPT_VERSION };
    return { kind: "unavailable", reason: "unexpected_error", promptVersion: PROMPT_VERSION };
  }
}
