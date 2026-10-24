import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { listRouterModels } from "@/modules/router/service";
import { RouterModelGrid } from "@/components/router/model-card";
import { ButtonLink, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.router.pickTitle };
}

export default async function RoutersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const models = await listRouterModels();
  return (
    <Container className="py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t.router.pickTitle}</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">{t.router.pickIntro}</p>
      <div className="mt-6"><RouterModelGrid models={models} locale={locale} t={t} /></div>
      <section className="mt-8 rounded-[var(--radius-card)] border border-line bg-sand p-5">
        <h2 className="font-semibold">{t.router.otherModel}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t.router.otherModelBody}</p>
        <div className="mt-3"><ButtonLink href={`/${locale}/support?escalate=1`} variant="secondary">{t.home.humanCta}</ButtonLink></div>
      </section>
    </Container>
  );
}
