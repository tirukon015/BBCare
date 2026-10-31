import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { BrandIcon } from "./brand";
import { Container } from "./ui";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const n = t.site.nav;
  const cols = [
    { title: t.site.home.routerTitle, links: [[`/${locale}/routers`, n.routers], [`/${locale}/troubleshooting`, n.troubleshooting], [`/${locale}/guides`, n.guides]] },
    { title: t.nav.support, links: [[`/${locale}/support`, t.support.title], [`/${locale}/support/case`, n.case], [`/${locale}/contact`, t.nav.contact]] },
    { title: t.nav.privacy, links: [[`/${locale}/privacy`, t.nav.privacy], [`/${locale}/privacy#choices`, t.consent.manage]] },
  ] as const;
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <Container className="grid gap-8 py-10 text-sm md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2"><BrandIcon size={36} /><span className="text-lg font-bold text-ink">BBCare</span></div>
          <p className="mt-2 text-ink-soft">{t.meta.descriptor}</p>
          <p className="mt-3 text-muted">{t.footer.note}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="font-semibold text-ink">{c.title}</p>
            <ul className="mt-2 space-y-1.5">
              {c.links.map(([href, label]) => <li key={href}><Link href={href} className="text-ink-soft underline-offset-4 hover:text-primary-dark hover:underline">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-1 py-4 text-xs text-muted sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {t.footer.rights}</span>
          <span>{t.site.chat.virtual}: {t.site.nav.ai}</span>
        </Container>
      </div>
    </footer>
  );
}
