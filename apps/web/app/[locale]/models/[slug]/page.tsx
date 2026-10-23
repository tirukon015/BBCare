import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getModel } from "@/modules/catalog/service";
import { listArticles } from "@/modules/knowledge/service";
import { getRecommendations } from "@/modules/commerce/service";
import { ArticleList, RecommendationList } from "@/components/cards";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const model = await getModel(slug, localeOrDefault(locale));
  return { title: model?.displayName ?? "Model" };
}

export default async function ModelPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug, locale: raw } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const model = await getModel(slug, locale);
  if (!model) notFound();
  const [specific, general, recs] = await Promise.all([
    listArticles({ locale, modelId: model.id }),
    listArticles({ locale, categorySlug: model.categorySlug, generalOnly: true, limit: 8 }),
    getRecommendations({ modelId: model.id, locale, context: "product" }),
  ]);
  return (
    <Container className="py-8">
      <p className="text-sm uppercase tracking-wide text-muted">{model.brand}</p>
      <h1 className="text-3xl font-bold tracking-tight">{model.displayName}</h1>
      <p className="text-muted">{model.modelNumber}{model.year ? ` · ${t.model.released} ${model.year}` : ""}</p>
      {model.summary ? <p className="mt-3 max-w-2xl text-ink-soft">{model.summary}</p> : null}
      <div className="mt-5">
        <ButtonLink href={`/${locale}/support?model=${model.slug}`} data-track="model.start_support">{t.model.startSupport}</ButtonLink>
      </div>

      <section className="mt-10" aria-labelledby="specific">
        <SectionHeading id="specific">{t.model.guides}</SectionHeading>
        <ArticleList items={specific} locale={locale} t={t} emptyText={t.category.noGuides} />
      </section>
      <section className="mt-10" aria-labelledby="general">
        <SectionHeading id="general">{t.model.general}</SectionHeading>
        <ArticleList items={general} locale={locale} t={t} emptyText={t.category.noGuides} />
      </section>

      {model.variants.length > 0 || model.firmware.length > 0 ? (
        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          {model.variants.length > 0 ? (
            <div>
              <SectionHeading>{t.model.variants}</SectionHeading>
              <ul className="list-disc pl-5 text-sm">{model.variants.map((v) => <li key={v.id}>{v.label}</li>)}</ul>
            </div>
          ) : null}
          {model.firmware.length > 0 ? (
            <div>
              <SectionHeading>{t.model.firmware}</SectionHeading>
              <ul className="list-disc pl-5 text-sm">{model.firmware.map((f) => <li key={`${f.version}-${f.variant ?? ""}`}>{f.version}{f.variant ? ` (${f.variant})` : ""}</li>)}</ul>
              <p className="mt-2 text-xs text-muted">{t.model.firmwareNote}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {recs.length > 0 ? (
        <section className="mt-10" aria-labelledby="products">
          <SectionHeading id="products">{t.model.products}</SectionHeading>
          <RecommendationList items={recs} t={t} />
        </section>
      ) : null}
    </Container>
  );
}
