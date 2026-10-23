import type { Metadata } from "next";
import Link from "next/link";
import { classifyResolution, resolveModels, searchKnowledge } from "@bbcare/db";
import { getDictionary, localeOrDefault } from "@/i18n";
import { db } from "@/lib/db";
import { getCategory } from "@/modules/catalog/service";
import { recordUnresolved } from "@/modules/support/gaps";
import { SearchForm } from "@/components/search-form";
import { TrackOnMount } from "@/components/track-on-mount";
import { Badge, ButtonLink, Container, Notice, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).search.title, robots: { index: false } };
}

/** ts_headline marks matches with << >>; split into plain and highlighted segments. */
function segments(text: string): { text: string; mark: boolean }[] {
  return text.split(/(<<[^>]*>>)/).filter(Boolean).map((p) => (p.startsWith("<<") && p.endsWith(">>") ? { text: p.slice(2, -2), mark: true } : { text: p, mark: false }));
}

function Snippet({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s, i) => (s.mark ? <mark key={i} className="bg-olive-soft text-ink">{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; c?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const catSlug = sp.c === "router" || sp.c === "laptop" ? sp.c : undefined;
  const category = catSlug ? await getCategory(catSlug, locale) : null;

  const models = q ? await resolveModels(db(), q, { categorySlug: catSlug }) : [];
  const resolution = classifyResolution(models);
  const resolved = resolution === "resolved" ? models[0]! : null;
  const hits = q
    ? await searchKnowledge(db(), { query: q, locale, categoryId: category?.id ?? (resolved ? resolved.categoryId : null), modelId: resolved?.id ?? null, limit: 15 })
    : [];
  if (q && hits.length === 0) await recordUnresolved({ query: q, locale, source: "no_results", categoryId: category?.id ?? null, modelId: resolved?.id ?? null });

  return (
    <Container className="py-8">
      <h1 className="text-2xl font-bold">{t.search.title}</h1>
      <div className="mt-4 max-w-2xl"><SearchForm locale={locale} t={t} defaultValue={q} category={catSlug} /></div>
      {q ? (
        <TrackOnMount
          name={hits.length ? "model_search" : "search_no_results"}
          props={hits.length ? { query: q, result_count: hits.length, category: catSlug ?? "all", ...(resolved ? { resolved_model_id: resolved.id } : {}) } : { query: q, category: catSlug ?? "all" }}
        />
      ) : null}

      {models.length > 0 ? (
        <section className="mt-8" aria-labelledby="models">
          <SectionHeading id="models">{resolution === "ambiguous" ? t.search.didYouMean : t.search.modelsFound}</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {models.slice(0, 5).map((m) => (
              <li key={m.id}>
                <Link href={`/${locale}/models/${m.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm hover:border-olive" data-track="search.model">
                  <span className="font-medium">{m.displayName}</span><span className="text-muted">{m.modelNumber}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {q ? (
        <section className="mt-8" aria-labelledby="results" aria-live="polite">
          <SectionHeading id="results">{t.search.resultsFor} &ldquo;{q}&rdquo;</SectionHeading>
          {hits.length === 0 ? (
            <div className="space-y-3">
              <Notice>{t.search.noResults} {t.search.noResultsHelp}</Notice>
              <ButtonLink href={`/${locale}/support`} variant="secondary">{t.nav.support}</ButtonLink>
            </div>
          ) : (
            <>
              {hits[0]?.localeFallback ? <div className="mb-3"><Notice>{t.search.fallback}</Notice></div> : null}
              <ol className="space-y-3">
                {hits.map((h) => (
                  <li key={h.articleId} className="rounded-[var(--radius-card)] border border-line bg-white p-4">
                    <Link href={`/${locale}/articles/${h.articleSlug}`} className="text-lg font-semibold text-ink hover:text-olive" data-track="search.result">{h.title}</Link>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {h.appliesToModels.length ? <Badge tone="olive">{h.appliesToModels.join(", ")}</Badge> : null}
                      {h.safetyLevel !== "normal" ? <Badge tone={h.safetyLevel === "danger" ? "danger" : "warn"}>!</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-ink-soft" lang={h.locale}><Snippet text={h.snippet} /></p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      ) : null}
    </Container>
  );
}
