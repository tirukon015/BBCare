import "server-only";
import { db } from "@/lib/db";
import type { Locale } from "@/i18n";
import { headingId } from "@/components/markdown";

export interface ArticleCard {
  id: string; slug: string; kind: string; categorySlug: string; title: string; summary: string;
  safetyLevel: "normal" | "caution" | "danger"; locale: Locale; models: string[];
  /** Estimated reading time from the body length (about 180 words a minute), at least one minute. */
  readingMinutes: number;
  publishedAt: string | null;
}

export type ArticleKind = "guide" | "troubleshooting" | "faq" | "reference";
export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 180));

/** Published articles in the requested locale, falling back to the other locale per article. */
export async function listArticles(opts: { locale: Locale; categorySlug?: string; modelId?: string | null; generalOnly?: boolean; limit?: number; kinds?: ArticleKind[]; excludeId?: string | null }): Promise<ArticleCard[]> {
  const kinds = opts.kinds ?? null;
  const rows = await db()<{
    id: string; slug: string; kind: string; category_slug: string; title: string; summary: string; safety_level: "normal" | "caution" | "danger";
    locale: Locale; models: string[] | null; words: number; published_at: string | null;
  }[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.id, a.slug, a.kind, c.slug AS category_slug, r.title, r.summary, r.safety_level, r.locale, r.published_at::text,
        array_length(regexp_split_to_array(r.body_md, '\\s+'), 1) AS words,
        (SELECT array_agg(DISTINCT m.display_name) FROM knowledge.applicability ap JOIN catalog.product_models m ON m.id = ap.model_id WHERE ap.revision_id = r.id) AS models
      FROM knowledge.articles a
      JOIN catalog.categories c ON c.id = a.category_id
      JOIN knowledge.revisions r ON r.article_id = a.id AND r.status = 'published'
      WHERE a.archived_at IS NULL AND c.active
        AND (${opts.categorySlug ?? null}::text IS NULL OR c.slug = ${opts.categorySlug ?? null})
        AND (${kinds}::text[] IS NULL OR a.kind = ANY (${kinds}::text[]))
        AND (${opts.excludeId ?? null}::uuid IS NULL OR a.id <> ${opts.excludeId ?? null}::uuid)
        AND (${opts.modelId ?? null}::uuid IS NULL OR EXISTS (SELECT 1 FROM knowledge.applicability ap WHERE ap.revision_id = r.id AND ap.model_id = ${opts.modelId ?? null}::uuid))
        AND (NOT ${opts.generalOnly ?? false} OR NOT EXISTS (SELECT 1 FROM knowledge.applicability ap WHERE ap.revision_id = r.id AND ap.model_id IS NOT NULL))
      ORDER BY a.id, (r.locale = ${opts.locale}) DESC) x
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${opts.limit ?? 50}`;
  return rows.map((r) => ({
    id: r.id, slug: r.slug, kind: r.kind, categorySlug: r.category_slug, title: r.title, summary: r.summary,
    safetyLevel: r.safety_level, locale: r.locale, models: r.models ?? [], readingMinutes: readingMinutes(r.words ?? 0), publishedAt: r.published_at,
  }));
}

/** Second-level headings of a Markdown body, for a table of contents. Ids match the renderer. */
export function articleHeadings(bodyMd: string): { id: string; text: string }[] {
  return bodyMd.split("\n").flatMap((line) => {
    const h = /^##\s+(.*)$/.exec(line);
    return h ? [{ id: headingId(h[1]!), text: h[1]!.replace(/[*`_]/g, "") }] : [];
  });
}

export interface ArticleDetail extends ArticleCard {
  revisionId: string; bodyMd: string; publishedAt: string | null; localeFallback: boolean;
  sources: { title: string; publisher: string | null; kind: string; locator: string | null }[];
  appliesTo: { modelId: string | null; modelName: string | null; modelSlug: string | null; categoryId: string | null; firmware: string[] | null }[];
}

export async function getArticle(slug: string, locale: Locale): Promise<ArticleDetail | null> {
  const sql = db();
  const [r] = await sql<{
    id: string; slug: string; kind: string; category_slug: string; revision_id: string; title: string; summary: string; body_md: string;
    safety_level: "normal" | "caution" | "danger"; locale: Locale; published_at: string | null;
  }[]>`
    SELECT a.id, a.slug, a.kind, c.slug AS category_slug, r.id AS revision_id, r.title, r.summary, r.body_md, r.safety_level, r.locale,
           r.published_at::text
    FROM knowledge.articles a JOIN catalog.categories c ON c.id = a.category_id
    JOIN knowledge.revisions r ON r.article_id = a.id AND r.status = 'published'
    WHERE a.slug = ${slug} AND a.archived_at IS NULL
    ORDER BY (r.locale = ${locale}) DESC LIMIT 1`;
  if (!r) return null;
  const [sources, appl] = await Promise.all([
    sql<{ title: string; publisher: string | null; kind: string; locator: string | null }[]>`
      SELECT s.title, s.publisher, s.kind, rs.locator FROM knowledge.revision_sources rs JOIN knowledge.sources s ON s.id = rs.source_id
      WHERE rs.revision_id = ${r.revision_id} ORDER BY s.title`,
    sql<{ model_id: string | null; model_name: string | null; model_slug: string | null; category_id: string | null; firmware_versions: string[] | null }[]>`
      SELECT ap.model_id, m.display_name AS model_name, m.slug AS model_slug, ap.category_id, ap.firmware_versions
      FROM knowledge.applicability ap LEFT JOIN catalog.product_models m ON m.id = ap.model_id WHERE ap.revision_id = ${r.revision_id}`,
  ]);
  return {
    id: r.id, slug: r.slug, kind: r.kind, categorySlug: r.category_slug, title: r.title, summary: r.summary, safetyLevel: r.safety_level,
    locale: r.locale, models: appl.filter((a) => a.model_name).map((a) => a.model_name!), revisionId: r.revision_id, bodyMd: r.body_md,
    readingMinutes: readingMinutes(r.body_md.split(/\s+/).length),
    publishedAt: r.published_at, localeFallback: r.locale !== locale,
    sources, appliesTo: appl.map((a) => ({ modelId: a.model_id, modelName: a.model_name, modelSlug: a.model_slug, categoryId: a.category_id, firmware: a.firmware_versions })),
  };
}

export interface FlowOption { key: string; label_en: string; label_ms: string; next?: string | null; outcome?: "resolved" | "resolved_hint" | "escalate" | null }
export interface FlowStep { key: string; isStart: boolean; promptEn: string; promptMs: string; options: FlowOption[]; articleSlug: string | null; safetyLevel: string }
export interface Flow { id: string; slug: string; categorySlug: string; title: string; steps: FlowStep[] }

export async function listFlows(locale: Locale, categorySlug?: string): Promise<{ slug: string; title: string; categorySlug: string }[]> {
  const rows = await db()<{ slug: string; title_en: string; title_ms: string; category_slug: string }[]>`
    SELECT f.slug, f.title_en, f.title_ms, c.slug AS category_slug FROM knowledge.flows f JOIN catalog.categories c ON c.id = f.category_id
    WHERE f.status = 'published' AND (${categorySlug ?? null}::text IS NULL OR c.slug = ${categorySlug ?? null}) ORDER BY f.title_en`;
  return rows.map((r) => ({ slug: r.slug, title: locale === "ms" ? r.title_ms : r.title_en, categorySlug: r.category_slug }));
}

export async function getFlow(slug: string, locale: Locale): Promise<Flow | null> {
  const sql = db();
  const [f] = await sql<{ id: string; slug: string; title_en: string; title_ms: string; category_slug: string }[]>`
    SELECT f.id, f.slug, f.title_en, f.title_ms, c.slug AS category_slug FROM knowledge.flows f JOIN catalog.categories c ON c.id = f.category_id
    WHERE f.slug = ${slug} AND f.status = 'published'`;
  if (!f) return null;
  const steps = await sql<{ step_key: string; is_start: boolean; prompt_en: string; prompt_ms: string; options: FlowOption[]; article_slug: string | null; safety_level: string }[]>`
    SELECT s.step_key, s.is_start, s.prompt_en, s.prompt_ms, s.options, a.slug AS article_slug, s.safety_level
    FROM knowledge.flow_steps s LEFT JOIN knowledge.articles a ON a.id = s.article_id WHERE s.flow_id = ${f.id} ORDER BY s.is_start DESC, s.step_key`;
  return {
    id: f.id, slug: f.slug, categorySlug: f.category_slug, title: locale === "ms" ? f.title_ms : f.title_en,
    steps: steps.map((s) => ({ key: s.step_key, isStart: s.is_start, promptEn: s.prompt_en, promptMs: s.prompt_ms, options: s.options, articleSlug: s.article_slug, safetyLevel: s.safety_level })),
  };
}
