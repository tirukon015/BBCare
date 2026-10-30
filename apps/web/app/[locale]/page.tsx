import { getDictionary, localeOrDefault } from "@/i18n";
import { listRouterModels } from "@/modules/router/service";
import { RouterModelGrid } from "@/components/router/model-card";
import { OpenAssistantButton } from "@/components/assistant/router-context";
import { SearchForm } from "@/components/search-form";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  // The seven-router catalogue comes from the catalogue tables alone: no customer data is involved.
  const models = await listRouterModels();
  return (
    <>
      <section className="border-b border-line bg-white">
        <Container className="py-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{t.meta.title} · {t.chat.scope}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t.home.heading}</h1>
          <p className="mt-3 max-w-2xl text-ink-soft">{t.home.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="#routers" data-track="home.start">{t.home.startCta}</ButtonLink>
            <OpenAssistantButton label={t.home.aiCta} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary-soft" />
          </div>
          <p className="mt-2 text-xs text-muted">{t.home.aiNote}</p>
          <div className="mt-6 max-w-2xl">
            <SearchForm locale={locale} t={t} />
          </div>
        </Container>
      </section>
      <Container className="mt-8">
        <div id="routers" className="scroll-mt-6">
          <SectionHeading>{t.router.pickTitle}</SectionHeading>
          <p className="-mt-2 mb-4 text-sm text-ink-soft">{t.router.pickIntro}</p>
          <RouterModelGrid models={models} locale={locale} t={t} />
        </div>
      </Container>
      <Container className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">{t.home.stepsTitle}</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="how-it-works">
          {t.home.steps.map((step, i) => (
            <li key={step} className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-dark">{i + 1}</span>
              <span className="text-sm text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </Container>
      <Container className="mt-10">
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
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
