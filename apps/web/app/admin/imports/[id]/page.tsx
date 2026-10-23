import { notFound, redirect } from "next/navigation";
import type { ImportedConversation } from "@bbcare/core";
import { promoteImportRecord } from "@bbcare/db";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { audit } from "@/modules/audit/service";
import { db } from "@/lib/db";
import { AdminShell, StatusPill } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import batch" };

async function recordAction(form: FormData) {
  "use server";
  const user = await assertPermission("imports.manage");
  const id = String(form.get("record"));
  const batch = String(form.get("batch"));
  if (form.get("op") === "promote") {
    const src = await promoteImportRecord(db(), id, user.id);
    await audit({ actorId: user.id, action: "imports.promote", entityType: "import_record", entityId: id, summary: { source: src } });
  } else {
    await db()`UPDATE ops.import_records SET status = 'discarded' WHERE id = ${id} AND status IN ('valid', 'duplicate')`;
    await audit({ actorId: user.id, action: "imports.discard", entityType: "import_record", entityId: id });
  }
  redirect(`/admin/imports/${batch}?status=${String(form.get("filter") ?? "valid")}`);
}

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff("imports.manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const status = ["valid", "duplicate", "discarded", "promoted"].includes((await searchParams).status ?? "") ? (await searchParams).status! : "valid";
  const [batch] = await db()<{ id: string; counts: Record<string, number>; created_at: Date }[]>`SELECT id, counts, created_at FROM ops.import_batches WHERE id = ${id}`;
  if (!batch) notFound();
  const records = await db()<{ id: string; status: string; data: ImportedConversation; validation_errors: string[] }[]>`
    SELECT id, status, data, validation_errors FROM ops.import_records WHERE batch_id = ${id} AND status = ${status} ORDER BY (data->>'createdAt') DESC NULLS LAST LIMIT 200`;
  return (
    <AdminShell user={user} title={`Import ${id.slice(0, 8)}`}>
      <p className="mb-3 font-mono text-xs">{JSON.stringify(batch.counts)}</p>
      <nav className="mb-4 flex gap-2 text-sm">{["valid", "duplicate", "discarded", "promoted"].map((s) => <a key={s} href={`/admin/imports/${id}?status=${s}`} className={`rounded-full border px-3 py-1 ${s === status ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{s}</a>)}</nav>
      <ul className="space-y-3">
        {records.map((r) => (
          <li key={r.id} className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={r.status} />
              <span className="font-semibold">{r.data.title}</span>
              <span className="text-muted">{r.data.createdAt?.slice(0, 10) ?? "no date"} · {r.data.messages.length} messages · {r.data.categories.join(", ") || "uncategorised"}{r.data.modelMentions.length ? ` · ${r.data.modelMentions.slice(0, 5).join(", ")}` : ""}</span>
              {r.data.attachmentsMissing ? <span className="text-warn">{r.data.attachmentsMissing} attachment(s) missing</span> : null}
              {r.validation_errors.length ? <span className="text-danger">{r.validation_errors.join(", ")}</span> : null}
            </div>
            <details className="mt-2"><summary className="cursor-pointer text-olive">Show conversation (personal data scrubbed)</summary>
              <ol className="mt-2 space-y-1">{r.data.messages.slice(0, 20).map((m, i) => <li key={i} className={m.role === "user" ? "rounded bg-sand p-2" : "rounded border border-line p-2"}><span className="text-xs uppercase text-muted">{m.role === "user" ? "question" : "previous answer (unverified)"}</span><p className="whitespace-pre-wrap">{m.text.slice(0, 2000)}</p></li>)}</ol>
            </details>
            {r.status === "valid" || r.status === "duplicate" ? (
              <form action={recordAction} className="mt-2 flex gap-2">
                <input type="hidden" name="record" value={r.id} /><input type="hidden" name="batch" value={id} /><input type="hidden" name="filter" value={status} />
                {r.status === "valid" ? <button name="op" value="promote" className="rounded border border-line px-3 py-1">Promote to unverified source</button> : null}
                <button name="op" value="discard" className="rounded border border-line px-3 py-1">Discard</button>
              </form>
            ) : null}
          </li>
        ))}
        {records.length === 0 ? <li className="text-sm text-muted">No records with this status.</li> : null}
      </ul>
    </AdminShell>
  );
}
