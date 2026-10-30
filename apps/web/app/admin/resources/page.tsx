import Link from "next/link";
import { redirect } from "next/navigation";
import { SCENARIOS } from "@bbcare/core";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { listResources, reviewResource } from "@/modules/support/demand-admin";
import { AdminShell, StatusPill, Table, Td, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resource library" };

async function reviewAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.publish");
  const r = await reviewResource(user, String(form.get("resourceId")), form.get("decision") === "approved" ? "approved" : "rejected", String(form.get("note") ?? "").trim().slice(0, 1000) || null);
  redirect(`/admin/resources?status=under_review${r.ok ? "&ok=1" : `&e=${r.reason}`}`);
}

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ status?: string; e?: string; ok?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const sp = await searchParams;
  const status = sp.status ?? "under_review";
  const rows = await listResources(status);
  return (
    <AdminShell user={user} title="Resource library">
      <div className="mb-4 space-y-2 text-sm">
        <Notice role="note">Videos, diagrams, images and documents uploaded by staff. A resource reaches customers and AI retrieval only when approved by someone other than the uploader. Opens and feedback come from customers after approval.</Notice>
        {sp.e ? <p role="alert" className="text-danger">{sp.e === "self_review" ? "A different reviewer must approve a resource you uploaded." : "Not saved."}</p> : null}
        {sp.ok ? <p role="status" className="text-olive-dark">Saved.</p> : null}
        <nav className="flex flex-wrap gap-2">{["under_review", "approved", "rejected", "archived"].map((s) => <Link key={s} href={`/admin/resources?status=${s}`} className={`rounded-full border px-3 py-1 ${s === status ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{s.replace("_", " ")}</Link>)}<Link href="/admin/demand" className={adminButtonSecondary}>Demand dashboard</Link></nav>
      </div>
      <Table head={["Kind", "Title", "Router", "Scenario", "Lang", "Uploaded by", "Opens", "Helpful / not", "Status", ""]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td>{r.kind}</Td>
            <Td>{r.title_en}<span className="block text-xs text-muted">{r.mime_type}, {Math.round(r.size_bytes / 1024)} KB</span></Td>
            <Td>{r.model ?? "-"}</Td>
            <Td className="text-xs">{r.scenario_key ? `${r.support_mode === "ap" ? "AP" : "Mesh"}: ${SCENARIOS.find((s) => s.key === r.scenario_key)?.en ?? r.scenario_key}` : "-"}</Td>
            <Td>{r.locale}</Td><Td>{r.uploader ?? "-"}</Td><Td>{r.opens}</Td><Td>{r.up} / {r.down}</Td>
            <Td><StatusPill status={r.status} /></Td>
            <Td>
              {r.status === "approved" ? <a href={`/media/resources/${r.id}`} className="text-xs text-olive underline" target="_blank" rel="noopener">Open</a> : null}
              {user.permissions.has("knowledge.publish") && r.status === "under_review" ? (
                <form action={reviewAction} className="flex flex-wrap items-end gap-1">
                  <input type="hidden" name="resourceId" value={r.id} />
                  <input name="note" placeholder="Note" maxLength={1000} className={`${adminInput} max-w-32`} />
                  <button name="decision" value="approved" className={adminButton} disabled={r.uploaded_by === user.id}>Approve</button>
                  <button name="decision" value="rejected" className={adminButtonSecondary}>Reject</button>
                </form>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
