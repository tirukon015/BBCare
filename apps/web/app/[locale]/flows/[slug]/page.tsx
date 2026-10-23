import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, localeOrDefault } from "@/i18n";
import { getFlow } from "@/modules/knowledge/service";
import { FlowRunner } from "@/components/flow-runner";
import { Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  return { title: (await getFlow(slug, localeOrDefault(locale)))?.title ?? "Troubleshooting" };
}

export default async function FlowPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug, locale: raw } = await params;
  const locale = localeOrDefault(raw);
  const t = getDictionary(locale);
  const flow = await getFlow(slug, locale);
  if (!flow) notFound();
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="mb-5 text-2xl font-bold">{flow.title}</h1>
      <FlowRunner flow={flow} locale={locale} labels={{ back: t.flow.back, restart: t.flow.restart, resolvedHint: t.flow.resolvedHint, escalate: t.flow.escalate, contact: t.flow.contact, readMore: t.common.readMore }} />
    </Container>
  );
}
