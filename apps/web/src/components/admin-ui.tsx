import Link from "next/link";
import type { ReactNode } from "react";
import type { Permission } from "@bbcare/core";
import type { StaffUser } from "@/modules/identity/service";
import { cx } from "./ui";

const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/cases", label: "Cases", permission: "cases.read_assigned" },
  { href: "/admin/knowledge", label: "Knowledge", permission: "knowledge.read" },
  { href: "/admin/flows", label: "Troubleshooting flows", permission: "knowledge.read" },
  { href: "/admin/review", label: "Review queue", permission: "knowledge.review" },
  { href: "/admin/gaps", label: "Knowledge gaps", permission: "knowledge.read" },
  { href: "/admin/imports", label: "Historical imports", permission: "imports.manage" },
  { href: "/admin/catalog", label: "Catalog", permission: "catalog.read" },
  { href: "/admin/products", label: "Products & listings", permission: "commerce.read" },
  { href: "/admin/analytics", label: "Analytics", permission: "analytics.read" },
  { href: "/admin/ai", label: "AI", permission: "ai.read" },
  { href: "/admin/users", label: "Users", permission: "users.manage" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.read" },
];

export function AdminShell({ user, children, title, actions }: { user: StaffUser; children: ReactNode; title: string; actions?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-white lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block">
          <Link href="/admin" className="block font-bold">BBCare Admin</Link>
          <p className="text-xs text-muted lg:mt-1">{user.displayName}</p>
        </div>
        <nav aria-label="Admin">
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm lg:flex-col lg:overflow-visible">
            {NAV.filter((n) => !n.permission || user.permissions.has(n.permission)).map((n) => (
              <li key={n.href} className="shrink-0">
                <Link href={n.href} className="flex min-h-11 items-center rounded-md px-3 text-ink-soft hover:bg-sand hover:text-ink">{n.label}</Link>
              </li>
            ))}
            <li className="shrink-0"><Link href="/en" className="flex min-h-11 items-center rounded-md px-3 text-ink-soft hover:bg-sand">View site</Link></li>
            <li className="shrink-0">
              <form action="/admin/logout" method="post"><button className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-ink-soft hover:bg-sand">Sign out</button></form>
            </li>
          </ul>
        </nav>
      </aside>
      <div className="flex-1 overflow-x-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 sm:px-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {actions}
        </header>
        <main id="main" className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-line bg-sand text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty ? <p className="p-4 text-sm text-muted">Nothing here yet.</p> : null}
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx("px-3 py-2 align-top", className)}>{children}</td>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    ["published", "active", "resolved", "approved", "ok", "closed"].includes(status) ? "bg-olive-soft text-olive-dark"
    : ["in_review", "new", "open", "unverified", "candidate", "waiting_customer"].includes(status) ? "bg-warn-soft text-warn"
    : ["rejected", "broken", "delisted", "disabled", "failed"].includes(status) ? "bg-danger-soft text-danger"
    : "bg-sand text-ink-soft";
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{status.replace(/_/g, " ")}</span>;
}

export const adminInput = "min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
export const adminButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-olive px-4 text-sm font-semibold text-white hover:bg-olive-dark disabled:opacity-60";
export const adminButtonSecondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:bg-sand";
