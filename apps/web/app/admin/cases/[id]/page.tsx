import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { CASE_STATUSES, getCase, purgeContact, revealContact, updateCase, type CaseStatus } from "@/modules/support/admin";
import { AdminShell, StatusPill, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case" };

async function updateAction(form: FormData) {
  "use server";
  const user = await assertPermission("cases.write");
  const id = String(form.get("id"));
  const status = String(form.get("status") ?? "");
  const priority = String(form.get("priority") ?? "");
  await updateCase(user, id, {
    status: status !== form.get("current_status") && CASE_STATUSES.includes(status as CaseStatus) ? (status as CaseStatus) : undefined,
    priority: priority !== form.get("current_priority") ? priority || undefined : undefined,
    assignToMe: form.get("assign") === "1",
    note: String(form.get("note") ?? "").trim() || undefined,
  });
  revalidatePath(`/admin/cases/${id}`);
  redirect(`/admin/cases/${id}`);
}

async function purgeAction(form: FormData) {
  "use server";
  const user = await assertPermission("cases.write");
  const id = String(form.get("id"));
  await purgeContact(user, id);
  redirect(`/admin/cases/${id}`);
}

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reveal?: string }> }) {
  const user = await requireStaff("cases.read_assigned");
  const { id } = await params;
  const c = await getCase(user, id);
  if (!c) notFound();
  const reveal = (await searchParams).reveal === "1" && user.permissions.has("cases.write") ? await revealContact(user, id) : null;
  const canWrite = user.permissions.has("cases.write");
  return (
    <AdminShell user={user} title={`Case ${c.reference}`}>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={c.status} /><span className="text-sm text-muted">Priority {c.priority} · {c.locale.toUpperCase()} · {c.created_at.toISOString().slice(0, 16).replace("T", " ")}</span></div>
            <h2 className="mt-2 text-lg font-semibold">{c.subject}</h2>
            {c.description ? <p className="mt-2 whitespace-pre-wrap text-sm">{c.description}</p> : null}
            <p className="mt-2 text-sm text-muted">{c.category ?? "No category"}{c.model ? ` · ${c.model}` : ""}</p>
          </div>
          {c.transcript.length > 0 ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
              <h3 className="font-semibold">Conversation</h3>
              <ol className="mt-2 space-y-2 text-sm">
                {c.transcript.map((m, i) => (
                  <li key={i} className={m.role === "customer" ? "rounded-md bg-sand p-2" : "rounded-md border border-line p-2"}>
                    <span className="text-xs uppercase text-muted">{m.role}{m.outcome ? ` · ${m.outcome}` : ""}</span>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
            <h3 className="font-semibold">History</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {c.events.map((e, i) => (
                <li key={i}><span className="text-muted">{e.at.toISOString().slice(0, 16).replace("T", " ")}</span> · {e.kind.replace("_", " ")}{e.actor ? ` by ${e.actor}` : ""}{e.kind === "note" ? `: ${String(e.data.text ?? "")}` : e.data.to ? ` → ${String(e.data.to)}` : ""}</li>
              ))}
            </ol>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h3 className="font-semibold">Contact</h3>
            {c.contact_purged_at ? <p className="text-muted">Contact details removed.</p> : reveal ? (
              <dl className="mt-2 space-y-1">
                <div><dt className="text-muted">Name</dt><dd>{reveal.name}</dd></div>
                {reveal.email ? <div><dt className="text-muted">Email</dt><dd>{reveal.email}</dd></div> : null}
                {reveal.phone ? <div><dt className="text-muted">Phone</dt><dd>{reveal.phone}</dd></div> : null}
                <div><dt className="text-muted">Preferred</dt><dd>{c.preferred_channel}</dd></div>
              </dl>
            ) : canWrite ? (
              <a href={`/admin/cases/${c.id}?reveal=1`} className={`${adminButtonSecondary} mt-2`}>Show contact details (logged)</a>
            ) : <p className="text-muted">Hidden.</p>}
            {canWrite && !c.contact_purged_at ? (
              <form action={purgeAction} className="mt-3"><input type="hidden" name="id" value={c.id} /><button className="text-sm text-danger underline">Remove contact details</button></form>
            ) : null}
          </div>
          {canWrite ? (
            <form action={updateAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="current_status" value={c.status} />
              <input type="hidden" name="current_priority" value={c.priority} />
              <h3 className="font-semibold">Update</h3>
              {!c.assigned_to || c.assigned_to !== user.id ? <label className="flex items-center gap-2"><input type="checkbox" name="assign" value="1" /> Assign to me</label> : null}
              <label className="block">Status
                <select name="status" defaultValue={c.status} className={adminInput}>{CASE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
              </label>
              <label className="block">Priority
                <select name="priority" defaultValue={c.priority} className={adminInput}>{["low", "normal", "high", "urgent"].map((p) => <option key={p}>{p}</option>)}</select>
              </label>
              <label className="block">Internal note
                <textarea name="note" rows={3} maxLength={2000} className={adminInput} />
              </label>
              <button className={adminButton}>Save</button>
            </form>
          ) : null}
        </aside>
      </div>
    </AdminShell>
  );
}
