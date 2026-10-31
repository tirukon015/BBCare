import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { isLocale } from "@bbcare/core/locale";
import { getDictionary } from "@/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ConsentBanner } from "@/components/consent-banner";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { AssistantProvider } from "@/components/assistant/router-context";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { aiState } from "@/lib/ai";
import { env } from "@/lib/env";
import "../globals.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: { default: `${t.meta.title} | ${t.meta.descriptor}`, template: `%s | ${t.meta.title}` },
    description: t.meta.description,
    alternates: { languages: { en: "/en", ms: "/ms" } },
    robots: process.env.BBCARE_ENV === "production" ? undefined : { index: false, follow: false },
    icons: { icon: [{ url: "/brand/bbcare-favicon.png", type: "image/png", sizes: "64x64" }], apple: "/brand/bbcare-app-icon.png" },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1365b8" };

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  // The floating assistant needs the real AI state; if the database is unreachable the page still renders (search-only assistant).
  const ai = await aiState(locale).catch(() => ({ enabled: false, mock: false }));
  const e = env();
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col pb-20 sm:pb-0">
        <AssistantProvider>
          <Suspense fallback={null}>
            <SiteHeader locale={locale} t={t} />
          </Suspense>
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} t={t} />
          <ConsentBanner t={t.consent} />
          <AnalyticsTracker />
          <FloatingAssistant locale={locale} t={t} aiEnabled={ai.enabled} mock={ai.mock} contacts={{ whatsapp: e.BBCARE_SUPPORT_CONTACT_WHATSAPP || undefined, email: e.BBCARE_SUPPORT_CONTACT_EMAIL || undefined }} />
        </AssistantProvider>
      </body>
    </html>
  );
}
