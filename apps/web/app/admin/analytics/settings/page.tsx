import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { parsePeriod, trackingStatus } from "@/modules/analytics/intelligence";
import { AdminShell, Table, Td } from "@/components/admin-ui";
import { AnalyticsNav, Panel } from "@/components/analytics-nav";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy & Tracking Settings" };
const PATH = "/admin/analytics/settings";

interface Feature { name: string; events: string[]; consent: "none" | "analytics"; dashboard: string; config: string | null; note: string }

/** Every tracking feature, what it emits, what gates it and where it is shown. Status is computed from real events. */
const FEATURES: Feature[] = [
  { name: "Page views and sessions", events: ["page_view", "session_started"], consent: "none", dashboard: "Overview, Visitors & Sessions", config: null, note: "Essential, aggregated; no persistent identifier without consent." },
  { name: "Consented visitor id (returning visitors)", events: ["page_view"], consent: "analytics", dashboard: "Visitors & Sessions", config: null, note: "Random id for 180 days, only after the visitor allows analytics." },
  { name: "Traffic source and channel labels", events: ["session_started"], consent: "none", dashboard: "Traffic Sources, Campaign Analytics", config: null, note: "From ?ch=, UTM parameters and referrer host only." },
  { name: "Campaign parameters (utm_content, utm_term)", events: ["session_started"], consent: "none", dashboard: "Campaign Analytics", config: null, note: "Stored as sent on the link." },
  { name: "Approximate location (state, country)", events: ["page_view"], consent: "none", dashboard: "Visitors & Sessions", config: "BBCARE_GEOIP_CSV", note: "Offline database; raw IP is never stored; small areas hidden." },
  { name: "Tagged clicks (navigation, buttons, cards)", events: ["ui_click"], consent: "none", dashboard: "Website Behaviour", config: null, note: "Element key only." },
  { name: "Click heatmap grid", events: ["click_area"], consent: "none", dashboard: "Heatmaps", config: null, note: "10 percent grid cell and element kind; no coordinates, text or recordings." },
  { name: "Exits and scroll depth bucket", events: ["navigation_exit"], consent: "none", dashboard: "Website Behaviour, Heatmaps", config: null, note: "Page type and scroll quarter." },
  { name: "Router journey (model, mode, problem)", events: ["router_model_selected", "router_mode_selected", "router_scenario_selected"], consent: "none", dashboard: "Router Analytics, Customer Journey", config: null, note: "" },
  { name: "Guide step progress", events: ["flow_step"], consent: "none", dashboard: "Router Analytics, Customer Journey", config: null, note: "" },
  { name: "Assistant outcomes", events: ["support_started", "support_resolved", "support_escalated", "support_outcome"], consent: "none", dashboard: "Support Analytics", config: null, note: "" },
  { name: "Escalations and case follow-ups", events: ["escalation_submitted", "case_followup"], consent: "none", dashboard: "Support Analytics", config: null, note: "" },
  { name: "Search queries", events: ["model_search", "search_no_results"], consent: "none", dashboard: "Website Behaviour", config: null, note: "Query stored after personal-data removal." },
  { name: "Resource opens, video progress, votes", events: ["resource_open", "video_progress", "resource_feedback"], consent: "none", dashboard: "Media Performance", config: null, note: "" },
  { name: "Shopee outbound clicks", events: ["shopee_outbound_click"], consent: "none", dashboard: "Overview (referral count, not sales)", config: null, note: "A click is not a confirmed sale." },
  { name: "Client errors", events: ["performance_error"], consent: "none", dashboard: "Not shown; operational logs", config: null, note: "Error type only." },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requireStaff("analytics.read");
  const period = parsePeriod(await searchParams);
  const s = await trackingStatus();
  const total = [...s.counts.values()].reduce((a, b) => a + b, 0);
  return (
    <AdminShell user={user} title="Privacy & Tracking Settings">
      <AnalyticsNav current={PATH} period={period} />
      <Notice role="note">This page reports what tracking is built, what is actually collecting now (events received in the last 24 hours), what each feature needs, and where its data appears. Nothing here changes collection: features that need consent are controlled by the visitor&apos;s own choice in the consent banner, and features that need configuration are enabled by the owner through environment variables, never from this page.</Notice>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="tracking-status">
        <Panel title="Events in last 24 hours"><p className="text-2xl font-semibold">{total}</p></Panel>
        <Panel title="Consent choices (30 days)"><p className="text-2xl font-semibold">{s.consent.total}</p><p className="text-xs text-muted">{s.consent.analytics} allowed analytics</p></Panel>
        <Panel title="Aggregates"><p className="text-2xl font-semibold">{s.agg.rows}</p><p className="text-xs text-muted">rows, latest day {s.agg.last_day ?? "none"}</p></Panel>
        <Panel title="Arrival channel known"><p className="text-2xl font-semibold">{s.attribution.n ? `${Math.round((s.attribution.known / s.attribution.n) * 100)}%` : "-"}</p><p className="text-xs text-muted">of {s.attribution.n} support arrivals in 30 days</p></Panel>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Tracking features</h2>
      <Table head={["Feature", "Implemented", "Enabled", "Consent required", "Collecting now (24h events)", "Shown in", "Missing configuration"]}>
        {FEATURES.map((f) => {
          const n = f.events.reduce((a, e) => a + (s.counts.get(e) ?? 0), 0);
          const configured = f.config ? (f.config === "BBCARE_GEOIP_CSV" ? s.geoConfigured : false) : true;
          const enabled = f.consent === "analytics" ? "Per visitor choice" : configured ? "Yes" : "No";
          const collecting = f.consent === "analytics" ? `${s.consent.analytics} consenting visitors` : configured ? (n > 0 ? `Yes (${n})` : "No events in 24h") : "No (not configured)";
          return (
            <tr key={f.name} data-testid="tracking-feature">
              <Td><span className="font-medium">{f.name}</span>{f.note ? <span className="block text-xs text-muted">{f.note}</span> : null}<span className="block font-mono text-[11px] text-muted">{f.events.join(", ")}</span></Td>
              <Td>Yes</Td><Td>{enabled}</Td><Td>{f.consent === "analytics" ? "Yes (analytics consent)" : "No (essential, aggregated)"}</Td><Td>{collecting}</Td><Td>{f.dashboard}</Td>
              <Td>{f.config && !configured ? <code>{f.config}</code> : "-"}</Td>
            </tr>
          );
        })}
      </Table>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Retention (applied by the worker retention job)">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Raw analytics events: 90 days, then deleted; aggregates kept.</li>
            <li>Security events: 30 days.</li>
            <li>Support sessions and transcripts: 180 days.</li>
            <li>Case contact details: 90 days after closure.</li>
            <li>Customer question text in demand requests: 180 days, then replaced with a placeholder; counts kept.</li>
            <li>Consented visitor id: 180 days in the browser.</li>
          </ul>
          <p className="mt-2 text-xs text-muted">Last completed job: {s.lastJob ? `${s.lastJob.queue} at ${s.lastJob.finished_at?.toISOString().slice(0, 16).replace("T", " ")}` : "none recorded in this database; dashboards refresh today's aggregates on open."}</p>
        </Panel>
        <Panel title="What is never collected">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Keystrokes, form contents, passwords, router credentials, screen or session recordings.</li>
            <li>Browser fingerprints or cross-device matching.</li>
            <li>Raw IP addresses (used only in memory for an approximate region, when configured).</li>
            <li>Third-party analytics, advertising or heatmap scripts.</li>
            <li>Customer messages for AI training (never automatic).</li>
          </ul>
          <p className="mt-2 text-sm">Customer-facing notice: <Link href="/en/privacy" className="text-olive underline">/en/privacy</Link> and <Link href="/ms/privacy" className="text-olive underline">/ms/privacy</Link>. Access and deletion requests: see <code>docs/runbooks/data-requests.md</code>. Configuration audit: <code>docs/analytics/implementation-matrix.md</code>.</p>
        </Panel>
      </div>
    </AdminShell>
  );
}
