import "server-only";
import { ROUTER_ECR_CODES, type SupportMode } from "@bbcare/core";
import { loadVerifiedRouterFlow, verifiedScenarioKeys } from "@bbcare/db";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
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
  if (rows.length !== ROUTER_ECR_CODES.length) {
    // The seven models are created by migration 0004 and the seed; anything else is a data fault.
    logger.error({ found: rows.map((r) => r.ecr_code), expected: ROUTER_ECR_CODES }, "router catalogue incomplete");
  }
  return rows.map(toModel);
}

export async function getRouterModel(slug: string): Promise<RouterModel | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  return (await listRouterModels()).find((m) => m.slug === slug) ?? null;
}

/** Scenario keys that have verified guidance for this model and mode. */
export async function verifiedScenarios(modelId: string, mode: SupportMode): Promise<Set<string>> {
  return new Set(await verifiedScenarioKeys(db(), modelId, mode));
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

/**
 * The verified flow for one model, mode and scenario, in the customer's language, or null.
 * Eligibility rules live in loadVerifiedRouterFlow (@bbcare/db) and are shared with AI retrieval.
 */
export async function getVerifiedRouterFlow(modelId: string, mode: SupportMode, scenarioKey: string, locale: Locale): Promise<RouterFlow | null> {
  const f = await loadVerifiedRouterFlow(db(), modelId, mode, scenarioKey);
  if (!f) return null;
  const ms = locale === "ms";
  return {
    id: f.id, title: ms ? f.title_ms : f.title_en, hardwareRevision: f.hardware_revision, firmwareNote: f.firmware_note, verifiedAt: f.verified_at.toISOString(),
    steps: f.steps.map((s) => ({
      key: s.step_key, isStart: s.is_start, prompt: ms ? s.prompt_ms : s.prompt_en,
      expected: ms ? s.expected_ms : s.expected_en, warning: ms ? s.warning_ms : s.warning_en,
      destructive: s.destructive, safetyLevel: s.safety_level,
      options: s.options.map((o) => ({ key: o.key, label: ms ? o.label_ms : o.label_en, next: o.next ?? null, outcome: o.outcome ?? null })),
    })),
    sources: f.sources.map((s) => ({ title: s.title, publisher: s.publisher, url: s.url && /^https:\/\//.test(s.url) ? s.url : null, locator: s.locator })),
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
