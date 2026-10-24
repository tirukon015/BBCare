import "server-only";
import { MAX_IMAGE_BYTES, normalizeModelNumber, sanitizeFilename, sha256Hex, sniffImageType } from "@bbcare/core";
import { db } from "@/lib/db";
import { putFile } from "@/lib/storage";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export async function listModelsAdmin(categorySlug?: string) {
  return db()<{ id: string; slug: string; display_name: string; model_number: string; brand: string; category: string; status: string; aliases: number; articles: number }[]>`
    SELECT m.id, m.slug, m.display_name, m.model_number, b.name AS brand, c.name_en AS category, m.status,
      (SELECT count(*)::int FROM catalog.model_aliases a WHERE a.model_id = m.id) AS aliases,
      (SELECT count(DISTINCT r.article_id)::int FROM knowledge.applicability ap JOIN knowledge.revisions r ON r.id = ap.revision_id AND r.status = 'published' WHERE ap.model_id = m.id) AS articles
    FROM catalog.product_models m JOIN catalog.brands b ON b.id = m.brand_id JOIN catalog.categories c ON c.id = m.category_id
    WHERE (${categorySlug ?? null}::text IS NULL OR c.slug = ${categorySlug ?? null})
    ORDER BY c.sort_order, b.name, m.display_name LIMIT 1000`;
}

export async function listBrandsAdmin() {
  return db()<{ id: string; slug: string; name: string; active: boolean }[]>`SELECT id, slug, name, active FROM catalog.brands ORDER BY name`;
}

export async function createBrand(user: StaffUser, name: string, slug: string) {
  const [b] = await db()<{ id: string }[]>`INSERT INTO catalog.brands (name, slug) VALUES (${name}, ${slug}) RETURNING id`;
  await audit({ actorId: user.id, action: "catalog.brand_create", entityType: "brand", entityId: b!.id, summary: { slug } });
  return b!.id;
}

export async function createModel(user: StaffUser, input: { brandId: string; categoryId: string; modelNumber: string; displayName: string; slug: string; summaryEn?: string; summaryMs?: string; year?: number }) {
  const [m] = await db()<{ id: string }[]>`
    INSERT INTO catalog.product_models (brand_id, category_id, model_number, normalized, slug, display_name, summary_en, summary_ms, released_year)
    VALUES (${input.brandId}, ${input.categoryId}, ${input.modelNumber}, ${normalizeModelNumber(input.modelNumber)}, ${input.slug}, ${input.displayName},
            ${input.summaryEn ?? null}, ${input.summaryMs ?? null}, ${input.year ?? null}) RETURNING id`;
  await audit({ actorId: user.id, action: "catalog.model_create", entityType: "model", entityId: m!.id, summary: { slug: input.slug } });
  return m!.id;
}

export async function getModelAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [m] = await sql<{ id: string; slug: string; display_name: string; model_number: string; brand: string; category: string; status: string; summary_en: string | null; summary_ms: string | null; released_year: number | null }[]>`
    SELECT m.id, m.slug, m.display_name, m.model_number, b.name AS brand, c.name_en AS category, m.status, m.summary_en, m.summary_ms, m.released_year
    FROM catalog.product_models m JOIN catalog.brands b ON b.id = m.brand_id JOIN catalog.categories c ON c.id = m.category_id WHERE m.id = ${id}`;
  if (!m) return null;
  const [aliases, variants, firmware] = await Promise.all([
    sql<{ id: string; alias: string }[]>`SELECT id, alias FROM catalog.model_aliases WHERE model_id = ${id} ORDER BY alias`,
    sql<{ id: string; label: string; hardware_revision: string | null; region: string | null; sku: string | null }[]>`SELECT id, label, hardware_revision, region, sku FROM catalog.product_variants WHERE model_id = ${id} ORDER BY label`,
    sql<{ id: string; version: string; released_on: string | null; notes: string | null; variant: string | null }[]>`
      SELECT f.id, f.version, f.released_on::text, f.notes, v.label AS variant FROM catalog.firmware_versions f LEFT JOIN catalog.product_variants v ON v.id = f.variant_id WHERE f.model_id = ${id} ORDER BY f.version DESC`,
  ]);
  return { ...m, aliases, variants, firmware };
}

export async function updateModel(user: StaffUser, id: string, input: { displayName: string; status: string; summaryEn: string; summaryMs: string; year: number | null }) {
  // The seven router models keep the exact name supplied by BBTech: names of models with an ECR code are not editable here.
  await db()`UPDATE catalog.product_models SET display_name = CASE WHEN ecr_code IS NULL THEN ${input.displayName} ELSE display_name END, status = ${input.status}, summary_en = ${input.summaryEn || null}, summary_ms = ${input.summaryMs || null}, released_year = ${input.year} WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "catalog.model_update", entityType: "model", entityId: id, summary: { status: input.status } });
}

export async function addAlias(user: StaffUser, modelId: string, alias: string) {
  await db()`INSERT INTO catalog.model_aliases (model_id, alias, normalized) VALUES (${modelId}, ${alias}, ${normalizeModelNumber(alias)}) ON CONFLICT DO NOTHING`;
  await audit({ actorId: user.id, action: "catalog.alias_add", entityType: "model", entityId: modelId, summary: { alias } });
}

export async function removeAlias(user: StaffUser, aliasId: string) {
  const [a] = await db()<{ model_id: string }[]>`DELETE FROM catalog.model_aliases WHERE id = ${aliasId} RETURNING model_id`;
  if (a) await audit({ actorId: user.id, action: "catalog.alias_remove", entityType: "model", entityId: a.model_id });
}

export async function addVariant(user: StaffUser, modelId: string, v: { label: string; hardwareRevision?: string; region?: string; sku?: string }) {
  await db()`INSERT INTO catalog.product_variants (model_id, label, hardware_revision, region, sku) VALUES (${modelId}, ${v.label}, ${v.hardwareRevision ?? null}, ${v.region ?? null}, ${v.sku ?? null})`;
  await audit({ actorId: user.id, action: "catalog.variant_add", entityType: "model", entityId: modelId, summary: { label: v.label } });
}

export async function addFirmware(user: StaffUser, modelId: string, f: { version: string; releasedOn?: string; notes?: string }) {
  await db()`INSERT INTO catalog.firmware_versions (model_id, version, released_on, notes) VALUES (${modelId}, ${f.version}, ${f.releasedOn || null}, ${f.notes ?? null}) ON CONFLICT DO NOTHING`;
  await audit({ actorId: user.id, action: "catalog.firmware_add", entityType: "model", entityId: modelId, summary: { version: f.version } });
}

/**
 * Upload a product photo for a router model. A new upload clears any previous verification:
 * the photo is not public until a reviewer confirms it shows the exact model.
 */
export async function uploadModelImage(user: StaffUser, modelId: string, file: File, sourceUrl: string | null) {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false as const, reason: "size" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return { ok: false as const, reason: "type" };
  const key = await putFile(bytes, type === "jpeg" ? "jpg" : type);
  const sql = db();
  return sql.begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.media_assets (storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by)
      VALUES (${key}, ${sanitizeFilename(file.name)}, ${`image/${type}`}, ${bytes.length}, ${sha256Hex(Buffer.from(bytes))}, ${user.id}) RETURNING id`;
    await tx`UPDATE catalog.product_models SET image_asset_id = ${a!.id}, image_source_url = ${sourceUrl}, image_verified_by = NULL, image_verified_at = NULL WHERE id = ${modelId} AND ecr_code IS NOT NULL`;
    await audit({ actorId: user.id, action: "catalog.model_image_upload", entityType: "model", entityId: modelId, summary: { source: sourceUrl } }, tx);
    return { ok: true as const };
  });
}

/** Reviewer confirms the uploaded photo shows the exact model. The uploader cannot verify their own upload. */
export async function verifyModelImage(user: StaffUser, modelId: string, verified: boolean) {
  const sql = db();
  const [m] = await sql<{ uploaded_by: string | null }[]>`
    SELECT a.uploaded_by FROM catalog.product_models m JOIN knowledge.media_assets a ON a.id = m.image_asset_id WHERE m.id = ${modelId}`;
  if (!m) return { ok: false as const, reason: "no_image" };
  if (verified && m.uploaded_by === user.id) return { ok: false as const, reason: "self_verify" };
  await sql`UPDATE catalog.product_models SET image_verified_by = ${verified ? user.id : null}, image_verified_at = ${verified ? new Date() : null} WHERE id = ${modelId}`;
  await audit({ actorId: user.id, action: verified ? "catalog.model_image_verify" : "catalog.model_image_unverify", entityType: "model", entityId: modelId });
  return { ok: true as const };
}

export async function routerCoverage() {
  const sql = db();
  const models = await sql<{ id: string; ecr_code: string; display_name: string; identity_status: string; identity_note: string | null; image_asset_id: string | null; image_verified_at: Date | null; image_source_url: string | null }[]>`
    SELECT id, ecr_code, display_name, identity_status, identity_note, image_asset_id, image_verified_at, image_source_url
    FROM catalog.product_models WHERE ecr_code IS NOT NULL
    ORDER BY array_position(ARRAY['AX20','EX5','EX2','EX8','EB4','KAO','HUA']::text[], ecr_code)`;
  const flows = await sql<{ id: string; model_id: string; support_mode: string; scenario_key: string; status: string; verification_status: string }[]>`
    SELECT id, model_id, support_mode, scenario_key, status, verification_status FROM knowledge.flows WHERE model_id IS NOT NULL AND status <> 'archived'`;
  return { models, flows };
}
