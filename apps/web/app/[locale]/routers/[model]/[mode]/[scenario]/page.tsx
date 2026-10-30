import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INTAKE_QUESTIONS, scenarioByKey, type SupportMode } from "@bbcare/core";
import { getDictionary, localeOrDefault } from "@/i18n";
import { env } from "@/lib/env";
import { getRouterModel, getVerifiedRouterFlow, resourcesForScenario } from "@/modules/router/service";
import { detectAndRecordDemand } from "@/modules/support/demand";
import { ResourceList } from "@/components/router/resource-list";
import { ModelHeader } from "@/components/router/model-header";
import { RouterEscalation, type IntakeView } from "@/components/router/router-escalation";
import { RouterFlowRunner } from "@/components/router/router-flow";
import { Container, Notice, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

const asMode = (v: string): SupportMode | null => (v === "mesh" || v === "ap" ? v : null);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; model: string; scenario: string }> }): Promise<Metadata> {
  const { locale, model, scenario } = await params;
  const s = scenarioByKey(scenario);
  const m = await getRouterModel(model);
  return { title: s && m ? `${m.name}: ${localeOrDefault(locale) === "ms" ? s.ms : s.en}` : "Router", robots: { index: false } };
}

export default async function RouterScenarioPage({ params, searchParams }: { params: Promise<{ locale: string; model: string; mode: string; scenario: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale: raw, model: slug, mode: rawMode, scenario: key } = await params;
  const typed = typeof (await searchParams).q === "string" ? (await searchParams).q!.trim().slice(0, 300) : "";
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const mode = asMode(rawMode);
  const scenario = scenarioByKey(key);
  const model = await getRouterModel(slug);
  if (!model || !mode || !scenario || !scenario.modes.includes(mode)) notFound();
  const [flow, resources] = await Promise.all([getVerifiedRouterFlow(model.id, mode, scenario.key, locale), resourcesForScenario(model.id, mode, scenario.key, locale)]);
  // The customer typed a description and then chose this problem: a request in their own words.
  // There is no session or case yet, so it is counted under a one-off anonymous reference.
  if (typed) await detectAndRecordDemand({ modelId: model.id, supportMode: mode, scenarioKey: scenario.key, locale, question: typed, origin: "describe_box", customerRef: "anon" });
  const ms = locale === "ms";
  const questions: IntakeView[] = scenario.intake.map((q) => {
    const def = INTAKE_QUESTIONS[q]!;
    return { key: def.key, label: ms ? def.ms : def.en, options: def.options.map((o) => ({ key: o.key, label: ms ? o.ms : o.en })) };
  });
  const e = env();
  const escalation = (outcome: "not_verified" | "steps_failed") => (
    <RouterEscalation
      locale={locale} t={t} modelEcr={model.ecr} mode={mode} scenario={scenario.key}
      subject={`${model.name} (${model.ecr}): ${scenario.en}`} questions={questions}
      flowId={flow?.id ?? null} flowOutcome={outcome}
      contacts={{ whatsapp: e.BBCARE_SUPPORT_CONTACT_WHATSAPP || undefined, email: e.BBCARE_SUPPORT_CONTACT_EMAIL || undefined }}
    />
  );
  return (
    <Container className="max-w-3xl py-8">
      <ModelHeader model={model} locale={locale} t={t} compact />
      <p className="mt-4 text-sm text-muted">
        <Link href={`/${locale}/routers/${model.slug}/${mode}`} className="text-olive underline">{t.router.modes[mode]}</Link>
      </p>
      <h2 className="mt-1 text-2xl font-bold" data-testid="scenario-title">{ms ? scenario.ms : scenario.en}</h2>
      <p className="mb-5 text-ink-soft">{ms ? scenario.summaryMs : scenario.summaryEn}</p>
      {flow ? (
        <>
          {flow.hardwareRevision || flow.firmwareNote ? (
            <div className="mb-4"><Notice role="note">{[flow.hardwareRevision && `${t.model.variants}: ${flow.hardwareRevision}`, flow.firmwareNote].filter(Boolean).join(" · ")}</Notice></div>
          ) : null}
          <div className="mb-4"><Notice tone="warn" role="note">{t.router.noSecrets}</Notice></div>
          <RouterFlowRunner flow={flow} t={t} escalation={escalation("steps_failed")} />
          <ResourceList items={resources} t={t} />
          <section className="mt-8" aria-labelledby="sources">
            <SectionHeading id="sources">{t.router.sources}</SectionHeading>
            <ul className="space-y-1 text-sm" data-testid="flow-sources">
              {flow.sources.map((s) => (
                <li key={s.title}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-olive underline">{s.title}</a> : s.title}
                  {s.publisher ? ` (${s.publisher})` : ""}{s.locator ? `, ${t.router.sourceSection}: ${s.locator}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <div className="mb-5" data-testid="not-verified">
            <Notice role="status"><strong className="block">{t.router.notVerifiedTitle}</strong>{t.router.notVerifiedBody}</Notice>
          </div>
          {resources.length ? <div className="mb-6"><ResourceList items={resources} t={t} /></div> : null}
          {escalation("not_verified")}
        </>
      )}
    </Container>
  );
}
