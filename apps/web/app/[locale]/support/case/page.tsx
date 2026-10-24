import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { CaseLookup } from "@/components/router/case-lookup";
import { Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).router.checkCase, robots: { index: false } };
}

export default async function CasePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-2xl font-bold">{t.router.checkCase}</h1>
      <p className="mb-5 text-ink-soft">{t.router.checkCaseIntro}</p>
      <CaseLookup locale={locale} t={t} />
    </Container>
  );
}
