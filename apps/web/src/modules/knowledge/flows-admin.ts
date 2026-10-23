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
  return db()<{ id: string; slug: string; title_en: string; status: string; category: string; steps: number; updated_at: Date }[]>`
    SELECT f.id, f.slug, f.title_en, f.status, c.name_en AS category, (SELECT count(*)::int FROM knowledge.flow_steps s WHERE s.flow_id = f.id) AS steps, f.updated_at
    FROM knowledge.flows f JOIN catalog.categories c ON c.id = f.category_id ORDER BY f.updated_at DESC`;
}

export async function getFlowAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [f] = await sql<{ id: string; slug: string; title_en: string; title_ms: string; status: string; category_id: string }[]>`
    SELECT id, slug, title_en, title_ms, status, category_id FROM knowledge.flows WHERE id = ${id}`;
  if (!f) return null;
  const steps = await sql<{ step_key: string; is_start: boolean; prompt_en: string; prompt_ms: string; options: unknown; safety_level: string }[]>`
    SELECT step_key, is_start, prompt_en, prompt_ms, options, safety_level FROM knowledge.flow_steps WHERE flow_id = ${id} ORDER BY is_start DESC, step_key`;
  const json = steps.map((s) => ({ key: s.step_key, start: s.is_start || undefined, prompt_en: s.prompt_en, prompt_ms: s.prompt_ms, safety: s.safety_level === "normal" ? undefined : s.safety_level, options: s.options }));
  return { ...f, stepsJson: JSON.stringify(json, null, 2) };
}

export async function saveFlow(user: StaffUser, input: { id?: string; slug: string; categoryId: string; titleEn: string; titleMs: string; steps: FlowStepsInput }) {
  return db().begin(async (tx) => {
    let id = input.id;
    if (id) {
      // Edits return a published flow to draft; publishing is a separate reviewer action.
      await tx`UPDATE knowledge.flows SET title_en = ${input.titleEn}, title_ms = ${input.titleMs}, category_id = ${input.categoryId}, status = 'draft' WHERE id = ${id}`;
      await tx`DELETE FROM knowledge.flow_steps WHERE flow_id = ${id}`;
    } else {
      const [f] = await tx<{ id: string }[]>`
        INSERT INTO knowledge.flows (category_id, slug, title_en, title_ms, created_by) VALUES (${input.categoryId}, ${input.slug}, ${input.titleEn}, ${input.titleMs}, ${user.id}) RETURNING id`;
      id = f!.id;
    }
    for (const s of input.steps) {
      await tx`
        INSERT INTO knowledge.flow_steps (flow_id, step_key, is_start, prompt_en, prompt_ms, options, safety_level)
        VALUES (${id}, ${s.key}, ${!!s.start}, ${s.prompt_en}, ${s.prompt_ms}, ${tx.json(s.options as never)}, ${s.safety ?? "normal"})`;
    }
    await audit({ actorId: user.id, action: "knowledge.flow_save", entityType: "flow", entityId: id, summary: { steps: input.steps.length } }, tx);
    return id!;
  });
}

export async function setFlowStatus(user: StaffUser, id: string, status: "draft" | "published" | "archived") {
  await db()`UPDATE knowledge.flows SET status = ${status} WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "knowledge.flow_status", entityType: "flow", entityId: id, summary: { status } });
}
