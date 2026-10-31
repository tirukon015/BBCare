import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CUSTOMER_SUPPORT_MODES } from "@bbcare/core";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getModel, listRelatedModels } from "@/modules/catalog/service";
import { listArticles } from "@/modules/knowledge/service";
import { getRecommendations } from "@/modules/commerce/service";
import { getRouterModel } from "@/modules/router/service";
import { ModelGrid, RecommendationList } from "@/components/cards";
import { ModelImage } from "@/components/router/model-card";
import { OpenAssistantButton, SetRouterContext } from "@/components/assistant/router-context";
import { Breadcrumbs, EmptyState, GuideCard, SectionHeader } from "@/components/site-cards";
import { TrackOnMount } from "@/components/track-on-mount";
import { Badge, ButtonLink, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const model = await getModel(slug, localeOrDefault(locale));
  return { title: model ? `${model.displayName} ${getDictionary(localeOrDefault(locale)).site.model.support}` : "Model", description: model?.summary ?? undefined };
}

/** Product support page: overview, troubleshooting, configuration, FAQs and related models, from the catalogue and published knowledge only. */
export default async function ModelPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug, locale: raw } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const s = t.site.model;
  const model = await getModel(slug, locale);
  if (!model) notFound();
  const isRouter = model.categorySlug === "router";
  const [router, troubleshooting, configuration, faqs, general, related, recs] = await Promise.all([
    isRouter ? getRouterModel(slug) : Promise.resolve(null),
    listArticles({ locale, modelId: model.id, kinds: ["troubleshooting"] }),
    listArticles({ locale, modelId: model.id, kinds: ["guide", "reference"] }),
    listArticles({ locale, modelId: model.id, kinds: ["faq"] }),
    listArticles({ locale, categorySlug: model.categorySlug, generalOnly: true, limit: 6 }),
    listRelatedModels(model, locale),
    getRecommendations({ modelId: model.id, locale, context: "product" }),
  ]);
  const base = `/${locale}/${isRouter ? "routers" : "laptops"}`;
  const tabs = [["overview", s.overview], ["troubleshooting", s.troubleshooting], ["configuration", s.configuration], ["faqs", s.faqs], ["related", s.related]] as const;
  const kindLabel = (k: string) => t.site.article.kind[k as keyof typeof t.site.article.kind] ?? k;
  const popular = [...troubleshooting, ...configuration, ...general].slice(0, 3);
  return (
    <>
      {router ? <SetRouterContext model={{ slug: router.slug, name: router.name, ecr: router.ecr }} mode={CUSTOMER_SUPPORT_MODES[0]!} /> : null}
      <TrackOnMount name="product_view" props={{ model_id: model.id }} />
      <Container className="pt-6">
        <Breadcrumbs items={[{ href: `/${locale}`, label: t.site.nav.home }, { href: base, label: isRouter ? t.site.nav.routers : t.site.nav.laptops }, { href: `${base}?brand=${model.brandSlug}`, label: model.brand }, { label: model.displayName }]} />
        <section id="overview" className="mt-5 grid scroll-mt-24 gap-6 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6 lg:grid-cols-[320px_1fr]">
          <div className="flex items-center justify-center rounded-xl bg-sand p-4">
            {router ? <ModelImage model={router} t={t} size="lg" /> : <Image src={`/brand/placeholder-${isRouter ? "router" : "laptop"}.svg`} alt="" width={320} height={200} className="h-auto w-full max-w-xs" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-wide text-muted">{model.brand}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink" data-testid="model-name">{model.displayName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{model.modelNumber}</span>
              {router ? <Badge tone="primary"><span className="font-mono" data-testid="model-ecr">{t.router.ecr} {router.ecr}</span></Badge> : null}
              <Badge>{isRouter ? s.support : s.laptopSupport}</Badge>
            </p>
            <p className="mt-3 max-w-2xl text-ink-soft">{model.summary ?? `${s.intro} ${model.displayName}.`}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {router ? <ButtonLink href={`/${locale}/routers/${router.slug}/${CUSTOMER_SUPPORT_MODES[0]}`} data-track="model.mesh_journey">{s.viewAll}</ButtonLink> : <ButtonLink href="#troubleshooting">{s.viewAll}</ButtonLink>}
              <OpenAssistantButton label={s.startConversation} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary bg-white px-4 text-sm font-semibold text-primary-dark hover:bg-primary-soft" testId="model-open-assistant" />
            </div>
            {router?.identityNote ? <p className="mt-4 rounded-lg border border-line bg-sand px-3 py-2 text-sm text-ink-soft"><strong>{s.identification}:</strong> {router.identityNote}</p> : <p className="mt-4 text-xs text-muted">{s.identification}: {s.identificationBody}</p>}
          </div>
        </section>

        <nav aria-label={model.displayName} className="sticky top-16 z-20 -mx-4 mt-6 overflow-x-auto border-b border-line bg-paper/95 px-4 backdrop-blur sm:mx-0 sm:px-0" data-testid="model-tabs">
          <ul className="flex gap-1 text-sm font-medium">
            {tabs.map(([id, label]) => <li key={id}><a href={`#${id}`} className="inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-ink-soft hover:border-primary hover:text-primary-dark">{label}</a></li>)}
          </ul>
        </nav>
      </Container>

      <Container className="mt-8">
        <SectionHeader title={`${s.popular} ${model.displayName}`} />
        {popular.length === 0 ? <EmptyState title={t.category.noGuides} body={t.router.notVerifiedBody}><OpenAssistantButton label={t.home.aiCta} /></EmptyState> : (
          <ul className="grid gap-3 md:grid-cols-3">{popular.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={kindLabel(a.kind)} /></li>)}</ul>
        )}
      </Container>

      <Container className="mt-12" >
        <section id="troubleshooting" className="scroll-mt-28" aria-labelledby="troubleshooting-h">
          <SectionHeader id="troubleshooting-h" title={s.troubleshooting} />
          {router ? (
            <Link href={`/${locale}/routers/${router.slug}/${CUSTOMER_SUPPORT_MODES[0]}`} data-testid="model-mesh-journey"
              className="mb-4 flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-primary-soft bg-primary-soft p-5 hover:border-primary">
              <span><span className="block font-semibold text-ink">{s.meshJourney}</span><span className="mt-1 block text-sm text-ink-soft">{s.meshJourneyBody}</span></span>
              <ChevronRight className="h-5 w-5 shrink-0 text-primary-dark" aria-hidden="true" />
            </Link>
          ) : null}
          {troubleshooting.length === 0 ? <p className="text-sm text-muted">{s.noTroubleshooting}</p> : (
            <ul className="grid gap-3 md:grid-cols-2">{troubleshooting.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={kindLabel(a.kind)} /></li>)}</ul>
          )}
        </section>
        <section id="configuration" className="mt-12 scroll-mt-28" aria-labelledby="configuration-h">
          <SectionHeader id="configuration-h" title={s.configuration} />
          {configuration.length === 0 ? <p className="text-sm text-muted">{s.noConfiguration}</p> : (
            <ul className="grid gap-3 md:grid-cols-2">{configuration.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={kindLabel(a.kind)} /></li>)}</ul>
          )}
          {(model.variants.length > 0 || model.firmware.length > 0) ? (
            <div className="mt-6 grid gap-6 rounded-[var(--radius-card)] border border-line bg-white p-5 sm:grid-cols-2">
              {model.variants.length > 0 ? <div><h3 className="font-semibold">{t.model.variants}</h3><ul className="mt-2 list-disc pl-5 text-sm">{model.variants.map((v) => <li key={v.id}>{v.label}</li>)}</ul></div> : null}
              {model.firmware.length > 0 ? <div><h3 className="font-semibold">{t.model.firmware}</h3><ul className="mt-2 list-disc pl-5 text-sm">{model.firmware.map((f) => <li key={`${f.version}-${f.variant ?? ""}`}>{f.version}{f.variant ? ` (${f.variant})` : ""}</li>)}</ul><p className="mt-2 text-xs text-muted">{t.model.firmwareNote}</p></div> : null}
            </div>
          ) : null}
        </section>
        <section id="faqs" className="mt-12 scroll-mt-28" aria-labelledby="faqs-h">
          <SectionHeader id="faqs-h" title={s.faqs} />
          {faqs.length === 0 ? <p className="text-sm text-muted">{s.noFaqs}</p> : (
            <ul className="grid gap-3 md:grid-cols-2">{faqs.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={kindLabel(a.kind)} /></li>)}</ul>
          )}
        </section>
        {general.length > 0 ? (
          <section className="mt-12" aria-labelledby="general-h">
            <SectionHeader id="general-h" title={t.model.general} />
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{general.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={kindLabel(a.kind)} /></li>)}</ul>
          </section>
        ) : null}
        {recs.length > 0 ? (
          <section className="mt-12" aria-labelledby="products-h">
            <SectionHeader id="products-h" title={t.model.products} />
            <RecommendationList items={recs} t={t} />
          </section>
        ) : null}
        <section id="related" className="mt-12 scroll-mt-28" aria-labelledby="related-h">
          <SectionHeader id="related-h" title={s.related} />
          <ModelGrid items={related} locale={locale} emptyText={s.noRelated} />
        </section>
      </Container>
    </>
  );
}
