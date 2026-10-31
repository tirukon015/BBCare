import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listBrands } from "@/modules/catalog/service";
import { listRouterModels } from "@/modules/router/service";
import { listArticles } from "@/modules/knowledge/service";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { RouterModelGrid } from "@/components/router/model-card";
import { SearchForm } from "@/components/search-form";
import { BrandCard, Breadcrumbs, GuideCard, IssueCard, PageHero, SectionHeader } from "@/components/site-cards";
import { ButtonLink, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.site.home.routerTitle, description: t.site.routers.intro };
}

/** Router Support: brand, then model, then the guided Mesh Connection journey. Only catalogued models appear. */
export default async function RoutersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ brand?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site;
  const sp = await searchParams;
  const brand = typeof sp.brand === "string" && /^[a-z0-9-]{1,40}$/.test(sp.brand) ? sp.brand : undefined;
  const [all, brands, guides] = await Promise.all([listRouterModels(), listBrands("router"), listArticles({ locale, categorySlug: "router", limit: 6 })]);
  const brandName = brands.find((b) => b.slug === brand)?.name;
  const models = brandName ? all.filter((m) => m.brand === brandName) : all;
  const q = (term: string) => `/${locale}/search?q=${encodeURIComponent(term)}&c=router`;
  return (
    <>
      <PageHero eyebrow={s.home.routerTitle} title={s.routers.heading} intro={s.routers.intro}>
        <div className="max-w-xl"><SearchForm locale={locale} t={t} category="router" /></div>
      </PageHero>
      <Container className="mt-6"><Breadcrumbs items={[{ href: `/${locale}`, label: s.nav.home }, { label: s.home.routerTitle }]} /></Container>

      <Container className="mt-6">
        <SectionHeader title={s.routers.brands} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="router-brands">
          <li><BrandCard href={`/${locale}/routers#models`} name={s.routers.allBrands} count={all.length} countLabel={t.category.models.toLowerCase()} /></li>
          {brands.map((b) => <li key={b.slug}><BrandCard href={`/${locale}/routers?brand=${b.slug}#models`} name={b.name} count={b.models} countLabel={t.category.models.toLowerCase()} /></li>)}
        </ul>
      </Container>

      <Container className="mt-10">
        <div id="models" className="scroll-mt-24">
          <SectionHeader title={brandName ? `${s.routers.modelsOf} ${brandName}` : s.routers.models} intro={s.home.routersIntro} href={brandName ? `/${locale}/routers#models` : undefined} linkLabel={brandName ? s.routers.allBrands : undefined} />
          <RouterModelGrid models={models} locale={locale} t={t} />
        </div>
      </Container>

      <Container className="mt-12">
        <SectionHeader title={s.routers.issues} intro={t.router.meshOnlyNote} />
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="router-issues">
          {s.issues.router.map((i) => <li key={i.key}><IssueCard href={q(i.q)} title={i.title} iconKey={i.key} compact /></li>)}
        </ul>
      </Container>

      {guides.length > 0 ? (
        <Container className="mt-12">
          <SectionHeader title={s.home.latestGuides} href={`/${locale}/guides?c=router`} linkLabel={s.home.viewAll} />
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{guides.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={s.article.kind[a.kind as keyof typeof s.article.kind] ?? a.kind} /></li>)}</ul>
        </Container>
      ) : null}

      <Container className="mt-12">
        <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">{t.router.otherModel}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-soft">{t.router.otherModelBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <OpenAssistantButton label={s.home.aiCta} />
            <ButtonLink href={`/${locale}/support?escalate=1`} variant="secondary">{t.home.humanCta}</ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
