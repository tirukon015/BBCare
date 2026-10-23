import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { listSources } from "@/modules/knowledge/admin";
import { addSource, reviewSource } from "@/modules/knowledge/sources";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

const KINDS = ["manufacturer_doc", "internal_procedure", "staff_authored", "historical_chat", "customer_feedback", "web_page"] as const;

async function addAction(form: FormData) {
  "use server";
  const user = await assertPermission("sources.upload");
  const parsed = z.object({
    kind: z.enum(KINDS), title: z.string().trim().min(3).max(200), publisher: z.string().trim().max(200).optional(),
    url: z.url().max(500).optional().or(z.literal("")), licenseNote: z.string().trim().max(500).optional(), text: z.string().max(200_000).optional(),
  }).safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "file")));
  if (!parsed.success) redirect("/admin/knowledge/sources?e=invalid");
  const file = form.get("file");
  const r = await addSource(user, { ...parsed.data, url: parsed.data.url || undefined, file: file instanceof File ? file : null });
  redirect(r.ok ? `/admin/knowledge/sources?added=1&flags=${r.injectionFlags}` : `/admin/knowledge/sources?e=${r.reason}`);
}

async function reviewAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.review");
  const status = form.get("status") === "approved" ? "approved" : "rejected";
  const trust = (["unverified", "reviewed", "authoritative"] as const).find((t) => t === form.get("trust")) ?? "reviewed";
  await reviewSource(user, String(form.get("id")), status, trust);
  redirect("/admin/knowledge/sources");
}

const ERR: Record<string, string> = {
  invalid: "Please check the form.", too_large: "File is larger than 15 MB.", type_not_allowed: "Only PDF, DOCX, TXT and Markdown files are accepted.",
  duplicate: "This exact file was already uploaded.", extract_failed: "Text could not be extracted from the file.", empty: "Provide a file, pasted text or a URL.",
};

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ e?: string; added?: string; flags?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const sp = await searchParams;
  const rows = await listSources();
  return (
    <AdminShell user={user} title="Sources">
      {sp.e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{ERR[sp.e] ?? sp.e}</p> : null}
      {sp.added ? <p role="status" className="mb-4 rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark">Source added.{sp.flags && sp.flags !== "0" ? " Warning: the text contains instruction-like phrases (possible prompt injection). Review before use." : ""}</p> : null}
      {user.permissions.has("sources.upload") ? (
        <form action={addAction} className="mb-8 grid max-w-3xl gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Add a source</h2>
          <label className="text-sm font-medium">Type<select name="kind" className={adminInput}>{KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></label>
          <label className="text-sm font-medium">Title<input name="title" required maxLength={200} className={adminInput} /></label>
          <label className="text-sm font-medium">Publisher<input name="publisher" maxLength={200} className={adminInput} /></label>
          <label className="text-sm font-medium">URL (reference only)<input name="url" type="url" maxLength={500} className={adminInput} /></label>
          <label className="text-sm font-medium sm:col-span-2">Licence / usage note<input name="licenseNote" maxLength={500} className={adminInput} placeholder="For example: manufacturer manual, may be quoted for support" /></label>
          <label className="text-sm font-medium sm:col-span-2">File (PDF, DOCX, TXT, MD; max 15 MB)<input name="file" type="file" accept=".pdf,.docx,.txt,.md" className="mt-1 block text-sm" /></label>
          <label className="text-sm font-medium sm:col-span-2">Or paste text<textarea name="text" rows={4} className={adminInput} /></label>
          <div className="sm:col-span-2"><button className={adminButton}>Add source</button></div>
          <p className="text-xs text-muted sm:col-span-2">Uploaded files are stored privately. Source text is treated as untrusted data and is never executed or followed as instructions. Do not upload customer personal data.</p>
        </form>
      ) : null}
      <Table head={["Title", "Type", "Publisher", "Status", "Trust", "Flags", ""]} empty={rows.length === 0}>
        {rows.map((s) => (
          <tr key={s.id}>
            <Td>{s.title}{s.has_file ? " (file)" : ""}</Td>
            <Td>{s.kind.replace("_", " ")}</Td>
            <Td>{s.publisher ?? "-"}</Td>
            <Td><StatusPill status={s.status} /></Td>
            <Td>{s.trust_level}</Td>
            <Td>{s.injection_flag ? <span className="text-danger">possible injection</span> : "-"}</Td>
            <Td>
              {user.permissions.has("knowledge.review") && s.status === "pending" ? (
                <form action={reviewAction} className="flex flex-wrap gap-1">
                  <input type="hidden" name="id" value={s.id} />
                  <select name="trust" className="min-h-9 rounded border border-line text-xs"><option value="reviewed">reviewed</option><option value="authoritative">authoritative</option><option value="unverified">unverified</option></select>
                  <button name="status" value="approved" className="rounded border border-line px-2 text-xs">Approve</button>
                  <button name="status" value="rejected" className="rounded border border-line px-2 text-xs">Reject</button>
                </form>
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
