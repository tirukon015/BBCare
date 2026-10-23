import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { isLocale } from "@bbcare/core/locale";
import { getDictionary } from "@/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ConsentBanner } from "@/components/consent-banner";
import { AnalyticsTracker } from "@/components/analytics-tracker";
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
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <Suspense fallback={null}>
          <SiteHeader locale={locale} t={t} />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} t={t} />
        <ConsentBanner t={t.consent} />
        <AnalyticsTracker />
      </body>
    </html>
  );
}
