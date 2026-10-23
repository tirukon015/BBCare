import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@/i18n";
import { getCategory, listBrands, listModels } from "@/modules/catalog/service";
import { listArticles, listFlows } from "@/modules/knowledge/service";
import { ArticleList, ModelGrid } from "./cards";
import { SearchForm } from "./search-form";
import { Container, SectionHeading } from "./ui";

export async function CategoryPage({ locale, slug, brand }: { locale: Locale; slug: "router" | "laptop"; brand?: string }) {
  const t = getDictionary(locale);
  const category = await getCategory(slug, locale);
  if (!category) notFound();
  const [models, brands, articles, flows] = await Promise.all([
    listModels(slug, locale, brand),
    listBrands(slug),
    listArticles({ locale, categorySlug: slug, limit: 20 }),
    listFlows(locale, slug),
  ]);
  const base = `/${locale}/${slug === "router" ? "routers" : "laptops"}`;
  return (
    <Container className="py-8">
      <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
      <div className="mt-4 max-w-2xl">
        <SearchForm locale={locale} t={t} category={slug} />
      </div>
      {flows.length > 0 ? (
        <section className="mt-8" aria-labelledby="flows">
          <SectionHeading id="flows">{t.category.flows}</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {flows.map((f) => (
              <li key={f.slug}>
                <Link href={`/${locale}/flows/${f.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-sm hover:border-olive">{f.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-8" aria-labelledby="models">
        <SectionHeading id="models">{t.category.findModel}</SectionHeading>
        {brands.length > 1 ? (
          <nav aria-label={t.category.allBrands} className="mb-3 flex flex-wrap gap-2 text-sm">
            <Link href={base} aria-current={!brand ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 ${!brand ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{t.category.allBrands}</Link>
            {brands.map((b) => (
              <Link key={b.slug} href={`${base}?brand=${b.slug}`} aria-current={brand === b.slug ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 ${brand === b.slug ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{b.name}</Link>
            ))}
          </nav>
        ) : null}
        <ModelGrid items={models} locale={locale} emptyText={t.category.noModels} />
      </section>
      <section className="mt-10" aria-labelledby="guides">
        <SectionHeading id="guides">{t.category.guides}</SectionHeading>
        <ArticleList items={articles} locale={locale} t={t} emptyText={t.category.noGuides} />
      </section>
    </Container>
  );
}
