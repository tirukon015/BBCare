import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import type { ArticleCard } from "@/modules/knowledge/service";
import type { ModelSummary } from "@/modules/catalog/service";
import type { RecommendationCard } from "@/modules/commerce/service";
import { Badge } from "./ui";

export function ArticleList({ items, locale, t, emptyText }: { items: ArticleCard[]; locale: Locale; t: Dictionary; emptyText: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={`/${locale}/articles/${a.slug}`} className="block h-full rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-olive" data-track="article.card">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {a.safetyLevel === "danger" ? <Badge tone="danger">!</Badge> : a.safetyLevel === "caution" ? <Badge tone="warn">!</Badge> : null}
              {a.models.length > 0 ? <Badge tone="olive">{a.models.join(", ")}</Badge> : null}
              {a.locale !== locale ? <Badge>{a.locale.toUpperCase()}</Badge> : null}
            </div>
            <h3 className="font-semibold text-ink">{a.title}</h3>
            {a.summary ? <p className="mt-1 text-sm text-ink-soft">{a.summary}</p> : null}
            <span className="mt-2 inline-block text-sm font-medium text-olive">{t.common.readMore}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ModelGrid({ items, locale, emptyText }: { items: ModelSummary[]; locale: Locale; emptyText: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((m) => (
        <li key={m.id}>
          <Link href={`/${locale}/models/${m.slug}`} className="block h-full rounded-[var(--radius-card)] border border-line bg-white p-4 hover:border-olive" data-track="model.card">
            <p className="text-xs uppercase tracking-wide text-muted">{m.brand}</p>
            <h3 className="font-semibold">{m.displayName}</h3>
            <p className="text-sm text-muted">{m.modelNumber}</p>
            {m.summary ? <p className="mt-1 text-sm text-ink-soft">{m.summary}</p> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RecommendationList({ items, t }: { items: RecommendationCard[]; t: Dictionary }) {
  if (items.length === 0) return null;
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <li key={r.recommendationId} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-4">
            <p className="font-semibold">{r.name}</p>
            {r.fitsModel ? <p className="mt-1 text-xs text-muted">{t.products.compatible}: {r.fitsModel}</p> : null}
            {r.summary ? <p className="mt-1 text-sm text-ink-soft">{r.summary}</p> : null}
            <a
              href={r.href}
              rel="noopener nofollow"
              target="_blank"
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-olive px-3 text-sm font-semibold text-olive hover:bg-olive-soft"
              data-track="recommendation.click"
            >
              {r.channel === "shopee" ? t.products.view : t.products.viewStore}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">{t.products.referralNote}</p>
    </div>
  );
}
