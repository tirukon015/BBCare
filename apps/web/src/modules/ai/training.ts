import "server-only";
import { redactSecrets, scrubPersonalData } from "@bbcare/core";
import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

/**
 * Curated examples for future evaluation or fine-tuning. The pipeline is:
 * resolved case -> staff proposal (scrubbed) -> review by a different person with a privacy
 * screen -> approved -> export. Customer messages and AI answers never enter automatically.
 */
const clean = (text: string) => redactSecrets(scrubPersonalData(text.trim())).text;

export async function proposeExample(user: StaffUser, caseId: string, input: { question: string; answer: string }) {
  const sql = db();
  const [c] = await sql<{ id: string; model_id: string | null; support_mode: string | null; scenario_key: string | null; locale: "en" | "ms"; resolution_flow_id: string | null; status: string }[]>`
    SELECT id, model_id, support_mode, scenario_key, locale, resolution_flow_id, status FROM support.cases WHERE id = ${caseId}`;
  if (!c || !["resolved", "closed"].includes(c.status)) return { ok: false as const, reason: "case_not_resolved" };
  const question = clean(input.question).slice(0, 1000);
  const answer = clean(input.answer).slice(0, 4000);
  if (question.length < 5 || answer.length < 5) return { ok: false as const, reason: "too_short" };
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO ai.training_examples (case_id, model_id, support_mode, scenario_key, locale, question, answer, flow_id, proposed_by)
    VALUES (${c.id}, ${c.model_id}, ${c.support_mode}, ${c.scenario_key}, ${c.locale}, ${question}, ${answer}, ${c.resolution_flow_id}, ${user.id}) RETURNING id`;
  await audit({ actorId: user.id, action: "ai.example_proposed", entityType: "training_example", entityId: row!.id, summary: { case: c.id } });
  return { ok: true as const, id: row!.id };
}

export async function listExamples(status?: string) {
  const s = ["proposed", "approved", "rejected"].includes(status ?? "") ? status! : null;
  return db()<{ id: string; status: string; locale: string; question: string; answer: string; model: string | null; scenario_key: string | null; proposed_by: string | null; proposer: string | null; created_at: Date }[]>`
    SELECT e.id, e.status, e.locale, e.question, e.answer, m.display_name AS model, e.scenario_key, e.proposed_by, u.display_name AS proposer, e.created_at
    FROM ai.training_examples e LEFT JOIN catalog.product_models m ON m.id = e.model_id LEFT JOIN identity.users u ON u.id = e.proposed_by
    WHERE (${s}::text IS NULL OR e.status = ${s}) ORDER BY e.created_at DESC LIMIT 200`;
}

/** Approve or reject. Approval needs a confirmed privacy screen and a reviewer other than the proposer (also enforced in SQL). */
export async function reviewExample(user: StaffUser, id: string, decision: "approved" | "rejected", privacyScreened: boolean, note: string | null) {
  const sql = db();
  const [e] = await sql<{ proposed_by: string | null; status: string }[]>`SELECT proposed_by, status FROM ai.training_examples WHERE id = ${id}`;
  if (!e || e.status !== "proposed") return { ok: false as const, reason: "not_pending" };
  if (decision === "approved" && (!privacyScreened || e.proposed_by === user.id)) return { ok: false as const, reason: e.proposed_by === user.id ? "self_review" : "privacy_screen_required" };
  await sql`
    UPDATE ai.training_examples SET status = ${decision}, privacy_screened = ${privacyScreened}, reviewed_by = ${user.id}, reviewed_at = now(), review_note = ${note}
    WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "ai.example_reviewed", entityType: "training_example", entityId: id, summary: { decision } });
  return { ok: true as const };
}

/** JSONL of approved examples only, for offline evaluation or a future, separately approved fine-tune. */
export async function exportApprovedJsonl(user: StaffUser): Promise<string> {
  const rows = await db()<{ id: string; locale: string; question: string; answer: string; ecr_code: string | null; support_mode: string | null; scenario_key: string | null }[]>`
    SELECT e.id, e.locale, e.question, e.answer, m.ecr_code, e.support_mode, e.scenario_key
    FROM ai.training_examples e LEFT JOIN catalog.product_models m ON m.id = e.model_id
    WHERE e.status = 'approved' AND e.privacy_screened ORDER BY e.created_at`;
  await audit({ actorId: user.id, action: "ai.examples_exported", entityType: "training_example", summary: { count: rows.length } });
  return rows.map((r) => JSON.stringify({ id: r.id, locale: r.locale, model: r.ecr_code, mode: r.support_mode, scenario: r.scenario_key, question: r.question, answer: r.answer })).join("\n") + (rows.length ? "\n" : "");
}
