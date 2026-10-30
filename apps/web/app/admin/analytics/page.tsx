import Link from "next/link";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, overview, parsePeriod } from "@/modules/analytics/intelligence";
import { audit } from "@/modules/audit/service";
import { AdminShell } from "@/components/admin-ui";
import { AnalyticsNav, Compare, Panel, PeriodPicker, periodQuery } from "@/components/analytics-nav";
import { BarList, DailyColumns } from "@/components/charts";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Analytics & Intelligence" };

const PATH = "/admin/analytics";

async function refreshAction(form: FormData) {
  "use server";
  const user = await assertPermission("analytics.read");
  await ensureFreshAggregates(true);
  await audit({ actorId: user.id, action: "analytics.refresh" });
  redirect(`${PATH}?${String(form.get("q") ?? "range=7")}`);
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const d = await overview(period);
  const q = periodQuery(period);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const groupLabel: Record<string, string> = { shopee: "Shopee", google: "Google", search: "Other search engines", social: "Social media", referral: "Referral websites", qr_code: "QR codes", direct_link: "Direct links (labelled)", labelled: "Other labelled links", website: "BBCare website", unknown: "Unknown" };
  return (
    <AdminShell user={user} title="Customer Analytics & Intelligence" actions={
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <form action={refreshAction}><input type="hidden" name="q" value={q} /><button className="rounded-lg border border-line bg-white px-3 py-2">Refresh now</button></form>
        {user.permissions.has("analytics.export") ? <Link href={`/admin/analytics/export?${q}`} prefetch={false} className="rounded-lg border border-line bg-white px-3 py-2">Export CSV</Link> : null}
      </div>
    }>
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <p className="mb-4 text-xs text-muted">First-party, aggregated counts. Sessions are browser sessions; visitor counts include only visitors who allowed analytics; a session is not a verified person. Locations are approximate and small areas are hidden. A Shopee click is a referral, not a confirmed sale.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-stats">
        <Compare label="Sessions" data={d.sessions} hint={`${d.pageViews.value} page views`} />
        <Compare label="Consented visitors" data={d.visitors} hint={`${d.newVisitors.value} first seen in period`} />
        <Compare label="Router selections" data={d.routerSelections} hint="Model pages opened" />
        <Compare label="Support started" data={d.supportStarted} hint={`Resolved ${pct(d.resolved.value, d.supportStarted.value)} · Escalated ${d.escalations.value}`} />
        <Compare label="Escalations to staff" data={d.escalations} />
        <Compare label="Resource opens" data={d.resourceOpens} hint="Approved videos, diagrams, images, documents" />
        <Compare label="Missing-resource requests" data={d.demandRequests} hint={`${d.demandRequests.open} open requirements`} />
      </div>
      <div className="mt-4"><Panel title="Sessions per day"><DailyColumns data={d.trend} label="Sessions" /></Panel></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Where visitors come from" hint="From link labels, UTM parameters and referrer hosts only"><BarList rows={d.topSources.map((g) => ({ label: groupLabel[g.group] ?? g.group, value: g.sessions }))} /></Panel>
        <Panel title="Most selected router models"><BarList rows={d.topModels} /></Panel>
        <Panel title="Most selected problems"><BarList rows={d.topScenarios} /></Panel>
        <Panel title="Most viewed pages"><BarList rows={d.topPages} /></Panel>
      </div>
    </AdminShell>
  );
}
