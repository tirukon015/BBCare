import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { classifyResolution, resolveModels, searchKnowledge, type SearchHit } from "@bbcare/db";
import { getDictionary, localeOrDefault } from "@/i18n";
import { db } from "@/lib/db";
import { getCategory } from "@/modules/catalog/service";
import { readingMinutes } from "@/modules/knowledge/service";
import { recordUnresolved } from "@/modules/support/gaps";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { SearchForm } from "@/components/search-form";
import { Breadcrumbs, EmptyState } from "@/components/site-cards";
import { TrackOnMount } from "@/components/track-on-mount";
import { Badge, ButtonLink, Container, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).site.search.heading, robots: { index: false } };
}

/** ts_headline marks matches with << >>; split into plain and highlighted segments. */
function segments(text: string): { text: string; mark: boolean }[] {
  return text.split(/(<<[^>]*>>)/).filter(Boolean).map((p) => (p.startsWith("<<") && p.endsWith(">>") ? { text: p.slice(2, -2), mark: true } : { text: p, mark: false }));
}
function Snippet({ text }: { text: string }) {
  return <>{segments(text).map((s, i) => (s.mark ? <mark key={i} className="rounded bg-primary-soft px-0.5 text-ink">{s.text}</mark> : <span key={i}>{s.text}</span>))}</>;
}

type Filter = "all" | "troubleshooting" | "guides" | "products";
const GUIDE_KINDS = new Set(["guide", "faq", "reference"]);

/** Search over published knowledge and the catalogue, with result-type filters. The same engine the assistant uses. */
export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; c?: string; f?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site.search;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const catSlug = sp.c === "router" || sp.c === "laptop" ? sp.c : undefined;
  const filter: Filter = sp.f === "troubleshooting" || sp.f === "guides" || sp.f === "products" ? sp.f : "all";
  const category = catSlug ? await getCategory(catSlug, locale) : null;

  const models = q ? await resolveModels(db(), q, { categorySlug: catSlug }) : [];
  const resolution = classifyResolution(models);
  const resolved = resolution === "resolved" ? models[0]! : null;
  const hits: SearchHit[] = q
    ? await searchKnowledge(db(), { query: q, locale, categoryId: category?.id ?? (resolved ? resolved.categoryId : null), modelId: resolved?.id ?? null, limit: 24 })
    : [];
  if (q && hits.length === 0 && models.length === 0) await recordUnresolved({ query: q, locale, source: "no_results", categoryId: category?.id ?? null, modelId: resolved?.id ?? null });

  const troubleshooting = hits.filter((h) => h.articleKind === "troubleshooting");
  const guides = hits.filter((h) => GUIDE_KINDS.has(h.articleKind));
  const counts = { all: hits.length + models.length, troubleshooting: troubleshooting.length, guides: guides.length, products: models.length };
  const shownHits = filter === "troubleshooting" ? troubleshooting : filter === "guides" ? guides : filter === "products" ? [] : hits;
  const shownModels = filter === "all" || filter === "products" ? models : [];
  const href = (f: Filter) => `/${locale}/search?q=${encodeURIComponent(q)}${catSlug ? `&c=${catSlug}` : ""}${f === "all" ? "" : `&f=${f}`}`;
  const kindLabel = (k: string) => s.kinds[k as keyof typeof s.kinds] ?? k;
  const supportHref = `/${locale}/support${resolved ? `?model=${resolved.slug}` : ""}`;

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ href: `/${locale}`, label: t.site.nav.home }, { label: s.heading }]} />
      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{s.heading}</h1>
      <div className="mt-4 max-w-2xl"><SearchForm locale={locale} t={t} defaultValue={q} category={catSlug} size="lg" /></div>
      {q ? (
        <TrackOnMount name={hits.length ? "model_search" : "search_no_results"}
          props={hits.length ? { query: q, result_count: hits.length, category: catSlug ?? "all", ...(resolved ? { resolved_model_id: resolved.id } : {}) } : { query: q, category: catSlug ?? "all" }} />
      ) : null}

      {!q ? <p className="mt-6 text-sm text-muted">{s.start}</p> : (
        <>
          <nav aria-label={s.heading} className="mt-6 flex gap-1 overflow-x-auto border-b border-line text-sm" data-testid="search-filters">
            {(["all", "troubleshooting", "guides", "products"] as Filter[]).map((f) => (
              <Link key={f} href={href(f)} aria-current={filter === f ? "page" : undefined}
                className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 font-medium", filter === f ? "border-primary text-primary-dark" : "border-transparent text-ink-soft hover:text-ink")}>
                {s[f]} <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">{counts[f]}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
            <div>
              {shownModels.length > 0 ? (
                <section className="mb-6" aria-labelledby="models">
                  <h2 id="models" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{resolution === "ambiguous" ? t.search.didYouMean : t.search.modelsFound}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {shownModels.slice(0, 6).map((m) => (
                      <li key={m.id}>
                        <Link href={`/${locale}/models/${m.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm hover:border-primary" data-track="search.model">
                          <span className="font-medium">{m.displayName}</span><span className="text-muted">{m.modelNumber}</span><ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section aria-labelledby="results" aria-live="polite">
                <h2 id="results" className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t.search.resultsFor} &ldquo;{q}&rdquo; · {counts[filter]} {s.results}</h2>
                {shownHits.length === 0 && shownModels.length === 0 ? (
                  hits.length === 0 && models.length === 0 ? (
                    <EmptyState title={t.search.noResults} body={t.search.noResultsHelp}>
                      <OpenAssistantButton label={s.nextAi} />
                      <ButtonLink href={supportHref} variant="secondary">{s.nextStaff}</ButtonLink>
                    </EmptyState>
                  ) : <p className="text-sm text-muted">{s.noneInFilter}</p>
                ) : (
                  <ul className="space-y-3" data-testid="search-results">
                    {shownHits.map((h) => (
                      <li key={h.chunkId}>
                        <Link href={`/${locale}/articles/${h.articleSlug}`} data-track="search.result"
                          className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary">
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge tone="primary">{kindLabel(h.articleKind)}</Badge>
                              <span className="uppercase tracking-wide text-muted">{h.categorySlug === "laptop" ? t.site.nav.laptops : t.site.nav.routers}</span>
                              {h.locale !== locale ? <Badge>{h.locale.toUpperCase()}</Badge> : null}
                            </span>
                            <span className="mt-1.5 block font-semibold text-ink">{h.title}</span>
                            <span className="mt-1 block text-sm text-ink-soft"><Snippet text={h.snippet} /></span>
                            <span className="mt-2 flex items-center gap-3 text-xs text-muted">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{readingMinutes(h.snippet.split(/\s+/).length * 8)} {t.site.article.readTime}</span>
                              {h.appliesToModels.length > 0 ? <span>{h.appliesToModels.slice(0, 3).join(", ")}</span> : null}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="h-fit rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]" aria-labelledby="next">
              <h2 id="next" className="font-semibold text-ink">{s.nextSteps}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href={`/${locale}/routers`} className="inline-flex items-center gap-1 text-primary-dark hover:underline">{s.nextBrowse} <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></li>
                <li><OpenAssistantButton label={s.nextAi} className="inline-flex items-center gap-1 text-primary-dark hover:underline" withIcon={false} testId="search-open-assistant" /></li>
                <li><Link href={supportHref} className="inline-flex items-center gap-1 text-primary-dark hover:underline">{s.nextStaff} <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></li>
              </ul>
            </aside>
          </div>
        </>
      )}
    </Container>
  );
}
