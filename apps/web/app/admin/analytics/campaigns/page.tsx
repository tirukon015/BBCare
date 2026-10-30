import { requireStaff } from "@/modules/identity/service";
import { campaigns, ensureFreshAggregates, parsePeriod } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, PeriodPicker } from "@/components/analytics-nav";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign Analytics" };
const PATH = "/admin/analytics/campaigns";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const c = await campaigns(period);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  return (
    <AdminShell user={user} title="Campaign Analytics">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">Campaigns are the <code>utm_campaign</code> values on arriving links. <code>utm_content</code> identifies the individual QR code, card or listing inside a campaign, so a visit is tied to a physical item only when that item&apos;s own code was scanned. The link convention for BBTech staff is in <code>docs/analytics/campaign-links.md</code>.</Notice>
      <h2 className="mb-2 mt-4 font-semibold">Campaigns</h2>
      <Table head={["Campaign", "Source / medium", "Sessions", "Started support", "Escalated"]} empty={c.campaigns.length === 0}>
        {c.campaigns.map((r) => <tr key={r.name} data-testid="campaign-row"><Td>{r.name}</Td><Td className="text-xs">{r.sources.join(", ")}</Td><Td>{r.sessions}</Td><Td>{r.support} ({pct(r.support, r.sessions)})</Td><Td>{r.escalated} ({pct(r.escalated, r.sessions)})</Td></tr>)}
      </Table>
      <h2 className="mb-2 mt-6 font-semibold">Individual codes and placements (utm_content)</h2>
      <Table head={["Campaign", "Content identifier", "Sessions"]} empty={c.content.length === 0}>
        {c.content.map((r, i) => <tr key={i}><Td>{r.campaign}</Td><Td className="font-mono text-xs">{r.content}</Td><Td>{r.sessions}</Td></tr>)}
      </Table>
    </AdminShell>
  );
}
