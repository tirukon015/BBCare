import { ROUTER_MODELS, normalizeModelNumber, scenarioByKey } from "@bbcare/core";
import type { Sql, TxSql } from "./client";

type Tx = Sql | TxSql;

/**
 * Create or update the router category and the seven authoritative router models. Idempotent:
 * rows are matched by slug and ECR code, so it is safe to run on every environment, including
 * production after owner approval. It never deletes anything.
 */
export async function seedRouterCatalog(tx: Tx): Promise<Record<string, string>> {
  const [cat] = await tx<{ id: string }[]>`
    INSERT INTO catalog.categories (slug, name_en, name_ms, sort_order, active) VALUES ('router', 'Router Support', 'Sokongan Penghala', 1, true)
    ON CONFLICT (slug) DO UPDATE SET active = true RETURNING id`;
  const ids: Record<string, string> = {};
  for (const m of ROUTER_MODELS) {
    const [brand] = await tx<{ id: string }[]>`
      INSERT INTO catalog.brands (slug, name) VALUES (${m.brandSlug}, ${m.brand})
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO catalog.product_models (brand_id, category_id, model_number, normalized, slug, display_name, ecr_code, identity_status, identity_note, status)
      VALUES (${brand!.id}, ${cat!.id}, ${m.modelNumber}, ${normalizeModelNumber(m.modelNumber)}, ${m.slug}, ${m.name}, ${m.ecr}, ${m.identityStatus}, ${m.identityNote}, 'active')
      ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, ecr_code = EXCLUDED.ecr_code, model_number = EXCLUDED.model_number,
        identity_status = EXCLUDED.identity_status, identity_note = EXCLUDED.identity_note, status = 'active'
      RETURNING id`;
    ids[m.ecr] = row!.id;
    for (const alias of m.aliases) {
      await tx`
        INSERT INTO catalog.model_aliases (model_id, alias, normalized) VALUES (${row!.id}, ${alias}, ${normalizeModelNumber(alias)})
        ON CONFLICT (model_id, normalized) DO NOTHING`;
    }
  }
  return ids;
}

/** One record of docs/research/mesh-ap/kb-import.json (fields used here). */
export interface ResearchRecord {
  record_id: string;
  ecr_code: string;
  hardware_revision: string | null;
  firmware_requirements: string | null;
  support_category: string;
  supported_feature: string;
  troubleshooting_steps: string[];
  expected_result: string;
  warnings: string[];
  source_title: string;
  source_url: string | null;
  source_section: string | null;
  verification_status: string;
}

const FEATURE_TO_SCENARIO: Record<string, string> = {
  easymesh_pairing: "mesh_pairing",
  easymesh_support_by_version: "mesh_pairing",
  ethernet_backhaul: "mesh_wired_backhaul",
  placement: "mesh_weak_signal",
  factory_reset_last_resort: "recovery_failed",
  access_point_mode: "ap_enable",
  admin_access_in_ap_mode: "ap_admin_access",
};

export const TRANSLATION_PLACEHOLDER = "[PERLU TERJEMAHAN]";
const RESET_WARNING_EN = "A factory reset erases all settings on that unit, including the Wi-Fi name, mesh pairing and internet provider settings. Reset only the second unit unless BBTech staff advise otherwise.";
const RESET_WARNING_MS = "Tetapan semula kilang memadam semua tetapan pada unit itu, termasuk nama Wi-Fi, pairing mesh dan tetapan penyedia internet. Tetapkan semula unit kedua sahaja kecuali dinasihatkan oleh kakitangan BBTech.";
const isDestructive = (text: string) => /factory|reset button/i.test(text);
const NO_SECRETS = /never ask for or accept/i;

/**
 * Turn research records into DRAFT flows for staff to verify against the full source. Nothing is
 * published: drafts carry the research verification level, an unapproved source, and Malay
 * placeholders that the publish guard rejects until translated. Records with no steps are skipped.
 * Idempotent by record id.
 */
export async function importResearchDrafts(tx: Tx, records: ResearchRecord[], userId: string | null = null) {
  const models = new Map((await tx<{ id: string; ecr_code: string }[]>`SELECT id, ecr_code FROM catalog.product_models WHERE ecr_code IS NOT NULL`).map((m) => [m.ecr_code, m.id]));
  const [cat] = await tx<{ id: string }[]>`SELECT id FROM catalog.categories WHERE slug = 'router'`;
  if (!cat) throw new Error("Router category missing: run seedRouterCatalog first");
  let created = 0;
  for (const r of records) {
    const modelId = models.get(r.ecr_code);
    const scenario = scenarioByKey(FEATURE_TO_SCENARIO[r.supported_feature] ?? "");
    if (!modelId || !scenario || r.troubleshooting_steps.length === 0) continue;
    const [exists] = await tx`SELECT 1 FROM knowledge.flows WHERE research_ref = ${r.record_id}`;
    if (exists) continue;
    const mode = r.support_category === "access_point_mode" ? "ap" : "mesh";
    const [flow] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.flows (category_id, slug, title_en, title_ms, status, created_by, model_id, support_mode, scenario_key,
        hardware_revision, firmware_note, verification_status, verification_note, research_ref)
      VALUES (${cat.id}, ${`research-${r.record_id.toLowerCase()}`}, ${scenario.en}, ${scenario.ms}, 'draft', ${userId}, ${modelId}, ${mode}, ${scenario.key},
        ${r.hardware_revision}, ${r.firmware_requirements}, ${r.verification_status},
        ${"Imported from research draft. Read the full source, correct the steps, then verify and publish."}, ${r.record_id})
      RETURNING id`;
    const warnings = r.warnings.filter((w) => !NO_SECRETS.test(w) && !/factory reset erases/i.test(w));
    const steps = r.troubleshooting_steps;
    for (const [i, text] of steps.entries()) {
      const last = i === steps.length - 1;
      const destructive = isDestructive(text);
      const options = last
        ? [{ key: "fixed", label_en: "That fixed it", label_ms: "Masalah selesai", outcome: "resolved" },
           { key: "not_fixed", label_en: "Still not working", label_ms: "Masih tidak berfungsi", outcome: "escalate" }]
        : [{ key: "done", label_en: "Done, next step", label_ms: "Selesai, langkah seterusnya", next: `s${i + 2}` },
           { key: "stuck", label_en: "I cannot do this step", label_ms: "Saya tidak dapat melakukan langkah ini", outcome: "escalate" }];
      const warningEn = destructive ? RESET_WARNING_EN : i === 0 && warnings.length ? warnings.join(" ").slice(0, 500) : null;
      const warningMs = destructive ? RESET_WARNING_MS : warningEn ? `${TRANSLATION_PLACEHOLDER} ${warningEn}`.slice(0, 500) : null;
      await tx`
        INSERT INTO knowledge.flow_steps (flow_id, step_key, is_start, prompt_en, prompt_ms, options, safety_level, expected_en, expected_ms, warning_en, warning_ms, destructive)
        VALUES (${flow!.id}, ${`s${i + 1}`}, ${i === 0}, ${text.slice(0, 500)}, ${`${TRANSLATION_PLACEHOLDER} ${text}`.slice(0, 500)}, ${tx.json(options)},
          ${destructive ? "danger" : "normal"}, ${last ? r.expected_result.slice(0, 500) : null}, ${last ? `${TRANSLATION_PLACEHOLDER} ${r.expected_result}`.slice(0, 500) : null},
          ${warningEn}, ${warningMs}, ${destructive})`;
    }
    if (r.source_url) {
      const [existing] = await tx<{ id: string }[]>`SELECT id FROM knowledge.sources WHERE url = ${r.source_url} LIMIT 1`;
      const sourceId = existing?.id ?? (await tx<{ id: string }[]>`
        INSERT INTO knowledge.sources (kind, title, publisher, url, trust_level, status, created_by)
        VALUES (${/maxis|tp-link|huawei/i.test(r.source_url) ? "manufacturer_doc" : "web_page"}, ${r.source_title.slice(0, 300)}, ${publisherFor(r.source_url)}, ${r.source_url}, 'unverified', 'pending', ${userId})
        RETURNING id`)[0]!.id;
      await tx`INSERT INTO knowledge.flow_sources (flow_id, source_id, locator) VALUES (${flow!.id}, ${sourceId}, ${r.source_section}) ON CONFLICT DO NOTHING`;
    }
    created++;
  }
  return { created };
}

function publisherFor(url: string): string | null {
  if (/maxis\.com\.my/.test(url)) return "Maxis";
  if (/tp-link\.com/.test(url)) return "TP-Link";
  if (/huawei/.test(url)) return "Huawei";
  if (/manualslib\.com/.test(url)) return "ManualsLib (mirror)";
  if (/lowyat\.net/.test(url)) return "Lowyat.NET forum (community)";
  return null;
}
