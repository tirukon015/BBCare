import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, heatmaps, parsePeriod } from "@/modules/analytics/intelligence";
import { AdminShell } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { ClickGrid } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Heatmaps" };
const PATH = "/admin/analytics/heatmaps";

export default async function HeatmapsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const h = await heatmaps(period);
  return (
    <AdminShell user={user} title="Heatmaps">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">Interface heatmaps are built from click positions rounded to a 10 percent grid of the viewport, per page type and device size. BBCare records the grid cell and whether a link, button or field was clicked, never the element text, exact coordinates, typed values or a recording of the screen. This is a first-party aggregate, not a third-party heatmap tool.</Notice>
      <h2 className="mb-2 mt-4 font-semibold">Most-clicked interface areas</h2>
      {h.grids.length === 0 ? <p className="text-sm text-muted">No click data in this period yet.</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="click-grids">
          {h.grids.map((g) => <ClickGrid key={`${g.page}|${g.viewport}`} title={`${g.page} · ${g.viewport}`} total={g.total} cells={g.cells} />)}
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Popular navigation paths"><BarList rows={h.navPaths} /></Panel>
        <Panel title="Frequently selected router models"><BarList rows={h.models} /></Panel>
        <Panel title="Frequently selected support problems"><BarList rows={h.scenarios} /></Panel>
        <Panel title="Abandoned support journeys" hint="Sessions that chose a problem or started the assistant and did not resolve or escalate; grouped by the last page seen"><BarList rows={h.exits} empty="No abandoned journeys recorded." /></Panel>
        <Panel title="Frequently viewed resources"><BarList rows={h.resources} /></Panel>
      </div>
    </AdminShell>
  );
}
