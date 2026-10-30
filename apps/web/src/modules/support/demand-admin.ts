import "server-only";
import {
  DEMAND_STATUSES, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, RESOURCE_TYPES, sanitizeFilename, sha256Hex, sniffFileType, sniffImageType, sniffVideoType,
  type DemandStatus, type ResourceType,
} from "@bbcare/core";
import { demandDetail, demandSummary, fulfilDemandsForResource, listDemands, type DemandFilter } from "@bbcare/db";
import { db } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

/**
 * Staff side of customer demand intelligence. Aggregates need analytics.read. Original customer
 * questions and case links are customer content: they need support.transcripts.read and every
 * detail view is audited. Uploads need sources.upload; approval needs knowledge.publish and a
 * reviewer other than the uploader (also enforced by the database).
 */

export interface FilterInput { model?: string; type?: string; locale?: string; mode?: string; status?: string; from?: string; to?: string }

export function parseFilter(sp: FilterInput): DemandFilter & { days: number } {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? new Date(`${sp.to}T00:00:00Z`) : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? new Date(`${sp.from}T00:00:00Z`) : new Date(to.getTime() - 29 * 86_400_000);
  const since = from <= to ? from : new Date(to.getTime() - 29 * 86_400_000);
  const until = new Date(to.getTime() + 86_400_000);
  return {
    since, until, days: Math.round((until.getTime() - since.getTime()) / 86_400_000),
    modelId: /^[0-9a-f-]{36}$/i.test(sp.model ?? "") ? sp.model! : null,
    resourceType: (RESOURCE_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as ResourceType) : null,
    locale: sp.locale === "en" || sp.locale === "ms" ? sp.locale : null,
    supportMode: sp.mode === "mesh" || sp.mode === "ap" ? sp.mode : null,
    status: (DEMAND_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : null,
  };
}

export async function dashboard(filter: DemandFilter) {
  const sql = db();
  const [summary, demands, models] = await Promise.all([
    demandSummary(sql, filter), listDemands(sql, filter),
    sql<{ id: string; display_name: string; ecr_code: string }[]>`SELECT id, display_name, ecr_code FROM catalog.product_models WHERE ecr_code IS NOT NULL ORDER BY display_name`,
  ]);
  return { summary, demands, models: [...models] };
}

/** Detail with original questions. Audited because it exposes customer content. */
export async function detailForStaff(user: StaffUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const d = await demandDetail(sql, id);
  if (!d) return null;
  const [resources, flows] = await Promise.all([
    sql<{ id: string; kind: string; title_en: string; status: string; locale: string; uploaded_by: string | null; uploader: string | null; created_at: Date }[]>`
      SELECT r.id, r.kind, r.title_en, r.status, r.locale, r.uploaded_by, u.display_name AS uploader, r.created_at
      FROM knowledge.resources r LEFT JOIN identity.users u ON u.id = r.uploaded_by
      WHERE r.model_id = ${d.demand.model_id} AND r.support_mode = ${d.demand.support_mode} AND r.scenario_key = ${d.demand.scenario_key} AND r.kind = ${d.demand.resource_type}
      ORDER BY r.created_at DESC`,
    sql<{ id: string; title_en: string; status: string; verification_status: string }[]>`
      SELECT id, title_en, status, verification_status FROM knowledge.flows WHERE model_id = ${d.demand.model_id} AND support_mode = ${d.demand.support_mode} AND scenario_key = ${d.demand.scenario_key} AND status <> 'archived'`,
  ]);
  await audit({ actorId: user.id, action: "demand.detail_viewed", entityType: "resource_demand", entityId: id, summary: { requests: d.requests.length } });
  return { ...d, resources: [...resources], flows: [...flows] };
}

export async function setDemandStatus(user: StaffUser, id: string, status: DemandStatus) {
  if (status === "approved") return { ok: false as const, reason: "approve_via_resource" };
  await db()`UPDATE support.resource_demands SET status = ${status}, fulfilled_resource_id = NULL, fulfilled_flow_id = NULL, fulfilled_at = NULL WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "demand.status", entityType: "resource_demand", entityId: id, summary: { status } });
  return { ok: true as const };
}

export type UploadResult = { ok: true; resourceId: string } | { ok: false; reason: "size" | "type" | "kind" | "fields" | "scope" };

/**
 * Upload a library resource for a model, mode and scenario. Type is decided by content, size by
 * kind. The resource starts under review and is invisible to customers and the AI until approved.
 */
export async function uploadResource(user: StaffUser, input: {
  kind: string; file: File; titleEn: string; titleMs: string; description?: string; locale: "en" | "ms" | "both"; sourceNote?: string;
  modelId: string; supportMode: "mesh" | "ap"; scenarioKey: string; demandId?: string | null;
}): Promise<UploadResult> {
  const kind = input.kind as ResourceType;
  if (!["video", "diagram", "image", "document"].includes(kind)) return { ok: false, reason: "kind" };
  if (input.titleEn.trim().length < 3 || input.titleMs.trim().length < 3) return { ok: false, reason: "fields" };
  if (input.file.size === 0) return { ok: false, reason: "size" };
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  let mime: string | null = null; let ext = ""; let limit = MAX_IMAGE_BYTES;
  if (kind === "video") { const v = sniffVideoType(bytes); if (v) { mime = `video/${v}`; ext = v; } limit = MAX_VIDEO_BYTES; }
  else if (kind === "document") { const t = sniffFileType(bytes, input.file.name); if (t === "pdf") { mime = "application/pdf"; ext = "pdf"; } limit = MAX_DOCUMENT_BYTES; }
  else { const i = sniffImageType(bytes); if (i) { mime = `image/${i}`; ext = i === "jpeg" ? "jpg" : i; } }
  if (!mime) return { ok: false, reason: "type" };
  if (bytes.length > limit) return { ok: false, reason: "size" };
  const sql = db();
  const [model] = await sql`SELECT 1 FROM catalog.product_models WHERE id = ${input.modelId} AND ecr_code IS NOT NULL`;
  if (!model) return { ok: false, reason: "scope" };
  const key = await putFile(bytes, ext);
  const id = await sql.begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.media_assets (storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by)
      VALUES (${key}, ${sanitizeFilename(input.file.name)}, ${mime}, ${bytes.length}, ${sha256Hex(Buffer.from(bytes))}, ${user.id}) RETURNING id`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.resources (kind, media_asset_id, title_en, title_ms, description, model_id, support_mode, scenario_key, locale, source_note, uploaded_by)
      VALUES (${kind}, ${a!.id}, ${input.titleEn.trim().slice(0, 200)}, ${input.titleMs.trim().slice(0, 200)}, ${input.description?.trim().slice(0, 1000) || null},
        ${input.modelId}, ${input.supportMode}, ${input.scenarioKey}, ${input.locale}, ${input.sourceNote?.trim().slice(0, 500) || null}, ${user.id}) RETURNING id`;
    if (input.demandId && /^[0-9a-f-]{36}$/i.test(input.demandId)) {
      await tx`UPDATE support.resource_demands SET status = 'uploaded' WHERE id = ${input.demandId} AND status <> 'approved'`;
    }
    await audit({ actorId: user.id, action: "resources.upload", entityType: "resource", entityId: r!.id, summary: { kind, mime, bytes: bytes.length, demand: input.demandId ?? null } }, tx);
    return r!.id;
  });
  return { ok: true, resourceId: id };
}

export async function submitResourceForReview(user: StaffUser, resourceId: string) {
  const sql = db();
  await sql`UPDATE support.resource_demands d SET status = 'under_review' FROM knowledge.resources r
    WHERE r.id = ${resourceId} AND d.model_id = r.model_id AND d.support_mode = r.support_mode AND d.scenario_key = r.scenario_key AND d.resource_type = r.kind AND d.status IN ('uploaded', 'in_progress', 'missing', 'requested')`;
  await audit({ actorId: user.id, action: "resources.submitted", entityType: "resource", entityId: resourceId });
}

/** Approve or reject. Approval needs a different person than the uploader; on approval, matching demands are fulfilled. */
export async function reviewResource(user: StaffUser, resourceId: string, decision: "approved" | "rejected", note: string | null) {
  const sql = db();
  const [r] = await sql<{ uploaded_by: string | null; status: string }[]>`SELECT uploaded_by, status FROM knowledge.resources WHERE id = ${resourceId}`;
  if (!r) return { ok: false as const, reason: "not_found" };
  if (decision === "approved" && r.uploaded_by === user.id) return { ok: false as const, reason: "self_review" };
  const fulfilled = await sql.begin(async (tx) => {
    await tx`UPDATE knowledge.resources SET status = ${decision}, reviewed_by = ${user.id}, reviewed_at = now(), review_note = ${note} WHERE id = ${resourceId}`;
    const ids = decision === "approved" ? await fulfilDemandsForResource(tx, resourceId) : [];
    if (decision === "rejected") {
      await tx`UPDATE support.resource_demands d SET status = 'missing' FROM knowledge.resources r
        WHERE r.id = ${resourceId} AND d.model_id = r.model_id AND d.support_mode = r.support_mode AND d.scenario_key = r.scenario_key AND d.resource_type = r.kind AND d.status IN ('uploaded', 'under_review')`;
    }
    await audit({ actorId: user.id, action: "resources.review", entityType: "resource", entityId: resourceId, summary: { decision, fulfilled: ids.length } }, tx);
    return ids;
  });
  return { ok: true as const, fulfilled: fulfilled.length };
}

export async function listResources(status?: string) {
  const s = ["under_review", "approved", "rejected", "archived"].includes(status ?? "") ? status! : null;
  const rows = await db()<{ id: string; kind: string; title_en: string; status: string; locale: string; model: string | null; ecr_code: string | null; support_mode: string | null; scenario_key: string | null; uploaded_by: string | null; uploader: string | null; mime_type: string; size_bytes: number; created_at: Date; up: number; down: number; opens: number }[]>`
    SELECT r.id, r.kind, r.title_en, r.status, r.locale, m.display_name AS model, m.ecr_code, r.support_mode, r.scenario_key, r.uploaded_by, u.display_name AS uploader, a.mime_type, a.size_bytes::int, r.created_at,
      (SELECT count(*)::int FROM support.feedback f WHERE f.resource_id = r.id AND f.rating = 1) AS up,
      (SELECT count(*)::int FROM support.feedback f WHERE f.resource_id = r.id AND f.rating = -1) AS down,
      (SELECT count(*)::int FROM analytics.events e WHERE e.name = 'resource_open' AND e.props->>'resource_id' = r.id::text) AS opens
    FROM knowledge.resources r JOIN knowledge.media_assets a ON a.id = r.media_asset_id
    LEFT JOIN catalog.product_models m ON m.id = r.model_id LEFT JOIN identity.users u ON u.id = r.uploaded_by
    WHERE (${s}::text IS NULL OR r.status = ${s}) ORDER BY r.created_at DESC LIMIT 200`;
  return [...rows];
}
