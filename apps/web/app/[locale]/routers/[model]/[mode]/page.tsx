import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { matchScenarios, scenariosForMode, type SupportMode } from "@bbcare/core";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getRouterModel, verifiedScenarios } from "@/modules/router/service";
import { recordUnresolved } from "@/modules/support/gaps";
import { ModelHeader } from "@/components/router/model-header";
import { Badge, Container, Notice, SectionHeading, buttonStyles, inputStyles } from "@/components/ui";

export const dynamic = "force-dynamic";

const asMode = (v: string): SupportMode | null => (v === "mesh" || v === "ap" ? v : null);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; model: string; mode: string }> }): Promise<Metadata> {
  const { locale, model, mode } = await params;
  const t = getDictionary(localeOrDefault(locale));
  const m = await getRouterModel(model);
  const md = asMode(mode);
  return { title: m && md ? `${m.name}: ${t.router.modes[md]}` : "Router" };
}

export default async function RouterModePage({ params, searchParams }: { params: Promise<{ locale: string; model: string; mode: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale: raw, model: slug, mode: rawMode } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const mode = asMode(rawMode);
  const model = await getRouterModel(slug);
  if (!model || !mode) notFound();
  const q = typeof (await searchParams).q === "string" ? (await searchParams).q!.trim().slice(0, 300) : "";
  const [verified] = await Promise.all([verifiedScenarios(model.id, mode)]);
  const scenarios = scenariosForMode(mode);
  const matches = q ? matchScenarios(q, mode).slice(0, 3) : [];
  if (q && matches.length === 0) await recordUnresolved({ query: q, locale, source: "no_results", modelId: model.id });
  const base = `/${locale}/routers/${model.slug}/${mode}`;
  const item = (key: string, highlight = false) => {
    const s = scenarios.find((x) => x.key === key)!;
    return (
      <li key={key}>
        <Link href={`${base}/${key}${highlight && q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`flex h-full flex-col gap-1 rounded-[var(--radius-card)] border bg-white p-4 hover:border-olive ${highlight ? "border-olive" : "border-line"}`} data-track="router.pick_scenario" data-testid={`scenario-${key}`}>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{locale === "ms" ? s.ms : s.en}</span>
            {verified.has(key) ? <Badge tone="olive">{t.router.verifiedBadge}</Badge> : <Badge>{t.router.staffBadge}</Badge>}
          </span>
          <span className="text-sm text-ink-soft">{locale === "ms" ? s.summaryMs : s.summaryEn}</span>
        </Link>
      </li>
    );
  };
  return (
    <Container className="py-8">
      <ModelHeader model={model} locale={locale} t={t} compact />
      <h2 className="mt-6 text-2xl font-bold">{t.router.modes[mode]}</h2>
      <p className="text-ink-soft">{t.router.modes[`${mode}Body`]}</p>

      <form method="get" action={base} className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="describe" className="sr-only">{t.router.describe}</label>
        <input id="describe" name="q" defaultValue={q} maxLength={300} placeholder={t.router.describePlaceholder} className={`${inputStyles} flex-1`} aria-describedby="describe-hint" />
        <button type="submit" className={buttonStyles.primary}>{t.router.describeSubmit}</button>
      </form>
      <p id="describe-hint" className="mt-1 text-xs text-muted">{t.router.describe}</p>

      {q ? (
        <section className="mt-6" aria-labelledby="matches">
          {matches.length ? (
            <>
              <SectionHeading id="matches">{t.router.matches}</SectionHeading>
              <ul className="grid gap-3 sm:grid-cols-2" data-testid="scenario-matches">{matches.map((m) => item(m.key, true))}</ul>
            </>
          ) : (
            <Notice role="status">{t.router.noMatch}</Notice>
          )}
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="problems">
        <SectionHeading id="problems">{t.router.chooseProblem}</SectionHeading>
        <ul className="grid gap-3 sm:grid-cols-2">{scenarios.map((s) => item(s.key))}</ul>
      </section>
    </Container>
  );
}
