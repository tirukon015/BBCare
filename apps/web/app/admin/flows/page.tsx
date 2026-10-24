import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { listFlowsAdmin } from "@/modules/knowledge/flows-admin";
import { AdminShell, StatusPill, Table, Td, adminButton } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Troubleshooting flows" };

export default async function FlowsAdminPage() {
  const user = await requireStaff("knowledge.read");
  const rows = await listFlowsAdmin();
  return (
    <AdminShell user={user} title="Troubleshooting flows" actions={user.permissions.has("knowledge.write") ? <Link className={adminButton} href="/admin/flows/new">New flow</Link> : null}>
      <Table head={["Title", "Model", "Mode / problem", "Verification", "Steps", "Status", "Updated"]} empty={rows.length === 0}>
        {rows.map((f) => (
          <tr key={f.id}>
            <Td><Link className="text-olive underline" href={`/admin/flows/${f.id}`}>{f.title_en}</Link></Td>
            <Td className="font-mono text-xs">{f.ecr_code ?? f.category}</Td><Td className="text-xs">{f.support_mode ? `${f.support_mode}: ${f.scenario_key}` : "-"}</Td>
            <Td className="text-xs">{f.ecr_code ? f.verification_status.replace("_", " ") : "-"}</Td><Td>{f.steps}</Td><Td><StatusPill status={f.status} /></Td><Td>{f.updated_at.toISOString().slice(0, 10)}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
