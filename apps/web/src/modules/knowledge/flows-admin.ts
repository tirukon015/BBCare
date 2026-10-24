import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

const option = z.strictObject({
  key: z.string().regex(/^[a-z0-9_-]{1,30}$/),
  label_en: z.string().min(1).max(120),
  label_ms: z.string().min(1).max(120),
  next: z.string().regex(/^[a-z0-9_-]{1,40}$/).nullish(),
  outcome: z.enum(["resolved", "resolved_hint", "escalate"]).nullish(),
});
const step = z.strictObject({
  key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  start: z.boolean().optional(),
  prompt_en: z.string().min(3).max(500),
  prompt_ms: z.string().min(3).max(500),
  safety: z.enum(["normal", "caution", "danger"]).optional(),
  expected_en: z.string().min(3).max(500).optional(),
  expected_ms: z.string().min(3).max(500).optional(),
  warning_en: z.string().min(3).max(500).optional(),
  warning_ms: z.string().min(3).max(500).optional(),
  destructive: z.boolean().optional(),
  options: z.array(option).min(1).max(6),
});
export const flowStepsSchema = z.array(step).min(1).max(40);
export type FlowStepsInput = z.infer<typeof flowStepsSchema>;

/** Structural checks: exactly one start, every "next" exists, every option ends or continues, no orphans. */
export function validateFlowGraph(steps: FlowStepsInput): string[] {
  const errors: string[] = [];
  const keys = new Set(steps.map((s) => s.key));
  if (keys.size !== steps.length) errors.push("Step keys must be unique.");
  const starts = steps.filter((s) => s.start);
  if (starts.length !== 1) errors.push("Exactly one step must have \"start\": true.");
  for (const s of steps) {
    if (s.destructive && (!s.warning_en || !s.warning_ms || s.safety !== "danger")) errors.push(`Step "${s.key}" is destructive: it needs warning_en, warning_ms and "safety": "danger".`);
    if (!!s.expected_en !== !!s.expected_ms) errors.push(`Step "${s.key}": give expected_en and expected_ms together.`);
    if (!!s.warning_en !== !!s.warning_ms) errors.push(`Step "${s.key}": give warning_en and warning_ms together.`);
    for (const o of s.options) {
      if (!o.next && !o.outcome) errors.push(`Option ${s.key}/${o.key} needs "next" or "outcome".`);
      if (o.next && !keys.has(o.next)) errors.push(`Option ${s.key}/${o.key} points to missing step "${o.next}".`);
    }
  }
  if (starts[0]) {
    const seen = new Set<string>();
    const queue = [starts[0].key];
    while (queue.length) {
      const k = queue.shift()!;
      if (seen.has(k)) continue;
      seen.add(k);
      steps.find((s) => s.key === k)?.options.forEach((o) => o.next && queue.push(o.next));
    }
    for (const k of keys) if (!seen.has(k)) errors.push(`Step "${k}" cannot be reached from the start.`);
  }
  return errors;
}

export async function listFlowsAdmin() {
  return db()<{ id: string; slug: string; title_en: string; status: string; category: string; steps: number; updated_at: Date; ecr_code: string | null; support_mode: string | null; scenario_key: string | null; verification_status: string }[]>`
    SELECT f.id, f.slug, f.title_en, f.status, c.name_en AS category, (SELECT count(*)::int FROM knowledge.flow_steps s WHERE s.flow_id = f.id) AS steps, f.updated_at,
      m.ecr_code, f.support_mode, f.scenario_key, f.verification_status
    FROM knowledge.flows f JOIN catalog.categories c ON c.id = f.category_id LEFT JOIN catalog.product_models m ON m.id = f.model_id
    ORDER BY m.ecr_code NULLS LAST, f.support_mode, f.scenario_key, f.updated_at DESC`;
}

export async function getFlowAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [f] = await sql<{
    id: string; slug: string; title_en: string; title_ms: string; status: string; category_id: string; model_id: string | null; support_mode: string | null;
    scenario_key: string | null; hardware_revision: string | null; firmware_note: string | null; verification_status: string; verification_note: string | null;
    verified_at: Date | null; verifier: string | null; research_ref: string | null;
  }[]>`
    SELECT f.id, f.slug, f.title_en, f.title_ms, f.status, f.category_id, f.model_id, f.support_mode, f.scenario_key, f.hardware_revision, f.firmware_note,
      f.verification_status, f.verification_note, f.verified_at, u.display_name AS verifier, f.research_ref
    FROM knowledge.flows f LEFT JOIN identity.users u ON u.id = f.verified_by WHERE f.id = ${id}`;
  if (!f) return null;
  const steps = await sql<{
    step_key: string; is_start: boolean; prompt_en: string; prompt_ms: string; options: unknown; safety_level: string;
    expected_en: string | null; expected_ms: string | null; warning_en: string | null; warning_ms: string | null; destructive: boolean;
  }[]>`
    SELECT step_key, is_start, prompt_en, prompt_ms, options, safety_level, expected_en, expected_ms, warning_en, warning_ms, destructive
    FROM knowledge.flow_steps WHERE flow_id = ${id} ORDER BY is_start DESC, step_key`;
  const json = steps.map((s) => ({
    key: s.step_key, start: s.is_start || undefined, prompt_en: s.prompt_en, prompt_ms: s.prompt_ms, safety: s.safety_level === "normal" ? undefined : s.safety_level,
    expected_en: s.expected_en ?? undefined, expected_ms: s.expected_ms ?? undefined, warning_en: s.warning_en ?? undefined, warning_ms: s.warning_ms ?? undefined,
    destructive: s.destructive || undefined, options: s.options,
  }));
  const sources = await sql<{ source_id: string; title: string; url: string | null; status: string; trust_level: string; locator: string | null }[]>`
    SELECT s.id AS source_id, s.title, s.url, s.status, s.trust_level, fs.locator FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
    WHERE fs.flow_id = ${id} ORDER BY s.title`;
  return { ...f, stepsJson: JSON.stringify(json, null, 2), sources };
}

export interface RouterFlowFields { modelId: string; mode: "mesh" | "ap"; scenarioKey: string; hardwareRevision: string | null; firmwareNote: string | null }

export async function saveFlow(user: StaffUser, input: { id?: string; slug: string; categoryId: string; titleEn: string; titleMs: string; steps: FlowStepsInput; router?: RouterFlowFields | null }) {
  const r = input.router ?? null;
  return db().begin(async (tx) => {
    let id = input.id;
    if (id) {
      // Edits return a published flow to draft, and any content change withdraws a verification:
      // the edited steps must be checked against the source again.
      await tx`
        UPDATE knowledge.flows SET title_en = ${input.titleEn}, title_ms = ${input.titleMs}, category_id = ${input.categoryId}, status = 'draft',
          model_id = ${r?.modelId ?? null}, support_mode = ${r?.mode ?? null}, scenario_key = ${r?.scenarioKey ?? null},
          hardware_revision = ${r?.hardwareRevision ?? null}, firmware_note = ${r?.firmwareNote ?? null},
          verification_status = CASE WHEN verification_status = 'verified' THEN 'unverified' ELSE verification_status END,
          verified_by = NULL, verified_at = NULL
        WHERE id = ${id}`;
      await tx`DELETE FROM knowledge.flow_steps WHERE flow_id = ${id}`;
    } else {
      const [f] = await tx<{ id: string }[]>`
        INSERT INTO knowledge.flows (category_id, slug, title_en, title_ms, created_by, model_id, support_mode, scenario_key, hardware_revision, firmware_note)
        VALUES (${input.categoryId}, ${input.slug}, ${input.titleEn}, ${input.titleMs}, ${user.id}, ${r?.modelId ?? null}, ${r?.mode ?? null}, ${r?.scenarioKey ?? null},
          ${r?.hardwareRevision ?? null}, ${r?.firmwareNote ?? null}) RETURNING id`;
      id = f!.id;
    }
    for (const s of input.steps) {
      await tx`
        INSERT INTO knowledge.flow_steps (flow_id, step_key, is_start, prompt_en, prompt_ms, options, safety_level, expected_en, expected_ms, warning_en, warning_ms, destructive)
        VALUES (${id}, ${s.key}, ${!!s.start}, ${s.prompt_en}, ${s.prompt_ms}, ${tx.json(s.options as never)}, ${s.safety ?? "normal"},
          ${s.expected_en ?? null}, ${s.expected_ms ?? null}, ${s.warning_en ?? null}, ${s.warning_ms ?? null}, ${!!s.destructive})`;
    }
    await audit({ actorId: user.id, action: "knowledge.flow_save", entityType: "flow", entityId: id, summary: { steps: input.steps.length } }, tx);
    return id!;
  });
}

/** Change status. Publishing a model-specific flow is refused by the database unless it is verified and sourced. */
export async function setFlowStatus(user: StaffUser, id: string, status: "draft" | "published" | "archived"): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await db()`UPDATE knowledge.flows SET status = ${status} WHERE id = ${id}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/flows_publish_verified|verified/.test(msg) && !/source|Malay/.test(msg)) return { ok: false, reason: "not_verified" };
    if (/source/.test(msg)) return { ok: false, reason: "no_source" };
    if (/Malay/.test(msg)) return { ok: false, reason: "translation" };
    if (/flows_one_published_scenario/.test(msg)) return { ok: false, reason: "duplicate_live" };
    throw err;
  }
  await audit({ actorId: user.id, action: "knowledge.flow_status", entityType: "flow", entityId: id, summary: { status } });
  return { ok: true };
}

/** Replace the sources linked to a flow. Linking does not approve a source; source review is separate. */
export async function setFlowSources(user: StaffUser, id: string, links: { sourceId: string; locator: string | null }[]) {
  await db().begin(async (tx) => {
    await tx`DELETE FROM knowledge.flow_sources WHERE flow_id = ${id}`;
    for (const l of links) await tx`INSERT INTO knowledge.flow_sources (flow_id, source_id, locator) VALUES (${id}, ${l.sourceId}, ${l.locator?.slice(0, 200) || null})`;
    await audit({ actorId: user.id, action: "knowledge.flow_sources", entityType: "flow", entityId: id, summary: { count: links.length } }, tx);
  });
}

/**
 * Record that a named reviewer checked every step of a model-specific flow against the full
 * source. Requires at least one approved, reviewed source and finished Malay text.
 */
export async function verifyFlow(user: StaffUser, id: string, note: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sql = db();
  const [f] = await sql<{ model_id: string | null; created_by: string | null }[]>`SELECT model_id, created_by FROM knowledge.flows WHERE id = ${id}`;
  if (!f?.model_id) return { ok: false, reason: "not_router" };
  if (note.trim().length < 10) return { ok: false, reason: "note_required" };
  const [src] = await sql`
    SELECT 1 FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
    WHERE fs.flow_id = ${id} AND s.status = 'approved' AND s.trust_level IN ('reviewed', 'authoritative') LIMIT 1`;
  if (!src) return { ok: false, reason: "no_source" };
  const [pending] = await sql`
    SELECT 1 FROM knowledge.flow_steps WHERE flow_id = ${id}
      AND (prompt_ms LIKE '[PERLU TERJEMAHAN]%' OR expected_ms LIKE '[PERLU TERJEMAHAN]%' OR warning_ms LIKE '[PERLU TERJEMAHAN]%') LIMIT 1`;
  if (pending) return { ok: false, reason: "translation" };
  const self = f.created_by === user.id;
  await sql`
    UPDATE knowledge.flows SET verification_status = 'verified', verified_by = ${user.id}, verified_at = now(),
      verification_note = ${`${note.trim().slice(0, 950)}${self ? " (verified by the author)" : ""}`}
    WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "knowledge.flow_verify", entityType: "flow", entityId: id, summary: { self } });
  return { ok: true };
}

export async function unverifyFlow(user: StaffUser, id: string) {
  await db()`UPDATE knowledge.flows SET verification_status = 'unverified', verified_by = NULL, verified_at = NULL, status = CASE WHEN status = 'published' THEN 'draft' ELSE status END WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "knowledge.flow_unverify", entityType: "flow", entityId: id });
}

export async function approvedSourceOptions() {
  return db()<{ id: string; title: string; trust_level: string; status: string }[]>`
    SELECT id, title, trust_level, status FROM knowledge.sources WHERE status <> 'rejected' ORDER BY status, title LIMIT 300`;
}
