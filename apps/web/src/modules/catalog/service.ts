import "server-only";
import { db } from "@/lib/db";
import type { Locale } from "@/i18n";

export const CATEGORY_PATHS = { routers: "router", laptops: "laptop" } as const;
export type CategoryPath = keyof typeof CATEGORY_PATHS;
export const categoryPathFor = (slug: string): CategoryPath => (slug === "laptop" ? "laptops" : "routers");

export interface Category { id: string; slug: string; name: string; nameEn: string; nameMs: string }

export async function listCategories(locale: Locale): Promise<Category[]> {
  const rows = await db()<{ id: string; slug: string; name_en: string; name_ms: string }[]>`
    SELECT id, slug, name_en, name_ms FROM catalog.categories WHERE active ORDER BY sort_order`;
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: locale === "ms" ? r.name_ms : r.name_en, nameEn: r.name_en, nameMs: r.name_ms }));
}

export async function getCategory(slug: string, locale: Locale): Promise<Category | null> {
  return (await listCategories(locale)).find((c) => c.slug === slug) ?? null;
}

export interface ModelSummary {
  id: string; slug: string; displayName: string; modelNumber: string; brand: string; brandSlug: string;
  categorySlug: string; summary: string | null; year: number | null; status: string;
}

export async function listModels(categorySlug: string, locale: Locale, brandSlug?: string): Promise<ModelSummary[]> {
  const rows = await db()<{
    id: string; slug: string; display_name: string; model_number: string; brand: string; brand_slug: string;
    category_slug: string; summary_en: string | null; summary_ms: string | null; released_year: number | null; status: string;
  }[]>`
    SELECT m.id, m.slug, m.display_name, m.model_number, b.name AS brand, b.slug AS brand_slug, c.slug AS category_slug,
           m.summary_en, m.summary_ms, m.released_year, m.status
    FROM catalog.product_models m
    JOIN catalog.brands b ON b.id = m.brand_id
    JOIN catalog.categories c ON c.id = m.category_id
    WHERE c.slug = ${categorySlug} AND m.status <> 'hidden' AND (${brandSlug ?? null}::text IS NULL OR b.slug = ${brandSlug ?? null})
    ORDER BY b.name, m.display_name
    LIMIT 500`;
  return rows.map((r) => ({
    id: r.id, slug: r.slug, displayName: r.display_name, modelNumber: r.model_number, brand: r.brand, brandSlug: r.brand_slug,
    categorySlug: r.category_slug, summary: locale === "ms" ? (r.summary_ms ?? r.summary_en) : r.summary_en, year: r.released_year, status: r.status,
  }));
}

export interface ModelDetail extends ModelSummary {
  categoryId: string;
  variants: { id: string; label: string; hardwareRevision: string | null; region: string | null }[];
  firmware: { version: string; releasedOn: string | null; variant: string | null }[];
  aliases: string[];
}

export async function getModel(slug: string, locale: Locale): Promise<ModelDetail | null> {
  const sql = db();
  const [m] = await sql<{
    id: string; slug: string; display_name: string; model_number: string; brand: string; brand_slug: string; category_id: string;
    category_slug: string; summary_en: string | null; summary_ms: string | null; released_year: number | null; status: string;
  }[]>`
    SELECT m.id, m.slug, m.display_name, m.model_number, b.name AS brand, b.slug AS brand_slug, c.id AS category_id, c.slug AS category_slug,
           m.summary_en, m.summary_ms, m.released_year, m.status
    FROM catalog.product_models m JOIN catalog.brands b ON b.id = m.brand_id JOIN catalog.categories c ON c.id = m.category_id
    WHERE m.slug = ${slug} AND m.status <> 'hidden'`;
  if (!m) return null;
  const [variants, firmware, aliases] = await Promise.all([
    sql<{ id: string; label: string; hardware_revision: string | null; region: string | null }[]>`
      SELECT id, label, hardware_revision, region FROM catalog.product_variants WHERE model_id = ${m.id} ORDER BY label`,
    sql<{ version: string; released_on: string | null; variant: string | null }[]>`
      SELECT f.version, f.released_on::text, v.label AS variant FROM catalog.firmware_versions f
      LEFT JOIN catalog.product_variants v ON v.id = f.variant_id WHERE f.model_id = ${m.id} ORDER BY f.version DESC`,
    sql<{ alias: string }[]>`SELECT alias FROM catalog.model_aliases WHERE model_id = ${m.id} ORDER BY alias`,
  ]);
  return {
    id: m.id, slug: m.slug, displayName: m.display_name, modelNumber: m.model_number, brand: m.brand, brandSlug: m.brand_slug,
    categoryId: m.category_id, categorySlug: m.category_slug, summary: locale === "ms" ? (m.summary_ms ?? m.summary_en) : m.summary_en,
    year: m.released_year, status: m.status,
    variants: variants.map((v) => ({ id: v.id, label: v.label, hardwareRevision: v.hardware_revision, region: v.region })),
    firmware: firmware.map((f) => ({ version: f.version, releasedOn: f.released_on, variant: f.variant })),
    aliases: aliases.map((a) => a.alias),
  };
}

export async function listBrands(categorySlug: string): Promise<{ slug: string; name: string; models: number }[]> {
  return [...(await db()<{ slug: string; name: string; models: number }[]>`
    SELECT b.slug, b.name, count(m.id)::int AS models FROM catalog.brands b
    JOIN catalog.product_models m ON m.brand_id = b.id AND m.status <> 'hidden' JOIN catalog.categories c ON c.id = m.category_id
    WHERE c.slug = ${categorySlug} AND c.active AND b.active GROUP BY b.slug, b.name ORDER BY b.name`)];
}

/** Other visible models of the same brand and category. */
export async function listRelatedModels(model: Pick<ModelSummary, "id" | "brandSlug" | "categorySlug">, locale: Locale, limit = 6): Promise<ModelSummary[]> {
  return (await listModels(model.categorySlug, locale, model.brandSlug)).filter((m) => m.id !== model.id).slice(0, limit);
}
