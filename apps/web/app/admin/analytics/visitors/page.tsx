import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, parsePeriod, visitors } from "@/modules/analytics/intelligence";
import { AdminShell } from "@/components/admin-ui";
import { AnalyticsNav, Compare, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList, DailyColumns } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitors & Sessions" };
const PATH = "/admin/analytics/visitors";

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const v = await visitors(period);
  return (
    <AdminShell user={user} title="Visitors & Sessions">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">
        <strong>Definitions.</strong> A <em>session</em> is one browser tab visit (an id in the tab&apos;s session storage, no consent needed, no identifier stored beyond the tab). A <em>consented visitor</em> is a browser that allowed analytics and received a random visitor id for 180 days; the same person on two devices counts twice and a cleared browser counts again. BBCare has no customer accounts, so there is no count of unique people. <em>Support sessions</em> are assistant conversations; <em>cases</em> are requests sent to staff. Anonymous visitors are never matched to people across devices.
      </Notice>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="visitor-stats">
        <Compare label="Sessions" data={v.sessions} />
        <Compare label="Page views" data={v.pageViews} />
        <Compare label="Consented visitors" data={v.consented} hint="Browsers that allowed analytics" />
        <Compare label="New consented visitors" data={v.newVisitors} hint="First seen in the period" />
        <Compare label="Support sessions" data={v.supportSessions} hint="Assistant conversations" />
        <Compare label="Support cases" data={v.cases} hint="Requests to staff" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Sessions per day"><DailyColumns data={v.trendSessions} label="Sessions" /></Panel>
        <Panel title="Consented visitors per day"><DailyColumns data={v.trendVisitors} label="Visitors" /></Panel>
        <Panel title="Devices"><BarList rows={v.devices} /></Panel>
        <Panel title="Browsers"><BarList rows={v.browsers} /></Panel>
        <Panel title="Malaysian states (approximate)" hint="From an offline IP database when configured; areas under 10 sessions are hidden; raw IP is never stored"><BarList rows={v.regions} empty="No location data: the offline geo database is not configured or there is no Malaysian traffic yet." /></Panel>
        <Panel title="Countries"><BarList rows={v.countries} empty="No location data." /></Panel>
      </div>
    </AdminShell>
  );
}
