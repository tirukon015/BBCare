import type { Metadata } from "next";
import { getDictionary, localeOrDefault } from "@/i18n";
import { CategoryPage } from "@/components/category-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(localeOrDefault((await params).locale));
  return { title: t.nav.laptops };
}

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ brand?: string }> }) {
  const locale = localeOrDefault((await params).locale);
  const { brand } = await searchParams;
  return <CategoryPage locale={locale} slug="laptop" brand={typeof brand === "string" && /^[a-z0-9-]{1,40}$/.test(brand) ? brand : undefined} />;
}
