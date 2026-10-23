import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { reviewQueue } from "@/modules/knowledge/admin";
import { AdminShell, StatusPill, Table, Td } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review queue" };

export default async function ReviewPage() {
  const user = await requireStaff("knowledge.review");
  const rows = await reviewQueue();
  return (
    <AdminShell user={user} title="Review queue">
      <p className="mb-4 text-sm text-muted">Revisions waiting for review or publication. Reviewers cannot approve their own content (administrators can, and this is flagged).</p>
      <Table head={["Title", "Language", "Status", "Safety", "Author", "Submitted"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><Link className="text-olive underline" href={`/admin/knowledge/${r.article_id}?locale=${r.locale}`}>{r.title}</Link></Td>
            <Td>{r.locale.toUpperCase()}</Td>
            <Td><StatusPill status={r.status} /></Td>
            <Td>{r.safety_level}</Td>
            <Td>{r.author ?? "-"}</Td>
            <Td>{r.submitted_at?.toISOString().slice(0, 10) ?? "-"}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
