import { requireStaff } from "@/modules/identity/service";
import { behaviour, ensureFreshAggregates, parsePeriod } from "@/modules/analytics/intelligence";
import { AdminShell } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website Behaviour" };
const PATH = "/admin/analytics/behaviour";

export default async function BehaviourPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const b = await behaviour(period);
  return (
    <AdminShell user={user} title="Website Behaviour">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">Page views, tagged clicks (navigation, cards, buttons), searches, guide views, exits and page-to-page paths. Search queries are stored after personal-data removal. No keystrokes, form contents or screen recordings are collected.</Notice>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Most viewed pages" hint="Page type and language"><BarList rows={b.pages} /></Panel>
        <Panel title="Tracked clicks" hint="Element key and page type"><BarList rows={b.clicks} /></Panel>
        <Panel title="Popular navigation paths" hint="Consecutive page types within a session"><BarList rows={b.navPaths} /></Panel>
        <Panel title="Exit pages" hint="Exits per page type; note shows exits before 50% scroll"><BarList rows={b.exits} /></Panel>
        <Panel title="Top searches"><BarList rows={b.searches} /></Panel>
        <Panel title="Searches with no results" hint="Knowledge gaps to address"><BarList rows={b.failed} /></Panel>
        <Panel title="Most viewed guides"><BarList rows={b.articles} /></Panel>
      </div>
    </AdminShell>
  );
}
