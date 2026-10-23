import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { aiState } from "@/lib/ai";
import { env } from "@/lib/env";
import { getModel } from "@/modules/catalog/service";
import { SupportChat } from "@/components/support-chat";
import { Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).support.title, robots: { index: false } };
}

export default async function SupportPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ model?: string; escalate?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const model = typeof sp.model === "string" && /^[a-z0-9-]{1,80}$/.test(sp.model) ? await getModel(sp.model, locale) : null;
  const ai = await aiState(locale);
  const e = env();
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="mb-4 text-2xl font-bold">{t.support.title}</h1>
      <SupportChat
        locale={locale}
        t={t}
        aiEnabled={ai.enabled}
        mock={ai.mock}
        initialModel={model ? { slug: model.slug, name: model.displayName } : null}
        startEscalated={sp.escalate === "1"}
        contacts={{ whatsapp: e.BBCARE_SUPPORT_CONTACT_WHATSAPP || undefined, email: e.BBCARE_SUPPORT_CONTACT_EMAIL || undefined }}
      />
    </Container>
  );
}
