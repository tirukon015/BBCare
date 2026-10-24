import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORT_MODES } from "@bbcare/core";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getRouterModel } from "@/modules/router/service";
import { ModelHeader } from "@/components/router/model-header";
import { ButtonLink, Container, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; model: string }> }): Promise<Metadata> {
  const model = await getRouterModel((await params).model);
  return { title: model?.name ?? "Router" };
}

export default async function RouterModelPage({ params }: { params: Promise<{ locale: string; model: string }> }) {
  const { locale: raw, model: slug } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const model = await getRouterModel(slug);
  if (!model) notFound();
  return (
    <Container className="py-8">
      <ModelHeader model={model} locale={locale} t={t} />
      <section className="mt-8" aria-labelledby="modes">
        <SectionHeading id="modes">{t.router.chooseMode}</SectionHeading>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SUPPORT_MODES.map((mode) => (
            <li key={mode}>
              <Link href={`/${locale}/routers/${model.slug}/${mode}`} className="block h-full rounded-[var(--radius-card)] border border-line bg-white p-5 hover:border-olive" data-track="router.pick_mode" data-testid={`mode-${mode}`}>
                <span className="block text-lg font-semibold">{t.router.modes[mode]}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t.router.modes[`${mode}Body`]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-8 flex flex-wrap gap-2">
        <ButtonLink href={`/${locale}/support?model=${model.slug}`} variant="secondary">{t.router.supportChat}</ButtonLink>
      </div>
    </Container>
  );
}
