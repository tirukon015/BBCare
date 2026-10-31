import Image from "next/image";
import Link from "next/link";
import { createElement, type ReactNode } from "react";
import { ArrowRight, Battery, Cable, ChevronRight, Clock, Gauge, Globe, Keyboard, Laptop, Monitor, MonitorX, Power, RefreshCw, Router, Settings, Share2, Wifi, type LucideIcon } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import type { ArticleCard } from "@/modules/knowledge/service";
import { Badge, cx } from "./ui";

/** Icon for each common issue key; unknown keys fall back to a settings icon. */
const ISSUE_ICONS: Record<string, LucideIcon> = {
  no_internet: Globe, wifi: Wifi, config: Settings, easymesh: Share2, red_light: Router, ap: Router, lan: Cable, reset: RefreshCw, restart: RefreshCw,
  power: Power, slow: Gauge, battery: Battery, bsod: MonitorX, driver: Settings, keyboard: Keyboard, display: Monitor,
};

export function issueIcon(key: string): LucideIcon { return ISSUE_ICONS[key] ?? Settings; }
/** Icon element for an issue key, created outside render-time component definitions. */
export function renderIssueIcon(key: string, className: string) { return createElement(issueIcon(key), { className, "aria-hidden": true }); }

export function PageHero({ eyebrow, title, intro, children, visual, className }: { eyebrow?: string; title: ReactNode; intro?: string; children?: ReactNode; visual?: ReactNode; className?: string }) {
  return (
    <section className={cx("hero-glow border-b border-line", className)}>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          {eyebrow ? <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-dark">{eyebrow}</span> : null}
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl lg:text-5xl">{title}</h1>
          {intro ? <p className="mt-4 max-w-xl text-base text-ink-soft sm:text-lg">{intro}</p> : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
        {visual ? <div className="hidden lg:block">{visual}</div> : null}
      </div>
    </section>
  );
}

/** Decorative hero visual: the two product placeholders on soft blue plinths. Replaceable by real photography. */
export function HeroVisual({ laptopAlt, routerAlt }: { laptopAlt: string; routerAlt: string }) {
  return (
    <div className="relative mx-auto h-72 w-full max-w-md" aria-hidden="true">
      <div className="absolute left-0 top-4 w-64 rotate-[-4deg] rounded-2xl bg-white p-3 shadow-[var(--shadow-card)]">
        <Image src="/brand/placeholder-laptop.svg" alt={laptopAlt} width={320} height={200} className="h-auto w-full rounded-xl" />
      </div>
      <div className="absolute bottom-0 right-0 w-56 rotate-[5deg] rounded-2xl bg-white p-3 shadow-[var(--shadow-card)]">
        <Image src="/brand/placeholder-router.svg" alt={routerAlt} width={320} height={200} className="h-auto w-full rounded-xl" />
      </div>
    </div>
  );
}

export function SectionHeader({ title, href, linkLabel, intro, id }: { title: string; href?: string; linkLabel?: string; intro?: string; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h2>
        {intro ? <p className="mt-1 text-sm text-ink-soft">{intro}</p> : null}
      </div>
      {href && linkLabel ? <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">{linkLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : null}
    </div>
  );
}

export function ProductEntryCard({ href, title, body, kind, cta }: { href: string; title: string; body: string; kind: "laptop" | "router"; cta: string }) {
  return (
    <Link href={href} data-track={`home.${kind}_card`} data-testid={`entry-${kind}`}
      className="group flex items-center gap-5 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-colors hover:border-primary sm:p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-dark">{kind === "laptop" ? <Laptop className="h-6 w-6" aria-hidden="true" /> : <Router className="h-6 w-6" aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold text-ink">{title}</span>
        <span className="mt-1 block text-sm text-ink-soft">{body}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark group-hover:underline">{cta} <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
      </span>
      <Image src={kind === "laptop" ? "/brand/placeholder-laptop.svg" : "/brand/placeholder-router.svg"} alt="" width={160} height={100} className="hidden h-24 w-auto rounded-xl sm:block" />
    </Link>
  );
}

export function IssueCard({ href, title, iconKey, compact = false }: { href: string; title: string; iconKey: string; compact?: boolean }) {
  return (
    <Link href={href} data-track="issue.card" data-testid={`issue-${iconKey}`}
      className={cx("flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] transition-colors hover:border-primary", compact ? "p-3" : "flex-col items-start p-4 text-left sm:min-h-32")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-dark">{renderIssueIcon(iconKey, "h-5 w-5")}</span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      {compact ? <ChevronRight className="ml-auto h-4 w-4 text-muted" aria-hidden="true" /> : null}
    </Link>
  );
}

/** Brand tile. No manufacturer logos are bundled; the brand name is set in a clean tile until BBTech supplies approved logo files. */
export function BrandCard({ href, name, count, countLabel }: { href: string; name: string; count?: number; countLabel?: string }) {
  return (
    <Link href={href} data-track="brand.card" data-testid={`brand-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-line bg-white p-4 text-center shadow-[var(--shadow-card)] transition-colors hover:border-primary">
      <span className="text-lg font-bold tracking-tight text-ink">{name}</span>
      {count !== undefined && countLabel ? <span className="text-xs text-muted">{count} {countLabel}</span> : null}
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-dark">{countLabel ? null : null}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
    </Link>
  );
}

export function GuideCard({ a, locale, t, kindLabel }: { a: ArticleCard; locale: Locale; t: Dictionary; kindLabel: string }) {
  const img = a.categorySlug === "laptop" ? "/brand/placeholder-laptop.svg" : "/brand/placeholder-router.svg";
  return (
    <Link href={`/${locale}/articles/${a.slug}`} data-track="article.card" data-testid="guide-card"
      className="group flex h-full gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{kindLabel}</Badge>
          {a.safetyLevel !== "normal" ? <Badge tone={a.safetyLevel === "danger" ? "danger" : "warn"}>!</Badge> : null}
          {a.locale !== locale ? <Badge>{a.locale.toUpperCase()}</Badge> : null}
        </span>
        <span className="mt-2 block font-semibold leading-snug text-ink group-hover:text-primary-dark">{a.title}</span>
        {a.summary ? <span className="mt-1 line-clamp-2 block text-sm text-ink-soft">{a.summary}</span> : null}
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{a.readingMinutes} {t.site.article.readTime}</span>
      </span>
      <Image src={img} alt="" width={160} height={100} className="h-20 w-32 shrink-0 rounded-xl object-cover" />
    </Link>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1">
            {it.href ? <Link href={it.href} className="hover:text-primary-dark hover:underline">{it.label}</Link> : <span className="text-ink" aria-current="page">{it.label}</span>}
            {i < items.length - 1 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white p-6 text-center">
      <Image src="/brand/bbcare-logo-icon.png" alt="" width={48} height={48} className="mx-auto h-12 w-12 object-contain opacity-90" />
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 text-sm text-ink-soft">{body}</p> : null}
      {children ? <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
