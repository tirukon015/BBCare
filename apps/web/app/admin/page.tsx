import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { overviewStats } from "@/modules/support/admin";
import { aiState } from "@/lib/ai";
import { AdminShell, Stat } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff();
  const [s, aiEn, aiMs] = await Promise.all([overviewStats(), aiState("en"), aiState("ms")]);
  const { denied } = await searchParams;
  const pct = (n: number) => (s.sessions_7d ? `${Math.round((n / s.sessions_7d) * 100)}%` : "-");
  return (
    <AdminShell user={user} title="Overview">
      {denied ? <div className="mb-4"><Notice tone="warn" role="alert">You do not have permission to open that page.</Notice></div> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open cases" value={s.open_cases} hint={`${s.new_cases} new`} />
        <Stat label="Awaiting review" value={s.in_review} />
        <Stat label="Open knowledge gaps" value={s.open_gaps} />
        <Stat label="Support sessions (7 days)" value={s.sessions_7d} hint={`Resolved ${pct(s.resolved_7d)} · Escalated ${pct(s.escalated_7d)}`} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
          <p className="font-semibold">AI answers</p>
          <p className="mt-1">English: {aiEn.enabled ? "on" : "off"} · Malay: {aiMs.enabled ? "on" : "off"}</p>
          <p className="text-muted">Provider: {aiEn.provider}{aiEn.mock ? " (mock, development only)" : ""}</p>
          {user.permissions.has("ai.read") ? <Link href="/admin/ai" className="mt-2 inline-block text-olive underline">AI settings</Link> : null}
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Signed in as {user.displayName}</p>
          <p className="text-muted">Roles: {user.roles.join(", ") || "none"}</p>
        </div>
      </div>
    </AdminShell>
  );
}
