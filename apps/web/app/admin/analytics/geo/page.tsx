import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, geoSummary, parsePeriod } from "@/modules/analytics/intelligence";
import { geoStatus } from "@/lib/geo";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker, periodQuery } from "@/components/analytics-nav";
import { MalaysiaMap } from "@/components/analytics/malaysia-map";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Geographic Analytics" };
const PATH = "/admin/analytics/geo";

export default async function GeoPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const [g, status] = await Promise.all([geoSummary(period), Promise.resolve(geoStatus())]);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const shown = g.states.filter((s) => s.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  return (
    <AdminShell user={user} title="Geographic Analytics">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">
        Locations are approximate, estimated from the network address with an offline database at the moment an event arrives; the address itself is never stored. State is recorded for every session, city only when the visitor allowed analytics. Areas with fewer than 10 sessions are shown as &quot;under 10&quot;. This is aggregate activity by area, never a person&apos;s position.
      </Notice>
      {!status.configured ? (
        <div className="mt-3"><Notice tone="warn" role="status">The offline geolocation database is not configured on this server (<code>BBCARE_GEOIP_CSV</code>), so new sessions are recorded without a location. See <code>docs/analytics/geographic-analytics.md</code>.</Notice></div>
      ) : null}
      <div className="mt-4">
        <MalaysiaMap query={periodQuery(period)} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4" data-testid="geo-totals">
        <Panel title="Sessions in period"><p className="text-2xl font-semibold">{g.totalSessions}</p></Panel>
        <Panel title="Malaysia"><p className="text-2xl font-semibold">{g.malaysiaSessions}</p><p className="text-xs text-muted">{g.malaysiaStateUnknown} without a state</p></Panel>
        <Panel title="Other countries"><p className="text-2xl font-semibold">{g.countries.reduce((a, c) => a + c.sessions, 0)}</p></Panel>
        <Panel title="Unknown location"><p className="text-2xl font-semibold">{g.unknownSessions}</p><p className="text-xs text-muted">{pct(g.unknownSessions, g.totalSessions)} of sessions</p></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Visitors and activity by state</h2>
      <Table head={["State", "Sessions", "Previous", "Consented visitors", "New sessions", "Page views", "Router selections", "Mesh support", "AI chats", "Escalations", "Cases", "Resource opens", "Completed guides"]} empty={shown.length === 0}>
        {shown.map((s) => (
          <tr key={s.code} data-testid={`geo-row-${s.code}`}>
            <Td>{s.name}</Td><Td>{s.suppressed ? "under 10" : s.sessions}</Td><Td>{s.previous}</Td><Td>{s.visitors}</Td><Td>{s.newSessions}</Td><Td>{s.pageViews}</Td>
            <Td>{s.router}</Td><Td>{s.mesh}</Td><Td>{s.ai}</Td><Td>{s.escalated}</Td><Td>{s.cases}</Td><Td>{s.media}</Td><Td>{s.completed}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Sessions by country" hint="Countries other than Malaysia"><BarList rows={g.countries.map((c) => ({ label: c.country, value: c.sessions }))} empty="No sessions from other countries." /></Panel>
        <Panel title="How to read this" hint="Accuracy and limits">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Mobile networks often resolve to the operator&apos;s city, so Kuala Lumpur and Selangor are over-represented for phone visitors.</li>
            <li>VPNs and corporate networks resolve to the exit point, which may be another country.</li>
            <li>Cities are shown only where the dataset names one and at least 10 sessions share it.</li>
          </ul>
        </Panel>
      </div>
    </AdminShell>
  );
}
