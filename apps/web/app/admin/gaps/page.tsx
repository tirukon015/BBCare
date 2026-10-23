import Link from "next/link";
import { redirect } from "next/navigation";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { listGaps, setGapStatus } from "@/modules/knowledge/admin";
import { AdminShell, Table, Td } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Knowledge gaps" };

async function statusAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const status = String(form.get("status"));
  if (!["open", "in_progress", "resolved", "dismissed"].includes(status)) return;
  await setGapStatus(user, String(form.get("id")), status as "open");
  redirect(`/admin/gaps?status=${String(form.get("current") ?? "open")}`);
}

export default async function GapsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const sp = await searchParams;
  const status = ["open", "in_progress", "resolved", "dismissed"].includes(sp.status ?? "") ? sp.status! : "open";
  const rows = await listGaps(status);
  return (
    <AdminShell user={user} title="Knowledge gaps">
      <p className="mb-3 text-sm text-muted">Questions customers asked that had no verified answer, were escalated, or were rated unhelpful. Personal data is removed before storage. Use these to prioritise new guides.</p>
      <nav className="mb-4 flex gap-2 text-sm">{["open", "in_progress", "resolved", "dismissed"].map((s) => <Link key={s} href={`/admin/gaps?status=${s}`} className={`rounded-full border px-3 py-1 ${s === status ? "border-olive bg-olive-soft" : "border-line bg-white"}`}>{s.replace("_", " ")}</Link>)}</nav>
      <Table head={["Question (normalised)", "Lang", "Count", "Source", "Model / category", "Last seen", ""]} empty={rows.length === 0}>
        {rows.map((g) => (
          <tr key={g.id}>
            <Td>{g.query_normalized}</Td>
            <Td>{g.locale}</Td>
            <Td>{g.occurrences}</Td>
            <Td>{g.last_source.replace("_", " ")}</Td>
            <Td>{g.model ?? g.category ?? "-"}</Td>
            <Td>{g.last_seen.toISOString().slice(0, 10)}</Td>
            <Td>
              {user.permissions.has("knowledge.write") ? (
                <form action={statusAction} className="flex gap-1">
                  <input type="hidden" name="id" value={g.id} /><input type="hidden" name="current" value={status} />
                  <select name="status" defaultValue={g.status} className="min-h-9 rounded border border-line text-xs">{["open", "in_progress", "resolved", "dismissed"].map((s) => <option key={s}>{s}</option>)}</select>
                  <button className="rounded border border-line px-2 text-xs">Set</button>
                </form>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
