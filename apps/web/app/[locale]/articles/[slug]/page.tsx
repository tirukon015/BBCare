import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getArticle } from "@/modules/knowledge/service";
import { getRecommendations } from "@/modules/commerce/service";
import { Markdown } from "@/components/markdown";
import { ArticleFeedback } from "@/components/article-feedback";
import { RecommendationList } from "@/components/cards";
import { TrackOnMount } from "@/components/track-on-mount";
import { Badge, ButtonLink, Container, Notice, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const a = await getArticle(slug, localeOrDefault(locale));
  return { title: a?.title ?? "Guide", description: a?.summary };
}

export default async function ArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug, locale: raw } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const a = await getArticle(slug, locale);
  if (!a) notFound();
  const modelRow = a.appliesTo.find((x) => x.modelId);
  const recs = modelRow?.modelId ? await getRecommendations({ modelId: modelRow.modelId, locale, context: "article", limit: 3 }) : [];
  const isSample = a.bodyMd.includes("Synthetic sample content") || a.bodyMd.includes("Kandungan contoh sintetik");
  return (
    <Container className="max-w-3xl py-8">
      <TrackOnMount name="article_view" props={{ article_id: a.id, revision_id: a.revisionId }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href={`/${locale}/${a.categorySlug === "laptop" ? "laptops" : "routers"}`} className="hover:underline">
          {a.categorySlug === "laptop" ? t.nav.laptops : t.nav.routers}
        </Link>
      </nav>
      <article lang={a.locale}>
        <h1 className="text-3xl font-bold tracking-tight">{a.title}</h1>
        {a.summary ? <p className="mt-2 text-lg text-ink-soft">{a.summary}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="olive">{t.article.appliesTo}: {a.models.length > 0 ? a.models.join(", ") : t.article.allModels}</Badge>
          {isSample ? <Badge>{t.common.sampleBadge}</Badge> : null}
        </div>
        <div className="mt-4 space-y-3">
          {a.localeFallback ? <Notice>{t.article.translatedFallback}</Notice> : null}
          {a.safetyLevel === "danger" ? <Notice tone="danger" role="note">{t.article.safetyDanger}</Notice> : null}
          {a.safetyLevel === "caution" ? <Notice tone="warn" role="note">{t.article.safetyCaution}</Notice> : null}
        </div>
        <div className="mt-6">
          <Markdown source={a.bodyMd} />
        </div>
      </article>
      {a.sources.length > 0 ? (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby="sources">
          <SectionHeading id="sources">{t.article.sources}</SectionHeading>
          <ul className="list-disc pl-5 text-sm text-ink-soft">
            {a.sources.map((s) => <li key={s.title}>{s.title}{s.publisher ? ` (${s.publisher})` : ""}{s.locator ? `, ${s.locator}` : ""}</li>)}
          </ul>
          {a.publishedAt ? <p className="mt-2 text-xs text-muted">{t.article.updated}: {new Date(a.publishedAt).toLocaleDateString(locale === "ms" ? "ms-MY" : "en-MY")}</p> : null}
        </section>
      ) : null}
      <section className="mt-8 border-t border-line pt-6">
        <ArticleFeedback articleId={a.id} labels={{ helpful: t.article.helpful, yes: t.article.yes, no: t.article.no, thanks: t.article.thanks }} />
      </section>
      {recs.length > 0 ? (
        <section className="mt-8" aria-labelledby="related">
          <SectionHeading id="related">{t.article.related}</SectionHeading>
          <RecommendationList items={recs} t={t} />
        </section>
      ) : null}
      <div className="mt-8">
        <ButtonLink href={`/${locale}/support${modelRow?.modelSlug ? `?model=${modelRow.modelSlug}` : ""}`} variant="secondary">{t.nav.support}</ButtonLink>
      </div>
    </Container>
  );
}
