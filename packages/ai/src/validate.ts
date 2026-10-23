import { z } from "zod";
import type { Evidence, ProductCandidate } from "./prompts";

export const answerSchema = z.object({
  sufficient: z.boolean(),
  confirmed: z.array(z.string()).default([]),
  possible_causes: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  citations: z.array(z.string()).default([]),
  product_refs: z.array(z.string()).default([]),
});

export type RawAnswer = z.infer<typeof answerSchema>;

export interface ValidatedAnswer {
  confirmed: string[];
  possibleCauses: string[];
  steps: string[];
  warnings: string[];
  citations: Evidence[];
  productIds: string[];
}

export type ValidationOutcome =
  | { ok: true; answer: ValidatedAnswer; removed: string[] }
  | { ok: false; reason: "unparseable" | "insufficient" | "no_valid_citations" | "human_claim" | "empty" };

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const VERSION_RE = /\b\d+\.\d+(?:\.\d+)+\b/g;
const PRICE_RE = /\b(?:RM|MYR)\s?\d[\d,.]*/gi;
const STOCK_RE = /\b(in stock|out of stock|ada stok|habis stok|stok terhad|limited stock)\b/gi;
const HUMAN_RE = /\b(i am|i'm) (a )?(human|real person|staff member)\b|\bsaya (adalah )?(manusia|staf sebenar)\b/i;

export function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validate model output against the evidence it was given. Sentences containing URLs, or
 * version numbers, prices or stock claims that do not appear in the evidence, are removed.
 */
export function validateAnswer(text: string, evidence: Evidence[], products: ProductCandidate[]): ValidationOutcome {
  const parsed = answerSchema.safeParse(parseJsonObject(text));
  if (!parsed.success) return { ok: false, reason: "unparseable" };
  const raw = parsed.data;
  const all = [...raw.confirmed, ...raw.possible_causes, ...raw.steps, ...raw.warnings].join(" ");
  if (HUMAN_RE.test(all)) return { ok: false, reason: "human_claim" };
  if (!raw.sufficient) return { ok: false, reason: "insufficient" };

  const byRef = new Map(evidence.map((e) => [e.ref, e]));
  const citations = [...new Set(raw.citations)].map((r) => byRef.get(r)).filter((e): e is Evidence => !!e);
  if (citations.length === 0) return { ok: false, reason: "no_valid_citations" };

  const evidenceText = evidence.map((e) => e.text).join(" ").toLowerCase();
  const removed: string[] = [];
  const clean = (items: string[]) =>
    items
      .map((s) => s.trim())
      .filter((s) => {
        const bad =
          URL_RE.test(s) ||
          (s.match(VERSION_RE) ?? []).some((v) => !evidenceText.includes(v.toLowerCase())) ||
          (s.match(PRICE_RE) ?? []).some((p) => !evidenceText.includes(p.toLowerCase())) ||
          (s.match(STOCK_RE) ?? []).length > 0;
        URL_RE.lastIndex = 0;
        if (bad) removed.push(s);
        return s.length > 0 && !bad;
      })
      .slice(0, 12);

  const answer: ValidatedAnswer = {
    confirmed: clean(raw.confirmed),
    possibleCauses: clean(raw.possible_causes),
    steps: clean(raw.steps),
    warnings: clean(raw.warnings),
    citations,
    productIds: [...new Set(raw.product_refs)]
      .map((r) => products.find((p) => p.ref === r)?.productId)
      .filter((id): id is string => !!id),
  };
  // Safety warnings present in evidence must survive even if the model omitted them.
  if (evidence.some((e) => e.safetyLevel === "danger") && answer.warnings.length === 0) {
    answer.warnings.push("__SAFETY_DEFAULT__");
  }
  if (answer.confirmed.length + answer.steps.length + answer.possibleCauses.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, answer, removed };
}
