import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, parsePeriod, recentSupportSessions, supportAnalytics } from "@/modules/analytics/intelligence";
import { AdminShell, StatusPill, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Compare, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support Analytics" };
const PATH = "/admin/analytics/support";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const canReadTranscripts = user.permissions.has("support.transcripts.read");
  const canReadCases = user.permissions.has("cases.write");
  const [s, sessions] = await Promise.all([supportAnalytics(period), canReadTranscripts ? recentSupportSessions(period, 50) : Promise.resolve([])]);
  return (
    <AdminShell user={user} title="Support Analytics">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="support-stats">
        <Compare label="Support started" data={s.started} hint="Assistant conversations and chosen problems" />
        <Compare label="Marked as fixed" data={s.resolved} />
        <Compare label="Escalated to staff" data={s.escalated} />
        <Compare label="Missing-resource requests" data={s.demand} hint={`${s.demand.open} open requirements`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Funnel" hint="Sessions reaching each stage"><BarList rows={s.funnel} /></Panel>
        <Panel title="Assistant outcomes"><BarList rows={s.outcomes} /></Panel>
        <Panel title="Escalation points" hint="Origin and problem"><BarList rows={s.escalations} empty="No escalations in this period." /></Panel>
        <Panel title="Case follow-ups" hint="Customers checking or replying to a case"><BarList rows={s.followups} empty="No follow-ups in this period." /></Panel>
        <Panel title="Cases by status"><BarList rows={s.cases} empty="No cases in this period." /></Panel>
        <Panel title="Cases by arrival channel" hint="Channel recorded when the case was created; unknown means nothing reliable was available"><BarList rows={s.caseChannels} empty="No cases in this period." /></Panel>
        <Panel title="Cases by router model"><BarList rows={s.caseModels} empty="No cases in this period." /></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Recent support sessions</h2>
      {canReadTranscripts ? (
        <>
          <Notice role="note">Session list for investigation. Message text is not shown here; open the linked case to read a transcript, which is audited. Channel is the recorded arrival channel for that session.</Notice>
          <div className="mt-3">
            <Table head={["Started", "Session", "Model", "Mode", "Language", "Customer messages", "Status", "Channel", "Case"]} empty={sessions.length === 0}>
              {sessions.map((x) => (
                <tr key={x.public_id} data-testid="support-session-row">
                  <Td className="whitespace-nowrap text-xs">{x.created_at.toISOString().slice(0, 16).replace("T", " ")}</Td>
                  <Td className="font-mono text-xs">{x.public_id.slice(0, 8)}</Td>
                  <Td>{x.model ?? "-"}</Td><Td>{x.mode}</Td><Td>{x.locale}</Td><Td>{x.messages}</Td>
                  <Td><StatusPill status={x.status} /></Td><Td>{x.channel ?? "unknown"}</Td>
                  <Td>{x.case_id && canReadCases ? <Link href={`/admin/cases/${x.case_id}`} className="text-olive underline">{x.reference}</Link> : x.reference ?? "-"}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      ) : <p className="text-sm text-muted">Session investigation needs the transcript-reading permission (analyst or supervisor role).</p>}
    </AdminShell>
  );
}
