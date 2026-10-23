import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { LanguageSwitch } from "./language-switch";
import { Container } from "./ui";

export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  const links = [
    { href: `/${locale}/routers`, label: t.nav.routers },
    { href: `/${locale}/laptops`, label: t.nav.laptops },
    { href: `/${locale}/support`, label: t.nav.support },
    { href: `/${locale}/contact`, label: t.nav.contact },
  ];
  return (
    <header className="border-b border-line bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t.nav.skip}
      </a>
      <Container className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
        <Link href={`/${locale}`} className="flex flex-col leading-tight" aria-label={`${t.meta.title} - ${t.nav.home}`}>
          <span className="text-xl font-bold tracking-tight text-ink">BBCare</span>
          <span className="text-xs text-muted">{t.meta.descriptor}</span>
        </Link>
        <nav aria-label="Main" className="order-3 w-full sm:order-2 sm:w-auto">
          <ul className="-mx-1 flex gap-1 overflow-x-auto text-sm whitespace-nowrap sm:mx-0 sm:flex-wrap sm:overflow-visible">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center rounded-md px-3 text-ink-soft hover:bg-sand hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="order-2 sm:order-3">
          <LanguageSwitch locale={locale} label={t.nav.language} short={t.nav.languageShort} />
        </div>
      </Container>
    </header>
  );
}
