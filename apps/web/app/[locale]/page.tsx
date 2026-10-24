import { getDictionary, localeOrDefault } from "@/i18n";
import { listRouterModels } from "@/modules/router/service";
import { RouterModelGrid } from "@/components/router/model-card";
import { SearchForm } from "@/components/search-form";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const models = await listRouterModels();
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
      <Container className="mt-8">
        <SectionHeading>{t.router.pickTitle}</SectionHeading>
        <RouterModelGrid models={models} locale={locale} t={t} />
      </Container>
      <Container className="mt-10">
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-sand p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.home.humanTitle}</h2>
            <p className="text-sm text-ink-soft">{t.home.humanBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/${locale}/support/case`} variant="secondary" data-track="home.case">{t.router.checkCase}</ButtonLink>
            <ButtonLink href={`/${locale}/contact`} variant="secondary" data-track="home.contact">{t.home.humanCta}</ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
