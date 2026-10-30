import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, parsePeriod, routers } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Router Analytics" };
const PATH = "/admin/analytics/routers";

export default async function RoutersPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const r = await routers(period);
  const change = (v: number, prev: number) => (prev ? `${v >= prev ? "+" : ""}${Math.round(((v - prev) / prev) * 100)}%` : v ? "new" : "-");
  return (
    <AdminShell user={user} title="Router Analytics">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">Counts are selections on the router pages: a model card, then Mesh or AP, then a problem. &quot;Without a verified guide&quot; means the customer reached a problem for which no published verified guide existed at that moment, so they were offered the assistant or staff instead. That list is the most direct measure of missing router content.</Notice>
      <h2 className="mb-2 mt-4 font-semibold">Models selected</h2>
      <Table head={["Model", "Selections", "Previous period", "Change"]} empty={r.models.length === 0}>
        {r.models.map((m) => <tr key={m.label} data-testid="router-model-row"><Td>{m.label}</Td><Td>{m.value}</Td><Td>{m.previous}</Td><Td>{change(m.value, m.previous)}</Td></tr>)}
      </Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Mesh versus AP by model"><BarList rows={r.modes} /></Panel>
        <Panel title="Problems selected" hint="With whether a verified guide existed"><BarList rows={r.scenarios} /></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Guide step outcomes</h2>
      <Table head={["Guide", "Step", "Continued", "Went back", "Fixed it", "Escalated", "Restarted"]} empty={r.steps.length === 0}>
        {r.steps.map((st) => <tr key={`${st.flow}-${st.step}`}><Td>{st.flow}</Td><Td className="font-mono text-xs">{st.step}</Td><Td>{st.next}</Td><Td>{st.back}</Td><Td>{st.resolved}</Td><Td>{st.escalate}</Td><Td>{st.restart}</Td></tr>)}
      </Table>
    </AdminShell>
  );
}
