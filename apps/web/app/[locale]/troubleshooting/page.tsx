import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listArticles, listFlows } from "@/modules/knowledge/service";
import { Breadcrumbs, EmptyState, GuideCard, IssueCard, PageHero, SectionHeader } from "@/components/site-cards";
import { ButtonLink, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.site.troubleshooting.heading, description: t.site.troubleshooting.intro };
}

export default async function TroubleshootingPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site;
  const [articles, flows] = await Promise.all([listArticles({ locale, kinds: ["troubleshooting"], limit: 24 }), listFlows(locale)]);
  const q = (term: string, c: string) => `/${locale}/search?q=${encodeURIComponent(term)}&c=${c}&f=troubleshooting`;
  return (
    <>
      <PageHero eyebrow={s.nav.troubleshooting} title={s.troubleshooting.heading} intro={s.troubleshooting.intro} />
      <Container className="mt-6"><Breadcrumbs items={[{ href: `/${locale}`, label: s.nav.home }, { label: s.troubleshooting.heading }]} /></Container>

      <Container className="mt-6">
        <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-primary-soft bg-primary-soft p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">{s.troubleshooting.meshTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-soft">{s.troubleshooting.meshBody}</p>
          </div>
          <ButtonLink href={`/${locale}/routers#models`}>{s.troubleshooting.meshCta}</ButtonLink>
        </div>
      </Container>

      <Container className="mt-10 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="router-issues">
          <SectionHeader id="router-issues" title={s.troubleshooting.routerSection} />
          <ul className="grid gap-2">{s.issues.router.map((i) => <li key={i.key}><IssueCard href={q(i.q, "router")} title={i.title} iconKey={i.key} compact /></li>)}</ul>
        </section>
        <section aria-labelledby="laptop-issues">
          <SectionHeader id="laptop-issues" title={s.troubleshooting.laptopSection} />
          <ul className="grid gap-2">{s.issues.laptop.map((i) => <li key={i.key}><IssueCard href={q(i.q, "laptop")} title={i.title} iconKey={i.key} compact /></li>)}</ul>
        </section>
      </Container>

      <Container className="mt-12">
        <SectionHeader title={s.troubleshooting.articles} />
        {articles.length === 0 ? <EmptyState title={s.home.noGuides} /> : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="troubleshooting-articles">{articles.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={s.article.kind.troubleshooting} /></li>)}</ul>
        )}
      </Container>

      {flows.length > 0 ? (
        <Container className="mt-12">
          <SectionHeader title={s.troubleshooting.flows} />
          <ul className="flex flex-wrap gap-2">{flows.map((f) => <li key={f.slug}><Link href={`/${locale}/flows/${f.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-sm hover:border-primary">{f.title}</Link></li>)}</ul>
        </Container>
      ) : null}
    </>
  );
}
