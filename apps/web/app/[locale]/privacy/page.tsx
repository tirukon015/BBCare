import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { privacyContent } from "@/i18n/privacy-content";
import { ConsentSettings } from "@/components/consent-settings";
import { Container, Notice, SectionHeading } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).privacy.title };
}

export const dynamic = "force-dynamic";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-2xl font-bold">{t.privacy.title}</h1>
      <div className="mt-3"><Notice tone="warn">{t.privacy.draft}</Notice></div>
      <div className="mt-6 space-y-5">
        {privacyContent[locale].map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            <p className="mt-1 text-ink-soft">{s.p}</p>
          </section>
        ))}
      </div>
      <section id="choices" className="mt-8 border-t border-line pt-6">
        <SectionHeading>{t.consent.title}</SectionHeading>
        <p className="mb-3 text-sm text-ink-soft">{t.consent.body}</p>
        <ConsentSettings labels={{ accept: t.consent.accept, reject: t.consent.reject, saved: t.consent.saved }} />
      </section>
    </Container>
  );
}
