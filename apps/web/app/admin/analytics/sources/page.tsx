import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, parsePeriod, sourcesSummary } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList, DailyColumns } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Traffic Sources" };
const PATH = "/admin/analytics/sources";
const GROUP: Record<string, string> = { shopee: "Shopee", google: "Google", search: "Other search engines", social: "Social media", referral: "Referral websites", qr_code: "QR codes", direct_link: "Direct links (labelled)", labelled: "Other labelled links", website: "BBCare website", unknown: "Unknown" };
const CHANNEL: Record<string, string> = { website: "BBCare website", shopee: "Shopee", qr_code: "QR code", direct_link: "Direct link", other: "Other (referrer or label)", unknown: "Unknown" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const s = await sourcesSummary(period);
  const pct = (a: number | null, b: number) => (a === null ? "n/a" : b ? `${Math.round((a / b) * 100)}%` : "-");
  const change = (v: number, prev: number) => (prev ? `${v >= prev ? "+" : ""}${Math.round(((v - prev) / prev) * 100)}%` : "new");
  return (
    <AdminShell user={user} title="Traffic Sources">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">A source is recorded only from what the link or browser carried: an explicit label (<code>?ch=shopee</code>, <code>?ch=qr</code>), UTM parameters, or the referrer host. Browsers often omit referrers, so &quot;Unknown&quot; is expected and is never counted as direct traffic. Conversion columns count sessions that went on to open a router model, start support (assistant or a chosen problem), escalate to staff, or open a resource.</Notice>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Sessions by source group"><BarList rows={s.groups.map((g) => ({ label: GROUP[g.group] ?? g.group, value: g.sessions, note: `· ${change(g.sessions, g.previous)}` }))} /></Panel>
        <Panel title="Shopee sessions per day" hint="Sessions whose arrival was labelled or referred from Shopee"><DailyColumns data={s.trendShopee} label="Shopee sessions" /></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Source groups and what visitors did next</h2>
      <Table head={["Source", "Sessions", "Previous", "Opened a router", "Started support", "Escalated", "Opened a resource", "Top hosts"]} empty={s.groups.length === 0}>
        {s.groups.map((g) => (
          <tr key={g.group} data-testid={`source-${g.group}`}>
            <Td>{GROUP[g.group] ?? g.group}</Td><Td>{g.sessions}</Td><Td>{g.previous}</Td>
            <Td>{g.router === null ? "see channel table" : `${g.router} (${pct(g.router, g.sessions)})`}</Td>
            <Td>{g.support === null ? "see channel table" : `${g.support} (${pct(g.support, g.sessions)})`}</Td>
            <Td>{g.escalated === null ? "see channel table" : `${g.escalated} (${pct(g.escalated, g.sessions)})`}</Td>
            <Td>{g.media === null ? "see channel table" : `${g.media} (${pct(g.media, g.sessions)})`}</Td>
            <Td className="text-xs">{g.hosts.map((h) => `${h.label} ${h.value}`).join(", ") || "-"}</Td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-6 font-semibold">Channels (as classified at arrival)</h2>
      <Table head={["Channel", "Sessions", "Opened a router", "Started support", "Escalated", "Opened a resource"]} empty={s.channels.length === 0}>
        {s.channels.map((c) => (
          <tr key={c.channel}><Td>{CHANNEL[c.channel] ?? c.channel}</Td><Td>{c.sessions}</Td><Td>{c.router} ({pct(c.router, c.sessions)})</Td><Td>{c.support} ({pct(c.support, c.sessions)})</Td><Td>{c.escalated} ({pct(c.escalated, c.sessions)})</Td><Td>{c.media} ({pct(c.media, c.sessions)})</Td></tr>
        ))}
      </Table>
      <div className="mt-6"><Panel title="Explicit link labels" hint="Values of ?ch= seen on arriving links"><BarList rows={s.labels.map((l) => ({ label: l.key, value: l.value }))} empty="No labelled links yet. See the campaign-link convention in docs/analytics/campaign-links.md." /></Panel></div>
    </AdminShell>
  );
}
