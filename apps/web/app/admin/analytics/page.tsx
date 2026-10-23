import Link from "next/link";
import { redirect } from "next/navigation";
import { rollupDay } from "@bbcare/db";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { dashboardData, parseRange } from "@/modules/analytics/dashboard";
import { audit } from "@/modules/audit/service";
import { db } from "@/lib/db";
import { AdminShell, Stat } from "@/components/admin-ui";
import { BarList, DailyColumns } from "@/components/charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

async function refreshAction(form: FormData) {
  "use server";
  const user = await assertPermission("analytics.read");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await rollupDay(db(), yesterday);
  await rollupDay(db(), today);
  await audit({ actorId: user.id, action: "analytics.refresh" });
  redirect(`/admin/analytics?range=${String(form.get("range") ?? "7")}`);
}

function Panel({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireStaff("analytics.read");
  const range = parseRange((await searchParams).range);
  const d = await dashboardData(range);
  const t = d.totals;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  return (
    <AdminShell user={user} title="Analytics" actions={
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[7, 30, 90].map((r) => <Link key={r} href={`/admin/analytics?range=${r}`} aria-current={r === range ? "page" : undefined} className={`rounded-full border px-3 py-2 ${r === range ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{r} days</Link>)}
        <form action={refreshAction}><input type="hidden" name="range" value={range} /><button className="rounded-lg border border-line bg-white px-3 py-2">Refresh today</button></form>
        {user.permissions.has("analytics.export") ? <a href={`/admin/analytics/export?range=${range}`} className="rounded-lg border border-line bg-white px-3 py-2">Export CSV</a> : null}
      </div>
    }>
      <p className="mb-4 text-xs text-muted">First-party, aggregated data. Visitor counts include only visitors who allowed analytics; locations are approximate (IP-derived state, raw IP never stored) and areas with fewer than 10 sessions are hidden. A Shopee click is a referral, not a confirmed sale.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions" value={t.sessions} hint={`${t.pageViews} page views`} />
        <Stat label="Visitors (consented)" value={t.consented} hint={`${t.newVisitors} new · ${t.returning} returning (estimate)`} />
        <Stat label="Support sessions" value={t.started} hint={`Resolved ${pct(t.resolved, t.started)} · Escalated ${pct(t.escalated, t.started)}`} />
        <Stat label="Feedback" value={`${t.feedbackUp} / ${t.feedbackDown}`} hint="helpful / not helpful" />
      </div>
      <div className="mt-4"><Panel title="Sessions per day"><DailyColumns data={d.daily} label="Sessions" /></Panel></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Journey funnel" hint="Sessions reaching each step"><BarList rows={d.funnel} /></Panel>
        <Panel title="Model demand" hint="Resolved model searches and model page views"><BarList rows={d.models} /></Panel>
        <Panel title="Top searches"><BarList rows={d.searches} /></Panel>
        <Panel title="Searches with no results" hint="Knowledge gaps to address"><BarList rows={d.failed} /></Panel>
        <Panel title="Popular guides"><BarList rows={d.articles} /></Panel>
        <Panel title="Recommendations" hint="Impressions and outbound referral clicks per product">
          <BarList rows={d.products.map((p) => ({ label: p.label, value: p.impressions, note: `· ${p.clicks} clicks (${pct(p.clicks, p.impressions)})` }))} />
        </Panel>
        <Panel title="Landing pages"><BarList rows={d.landing} /></Panel>
        <Panel title="Traffic sources"><BarList rows={d.referrers} /></Panel>
        <Panel title="Malaysian states (approximate)"><BarList rows={d.regions} empty="No location data (offline geo database not configured or no Malaysian traffic yet)." /></Panel>
        <Panel title="Devices"><BarList rows={d.devices} /></Panel>
        <Panel title="Browsers"><BarList rows={d.browsers} /></Panel>
        <Panel title="Exit pages" hint="Exits per page type; note shows exits before 50% scroll">
          <BarList rows={d.exits.map((e) => ({ label: e.label, value: e.value, note: `· ${e.shallow ?? 0} shallow` }))} />
        </Panel>
        <Panel title="Tracked clicks"><BarList rows={d.clicks} /></Panel>
        <Panel title="Core Web Vitals (p75, ms; CLS ×1000)"><BarList rows={d.vitals} /></Panel>
        <Panel title="Errors"><BarList rows={d.errors} empty="No errors recorded." /></Panel>
      </div>
    </AdminShell>
  );
}
