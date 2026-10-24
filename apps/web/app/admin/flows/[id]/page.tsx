import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { SCENARIOS } from "@bbcare/core";
import {
  approvedSourceOptions, flowStepsSchema, type RouterFlowFields, getFlowAdmin, saveFlow, setFlowSources, setFlowStatus, unverifyFlow, validateFlowGraph, verifyFlow,
} from "@/modules/knowledge/flows-admin";
import { listRouterModels } from "@/modules/router/service";
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
  const modelId = String(form.get("modelId") ?? "");
  const mode = form.get("mode") === "ap" ? "ap" : form.get("mode") === "mesh" ? "mesh" : null;
  const scenarioKey = String(form.get("scenarioKey") ?? "");
  let router: RouterFlowFields | null = null;
  if (modelId) {
    const scenario = SCENARIOS.find((s) => s.key === scenarioKey);
    if (!/^[0-9a-f-]{36}$/i.test(modelId) || !mode || !scenario || !scenario.modes.includes(mode)) redirect(`${back}?e=${encodeURIComponent("Choose a mode and a problem that belongs to that mode.")}`);
    router = { modelId, mode: mode!, scenarioKey, hardwareRevision: String(form.get("hardwareRevision") ?? "").trim().slice(0, 60) || null, firmwareNote: String(form.get("firmwareNote") ?? "").trim().slice(0, 200) || null };
  }
  let saved: string;
  try { saved = await saveFlow(user, { id: id || undefined, ...meta.data, steps: steps.data, router }); } catch { redirect(`${back}?e=${encodeURIComponent("Slug already in use or invalid fields.")}`); }
  redirect(`/admin/flows/${saved}?ok=1`);
}

async function statusAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.publish");
  const status = (["draft", "published", "archived"] as const).find((s) => s === form.get("status"));
  const r = status ? await setFlowStatus(user, String(form.get("id")), status) : { ok: true as const };
  redirect(`/admin/flows/${String(form.get("id"))}${r.ok ? "" : `?e=${encodeURIComponent(STATUS_ERR[r.reason] ?? "Not published.")}`}`);
}

const STATUS_ERR: Record<string, string> = {
  not_verified: "Verify this flow before publishing.",
  no_source: "Link an approved, reviewed source before publishing.",
  translation: "Replace every [PERLU TERJEMAHAN] Malay placeholder before publishing.",
  duplicate_live: "Another flow is already live for this model, mode and problem. Archive it first.",
  not_router: "Only model-specific flows need verification.",
  note_required: "Describe what you checked (at least 10 characters): document, section and page.",
};

async function verifyAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.verify");
  const id = String(form.get("id"));
  if (form.get("unverify") === "1") { await unverifyFlow(user, id); redirect(`/admin/flows/${id}`); }
  const r = await verifyFlow(user, id, String(form.get("note") ?? ""));
  redirect(`/admin/flows/${id}${r.ok ? "?ok=1" : `?e=${encodeURIComponent(STATUS_ERR[r.reason] ?? "Not verified.")}`}`);
}

async function sourcesAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const id = String(form.get("id"));
  const ids = form.getAll("sourceId").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  await setFlowSources(user, id, ids.map((sourceId) => ({ sourceId, locator: String(form.get(`locator-${sourceId}`) ?? "").trim() || null })));
  redirect(`/admin/flows/${id}`);
}

export default async function FlowEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  const [flow, opts, routerModels, sourceOpts] = await Promise.all([isNew ? null : getFlowAdmin(id), catalogOptions(), listRouterModels(), approvedSourceOptions()]);
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
      {flow?.model_id ? (
        <div className="mb-4 grid max-w-4xl gap-4 lg:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm" data-testid="flow-verification">
            <h2 className="font-semibold">Verification</h2>
            <p className="mt-1">Status: <strong>{flow.verification_status.replace("_", " ")}</strong>{flow.verified_at ? ` by ${flow.verifier ?? "unknown"} on ${flow.verified_at.toISOString().slice(0, 10)}` : ""}</p>
            {flow.research_ref ? <p className="text-xs text-muted">Imported from research record {flow.research_ref}. Treat the steps as unconfirmed until checked against the full source.</p> : null}
            {flow.verification_note ? <p className="mt-1 text-xs">{flow.verification_note}</p> : null}
            {user.permissions.has("knowledge.verify") ? (
              <form action={verifyAction} className="mt-3 space-y-2"><input type="hidden" name="id" value={flow.id} />
                {flow.verification_status === "verified" ? (
                  <button name="unverify" value="1" className={adminButtonSecondary}>Withdraw verification</button>
                ) : (
                  <>
                    <label className="block">What did you check? (document, section, page)<textarea name="note" required minLength={10} maxLength={950} rows={2} className={adminInput} /></label>
                    <button className={adminButton}>I checked every step against the full source: mark verified</button>
                  </>
                )}
              </form>
            ) : null}
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Sources</h2>
            <p className="text-xs text-muted">Publishing needs at least one approved source with trust level reviewed or authoritative. Approve sources under Knowledge &gt; Sources.</p>
            <form action={sourcesAction} className="mt-2 space-y-1"><input type="hidden" name="id" value={flow.id} />
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {sourceOpts.map((s) => {
                  const linked = flow.sources.find((x) => x.source_id === s.id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2"><input type="checkbox" name="sourceId" value={s.id} defaultChecked={!!linked} /> {s.title} <span className="text-xs text-muted">({s.status}, {s.trust_level})</span></label>
                      <input name={`locator-${s.id}`} defaultValue={linked?.locator ?? ""} placeholder="Section / page" maxLength={200} className={`${adminInput} max-w-40`} />
                    </li>
                  );
                })}
              </ul>
              {user.permissions.has("knowledge.write") ? <button className={adminButtonSecondary}>Save sources</button> : null}
            </form>
          </section>
        </div>
      ) : null}
      <form action={saveAction} className="grid max-w-4xl gap-3 text-sm">
        <input type="hidden" name="id" value={flow?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Slug<input name="slug" required defaultValue={flow?.slug} readOnly={!!flow} pattern="[a-z0-9-]{3,80}" className={adminInput} /></label>
          <label>Category<select name="categoryId" defaultValue={flow?.category_id} className={adminInput}>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></label>
          <label>Title (English)<input name="titleEn" required defaultValue={flow?.title_en} className={adminInput} /></label>
          <label>Title (Malay)<input name="titleMs" required defaultValue={flow?.title_ms} className={adminInput} /></label>
          <label>Router model (leave empty for a general flow)<select name="modelId" defaultValue={flow?.model_id ?? ""} className={adminInput}>
            <option value="">General flow</option>{routerModels.map((m) => <option key={m.id} value={m.id}>{m.ecr}: {m.name}</option>)}</select></label>
          <label>Mode<select name="mode" defaultValue={flow?.support_mode ?? ""} className={adminInput}><option value="">-</option><option value="mesh">Mesh Connection Mode</option><option value="ap">Access Point (AP) Mode</option></select></label>
          <label>Problem<select name="scenarioKey" defaultValue={flow?.scenario_key ?? ""} className={adminInput}><option value="">-</option>{SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.modes.join("/")}: {s.en}</option>)}</select></label>
          <label>Hardware version (optional)<input name="hardwareRevision" maxLength={60} defaultValue={flow?.hardware_revision ?? ""} className={adminInput} /></label>
          <label className="sm:col-span-2">Firmware note (optional)<input name="firmwareNote" maxLength={200} defaultValue={flow?.firmware_note ?? ""} className={adminInput} /></label>
        </div>
        <label>Steps (JSON). Each option either continues to another step (next) or ends with an outcome: resolved, resolved_hint or escalate. Optional per step: expected_en/expected_ms (what the customer should see), warning_en/warning_ms, and destructive: true for configuration-erasing steps (requires both warnings and &quot;safety&quot;: &quot;danger&quot;). Editing a verified flow withdraws its verification.
          <textarea name="steps" rows={24} required defaultValue={flow?.stepsJson ?? TEMPLATE} className={`${adminInput} font-mono text-xs`} />
        </label>
        {user.permissions.has("knowledge.write") ? <div><button className={adminButton}>Validate and save draft</button></div> : null}
      </form>
    </AdminShell>
  );
}
