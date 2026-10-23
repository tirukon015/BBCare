import { buildTsQuery, extractModelCandidates, normalizeForSearch, normalizeModelNumber } from "@bbcare/core";
import type { Sql } from "../client";

export interface ModelCandidate {
  id: string;
  slug: string;
  displayName: string;
  modelNumber: string;
  brandName: string;
  categoryId: string;
  categorySlug: string;
  score: number;
  matchedBy: "exact" | "alias" | "fuzzy";
}

/**
 * Resolve product models mentioned in free text. Exact normalized matches win; otherwise
 * trigram similarity over model numbers and aliases. Several close candidates mean the
 * caller should ask the customer to choose.
 */
export async function resolveModels(
  sql: Sql,
  text: string,
  opts: { categorySlug?: string | null; limit?: number } = {},
): Promise<ModelCandidate[]> {
  const tokens = extractModelCandidates(text);
  const whole = normalizeModelNumber(text);
  const probes = [...new Set([...tokens, ...(whole.length >= 3 && whole.length <= 24 ? [whole] : [])])];
  if (probes.length === 0) return [];
  const limit = opts.limit ?? 5;
  const maxLen = Math.max(...probes.map((p) => p.length));
  const category = opts.categorySlug ?? null;
  const rows = await sql<
    {
      id: string; slug: string; display_name: string; model_number: string; brand_name: string;
      category_id: string; category_slug: string; score: number; matched_by: "exact" | "alias" | "fuzzy";
    }[]
  >`
    WITH probes AS (SELECT p, (${maxLen}::int - length(p)) * 0.01 AS penalty FROM unnest(${probes}::text[]) AS p),
    hits AS (
      SELECT m.id, CASE WHEN m.normalized = p.p THEN 1.0 - p.penalty ELSE similarity(m.normalized, p.p) END AS score,
             CASE WHEN m.normalized = p.p THEN 'exact' ELSE 'fuzzy' END AS matched_by
      FROM catalog.product_models m, probes p
      WHERE m.status <> 'hidden' AND (m.normalized = p.p OR m.normalized % p.p OR (length(p.p) >= 4 AND m.normalized LIKE '%' || p.p || '%'))
      UNION ALL
      SELECT a.model_id, CASE WHEN a.normalized = p.p THEN 0.98 - p.penalty
                              WHEN length(p.p) >= 6 AND a.normalized LIKE p.p || '%' THEN 0.85 - p.penalty
                              ELSE similarity(a.normalized, p.p) * 0.95 END,
             CASE WHEN a.normalized = p.p THEN 'alias' WHEN length(p.p) >= 6 AND a.normalized LIKE p.p || '%' THEN 'alias' ELSE 'fuzzy' END
      FROM catalog.model_aliases a, probes p
      WHERE a.normalized = p.p OR a.normalized % p.p OR (length(p.p) >= 6 AND a.normalized LIKE p.p || '%')
    ),
    best AS (
      SELECT DISTINCT ON (id) id, score, matched_by FROM hits ORDER BY id, score DESC
    )
    SELECT m.id, m.slug, m.display_name, m.model_number, b.name AS brand_name, c.id AS category_id, c.slug AS category_slug,
           best.score::float8 AS score, best.matched_by
    FROM best
    JOIN catalog.product_models m ON m.id = best.id
    JOIN catalog.brands b ON b.id = m.brand_id
    JOIN catalog.categories c ON c.id = m.category_id
    WHERE (${category}::text IS NULL OR c.slug = ${category})
    ORDER BY best.score DESC, m.display_name
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id, slug: r.slug, displayName: r.display_name, modelNumber: r.model_number, brandName: r.brand_name,
    categoryId: r.category_id, categorySlug: r.category_slug, score: Number(r.score), matchedBy: r.matched_by,
  }));
}

/** Decide whether resolution is confident, ambiguous, or empty. */
export function classifyResolution(cands: ModelCandidate[]): "resolved" | "ambiguous" | "none" {
  if (cands.length === 0) return "none";
  const [top, second] = cands;
  if (top!.matchedBy !== "fuzzy" && (!second || second.score < top!.score)) return "resolved";
  if (top!.score >= 0.75 && (!second || top!.score - second.score >= 0.2)) return "resolved";
  return "ambiguous";
}

export interface SearchContext {
  query: string;
  locale: "en" | "ms";
  categoryId?: string | null;
  modelId?: string | null;
  variantId?: string | null;
  firmware?: string | null;
  /** When true, model-specific articles for other or unknown models are excluded (chat). */
  strictApplicability?: boolean;
  limit?: number;
}

export interface SearchHit {
  articleId: string;
  articleSlug: string;
  articleKind: string;
  categorySlug: string;
  revisionId: string;
  locale: "en" | "ms";
  title: string;
  summary: string;
  safetyLevel: "normal" | "caution" | "danger";
  chunkId: string;
  heading: string;
  snippet: string;
  rank: number;
  matchLevel: "exact" | "model" | "category";
  appliesToModels: string[];
  localeFallback: boolean;
}

/**
 * Lexical search over published revisions only. Applicability is evaluated in SQL:
 * - category-level rows match when the category matches or no category filter is given;
 * - model-level rows match the given model; in non-strict mode they also match when no model is given.
 */
export async function searchKnowledge(sql: Sql, ctx: SearchContext): Promise<SearchHit[]> {
  const tsq = buildTsQuery(ctx.query);
  if (!tsq) return [];
  const normalized = normalizeForSearch(ctx.query);
  const limit = Math.min(ctx.limit ?? 10, 50);
  const strict = ctx.strictApplicability ?? false;
  const run = async (locale: "en" | "ms") =>
    sql<
      {
        article_id: string; slug: string; kind: string; category_slug: string; revision_id: string; locale: "en" | "ms";
        title: string; summary: string; safety_level: "normal" | "caution" | "danger"; chunk_id: string; heading: string;
        snippet: string; rank: number; match_level: "exact" | "model" | "category"; models: string[] | null;
      }[]
    >`
      WITH q AS (SELECT to_tsquery('public.bbcare', ${tsq}) AS q),
      eligible AS (
        SELECT r.id AS revision_id,
               MAX(CASE
                     WHEN ap.model_id IS NOT NULL AND ap.model_id = ${ctx.modelId ?? null}::uuid
                          AND (ap.variant_id IS NULL OR ap.variant_id = ${ctx.variantId ?? null}::uuid)
                          AND (ap.firmware_versions IS NULL OR ${ctx.firmware ?? null}::text = ANY (ap.firmware_versions)) THEN 3
                     WHEN ap.model_id IS NOT NULL AND ${ctx.modelId ?? null}::uuid IS NULL AND NOT ${strict} THEN 2
                     WHEN ap.model_id IS NULL AND (${ctx.categoryId ?? null}::uuid IS NULL OR ap.category_id = ${ctx.categoryId ?? null}::uuid) THEN 1
                     ELSE 0 END) AS level
        FROM knowledge.revisions r
        JOIN knowledge.articles a ON a.id = r.article_id AND a.archived_at IS NULL
        JOIN knowledge.applicability ap ON ap.revision_id = r.id
        WHERE r.status = 'published' AND r.locale = ${locale}
        GROUP BY r.id
      ),
      ranked AS (
        SELECT c.id AS chunk_id, c.revision_id, c.heading, c.content,
               ts_rank_cd(c.tsv, q.q, 32) + 0.3 * similarity(c.search_text, ${normalized}) + 0.05 * e.level AS rank,
               e.level
        FROM knowledge.chunks c
        JOIN eligible e ON e.revision_id = c.revision_id AND e.level > 0
        CROSS JOIN q
        WHERE c.tsv @@ q.q
      ),
      best AS (
        SELECT DISTINCT ON (r.article_id) rk.*, r.article_id
        FROM ranked rk JOIN knowledge.revisions r ON r.id = rk.revision_id
        ORDER BY r.article_id, rk.rank DESC
      )
      SELECT a.id AS article_id, a.slug, a.kind, cat.slug AS category_slug, r.id AS revision_id, r.locale, r.title, r.summary,
             r.safety_level, b.chunk_id, b.heading,
             ts_headline('public.bbcare', b.content, (SELECT q FROM q), 'MaxWords=40, MinWords=15, StartSel=<<, StopSel=>>') AS snippet,
             b.rank::float8 AS rank,
             CASE b.level WHEN 3 THEN 'exact' WHEN 2 THEN 'model' ELSE 'category' END AS match_level,
             (SELECT array_agg(DISTINCT m.display_name) FROM knowledge.applicability ap JOIN catalog.product_models m ON m.id = ap.model_id WHERE ap.revision_id = r.id) AS models
      FROM best b
      JOIN knowledge.revisions r ON r.id = b.revision_id
      JOIN knowledge.articles a ON a.id = r.article_id
      JOIN catalog.categories cat ON cat.id = a.category_id
      ORDER BY b.rank DESC
      LIMIT ${limit}`;
  let rows = [...(await run(ctx.locale))];
  let fallback = false;
  if (rows.length === 0) {
    rows = [...(await run(ctx.locale === "en" ? "ms" : "en"))];
    fallback = rows.length > 0;
  }
  const top = rows[0] ? Number(rows[0].rank) : 0;
  rows = rows.filter((r) => Number(r.rank) >= top * 0.4);
  return rows.map((r) => ({
    articleId: r.article_id, articleSlug: r.slug, articleKind: r.kind, categorySlug: r.category_slug,
    revisionId: r.revision_id, locale: r.locale, title: r.title, summary: r.summary, safetyLevel: r.safety_level,
    chunkId: r.chunk_id, heading: r.heading, snippet: r.snippet, rank: Number(r.rank),
    matchLevel: r.match_level, appliesToModels: r.models ?? [], localeFallback: fallback,
  }));
}
