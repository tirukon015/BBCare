import type { Sql, TxSql } from "../client";

type Tx = Sql | TxSql;

export interface VerifiedFlowRow {
  id: string; title_en: string; title_ms: string; hardware_revision: string | null; firmware_note: string | null; verified_at: Date;
  steps: {
    step_key: string; is_start: boolean; prompt_en: string; prompt_ms: string; expected_en: string | null; expected_ms: string | null;
    warning_en: string | null; warning_ms: string | null; destructive: boolean; safety_level: "normal" | "caution" | "danger";
    options: { key: string; label_en: string; label_ms: string; next?: string | null; outcome?: "resolved" | "resolved_hint" | "escalate" | null }[];
  }[];
  sources: { title: string; publisher: string | null; url: string | null; locator: string | null }[];
}

/**
 * The single source of truth for "verified router guidance", used by the customer pages and by
 * AI retrieval. Returns a flow only if it is published, verified by a named staff member, and
 * backed by an approved, reviewed source whose document is held in BBCare. Reads only knowledge
 * tables: never cases, sessions or messages.
 */
export async function loadVerifiedRouterFlow(sql: Tx, modelId: string, mode: "mesh" | "ap", scenarioKey: string): Promise<VerifiedFlowRow | null> {
  const [f] = await sql<{ id: string; title_en: string; title_ms: string; hardware_revision: string | null; firmware_note: string | null; verified_at: Date }[]>`
    SELECT f.id, f.title_en, f.title_ms, f.hardware_revision, f.firmware_note, f.verified_at
    FROM knowledge.flows f
    WHERE f.model_id = ${modelId} AND f.support_mode = ${mode} AND f.scenario_key = ${scenarioKey}
      AND f.status = 'published' AND f.verification_status = 'verified' AND f.verified_by IS NOT NULL AND f.verified_at IS NOT NULL
      AND knowledge.flow_has_held_source(f.id)`;
  if (!f) return null;
  const [steps, sources] = await Promise.all([
    sql<VerifiedFlowRow["steps"]>`
      SELECT step_key, is_start, prompt_en, prompt_ms, expected_en, expected_ms, warning_en, warning_ms, destructive, safety_level, options
      FROM knowledge.flow_steps WHERE flow_id = ${f.id} ORDER BY is_start DESC, step_key`,
    sql<VerifiedFlowRow["sources"]>`
      SELECT s.title, s.publisher, s.url, fs.locator FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
      WHERE fs.flow_id = ${f.id} AND s.status = 'approved' AND s.trust_level IN ('reviewed', 'authoritative') ORDER BY s.title`,
  ]);
  if (steps.length === 0 || sources.length === 0) return null;
  return { ...f, steps: [...steps], sources: [...sources] };
}

/** Scenario keys with verified guidance for one model and mode (same rules as above). */
export async function verifiedScenarioKeys(sql: Tx, modelId: string, mode: "mesh" | "ap"): Promise<string[]> {
  const rows = await sql<{ scenario_key: string }[]>`
    SELECT f.scenario_key FROM knowledge.flows f
    WHERE f.model_id = ${modelId} AND f.support_mode = ${mode} AND f.status = 'published' AND f.verification_status = 'verified'
      AND f.verified_by IS NOT NULL AND f.verified_at IS NOT NULL AND knowledge.flow_has_held_source(f.id)`;
  return rows.map((r) => r.scenario_key);
}
