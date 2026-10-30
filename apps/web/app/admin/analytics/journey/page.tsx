import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, heatmaps, parsePeriod, routers, supportAnalytics } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker, periodQuery } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Journey" };
const PATH = "/admin/analytics/journey";

export default async function JourneyPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const [s, r, h] = await Promise.all([supportAnalytics(period), routers(period), heatmaps(period)]);
  return (
    <AdminShell user={user} title="Customer Journey">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">The journey is: arrive, choose a router, choose Mesh or AP, choose a problem, follow verified steps or answer intake questions, then resolve or escalate. Steps come from real interactions on the pages; where no verified guide exists the journey ends in a staff request.</Notice>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Funnel" hint="Sessions reaching each stage"><BarList rows={s.funnel} /></Panel>
        <Panel title="Where customers leave" hint="Last page of sessions that stopped after choosing a problem or starting the assistant"><BarList rows={h.exits} empty="No abandoned journeys recorded." /></Panel>
        <Panel title="Escalation points" hint="Where staff requests were submitted from"><BarList rows={s.escalations} empty="No escalations in this period." /></Panel>
        <Panel title="Problems chosen" hint="Note shows how many arrived where no verified guide existed"><BarList rows={r.scenarios.slice(0, 12)} /></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Step-by-step guide progress</h2>
      <Table head={["Guide", "Step", "Continued", "Went back", "Fixed it", "Escalated", "Restarted"]} empty={r.steps.length === 0}>
        {r.steps.map((st) => <tr key={`${st.flow}-${st.step}`}><Td>{st.flow}</Td><Td className="font-mono text-xs">{st.step}</Td><Td>{st.next}</Td><Td>{st.back}</Td><Td>{st.resolved}</Td><Td>{st.escalate}</Td><Td>{st.restart}</Td></tr>)}
      </Table>
      <p className="mt-4 text-sm"><Link href={`/admin/analytics/support?${periodQuery(period)}`} className="text-olive underline">Support analytics and session investigation</Link></p>
    </AdminShell>
  );
}
