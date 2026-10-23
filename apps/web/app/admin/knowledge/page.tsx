import Link from "next/link";
import { requireStaff } from "@/modules/identity/service";
import { listArticlesAdmin } from "@/modules/knowledge/admin";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const { q } = await searchParams;
  const rows = await listArticlesAdmin({ q: typeof q === "string" ? q.slice(0, 100) : undefined });
  return (
    <AdminShell user={user} title="Knowledge" actions={
      <div className="flex gap-2">
        {user.permissions.has("sources.upload") ? <Link href="/admin/knowledge/sources" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">Sources</Link> : null}
        {user.permissions.has("knowledge.write") ? <Link href="/admin/knowledge/new" className={adminButton}>New article</Link> : null}
      </div>
    }>
      <form className="mb-4 flex max-w-md gap-2"><input name="q" defaultValue={q} placeholder="Search title or slug" className={adminInput} /><button className="rounded-lg border border-line bg-white px-4 text-sm">Search</button></form>
      <Table head={["Title", "Slug", "Category", "English", "Malay", "Updated"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><Link href={`/admin/knowledge/${r.id}`} className="text-olive underline">{r.title ?? r.slug}</Link>{r.archived_at ? " (archived)" : ""}</Td>
            <Td className="font-mono text-xs">{r.slug}</Td>
            <Td>{r.category}</Td>
            <Td>{r.en ? <StatusPill status={r.en} /> : "-"}</Td>
            <Td>{r.ms ? <StatusPill status={r.ms} /> : "-"}</Td>
            <Td>{r.updated.toISOString().slice(0, 10)}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
