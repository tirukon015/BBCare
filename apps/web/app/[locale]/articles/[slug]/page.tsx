import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Gauge } from "lucide-react";
import { getDictionary, localeOrDefault } from "@/i18n";
import { articleHeadings, getArticle, listArticles } from "@/modules/knowledge/service";
import { getRecommendations } from "@/modules/commerce/service";
import { Markdown } from "@/components/markdown";
import { ArticleFeedback } from "@/components/article-feedback";
import { RecommendationList } from "@/components/cards";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { Breadcrumbs, GuideCard, SectionHeader } from "@/components/site-cards";
import { TrackOnMount } from "@/components/track-on-mount";
import { Badge, ButtonLink, Container, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const a = await getArticle(slug, localeOrDefault(locale));
  return { title: a?.title ?? "Guide", description: a?.summary };
}

/** Troubleshooting and guide article: readable steps, a table of contents for longer pieces, feedback and the assistant. */
export default async function ArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug, locale: raw } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const s = t.site.article;
  const a = await getArticle(slug, locale);
  if (!a) notFound();
  const modelRow = a.appliesTo.find((x) => x.modelId);
  const [recs, related] = await Promise.all([
    modelRow?.modelId ? getRecommendations({ modelId: modelRow.modelId, locale, context: "article", limit: 3 }) : Promise.resolve([]),
    listArticles({ locale, categorySlug: a.categorySlug, excludeId: a.id, kinds: a.kind === "troubleshooting" ? ["troubleshooting"] : ["guide", "faq", "reference"], limit: 3 }),
  ]);
  const isSample = a.bodyMd.includes("Synthetic sample content") || a.bodyMd.includes("Kandungan contoh sintetik");
  const headings = articleHeadings(a.bodyMd);
  const sectionHref = `/${locale}/${a.categorySlug === "laptop" ? "laptops" : "routers"}`;
  const sectionLabel = a.categorySlug === "laptop" ? t.site.nav.laptops : t.site.nav.routers;
  const kindLabel = s.kind[a.kind as keyof typeof s.kind] ?? a.kind;
  return (
    <Container className="py-6">
      <TrackOnMount name="article_view" props={{ article_id: a.id, revision_id: a.revisionId }} />
      <Breadcrumbs items={[{ href: `/${locale}`, label: t.site.nav.home }, { href: sectionHref, label: sectionLabel }, { href: `/${locale}/${a.kind === "troubleshooting" ? "troubleshooting" : "guides"}`, label: a.kind === "troubleshooting" ? t.site.nav.troubleshooting : t.site.nav.guides }, { label: a.title }]} />
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article lang={a.locale} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="primary">{kindLabel}</Badge>
            {modelRow?.modelSlug ? <Link href={`/${locale}/models/${modelRow.modelSlug}`} className="rounded-full bg-sand px-2.5 py-0.5 font-medium text-ink-soft hover:text-primary-dark">{modelRow.modelName}</Link> : <span className="rounded-full bg-sand px-2.5 py-0.5 text-ink-soft">{t.article.allModels}</span>}
            {isSample ? <Badge>{t.common.sampleBadge}</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">{a.title}</h1>
          {a.summary ? <p className="mt-3 text-lg text-ink-soft">{a.summary}</p> : null}
          <p className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden="true" />{a.readingMinutes} {s.readTime}</span>
            <span className="inline-flex items-center gap-1"><Gauge className="h-4 w-4" aria-hidden="true" />{s.difficulty[a.safetyLevel]}</span>
            {a.publishedAt ? <span>{t.article.updated}: {new Date(a.publishedAt).toLocaleDateString(locale === "ms" ? "ms-MY" : "en-MY")}</span> : null}
          </p>
          <div className="mt-5 space-y-3">
            {a.localeFallback ? <Notice>{t.article.translatedFallback}</Notice> : null}
            {a.safetyLevel === "danger" ? <Notice tone="danger" role="note">{t.article.safetyDanger}</Notice> : null}
            {a.safetyLevel === "caution" ? <Notice tone="warn" role="note">{t.article.safetyCaution}</Notice> : null}
          </div>
          {headings.length >= 3 ? (
            <nav aria-label={s.onThisPage} className="mt-6 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm lg:hidden" data-testid="toc-inline">
              <p className="font-semibold text-ink">{s.onThisPage}</p>
              <ol className="mt-2 space-y-1">{headings.map((h, i) => <li key={h.id}><a href={`#${h.id}`} className="text-ink-soft hover:text-primary-dark"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">{i + 1}</span>{h.text}</a></li>)}</ol>
            </nav>
          ) : null}
          <div className="prose-bb mt-6 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
            <Markdown source={a.bodyMd} />
          </div>
          {a.sources.length > 0 ? (
            <section className="mt-8" aria-labelledby="sources">
              <SectionHeader id="sources" title={t.article.sources} />
              <ul className="list-disc pl-5 text-sm text-ink-soft">
                {a.sources.map((src) => <li key={src.title}>{src.title}{src.publisher ? ` (${src.publisher})` : ""}{src.locator ? `, ${src.locator}` : ""}</li>)}
              </ul>
            </section>
          ) : null}
          <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-white p-5">
            <ArticleFeedback articleId={a.id} labels={{ helpful: t.article.helpful, yes: t.article.yes, no: t.article.no, thanks: t.article.thanks }} />
          </section>
          <div className="mt-6 flex flex-wrap gap-2">
            <OpenAssistantButton label={s.askAi} testId="article-open-assistant" />
            <ButtonLink href={`/${locale}/support${modelRow?.modelSlug ? `?model=${modelRow.modelSlug}` : ""}&escalate=1`.replace("support&", "support?")} variant="secondary">{t.home.humanCta}</ButtonLink>
          </div>
        </article>

        <aside className="space-y-6">
          {headings.length >= 3 ? (
            <nav aria-label={s.onThisPage} className="sticky top-24 hidden rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm lg:block" data-testid="toc">
              <p className="font-semibold text-ink">{s.onThisPage}</p>
              <ol className="mt-2 space-y-1.5">{headings.map((h, i) => <li key={h.id}><a href={`#${h.id}`} className="flex items-start gap-2 text-ink-soft hover:text-primary-dark"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">{i + 1}</span>{h.text}</a></li>)}</ol>
            </nav>
          ) : null}
          {related.length > 0 ? (
            <section aria-labelledby="related-articles">
              <h2 id="related-articles" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{s.relatedArticles}</h2>
              <ul className="space-y-3">{related.map((r) => <li key={r.id}><GuideCard a={r} locale={locale} t={t} kindLabel={s.kind[r.kind as keyof typeof s.kind] ?? r.kind} /></li>)}</ul>
            </section>
          ) : null}
        </aside>
      </div>
      {recs.length > 0 ? (
        <section className="mt-10" aria-labelledby="related">
          <SectionHeader id="related" title={t.article.related} />
          <RecommendationList items={recs} t={t} />
        </section>
      ) : null}
    </Container>
  );
}
