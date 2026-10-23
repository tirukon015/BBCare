import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { CASE_STATUSES, listCases } from "@/modules/support/admin";
import { AdminShell, StatusPill, Table, Td } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cases" };

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const user = await requireStaff("cases.read_assigned");
  const sp = await searchParams;
  const cases = await listCases(user, { status: sp.status, mine: sp.mine === "1" });
  return (
    <AdminShell user={user} title="Cases">
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter">
        <Link href="/admin/cases" className="rounded-full border border-line bg-white px-3 py-2">All</Link>
        <Link href="/admin/cases?mine=1" className="rounded-full border border-line bg-white px-3 py-2">Assigned to me</Link>
        {CASE_STATUSES.map((s) => <Link key={s} href={`/admin/cases?status=${s}`} className="rounded-full border border-line bg-white px-3 py-2">{s.replace("_", " ")}</Link>)}
      </nav>
      <Table head={["Reference", "Subject", "Model", "Status", "Priority", "Assigned", "Created"]} empty={cases.length === 0}>
        {cases.map((c) => (
          <tr key={c.id}>
            <Td><Link className="font-mono text-olive underline" href={`/admin/cases/${c.id}`}>{c.reference}</Link></Td>
            <Td>{c.subject}</Td>
            <Td>{c.model ?? "-"}</Td>
            <Td><StatusPill status={c.status} /></Td>
            <Td>{c.priority}</Td>
            <Td>{c.assigned ?? "-"}</Td>
            <Td>{c.created_at.toISOString().slice(0, 16).replace("T", " ")}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
