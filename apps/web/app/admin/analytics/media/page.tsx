import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { ensureFreshAggregates, media, parsePeriod } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel, PeriodPicker } from "@/components/analytics-nav";
import { BarList } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media Performance" };
const PATH = "/admin/analytics/media";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  await ensureFreshAggregates();
  const m = await media(period);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const kinds = { video: "Video", diagram: "Diagram", image: "Image or photo", document: "Document" } as const;
  return (
    <AdminShell user={user} title="Media Performance">
      <AnalyticsNav current={PATH} period={period} />
      <PeriodPicker period={period} path={PATH} />
      <Notice role="note">Opens are plays, enlargements or downloads of approved library resources on scenario pages. Video progress is reported at 25, 50, 75 and 100 percent from the player position only. Votes are the helpful / not helpful buttons. Resources are managed in the <Link href="/admin/resources" className="underline">resource library</Link>.</Notice>
      <h2 className="mb-2 mt-4 font-semibold">Resources used</h2>
      <Table head={["Type", "Resource", "Model", "Language", "Opens", "Watched 50%", "Watched to end", "Helpful", "Not helpful"]} empty={m.all.length === 0}>
        {m.all.map((r) => (
          <tr key={r.id} data-testid="media-row">
            <Td>{kinds[r.kind as keyof typeof kinds] ?? r.kind}</Td><Td>{r.title}</Td><Td>{r.model ?? "-"}</Td><Td>{r.locale === "ms" ? "Malay" : r.locale === "en" ? "English" : "Both"}</Td>
            <Td>{r.opens}</Td>
            <Td>{r.kind === "video" ? `${r.p50} (${pct(r.p50, r.opens)})` : "n/a"}</Td>
            <Td>{r.kind === "video" ? `${r.p100} (${pct(r.p100, r.opens)})` : "n/a"}</Td>
            <Td>{r.up}</Td><Td>{r.down}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Opens by router model"><BarList rows={m.byModel} /></Panel>
        <Panel title="Opens by language"><BarList rows={m.byLocale} /></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Demand versus availability</h2>
      <Table head={["Resource type", "Approved resources", "Open requirements", "Requests in period"]}>
        {m.gaps.map((g) => <tr key={g.resource_type}><Td>{kinds[g.resource_type as keyof typeof kinds] ?? g.resource_type}</Td><Td>{g.approved}</Td><Td>{g.open_demands}</Td><Td>{g.requests}</Td></tr>)}
      </Table>
      <h2 className="mb-2 mt-6 font-semibold">Did fulfilling a requirement reduce repeat requests?</h2>
      <Table head={["Requirement", "Fulfilled", "Requests before", "Requests after"]} empty={m.after.length === 0}>
        {m.after.map((a, i) => <tr key={i}><Td>{a.requirement}</Td><Td className="whitespace-nowrap text-xs">{a.fulfilled_at.toISOString().slice(0, 10)}</Td><Td>{a.before}</Td><Td>{a.after}</Td></tr>)}
      </Table>
    </AdminShell>
  );
}
