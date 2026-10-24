import Link from "next/link";
import { redirect } from "next/navigation";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { listExamples, reviewExample } from "@/modules/ai/training";
import { AdminShell, StatusPill, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI examples" };

async function reviewAction(form: FormData) {
  "use server";
  const user = await assertPermission("ai.configure");
  const decision = form.get("decision") === "approved" ? "approved" : "rejected";
  const r = await reviewExample(user, String(form.get("id")), decision, form.get("screened") === "1", String(form.get("note") ?? "").trim().slice(0, 1000) || null);
  redirect(r.ok ? "/admin/ai/examples?ok=1" : `/admin/ai/examples?e=${r.reason}`);
}

const ERR: Record<string, string> = {
  self_review: "You cannot approve an example you proposed.",
  privacy_screen_required: "Confirm the privacy screen before approving.",
  not_pending: "This example was already reviewed.",
};

export default async function ExamplesPage({ searchParams }: { searchParams: Promise<{ s?: string; e?: string; ok?: string }> }) {
  const user = await requireStaff("ai.read");
  const sp = await searchParams;
  const rows = await listExamples(sp.s ?? "proposed");
  const canReview = user.permissions.has("ai.configure");
  return (
    <AdminShell user={user} title="AI training and evaluation examples">
      <div className="mb-4 space-y-2 text-sm">
        <Notice role="note">Examples come only from resolved cases, proposed by staff. A different reviewer approves each one after a privacy screen. Only approved examples are exported. Nothing here is used by the live assistant.</Notice>
        {sp.e ? <p role="alert" className="text-danger">{ERR[sp.e] ?? "Not saved."}</p> : null}
        {sp.ok ? <p role="status" className="text-olive-dark">Saved.</p> : null}
        <nav className="flex flex-wrap gap-2">
          {["proposed", "approved", "rejected"].map((s) => <a key={s} href={`/admin/ai/examples?s=${s}`} className={adminButtonSecondary}>{s}</a>)}
          {user.permissions.has("ai.configure") ? <Link href="/admin/ai/examples/export" prefetch={false} className={adminButtonSecondary}>Export approved (JSONL)</Link> : null}
        </nav>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">No examples.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} /><span className="text-muted">{r.model ?? "No model"} · {r.scenario_key ?? "-"} · {r.locale.toUpperCase()} · proposed by {r.proposer ?? "unknown"}</span></div>
              <p className="mt-2"><strong>Q:</strong> {r.question}</p>
              <p className="mt-1 whitespace-pre-wrap"><strong>A:</strong> {r.answer}</p>
              {canReview && r.status === "proposed" ? (
                <form action={reviewAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="flex items-center gap-2"><input type="checkbox" name="screened" value="1" /> No personal data or secrets</label>
                  <input name="note" placeholder="Review note" maxLength={1000} className={`${adminInput} max-w-xs`} />
                  <button name="decision" value="approved" className={adminButton} disabled={r.proposed_by === user.id}>Approve</button>
                  <button name="decision" value="rejected" className={adminButtonSecondary}>Reject</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
