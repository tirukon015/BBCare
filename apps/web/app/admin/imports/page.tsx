import Link from "next/link";
import { redirect } from "next/navigation";
import { parseChatGptExport, sha256Hex } from "@bbcare/core";
import { stageChatGptImport } from "@bbcare/db";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { audit } from "@/modules/audit/service";
import { db } from "@/lib/db";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imports" };

async function uploadAction(form: FormData) {
  "use server";
  const user = await assertPermission("imports.manage");
  if (form.get("authorized") !== "on") redirect("/admin/imports?e=authorization");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 15 * 1024 * 1024) redirect("/admin/imports?e=file");
  const buf = Buffer.from(await file.arrayBuffer());
  let raw: unknown;
  try { raw = JSON.parse(buf.toString("utf8")); } catch { redirect("/admin/imports?e=json"); }
  const keywords = String(form.get("keywords") ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
  const report = parseChatGptExport(raw, { keywords });
  const r = await stageChatGptImport(db(), report, { fileSha256: sha256Hex(buf), userId: user.id });
  await audit({ actorId: user.id, action: "imports.stage", entityType: "import_batch", entityId: r.batchId, summary: { counts: r.counts, alreadyImported: r.alreadyImported } });
  redirect(`/admin/imports/${r.batchId}`);
}

const ERR: Record<string, string> = {
  authorization: "Confirm that the owner authorised importing this data.",
  file: "Choose a conversations.json file up to 15 MB (larger exports: use the command-line import on the server).",
  json: "The file is not valid JSON.",
};

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await requireStaff("imports.manage");
  const { e } = await searchParams;
  const batches = await db()<{ id: string; status: string; counts: Record<string, number>; created_at: Date }[]>`
    SELECT id, status, counts, created_at FROM ops.import_batches WHERE kind = 'chatgpt_export' ORDER BY created_at DESC LIMIT 50`;
  return (
    <AdminShell user={user} title="Historical imports">
      <div className="mb-4 max-w-3xl space-y-2">
        <Notice tone="warn">Historical conversations are never treated as verified answers. Imports are staged, scrubbed of personal data, deduplicated and reviewed. Promoted records become <strong>unverified, pending</strong> sources that editors must check against manufacturer documentation before writing any guide. Images and attachments are not included in ChatGPT exports and are reported as missing.</Notice>
        {e ? <Notice tone="danger" role="alert">{ERR[e] ?? e}</Notice> : null}
      </div>
      <form action={uploadAction} className="mb-8 grid max-w-3xl gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
        <h2 className="font-semibold">Stage a ChatGPT export (conversations.json)</h2>
        <input type="file" name="file" accept=".json,application/json" required />
        <label>Extra relevance keywords (comma separated, optional)<input name="keywords" className={adminInput} placeholder="tp-link, asus, thinkpad" /></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="authorized" className="mt-1" /> The owner has authorised importing this export, and it contains no data we are not permitted to process.</label>
        <div><button className={adminButton}>Stage import</button></div>
      </form>
      <Table head={["Batch", "Status", "Counts", "Created"]} empty={batches.length === 0}>
        {batches.map((b) => (
          <tr key={b.id}>
            <Td><Link className="font-mono text-olive underline" href={`/admin/imports/${b.id}`}>{b.id.slice(0, 8)}</Link></Td>
            <Td><StatusPill status={b.status} /></Td>
            <Td className="font-mono text-xs">{JSON.stringify(b.counts)}</Td>
            <Td>{b.created_at.toISOString().slice(0, 16).replace("T", " ")}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
