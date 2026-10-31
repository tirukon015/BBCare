"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { BrandLogo } from "./brand";
import { OpenAssistantButton } from "./assistant/router-context";
import { LanguageSwitch } from "./language-switch";
import { Container, cx } from "./ui";

/** Customer navigation: logo, five sections, search, the BBCare AI entry point and the language switch. */
export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  const n = t.site.nav;
  const pathname = usePathname() ?? "";
  // The menu is "open for a path": navigating to another page closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? pathname : null);
  const links = [
    { href: `/${locale}`, label: n.home, exact: true },
    { href: `/${locale}/laptops`, label: n.laptops },
    { href: `/${locale}/routers`, label: n.routers },
    { href: `/${locale}/troubleshooting`, label: n.troubleshooting },
    { href: `/${locale}/guides`, label: n.guides },
  ];
  const active = (l: { href: string; exact?: boolean }) => (l.exact ? pathname === l.href : pathname.startsWith(l.href));
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">{t.nav.skip}</a>
      <Container className="flex h-16 items-center gap-3">
        <BrandLogo href={`/${locale}`} label={`${t.meta.title} - ${n.home}`} compact />
        <nav aria-label="Main" className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1 text-sm font-medium">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={active(l) ? "page" : undefined}
                  className={cx("inline-flex min-h-10 items-center rounded-full px-3.5 transition-colors", active(l) ? "bg-primary-soft text-primary-dark" : "text-ink-soft hover:bg-sand hover:text-ink")}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/${locale}/search`} aria-label={n.search} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink-soft hover:border-primary hover:text-primary-dark">
            <Search className="h-4 w-4" aria-hidden="true" />
          </Link>
          <OpenAssistantButton label={n.ai} testId="header-open-assistant" className="hidden sm:inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-[var(--shadow-card)] hover:bg-primary-dark" withIcon />
          <LanguageSwitch locale={locale} label={t.nav.language} short={t.nav.languageShort} />
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? n.closeMenu : n.menu} data-testid="menu-toggle"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink lg:hidden">
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </Container>
      {open ? (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-white lg:hidden" data-testid="mobile-nav">
          <Container className="py-3">
            <ul className="flex flex-col gap-1 text-base font-medium">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} aria-current={active(l) ? "page" : undefined} className={cx("flex min-h-11 items-center rounded-lg px-3", active(l) ? "bg-primary-soft text-primary-dark" : "text-ink hover:bg-sand")}>{l.label}</Link>
                </li>
              ))}
              <li><Link href={`/${locale}/support/case`} className="flex min-h-11 items-center rounded-lg px-3 text-ink hover:bg-sand">{n.case}</Link></li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <OpenAssistantButton label={n.ai} testId="mobile-open-assistant" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white" withIcon />
            </div>
          </Container>
        </nav>
      ) : null}
    </header>
  );
}
