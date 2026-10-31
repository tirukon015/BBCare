import Link from "next/link";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listRouterModels } from "@/modules/router/service";
import { listArticles } from "@/modules/knowledge/service";
import { RouterModelGrid } from "@/components/router/model-card";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { SearchForm } from "@/components/search-form";
import { EmptyState, GuideCard, HeroVisual, IssueCard, PageHero, ProductEntryCard, SectionHeader } from "@/components/site-cards";
import { ButtonLink, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site;
  // Catalogue and guides come from the published tables only; the page never depends on customer records.
  const [models, guides] = await Promise.all([listRouterModels(), listArticles({ locale, limit: 4 })]);
  const q = (term: string) => `/${locale}/search?q=${encodeURIComponent(term)}`;
  const issues = [...s.issues.router.slice(0, 4), ...s.issues.laptop.slice(0, 5)];
  return (
    <>
      <PageHero eyebrow={s.home.badge} intro={s.home.intro} visual={<HeroVisual laptopAlt={s.home.laptopTitle} routerAlt={s.home.routerTitle} />}
        title={<>{s.home.heading1} <span className="text-primary">{s.home.heading2}</span></>}>
        <div className="max-w-2xl"><SearchForm locale={locale} t={t} size="lg" /></div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <span className="font-medium">{s.home.popular}</span>
          {s.home.popularTerms.map((term) => <Link key={term} href={q(term)} data-track="home.popular_term" className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-soft hover:border-primary hover:text-primary-dark">{term}</Link>)}
        </p>
      </PageHero>

      <Container className="mt-8 grid gap-4 md:grid-cols-2">
        <ProductEntryCard href={`/${locale}/laptops`} title={s.home.laptopTitle} body={s.home.laptopBody} kind="laptop" cta={s.nav.laptops} />
        <ProductEntryCard href={`/${locale}/routers`} title={s.home.routerTitle} body={s.home.routerBody} kind="router" cta={s.nav.routers} />
      </Container>

      <Container className="mt-12">
        <SectionHeader title={s.home.troubleshooting} href={`/${locale}/troubleshooting`} linkLabel={s.home.viewAll} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="popular-issues">
          {issues.map((i) => <li key={`${i.key}-${i.title}`}><IssueCard href={q(i.q)} title={i.title} iconKey={i.key} /></li>)}
        </ul>
      </Container>

      <Container className="mt-12">
        <SectionHeader id="routers" title={s.home.routersTitle} intro={s.home.routersIntro} href={`/${locale}/routers`} linkLabel={s.home.viewAll} />
        <RouterModelGrid models={models} locale={locale} t={t} />
      </Container>

      <Container className="mt-12">
        <SectionHeader title={s.home.latestGuides} href={`/${locale}/guides`} linkLabel={s.home.viewAll} />
        {guides.length === 0 ? <EmptyState title={s.home.noGuides} /> : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {guides.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={s.article.kind[a.kind as keyof typeof s.article.kind] ?? a.kind} /></li>)}
          </ul>
        )}
      </Container>

      <Container className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-primary-soft bg-primary-soft p-6">
          <h2 className="text-lg font-bold text-ink">{s.home.aiTitle}</h2>
          <p className="mt-1 text-sm text-ink-soft">{s.home.aiBody}</p>
          <div className="mt-4"><OpenAssistantButton label={s.home.aiCta} testId="home-open-assistant" /></div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-lg font-bold text-ink">{s.home.humanTitle}</h2>
          <p className="mt-1 text-sm text-ink-soft">{s.home.humanBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/${locale}/support/case`} variant="secondary" data-track="home.case">{s.nav.case}</ButtonLink>
            <ButtonLink href={`/${locale}/contact`} variant="secondary" data-track="home.contact">{s.home.humanCta}</ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
