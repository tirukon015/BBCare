import Link from "next/link";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listArticles, listFlows } from "@/modules/knowledge/service";
import { ArticleList } from "@/components/cards";
import { SearchForm } from "@/components/search-form";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const [articles, flows] = await Promise.all([listArticles({ locale, limit: 6 }), listFlows(locale)]);
  return (
    <>
      <section className="border-b border-line bg-white">
        <Container className="py-10 sm:py-14">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.home.heading}</h1>
          <p className="mt-3 max-w-2xl text-ink-soft">{t.home.intro}</p>
          <div className="mt-6 max-w-2xl">
            <SearchForm locale={locale} t={t} />
          </div>
        </Container>
      </section>
      <Container className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href={`/${locale}/routers`} className="rounded-[var(--radius-card)] border border-line bg-white p-6 hover:border-olive" data-track="home.routers">
          <h2 className="text-xl font-semibold">{t.nav.routers}</h2>
          <p className="mt-2 text-sm text-ink-soft">{t.home.routersBody}</p>
        </Link>
        <Link href={`/${locale}/laptops`} className="rounded-[var(--radius-card)] border border-line bg-white p-6 hover:border-olive" data-track="home.laptops">
          <h2 className="text-xl font-semibold">{t.nav.laptops}</h2>
          <p className="mt-2 text-sm text-ink-soft">{t.home.laptopsBody}</p>
        </Link>
      </Container>
      <Container className="mt-10">
        <SectionHeading>{t.home.popular}</SectionHeading>
        <ArticleList items={articles} locale={locale} t={t} emptyText={t.category.noGuides} />
      </Container>
      {flows.length > 0 ? (
        <Container className="mt-10">
          <SectionHeading>{t.home.flows}</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {flows.map((f) => (
              <li key={f.slug}>
                <Link href={`/${locale}/flows/${f.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-sm hover:border-olive" data-track="home.flow">
                  {f.title}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      ) : null}
      <Container className="mt-10">
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-sand p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.home.humanTitle}</h2>
            <p className="text-sm text-ink-soft">{t.home.humanBody}</p>
          </div>
          <ButtonLink href={`/${locale}/contact`} variant="secondary" data-track="home.contact">{t.home.humanCta}</ButtonLink>
        </div>
      </Container>
    </>
  );
}
