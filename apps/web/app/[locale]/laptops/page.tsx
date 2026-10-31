import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getCategory, listBrands, listModels } from "@/modules/catalog/service";
import { listArticles } from "@/modules/knowledge/service";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { ModelGrid } from "@/components/cards";
import { SearchForm } from "@/components/search-form";
import { BrandCard, Breadcrumbs, EmptyState, GuideCard, IssueCard, PageHero, SectionHeader } from "@/components/site-cards";
import { Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.site.home.laptopTitle, description: t.site.laptops.intro };
}

/**
 * Laptop Support landing page. Brands, models and guides come from the catalogue and published
 * knowledge; while the laptop category has no published content the page says so instead of
 * showing invented brands.
 */
export default async function LaptopsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ brand?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site;
  const sp = await searchParams;
  const brand = typeof sp.brand === "string" && /^[a-z0-9-]{1,40}$/.test(sp.brand) ? sp.brand : undefined;
  const category = await getCategory("laptop", locale);
  const [brands, models, guides] = category
    ? await Promise.all([listBrands("laptop"), brand ? listModels("laptop", locale, brand) : Promise.resolve([]), listArticles({ locale, categorySlug: "laptop", limit: 6 })])
    : [[], [], []];
  const q = (term: string) => `/${locale}/search?q=${encodeURIComponent(term)}&c=laptop`;
  const current = brands.find((b) => b.slug === brand);
  return (
    <>
      <PageHero eyebrow={s.home.laptopTitle} title={s.laptops.heading} intro={s.laptops.intro}>
        <div className="max-w-xl"><SearchForm locale={locale} t={t} category="laptop" /></div>
      </PageHero>
      <Container className="mt-6"><Breadcrumbs items={[{ href: `/${locale}`, label: s.nav.home }, { label: s.home.laptopTitle }]} /></Container>

      <Container className="mt-6">
        <SectionHeader title={s.laptops.brands} />
        {brands.length === 0 ? (
          <EmptyState title={s.laptops.noBrands}>
            <OpenAssistantButton label={s.home.aiCta} />
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="laptop-brands">
            {brands.map((b) => <li key={b.slug}><BrandCard href={`/${locale}/laptops?brand=${b.slug}#models`} name={b.name} count={b.models} countLabel={t.category.models.toLowerCase()} /></li>)}
          </ul>
        )}
        {current ? (
          <div id="models" className="mt-8 scroll-mt-24">
            <SectionHeader title={`${s.routers.modelsOf} ${current.name}`} href={`/${locale}/laptops`} linkLabel={s.routers.allBrands} />
            <ModelGrid items={models} locale={locale} emptyText={t.category.noModels} />
          </div>
        ) : null}
      </Container>

      <Container className="mt-12">
        <SectionHeader title={s.laptops.issues} intro={s.troubleshooting.intro} />
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="laptop-issues">
          {s.issues.laptop.map((i) => <li key={i.key}><IssueCard href={q(i.q)} title={i.title} iconKey={i.key} compact /></li>)}
        </ul>
      </Container>

      {guides.length > 0 ? (
        <Container className="mt-12">
          <SectionHeader title={s.home.latestGuides} href={`/${locale}/guides?c=laptop`} linkLabel={s.home.viewAll} />
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{guides.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={s.article.kind[a.kind as keyof typeof s.article.kind] ?? a.kind} /></li>)}</ul>
        </Container>
      ) : null}

      <Container className="mt-12">
        <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-primary-soft bg-primary-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">{s.laptops.aiTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-soft">{s.laptops.aiBody}</p>
          </div>
          <OpenAssistantButton label={s.home.aiCta} />
        </div>
      </Container>
    </>
  );
}
