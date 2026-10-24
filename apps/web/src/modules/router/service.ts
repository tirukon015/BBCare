import "server-only";
import { isCustomerVisibleFlow, type SupportMode } from "@bbcare/core";
import { db } from "@/lib/db";
import type { Locale } from "@/i18n";

export interface RouterModel {
  id: string; slug: string; ecr: string; name: string; brand: string; modelNumber: string;
  identityStatus: "confirmed" | "needs_confirmation"; identityNote: string | null;
  /** Set only when staff verified the product photo. */
  imageUrl: string | null;
}

type ModelRow = {
  id: string; slug: string; ecr_code: string; display_name: string; brand: string; model_number: string;
  identity_status: "confirmed" | "needs_confirmation"; identity_note: string | null; image_verified_at: Date | null;
};

const toModel = (r: ModelRow): RouterModel => ({
  id: r.id, slug: r.slug, ecr: r.ecr_code, name: r.display_name, brand: r.brand, modelNumber: r.model_number,
  identityStatus: r.identity_status, identityNote: r.identity_note,
  imageUrl: r.image_verified_at ? `/media/models/${r.slug}?v=${r.image_verified_at.getTime()}` : null,
});

/** The customer router catalogue: only models that carry an ECR code. */
export async function listRouterModels(): Promise<RouterModel[]> {
  const rows = await db()<ModelRow[]>`
    SELECT m.id, m.slug, m.ecr_code, m.display_name, b.name AS brand, m.model_number, m.identity_status, m.identity_note, m.image_verified_at
    FROM catalog.product_models m JOIN catalog.brands b ON b.id = m.brand_id JOIN catalog.categories c ON c.id = m.category_id
    WHERE m.ecr_code IS NOT NULL AND m.status = 'active' AND c.slug = 'router' AND c.active
    ORDER BY array_position(ARRAY['AX20','EX5','EX2','EX8','EB4','KAO','HUA']::text[], m.ecr_code), m.display_name`;
  return rows.map(toModel);
}

export async function getRouterModel(slug: string): Promise<RouterModel | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  return (await listRouterModels()).find((m) => m.slug === slug) ?? null;
}

/** Scenario keys that have a verified, published flow for this model and mode. */
export async function verifiedScenarios(modelId: string, mode: SupportMode): Promise<Set<string>> {
  const rows = await db()<{ scenario_key: string }[]>`
    SELECT scenario_key FROM knowledge.flows
    WHERE model_id = ${modelId} AND support_mode = ${mode} AND status = 'published' AND verification_status = 'verified'
      AND verified_at IS NOT NULL AND verified_by IS NOT NULL`;
  return new Set(rows.map((r) => r.scenario_key));
}

export interface RouterFlowOption { key: string; label: string; next: string | null; outcome: "resolved" | "resolved_hint" | "escalate" | null }
export interface RouterFlowStep {
  key: string; isStart: boolean; prompt: string; expected: string | null; warning: string | null; destructive: boolean;
  safetyLevel: "normal" | "caution" | "danger"; options: RouterFlowOption[];
}
export interface RouterFlow {
  id: string; title: string; hardwareRevision: string | null; firmwareNote: string | null; verifiedAt: string;
  steps: RouterFlowStep[];
  sources: { title: string; publisher: string | null; url: string | null; locator: string | null }[];
}

type RawOption = { key: string; label_en: string; label_ms: string; next?: string | null; outcome?: RouterFlowOption["outcome"] };

/**
 * The verified flow for one model, mode and scenario, in the customer's language. Returns null
 * unless the flow is published, verified by a named staff member, and backed by an approved source.
 */
export async function getVerifiedRouterFlow(modelId: string, mode: SupportMode, scenarioKey: string, locale: Locale): Promise<RouterFlow | null> {
  const sql = db();
  const [f] = await sql<{
    id: string; title_en: string; title_ms: string; status: string; verification_status: string; verified_at: Date | null; verified_by: string | null;
    hardware_revision: string | null; firmware_note: string | null;
  }[]>`
    SELECT id, title_en, title_ms, status, verification_status, verified_at, verified_by, hardware_revision, firmware_note
    FROM knowledge.flows
    WHERE model_id = ${modelId} AND support_mode = ${mode} AND scenario_key = ${scenarioKey} AND status = 'published'`;
  if (!f || !isCustomerVisibleFlow({ status: f.status, verificationStatus: f.verification_status, verifiedAt: f.verified_at, verifiedBy: f.verified_by })) return null;
  const [steps, sources] = await Promise.all([
    sql<{
      step_key: string; is_start: boolean; prompt_en: string; prompt_ms: string; expected_en: string | null; expected_ms: string | null;
      warning_en: string | null; warning_ms: string | null; destructive: boolean; safety_level: RouterFlowStep["safetyLevel"]; options: RawOption[];
    }[]>`
      SELECT step_key, is_start, prompt_en, prompt_ms, expected_en, expected_ms, warning_en, warning_ms, destructive, safety_level, options
      FROM knowledge.flow_steps WHERE flow_id = ${f.id} ORDER BY is_start DESC, step_key`,
    sql<{ title: string; publisher: string | null; url: string | null; locator: string | null }[]>`
      SELECT s.title, s.publisher, s.url, fs.locator FROM knowledge.flow_sources fs JOIN knowledge.sources s ON s.id = fs.source_id
      WHERE fs.flow_id = ${f.id} AND s.status = 'approved' AND s.trust_level IN ('reviewed', 'authoritative') ORDER BY s.title`,
  ]);
  if (sources.length === 0 || steps.length === 0) return null;
  const ms = locale === "ms";
  return {
    id: f.id, title: ms ? f.title_ms : f.title_en, hardwareRevision: f.hardware_revision, firmwareNote: f.firmware_note, verifiedAt: f.verified_at!.toISOString(),
    steps: steps.map((s) => ({
      key: s.step_key, isStart: s.is_start, prompt: ms ? s.prompt_ms : s.prompt_en,
      expected: ms ? s.expected_ms : s.expected_en, warning: ms ? s.warning_ms : s.warning_en,
      destructive: s.destructive, safetyLevel: s.safety_level,
      options: s.options.map((o) => ({ key: o.key, label: ms ? o.label_ms : o.label_en, next: o.next ?? null, outcome: o.outcome ?? null })),
    })),
    sources: sources.map((s) => ({ title: s.title, publisher: s.publisher, url: s.url && /^https:\/\//.test(s.url) ? s.url : null, locator: s.locator })),
  };
}

/** Verified product photo for a router model, or null. */
export async function getModelImage(slug: string): Promise<{ storageKey: string; mimeType: string } | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const [r] = await db()<{ storage_key: string; mime_type: string }[]>`
    SELECT a.storage_key, a.mime_type FROM catalog.product_models m JOIN knowledge.media_assets a ON a.id = m.image_asset_id
    WHERE m.slug = ${slug} AND m.ecr_code IS NOT NULL AND m.image_verified_at IS NOT NULL AND m.image_verified_by IS NOT NULL`;
  return r ? { storageKey: r.storage_key, mimeType: r.mime_type } : null;
}
