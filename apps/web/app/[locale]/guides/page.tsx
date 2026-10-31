import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listArticles } from "@/modules/knowledge/service";
import { Breadcrumbs, EmptyState, GuideCard, PageHero } from "@/components/site-cards";
import { Container, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.site.guides.heading, description: t.site.guides.intro };
}

export default async function GuidesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ c?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const s = t.site;
  const c = (await searchParams).c;
  const cat = c === "router" || c === "laptop" ? c : undefined;
  const articles = await listArticles({ locale, categorySlug: cat, kinds: ["guide", "faq", "reference"], limit: 48 });
  const tabs = [{ key: undefined, label: s.guides.filterAll }, { key: "router", label: s.nav.routers }, { key: "laptop", label: s.nav.laptops }] as const;
  return (
    <>
      <PageHero eyebrow={s.nav.guides} title={s.guides.heading} intro={s.guides.intro} />
      <Container className="mt-6"><Breadcrumbs items={[{ href: `/${locale}`, label: s.nav.home }, { label: s.guides.heading }]} /></Container>
      <Container className="mt-6">
        <nav aria-label={s.guides.heading} className="mb-4 flex flex-wrap gap-2 text-sm">
          {tabs.map((tab) => (
            <Link key={tab.label} href={`/${locale}/guides${tab.key ? `?c=${tab.key}` : ""}`} aria-current={cat === tab.key ? "page" : undefined}
              className={cx("inline-flex min-h-10 items-center rounded-full border px-4 font-medium", cat === tab.key ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-white text-ink-soft hover:border-primary")}>{tab.label}</Link>
          ))}
        </nav>
        {articles.length === 0 ? <EmptyState title={s.guides.empty} /> : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="guide-list">{articles.map((a) => <li key={a.id}><GuideCard a={a} locale={locale} t={t} kindLabel={s.article.kind[a.kind as keyof typeof s.article.kind] ?? a.kind} /></li>)}</ul>
        )}
      </Container>
    </>
  );
}
