import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { aiProvider } from "@/lib/ai";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export async function aiOverview() {
  const sql = db();
  const provider = aiProvider();
  const [flags, models, runs] = await Promise.all([
    sql<{ key: string; enabled: boolean; updated_at: Date; by: string | null }[]>`SELECT f.key, f.enabled, f.updated_at, u.display_name AS by FROM ai.flags f LEFT JOIN identity.users u ON u.id = f.updated_by ORDER BY f.key`,
    sql<{ id: string; name: string; purpose: string; provider: string; status: string; quantization: string | null; license_note: string | null; notes: string | null }[]>`
      SELECT id, name, purpose, provider, status, quantization, license_note, notes FROM ai.models ORDER BY purpose, created_at DESC`,
    sql<{ id: string; dataset: string; version: number; summary: Record<string, unknown>; started_at: Date; finished_at: Date | null; config: Record<string, unknown> }[]>`
      SELECT r.id, d.name AS dataset, d.version, r.summary, r.started_at, r.finished_at, r.config FROM ai.eval_runs r JOIN ai.eval_datasets d ON d.id = r.dataset_id ORDER BY r.started_at DESC LIMIT 20`,
  ]);
  const health = provider ? await provider.health(AbortSignal.timeout(5000)) : null;
  return { provider: provider ? { name: provider.name, mock: provider.isMock } : null, health, flags, models, runs, env: env().BBCARE_ENV };
}

export type FlagResult = { ok: true } | { ok: false; reason: "no_provider" | "mock_not_allowed" | "no_active_model" | "unknown_flag" };

/**
 * Turning on customer-facing AI is a safety gate: outside development and preview it requires a
 * real provider and an approved, active chat model. The change is audited.
 */
export async function setFlag(user: StaffUser, key: string, enabled: boolean): Promise<FlagResult> {
  const sql = db();
  const [flag] = await sql`SELECT 1 FROM ai.flags WHERE key = ${key}`;
  if (!flag) return { ok: false, reason: "unknown_flag" };
  if (enabled && key.startsWith("ai_answers.")) {
    const provider = aiProvider();
    if (!provider) return { ok: false, reason: "no_provider" };
    const e = env().BBCARE_ENV;
    const productionLike = e === "production" || e === "staging";
    if (provider.isMock && productionLike) return { ok: false, reason: "mock_not_allowed" };
    if (productionLike) {
      const [active] = await sql`SELECT 1 FROM ai.models WHERE purpose = 'chat' AND status = 'active'`;
      if (!active) return { ok: false, reason: "no_active_model" };
    }
  }
  await sql`UPDATE ai.flags SET enabled = ${enabled}, updated_by = ${user.id}, updated_at = now() WHERE key = ${key}`;
  await audit({ actorId: user.id, action: "ai.flag_set", entityType: "flag", entityId: key, summary: { enabled } });
  return { ok: true };
}

const NEXT_STATUS: Record<string, string[]> = { candidate: ["evaluated", "retired"], evaluated: ["approved", "retired"], approved: ["active", "retired"], active: ["retired"], retired: [] };

export async function setModelStatus(user: StaffUser, id: string, status: string): Promise<boolean> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [m] = await tx<{ status: string; purpose: string; provider: string }[]>`SELECT status, purpose, provider FROM ai.models WHERE id = ${id} FOR UPDATE`;
    if (!m || !NEXT_STATUS[m.status]?.includes(status)) return false;
    if (status === "active" && m.provider === "mock") return false;
    if (status === "active") await tx`UPDATE ai.models SET status = 'approved' WHERE purpose = ${m.purpose} AND status = 'active'`;
    await tx`UPDATE ai.models SET status = ${status}, approved_by = CASE WHEN ${status} IN ('approved','active') THEN ${user.id}::uuid ELSE approved_by END WHERE id = ${id}`;
    await audit({ actorId: user.id, action: "ai.model_status", entityType: "model", entityId: id, summary: { from: m.status, to: status } }, tx);
    return true;
  });
}

export async function registerModel(user: StaffUser, input: { name: string; purpose: string; provider: string; quantization?: string; licenseNote?: string; notes?: string }) {
  const [m] = await db()<{ id: string }[]>`
    INSERT INTO ai.models (name, purpose, provider, quantization, license_note, notes) VALUES (${input.name}, ${input.purpose}, ${input.provider}, ${input.quantization ?? null}, ${input.licenseNote ?? null}, ${input.notes ?? null})
    ON CONFLICT (name, purpose) DO NOTHING RETURNING id`;
  if (m) await audit({ actorId: user.id, action: "ai.model_register", entityType: "model", entityId: m.id, summary: { name: input.name } });
}

export { NEXT_STATUS };
