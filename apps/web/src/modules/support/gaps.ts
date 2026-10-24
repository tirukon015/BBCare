import "server-only";
import { normalizeForSearch, redactSecrets, scrubPersonalData, sha256Hex } from "@bbcare/core";
import { db } from "@/lib/db";

export type GapSource = "no_results" | "abstain" | "escalation" | "negative_feedback";

/** Record an unanswered question for the knowledge-gap queue (personal data and secrets removed first). */
export async function recordUnresolved(opts: { query: string; locale: "en" | "ms"; source: GapSource; categoryId?: string | null; modelId?: string | null }) {
  const cleaned = normalizeForSearch(redactSecrets(scrubPersonalData(opts.query)).text).slice(0, 200);
  if (cleaned.length < 3) return;
  const fingerprint = sha256Hex(`${opts.locale}|${cleaned}|${opts.modelId ?? ""}`);
  await db()`
    INSERT INTO support.unresolved_questions (fingerprint, query_normalized, locale, category_id, model_id, last_source)
    VALUES (${fingerprint}, ${cleaned}, ${opts.locale}, ${opts.categoryId ?? null}, ${opts.modelId ?? null}, ${opts.source})
    ON CONFLICT (fingerprint) DO UPDATE SET occurrences = support.unresolved_questions.occurrences + 1, last_seen = now(),
      last_source = EXCLUDED.last_source,
      status = CASE WHEN support.unresolved_questions.status = 'resolved' THEN 'open' ELSE support.unresolved_questions.status END`;
}
