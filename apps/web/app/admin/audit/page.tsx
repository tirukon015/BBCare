import { requireStaff } from "@/modules/identity/service";
import { db } from "@/lib/db";
import { AdminShell, Table, Td } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const user = await requireStaff("audit.read");
  const { action } = await searchParams;
  const filter = typeof action === "string" && /^[a-z_.]{2,60}$/.test(action) ? `${action}%` : null;
  const rows = await db()<{ id: string; at: Date; action: string; entity_type: string | null; entity_id: string | null; summary: Record<string, unknown>; actor: string | null }[]>`
    SELECT l.id::text, l.at, l.action, l.entity_type, l.entity_id, l.summary, u.display_name AS actor
    FROM identity.audit_logs l LEFT JOIN identity.users u ON u.id = l.actor_user_id
    WHERE (${filter}::text IS NULL OR l.action LIKE ${filter}) ORDER BY l.at DESC LIMIT 300`;
  return (
    <AdminShell user={user} title="Audit log">
      <form className="mb-4 flex gap-2 text-sm"><input name="action" defaultValue={action} placeholder="Filter by action prefix, e.g. auth. or knowledge." className="min-h-11 w-80 rounded-lg border border-line px-3" /><button className="rounded-lg border border-line bg-white px-4">Filter</button></form>
      <Table head={["Time (UTC)", "Actor", "Action", "Entity", "Details"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{r.at.toISOString().slice(0, 19).replace("T", " ")}</Td>
            <Td>{r.actor ?? "system"}</Td><Td className="font-mono text-xs">{r.action}</Td>
            <Td className="font-mono text-xs">{r.entity_type ? `${r.entity_type}:${r.entity_id?.slice(0, 8)}` : "-"}</Td>
            <Td className="font-mono text-xs">{Object.keys(r.summary).length ? JSON.stringify(r.summary) : ""}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
