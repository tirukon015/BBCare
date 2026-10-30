import Link from "next/link";
import type { Period } from "@/modules/analytics/intelligence";
import { adminButton, adminInput } from "./admin-ui";
import { cx } from "./ui";

/** Sections of Customer Analytics and Intelligence. The demand section is its own page family. */
export const ANALYTICS_SECTIONS = [
  { href: "/admin/analytics", label: "Overview" },
  { href: "/admin/analytics/sources", label: "Traffic Sources" },
  { href: "/admin/analytics/visitors", label: "Visitors & Sessions" },
  { href: "/admin/analytics/geo", label: "Geographic Analytics" },
  { href: "/admin/analytics/behaviour", label: "Website Behaviour" },
  { href: "/admin/analytics/journey", label: "Customer Journey" },
  { href: "/admin/analytics/heatmaps", label: "Heatmaps" },
  { href: "/admin/analytics/routers", label: "Router Analytics" },
  { href: "/admin/analytics/support", label: "Support Analytics" },
  { href: "/admin/demand", label: "Customer Demand Intelligence" },
  { href: "/admin/analytics/media", label: "Media Performance" },
  { href: "/admin/analytics/campaigns", label: "Campaign Analytics" },
  { href: "/admin/analytics/settings", label: "Privacy & Tracking Settings" },
] as const;

export function periodQuery(p: Period): string {
  return p.key === "custom" ? `range=custom&from=${p.from}&to=${p.to}` : `range=${p.key}`;
}

export function AnalyticsNav({ current, period }: { current: string; period: Period }) {
  const q = periodQuery(period);
  return (
    <nav aria-label="Customer Analytics and Intelligence" className="mb-4 -mx-1 flex gap-1 overflow-x-auto whitespace-nowrap text-sm">
      {ANALYTICS_SECTIONS.map((s) => (
        <Link key={s.href} href={s.href.startsWith("/admin/analytics") ? `${s.href}?${q}` : s.href} aria-current={s.href === current ? "page" : undefined}
          className={cx("inline-flex min-h-10 items-center rounded-full border px-3", s.href === current ? "border-olive bg-olive-soft font-medium" : "border-line bg-white hover:bg-sand")}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

const PRESETS: { key: Period["key"]; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7", label: "Last 7 days" }, { key: "30", label: "Last 30 days" }, { key: "90", label: "Last 90 days" },
];

export function PeriodPicker({ period, path }: { period: Period; path: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 text-sm" data-testid="period-picker">
      {PRESETS.map((r) => (
        <Link key={r.key} href={`${path}?range=${r.key}`} aria-current={r.key === period.key ? "page" : undefined}
          className={cx("inline-flex min-h-10 items-center rounded-lg border px-3", r.key === period.key ? "border-olive bg-olive-soft font-medium" : "border-line bg-white hover:bg-sand")}>{r.label}</Link>
      ))}
      <form method="get" action={path} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <label>From<input type="date" name="from" defaultValue={period.from} className={adminInput} /></label>
        <label>To<input type="date" name="to" defaultValue={period.to} className={adminInput} /></label>
        <button className={adminButton}>Apply</button>
      </form>
      <p className="text-xs text-muted">{period.from} to {period.to} ({period.days} day{period.days === 1 ? "" : "s"}), compared with {period.prevFrom} to {period.prevTo}.</p>
    </div>
  );
}

/** A headline number with its change against the previous period. */
export function Compare({ label, data, hint, format }: { label: string; data: { value: number; previous: number; change: number | null }; hint?: string; format?: (n: number) => string }) {
  const f = format ?? ((n: number) => String(n));
  const tone = data.change === null ? "text-muted" : data.change >= 0 ? "text-olive-dark" : "text-danger";
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4" data-testid="compare-stat">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{f(data.value)}</p>
      <p className={cx("mt-1 text-xs", tone)}>{data.change === null ? `previous period: ${f(data.previous)}` : `${data.change >= 0 ? "+" : ""}${data.change}% versus ${f(data.previous)} previously`}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Panel({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}
