import Link from "next/link";
import { SCENARIOS } from "@bbcare/core";
import { requireStaff } from "@/modules/identity/service";
import { dashboard, parseFilter, type FilterInput } from "@/modules/support/demand-admin";
import { AdminShell, Stat, StatusPill, Table, Td, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { BarList, DailyColumns } from "@/components/charts";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Demand Intelligence" };

const TYPE_LABEL: Record<string, string> = { text_guide: "Step-by-step guides", video: "Videos", diagram: "Diagrams", image: "Images", document: "Documents" };
const CHANNEL_LABEL: Record<string, string> = { website: "BBCare website", shopee: "Shopee", qr_code: "QR code", direct_link: "Direct link", other: "Other", unknown: "Unknown" };
const scenarioTitle = (key: string) => SCENARIOS.find((s) => s.key === key)?.en ?? key;

function Panel({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}

export default async function DemandPage({ searchParams }: { searchParams: Promise<FilterInput> }) {
  const user = await requireStaff("analytics.read");
  const sp = await searchParams;
  const filter = parseFilter(sp);
  const { summary: s, demands, models } = await dashboard(filter);
  const canSeeQuestions = user.permissions.has("support.transcripts.read");
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string" && v) as [string, string][]).toString();
  return (
    <AdminShell user={user} title="Customer Demand Intelligence">
      <div className="mb-4 space-y-2 text-sm">
        <Notice role="note">What customers asked for that BBCare could not yet give them: a verified guide, video, diagram, image or document for a specific router model and problem. Counts come from real requests (escalations, assistant questions, typed descriptions). Unique customers are counted per support session or case; BBCare has no customer accounts. Source channels are recorded only from what the link or browser reported; &quot;Unknown&quot; means nothing reliable was available.</Notice>
      </div>

      <form method="get" className="mb-6 grid gap-2 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm sm:grid-cols-3 lg:grid-cols-7" data-testid="demand-filters">
        <label>Router<select name="model" defaultValue={sp.model ?? ""} className={adminInput}><option value="">All</option>{models.map((m) => <option key={m.id} value={m.id}>{m.ecr_code}: {m.display_name}</option>)}</select></label>
        <label>Resource type<select name="type" defaultValue={sp.type ?? ""} className={adminInput}><option value="">All</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Language<select name="locale" defaultValue={sp.locale ?? ""} className={adminInput}><option value="">Both</option><option value="en">English</option><option value="ms">Malay</option></select></label>
        <label>Support category<select name="mode" defaultValue={sp.mode ?? ""} className={adminInput}><option value="">Both</option><option value="mesh">Mesh Connection Mode</option><option value="ap">Access Point (AP) Mode</option></select></label>
        <label>Status<select name="status" defaultValue={sp.status ?? ""} className={adminInput}><option value="">All</option>{["missing", "requested", "in_progress", "uploaded", "under_review", "approved"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label>
        <label>From<input type="date" name="from" defaultValue={fmt(filter.since)} className={adminInput} /></label>
        <label>To<input type="date" name="to" defaultValue={fmt(new Date(filter.until.getTime() - 86_400_000))} className={adminInput} /></label>
        <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-7"><button className={adminButton}>Apply filters</button><Link href="/admin/demand" className={adminButtonSecondary}>Reset</Link><Link href="/admin/resources" className={adminButtonSecondary}>Resource library</Link></div>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="demand-stats">
        <Stat label="Missing resources" value={s.totals.missingDemands} hint="Open requirements in the period" />
        <Stat label="Customer requests" value={s.totals.requests} hint="Every original request" />
        <Stat label="Unique customers affected" value={s.totals.uniqueCustomers} hint="Per session or case" />
        <Stat label="Fulfilled" value={s.totals.fulfilled} hint="Requirements now met by an approved resource" />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(["video", "diagram", "image", "document", "text_guide"] as const).map((k) => <Stat key={k} label={`Missing ${TYPE_LABEL[k]!.toLowerCase()}`} value={s.byType[k]} />)}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Demand over time" hint="Requests per day in the selected period"><DailyColumns data={s.daily} label="Requests" /></Panel>
        <Panel title="Most requested router models"><BarList rows={s.byModel} /></Panel>
        <Panel title="Most requested troubleshooting scenarios"><BarList rows={s.byScenario.map((r) => ({ label: `${r.label.startsWith("ap:") ? "AP" : "Mesh"}: ${scenarioTitle(r.label.split(":")[1]!)}`, value: r.value }))} /></Panel>
        <Panel title="Demand by source channel" hint="From link labels, UTM parameters or referrer host only"><BarList rows={s.byChannel.map((r) => ({ label: CHANNEL_LABEL[r.label] ?? r.label, value: r.value }))} /></Panel>
        <Panel title="English versus Malay resource gaps" hint="Open requirements by required language"><BarList rows={[{ label: "English", value: s.byLocale.en }, { label: "Malay", value: s.byLocale.ms }]} /></Panel>
      </div>

      <h2 className="mb-2 font-semibold">Missing resources</h2>
      <Table head={["Requirement", "Router", "Category", "Lang", "Requests", "Customers", "Top channel", "First", "Latest", "Status"]} empty={demands.length === 0}>
        {demands.map((d) => (
          <tr key={d.id} data-testid="demand-row">
            <Td>{canSeeQuestions ? <Link href={`/admin/demand/${d.id}?${query}`} className="text-olive underline">{d.requirement}</Link> : d.requirement}</Td>
            <Td>{d.model}{d.hardware_revision ? ` (${d.hardware_revision})` : ""}</Td>
            <Td>{d.support_mode === "ap" ? "AP" : "Mesh"}: {scenarioTitle(d.scenario_key)}</Td>
            <Td>{d.locale.toUpperCase()}</Td>
            <Td>{d.requests}</Td><Td>{d.customers}</Td>
            <Td>{CHANNEL_LABEL[d.top_channel ?? "unknown"]}</Td>
            <Td>{fmt(d.first_requested_at)}</Td><Td>{fmt(d.last_requested_at)}</Td>
            <Td><StatusPill status={d.status} /></Td>
          </tr>
        ))}
      </Table>
      {!canSeeQuestions ? <p className="mt-2 text-xs text-muted">Original customer questions and case links need the support transcripts permission.</p> : null}
    </AdminShell>
  );
}
