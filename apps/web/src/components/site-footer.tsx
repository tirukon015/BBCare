import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { Container } from "./ui";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <Container className="flex flex-col gap-3 py-8 text-sm text-muted sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-md">
          <p className="font-semibold text-ink">BBCare</p>
          <p>{t.meta.descriptor}</p>
          <p className="mt-2">{t.footer.note}</p>
        </div>
        <ul className="flex flex-wrap gap-4">
          <li><Link className="underline-offset-4 hover:underline" href={`/${locale}/privacy`}>{t.nav.privacy}</Link></li>
          <li><Link className="underline-offset-4 hover:underline" href={`/${locale}/contact`}>{t.nav.contact}</Link></li>
          <li><Link className="underline-offset-4 hover:underline" href={`/${locale}/privacy#choices`}>{t.consent.manage}</Link></li>
        </ul>
      </Container>
    </footer>
  );
}
