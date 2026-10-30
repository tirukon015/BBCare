import {
  classifyChannel, demandGroupKey, describeRequirement, normalizeHardwareRevision, referrerHost, scenarioByKey,
  type AttributionInput, type ResourceType, type SupportChannel, type Touch,
} from "@bbcare/core";
import type { Sql, TxSql } from "../client";

type Tx = Sql | TxSql;

/**
 * Customer demand intelligence storage. Rules (channel classification, grouping) come from
 * @bbcare/core; this file only reads and writes rows.
 */

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export interface AttributionRow {
  channel: SupportChannel; channel_detail: string | null; channel_evidence: string;
  referrer_host: string | null; landing_path: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  first_referrer_host: string | null; first_landing_path: string | null; first_utm_source: string | null; first_utm_medium: string | null; first_utm_campaign: string | null;
  first_channel: SupportChannel | null; first_touch_at: Date | null; consent: string;
}

const touchCols = (t: Touch | undefined) => ({
  referrer_host: referrerHost(t?.referrer),
  landing_path: t?.landing_path ?? null,
  utm_source: t?.utm_source ?? null,
  utm_medium: t?.utm_medium ?? null,
  utm_campaign: t?.utm_campaign ?? null,
});

/**
 * Store attribution for a session or a case. Missing data stays missing: the channel is
 * "unknown" with evidence "none" when the browser reported nothing usable.
 */
export async function recordAttribution(
  sql: Tx,
  subject: { sessionId?: string | null; caseId?: string | null },
  input: AttributionInput | null | undefined,
  ctx: { ownHosts: string[]; consent: "essential" | "analytics" },
): Promise<SupportChannel> {
  if (!subject.sessionId && !subject.caseId) throw new Error("attribution needs a session or a case");
  const latest = classifyChannel(input?.latest, ctx.ownHosts);
  const first = input?.first ? classifyChannel(input.first, ctx.ownHosts) : null;
  const l = touchCols(input?.latest);
  const f = touchCols(input?.first);
  await sql`
    INSERT INTO support.attribution (session_id, case_id, channel, channel_detail, channel_evidence,
      referrer_host, landing_path, utm_source, utm_medium, utm_campaign,
      first_referrer_host, first_landing_path, first_utm_source, first_utm_medium, first_utm_campaign, first_channel, first_touch_at, consent)
    VALUES (${subject.sessionId ?? null}, ${subject.caseId ?? null}, ${latest.channel}, ${latest.detail}, ${latest.evidence},
      ${l.referrer_host}, ${l.landing_path}, ${l.utm_source}, ${l.utm_medium}, ${l.utm_campaign},
      ${f.referrer_host}, ${f.landing_path}, ${f.utm_source}, ${f.utm_medium}, ${f.utm_campaign}, ${first?.channel ?? null},
      ${input?.first?.at ? new Date(input.first.at) : null}, ${ctx.consent})
    ON CONFLICT DO NOTHING`;
  return latest.channel;
}

export async function attributionFor(sql: Tx, subject: { sessionId?: string | null; caseId?: string | null }): Promise<AttributionRow | null> {
  const [row] = await sql<AttributionRow[]>`
    SELECT channel, channel_detail, channel_evidence, referrer_host, landing_path, utm_source, utm_medium, utm_campaign,
      first_referrer_host, first_landing_path, first_utm_source, first_utm_medium, first_utm_campaign, first_channel, first_touch_at, consent
    FROM support.attribution WHERE (${subject.sessionId ?? null}::uuid IS NOT NULL AND session_id = ${subject.sessionId ?? null}::uuid)
       OR (${subject.caseId ?? null}::uuid IS NOT NULL AND case_id = ${subject.caseId ?? null}::uuid) LIMIT 1`;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Demand recording
// ---------------------------------------------------------------------------

export interface DemandRequestInput {
  modelId: string;
  hardwareRevision?: string | null;
  supportMode: "mesh" | "ap";
  scenarioKey: string;
  resourceType: ResourceType;
  locale: "en" | "ms";
  /** Already scrubbed of personal data and secrets by the caller. */
  question: string;
  origin: "router_page" | "assistant" | "escalation" | "describe_box";
  customerRef: string;
  sessionId?: string | null;
  caseId?: string | null;
  channel?: SupportChannel | null;
  hadTextGuide: boolean;
  interpretedBy?: "rules" | "ai";
}

/**
 * Record one request against its grouped demand (created on first sight). Returns the demand id,
 * or null when the requirement is already fulfilled by an approved resource or verified flow, in
 * which case nothing is missing and nothing is recorded.
 */
export async function recordDemand(sql: Tx, input: DemandRequestInput): Promise<{ demandId: string; created: boolean } | null> {
  const scenario = scenarioByKey(input.scenarioKey);
  if (!scenario || !scenario.modes.includes(input.supportMode)) return null;
  const revision = normalizeHardwareRevision(input.hardwareRevision);
  if (await resourceExists(sql, { modelId: input.modelId, supportMode: input.supportMode, scenarioKey: input.scenarioKey, resourceType: input.resourceType, locale: input.locale })) return null;
  const [model] = await sql<{ display_name: string }[]>`SELECT display_name FROM catalog.product_models WHERE id = ${input.modelId}`;
  if (!model) return null;
  const requirement = describeRequirement({ modelName: model.display_name, scenarioTitle: scenario.en, resourceType: input.resourceType, locale: input.locale, hardwareRevision: revision });
  const [d] = await sql<{ id: string; created: boolean }[]>`
    INSERT INTO support.resource_demands (model_id, hardware_revision, support_mode, scenario_key, resource_type, locale, requirement, status, last_requested_at)
    VALUES (${input.modelId}, ${revision}, ${input.supportMode}, ${input.scenarioKey}, ${input.resourceType}, ${input.locale}, ${requirement}, 'missing', now())
    ON CONFLICT (model_id, hardware_revision, support_mode, scenario_key, resource_type, locale) DO UPDATE
      SET last_requested_at = now(),
          status = CASE WHEN support.resource_demands.status = 'approved' THEN 'missing' ELSE support.resource_demands.status END
    RETURNING id, (xmax = 0) AS created`;
  await sql`
    INSERT INTO support.resource_demand_requests (demand_id, customer_ref, session_id, case_id, question, interpreted, interpreted_by, locale, channel, origin, had_text_guide)
    VALUES (${d!.id}, ${input.customerRef.slice(0, 80)}, ${input.sessionId ?? null}, ${input.caseId ?? null}, ${input.question.slice(0, 1000)}, ${requirement},
      ${input.interpretedBy ?? "rules"}, ${input.locale}, ${input.channel ?? "unknown"}, ${input.origin}, ${input.hadTextGuide})`;
  return { demandId: d!.id, created: d!.created };
}

/** Does an approved resource (or, for text guides, a verified flow) already satisfy this requirement? */
export async function resourceExists(sql: Tx, k: { modelId: string; supportMode: "mesh" | "ap"; scenarioKey: string; resourceType: ResourceType; locale: "en" | "ms" }): Promise<boolean> {
  if (k.resourceType === "text_guide") {
    const [f] = await sql`
      SELECT 1 FROM knowledge.flows f WHERE f.model_id = ${k.modelId} AND f.support_mode = ${k.supportMode} AND f.scenario_key = ${k.scenarioKey}
        AND f.status = 'published' AND f.verification_status = 'verified' AND knowledge.flow_has_held_source(f.id)`;
    return !!f;
  }
  const [r] = await sql`
    SELECT 1 FROM knowledge.resources WHERE model_id = ${k.modelId} AND support_mode = ${k.supportMode} AND scenario_key = ${k.scenarioKey}
      AND kind = ${k.resourceType} AND status = 'approved' AND locale IN ('both', ${k.locale})`;
  return !!r;
}

export interface ApprovedResource { id: string; kind: string; title: string; description: string | null; mimeType: string; locale: string }

/** Approved resources for a model, mode and scenario, in the customer's language or language-neutral. */
export async function approvedResources(sql: Tx, k: { modelId: string; supportMode: "mesh" | "ap"; scenarioKey: string; locale: "en" | "ms" }): Promise<ApprovedResource[]> {
  const rows = await sql<{ id: string; kind: string; title_en: string; title_ms: string; description: string | null; mime_type: string; locale: string }[]>`
    SELECT r.id, r.kind, r.title_en, r.title_ms, r.description, a.mime_type, r.locale
    FROM knowledge.resources r JOIN knowledge.media_assets a ON a.id = r.media_asset_id
    WHERE r.model_id = ${k.modelId} AND r.support_mode = ${k.supportMode} AND r.scenario_key = ${k.scenarioKey}
      AND r.status = 'approved' AND r.locale IN ('both', ${k.locale})
    ORDER BY array_position(ARRAY['video','diagram','image','document']::text[], r.kind), r.created_at`;
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: k.locale === "ms" ? r.title_ms : r.title_en, description: r.description, mimeType: r.mime_type, locale: r.locale }));
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

/**
 * After a resource is approved, mark every demand it satisfies as approved (fulfilled). The
 * request history stays untouched. Returns the fulfilled demand ids.
 */
export async function fulfilDemandsForResource(sql: Tx, resourceId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    UPDATE support.resource_demands d SET status = 'approved', fulfilled_resource_id = r.id, fulfilled_at = now()
    FROM knowledge.resources r
    WHERE r.id = ${resourceId} AND r.status = 'approved' AND r.model_id IS NOT NULL
      AND d.model_id = r.model_id AND d.support_mode = r.support_mode AND d.scenario_key = r.scenario_key AND d.resource_type = r.kind
      AND (r.locale = 'both' OR d.locale = r.locale) AND d.status <> 'approved'
    RETURNING d.id`;
  return rows.map((r) => r.id);
}

/** Same for text guides: when a flow becomes customer-visible, its text-guide demands are fulfilled. */
export async function fulfilDemandsForFlow(sql: Tx, flowId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    UPDATE support.resource_demands d SET status = 'approved', fulfilled_flow_id = f.id, fulfilled_at = now()
    FROM knowledge.flows f
    WHERE f.id = ${flowId} AND f.status = 'published' AND f.verification_status = 'verified' AND knowledge.flow_has_held_source(f.id)
      AND d.model_id = f.model_id AND d.support_mode = f.support_mode AND d.scenario_key = f.scenario_key AND d.resource_type = 'text_guide' AND d.status <> 'approved'
    RETURNING d.id`;
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DemandFilter {
  modelId?: string | null;
  resourceType?: ResourceType | null;
  locale?: "en" | "ms" | null;
  supportMode?: "mesh" | "ap" | null;
  status?: string | null;
  since: Date;
  until: Date;
}

export interface DemandSummary {
  totals: { missingDemands: number; requests: number; uniqueCustomers: number; fulfilled: number };
  byModel: { label: string; value: number }[];
  byScenario: { label: string; value: number }[];
  byType: Record<ResourceType, number>;
  byLocale: { en: number; ms: number };
  byChannel: { label: string; value: number }[];
  daily: { day: string; value: number }[];
}

export async function demandSummary(sql: Tx, f: DemandFilter): Promise<DemandSummary> {
  // Requests inside the window, joined to their demand, with the filters applied once.
  const base = sql`
    FROM support.resource_demand_requests q JOIN support.resource_demands d ON d.id = q.demand_id JOIN catalog.product_models m ON m.id = d.model_id
    WHERE q.created_at >= ${f.since} AND q.created_at < ${f.until}
      AND (${f.modelId ?? null}::uuid IS NULL OR d.model_id = ${f.modelId ?? null}::uuid)
      AND (${f.resourceType ?? null}::text IS NULL OR d.resource_type = ${f.resourceType ?? null})
      AND (${f.locale ?? null}::text IS NULL OR d.locale = ${f.locale ?? null})
      AND (${f.supportMode ?? null}::text IS NULL OR d.support_mode = ${f.supportMode ?? null})
      AND (${f.status ?? null}::text IS NULL OR d.status = ${f.status ?? null})`;
  const [tot] = await sql<{ requests: number; customers: number; open: number; fulfilled: number }[]>`
    SELECT count(*)::int AS requests, count(DISTINCT q.customer_ref)::int AS customers,
      count(DISTINCT d.id) FILTER (WHERE d.status <> 'approved')::int AS open, count(DISTINCT d.id) FILTER (WHERE d.status = 'approved')::int AS fulfilled ${base}`;
  const byModel = await sql<{ label: string; value: number }[]>`
    SELECT m.display_name AS label, count(*)::int AS value ${base} GROUP BY m.display_name ORDER BY value DESC LIMIT 10`;
  const byScenario = await sql<{ label: string; value: number }[]>`
    SELECT d.support_mode || ':' || d.scenario_key AS label, count(*)::int AS value ${base} GROUP BY 1 ORDER BY value DESC LIMIT 12`;
  const byType = await sql<{ label: string; value: number }[]>`SELECT d.resource_type AS label, count(DISTINCT d.id) FILTER (WHERE d.status <> 'approved')::int AS value ${base} GROUP BY 1`;
  const byLocale = await sql<{ label: string; value: number }[]>`SELECT d.locale AS label, count(DISTINCT d.id) FILTER (WHERE d.status <> 'approved')::int AS value ${base} GROUP BY 1`;
  const byChannel = await sql<{ label: string; value: number }[]>`SELECT q.channel AS label, count(*)::int AS value ${base} GROUP BY 1 ORDER BY value DESC`;
  const daily = await sql<{ day: string; value: number }[]>`
    SELECT gs::date::text AS day, (SELECT count(*)::int ${base} AND q.created_at::date = gs::date) AS value
    FROM generate_series(${f.since}::date, (${f.until}::date - 1), interval '1 day') gs ORDER BY gs`;
  const types: Record<ResourceType, number> = { text_guide: 0, video: 0, diagram: 0, image: 0, document: 0 };
  for (const r of byType) types[r.label as ResourceType] = r.value;
  const locales = { en: 0, ms: 0 };
  for (const r of byLocale) locales[r.label as "en" | "ms"] = r.value;
  return {
    totals: { missingDemands: tot?.open ?? 0, requests: tot?.requests ?? 0, uniqueCustomers: tot?.customers ?? 0, fulfilled: tot?.fulfilled ?? 0 },
    byModel: [...byModel], byScenario: [...byScenario], byType: types, byLocale: locales, byChannel: [...byChannel], daily: [...daily],
  };
}

export interface DemandListRow {
  id: string; requirement: string; model: string; ecr_code: string | null; hardware_revision: string; support_mode: string; scenario_key: string;
  resource_type: string; locale: string; status: string; requests: number; customers: number; first_requested_at: Date; last_requested_at: Date; top_channel: string | null;
}

export async function listDemands(sql: Tx, f: DemandFilter): Promise<DemandListRow[]> {
  return [...(await sql<DemandListRow[]>`
    SELECT d.id, d.requirement, m.display_name AS model, m.ecr_code, d.hardware_revision, d.support_mode, d.scenario_key, d.resource_type, d.locale, d.status,
      count(q.id)::int AS requests, count(DISTINCT q.customer_ref)::int AS customers, d.first_requested_at, d.last_requested_at,
      (SELECT q2.channel FROM support.resource_demand_requests q2 WHERE q2.demand_id = d.id GROUP BY q2.channel ORDER BY count(*) DESC LIMIT 1) AS top_channel
    FROM support.resource_demands d JOIN catalog.product_models m ON m.id = d.model_id
    LEFT JOIN support.resource_demand_requests q ON q.demand_id = d.id AND q.created_at >= ${f.since} AND q.created_at < ${f.until}
    WHERE (${f.modelId ?? null}::uuid IS NULL OR d.model_id = ${f.modelId ?? null}::uuid)
      AND (${f.resourceType ?? null}::text IS NULL OR d.resource_type = ${f.resourceType ?? null})
      AND (${f.locale ?? null}::text IS NULL OR d.locale = ${f.locale ?? null})
      AND (${f.supportMode ?? null}::text IS NULL OR d.support_mode = ${f.supportMode ?? null})
      AND (${f.status ?? null}::text IS NULL OR d.status = ${f.status ?? null})
      AND d.last_requested_at >= ${f.since}
    GROUP BY d.id, m.display_name, m.ecr_code
    ORDER BY requests DESC, d.last_requested_at DESC LIMIT 300`)];
}

export interface DemandDetail {
  demand: DemandListRow & { model_id: string; fulfilled_resource_id: string | null; fulfilled_flow_id: string | null; fulfilled_at: Date | null };
  requests: { id: string; customer_ref: string; case_id: string | null; case_reference: string | null; session_public_id: string | null; question: string; interpreted: string; interpreted_by: string; locale: string; channel: string; origin: string; had_text_guide: boolean; created_at: Date }[];
  channels: { label: string; value: number }[];
}

export async function demandDetail(sql: Tx, id: string): Promise<DemandDetail | null> {
  const [demand] = await sql<DemandDetail["demand"][]>`
    SELECT d.id, d.requirement, m.display_name AS model, m.ecr_code, d.model_id, d.hardware_revision, d.support_mode, d.scenario_key, d.resource_type, d.locale, d.status,
      (SELECT count(*)::int FROM support.resource_demand_requests q WHERE q.demand_id = d.id) AS requests,
      (SELECT count(DISTINCT q.customer_ref)::int FROM support.resource_demand_requests q WHERE q.demand_id = d.id) AS customers,
      d.first_requested_at, d.last_requested_at, d.fulfilled_resource_id, d.fulfilled_flow_id, d.fulfilled_at, NULL::text AS top_channel
    FROM support.resource_demands d JOIN catalog.product_models m ON m.id = d.model_id WHERE d.id = ${id}`;
  if (!demand) return null;
  const requests = await sql<DemandDetail["requests"]>`
    SELECT q.id, q.customer_ref, q.case_id, c.reference AS case_reference, s.public_id AS session_public_id, q.question, q.interpreted, q.interpreted_by, q.locale, q.channel, q.origin, q.had_text_guide, q.created_at
    FROM support.resource_demand_requests q LEFT JOIN support.cases c ON c.id = q.case_id LEFT JOIN support.sessions s ON s.id = q.session_id
    WHERE q.demand_id = ${id} ORDER BY q.created_at DESC LIMIT 500`;
  const channels = await sql<{ label: string; value: number }[]>`SELECT channel AS label, count(*)::int AS value FROM support.resource_demand_requests WHERE demand_id = ${id} GROUP BY 1 ORDER BY 2 DESC`;
  return { demand, requests: [...requests], channels: [...channels] };
}

/** Group key for callers that need it (tests, dedupe checks). */
export { demandGroupKey };
