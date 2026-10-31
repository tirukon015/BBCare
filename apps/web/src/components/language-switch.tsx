"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/i18n";

export function LanguageSwitch({ locale, label, short }: { locale: Locale; label: string; short: string }) {
  const pathname = usePathname() ?? `/${locale}`;
  const params = useSearchParams();
  const target = locale === "en" ? "ms" : "en";
  const rest = pathname.replace(/^\/(en|ms)(?=\/|$)/, "");
  const qs = params?.toString();
  return (
    <Link
      href={`/${target}${rest}${qs ? `?${qs}` : ""}`}
      hrefLang={target}
      lang={target}
      className="inline-flex h-10 items-center rounded-full border border-line px-3 text-sm font-medium text-ink hover:bg-sand"
      data-track="nav.language"
    >
      <span aria-hidden="true" className="font-semibold sm:mr-1">{short}</span>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Link>
  );
}
