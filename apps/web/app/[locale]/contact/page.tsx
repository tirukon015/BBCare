import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { env } from "@/lib/env";
import { ButtonLink, Card, Container } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return { title: getDictionary(localeOrDefault((await params).locale)).contact.title };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const t = getDictionary(locale);
  const e = env();
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-2xl font-bold">{t.contact.title}</h1>
      <p className="mt-2 text-ink-soft">{t.contact.body}</p>
      <div className="mt-6 grid gap-3">
        <Card>
          <ButtonLink href={`/${locale}/support?escalate=1`} data-track="contact.escalate">{t.contact.escalate}</ButtonLink>
        </Card>
        <Card>
          <ul className="space-y-2 text-sm">
            <li><a className="text-olive underline" href="https://shopee.com.my/bbtech.shop" rel="noopener" target="_blank" data-track="contact.shopee">{t.contact.shopee}</a></li>
            <li><a className="text-olive underline" href="https://www.bbtech.shop/" rel="noopener" target="_blank" data-track="contact.store">{t.contact.store}</a></li>
            {e.BBCARE_SUPPORT_CONTACT_WHATSAPP ? <li><a className="text-olive underline" href={`https://wa.me/${e.BBCARE_SUPPORT_CONTACT_WHATSAPP}`} rel="noopener" target="_blank" data-track="contact.whatsapp">WhatsApp</a></li> : null}
            {e.BBCARE_SUPPORT_CONTACT_EMAIL ? <li><a className="text-olive underline" href={`mailto:${e.BBCARE_SUPPORT_CONTACT_EMAIL}`}>{e.BBCARE_SUPPORT_CONTACT_EMAIL}</a></li> : null}
          </ul>
        </Card>
      </div>
    </Container>
  );
}
