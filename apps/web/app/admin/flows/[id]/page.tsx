import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { flowStepsSchema, getFlowAdmin, saveFlow, setFlowStatus, validateFlowGraph } from "@/modules/knowledge/flows-admin";
import { catalogOptions } from "@/modules/catalog/options";
import { AdminShell, StatusPill, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flow" };

const TEMPLATE = JSON.stringify([
  { key: "start", start: true, prompt_en: "Question in English?", prompt_ms: "Soalan dalam Bahasa Melayu?", options: [
    { key: "yes", label_en: "Yes", label_ms: "Ya", next: "next_step" },
    { key: "no", label_en: "No", label_ms: "Tidak", outcome: "escalate" } ] },
  { key: "next_step", prompt_en: "Next instruction?", prompt_ms: "Arahan seterusnya?", options: [
    { key: "fixed", label_en: "That fixed it", label_ms: "Masalah selesai", outcome: "resolved" },
    { key: "not", label_en: "Still not working", label_ms: "Masih tidak berfungsi", outcome: "escalate" } ] },
], null, 2);

async function saveAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const id = String(form.get("id") ?? "");
  const meta = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/), categoryId: z.uuid(), titleEn: z.string().trim().min(3).max(150), titleMs: z.string().trim().min(3).max(150) }).safeParse(Object.fromEntries(form));
  const back = `/admin/flows/${id || "new"}`;
  if (!meta.success) redirect(`${back}?e=${encodeURIComponent("Check slug, category and titles.")}`);
  let parsed: unknown;
  try { parsed = JSON.parse(String(form.get("steps") ?? "")); } catch { redirect(`${back}?e=${encodeURIComponent("Steps are not valid JSON.")}`); }
  const steps = flowStepsSchema.safeParse(parsed);
  if (!steps.success) redirect(`${back}?e=${encodeURIComponent(steps.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))}`);
  const graph = validateFlowGraph(steps.data);
  if (graph.length) redirect(`${back}?e=${encodeURIComponent(graph.join(" "))}`);
  let saved: string;
  try { saved = await saveFlow(user, { id: id || undefined, ...meta.data, steps: steps.data }); } catch { redirect(`${back}?e=${encodeURIComponent("Slug already in use.")}`); }
  redirect(`/admin/flows/${saved}?ok=1`);
}

async function statusAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.publish");
  const status = (["draft", "published", "archived"] as const).find((s) => s === form.get("status"));
  if (status) await setFlowStatus(user, String(form.get("id")), status);
  redirect(`/admin/flows/${String(form.get("id"))}`);
}

export default async function FlowEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const [flow, opts] = await Promise.all([isNew ? null : getFlowAdmin(id), catalogOptions()]);
  if (!isNew && !flow) notFound();
  return (
    <AdminShell user={user} title={isNew ? "New flow" : flow!.title_en}>
      {sp.e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{sp.e}</p> : null}
      {sp.ok ? <p role="status" className="mb-4 rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark">Saved as draft. A reviewer publishes it.</p> : null}
      {flow ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={flow.status} />
          {user.permissions.has("knowledge.publish") ? (
            <form action={statusAction} className="flex gap-2"><input type="hidden" name="id" value={flow.id} />
              {flow.status !== "published" ? <button name="status" value="published" className={adminButton}>Publish</button> : null}
              {flow.status !== "archived" ? <button name="status" value="archived" className={adminButtonSecondary}>Archive</button> : null}
            </form>
          ) : null}
        </div>
      ) : null}
      <form action={saveAction} className="grid max-w-4xl gap-3 text-sm">
        <input type="hidden" name="id" value={flow?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Slug<input name="slug" required defaultValue={flow?.slug} readOnly={!!flow} pattern="[a-z0-9-]{3,80}" className={adminInput} /></label>
          <label>Category<select name="categoryId" defaultValue={flow?.category_id} className={adminInput}>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></label>
          <label>Title (English)<input name="titleEn" required defaultValue={flow?.title_en} className={adminInput} /></label>
          <label>Title (Malay)<input name="titleMs" required defaultValue={flow?.title_ms} className={adminInput} /></label>
        </div>
        <label>Steps (JSON). Each option either continues to another step (next) or ends with an outcome: resolved, resolved_hint or escalate.
          <textarea name="steps" rows={24} required defaultValue={flow?.stepsJson ?? TEMPLATE} className={`${adminInput} font-mono text-xs`} />
        </label>
        {user.permissions.has("knowledge.write") ? <div><button className={adminButton}>Validate and save draft</button></div> : null}
      </form>
    </AdminShell>
  );
}
