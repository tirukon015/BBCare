import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { aiOverview, NEXT_STATUS, registerModel, setFlag, setModelStatus } from "@/modules/ai/admin";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI" };

async function flagAction(form: FormData) {
  "use server";
  const user = await assertPermission("ai.configure");
  const enable = form.get("enabled") === "1";
  if (enable && form.get("confirm") !== "ENABLE") redirect("/admin/ai?e=confirm");
  const r = await setFlag(user, String(form.get("key")), enable);
  redirect(r.ok ? "/admin/ai?ok=1" : `/admin/ai?e=${r.reason}`);
}
async function modelAction(form: FormData) {
  "use server";
  const user = await assertPermission("ai.configure");
  const ok = await setModelStatus(user, String(form.get("id")), String(form.get("status")));
  redirect(ok ? "/admin/ai?ok=1" : "/admin/ai?e=model_transition");
}
async function registerAction(form: FormData) {
  "use server";
  const user = await assertPermission("ai.configure");
  const p = z.object({ name: z.string().trim().min(2).max(120), purpose: z.enum(["chat", "embedding", "rerank"]), provider: z.enum(["flask"]), quantization: z.string().max(40).optional(), licenseNote: z.string().max(300).optional(), notes: z.string().max(500).optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) redirect("/admin/ai?e=invalid");
  await registerModel(user, p.data);
  redirect("/admin/ai?ok=1");
}

const ERR: Record<string, string> = {
  confirm: "Type ENABLE to confirm turning on customer-facing AI.",
  no_provider: "No AI provider is configured (BBCARE_AI_PROVIDER).",
  mock_not_allowed: "The mock provider cannot serve customers in staging or production.",
  no_active_model: "Activate an evaluated and approved chat model first.",
  model_transition: "That model status change is not allowed.",
  invalid: "Please check the form.",
};

export default async function AiPage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("ai.read");
  const o = await aiOverview();
  const sp = await searchParams;
  const canConfigure = user.permissions.has("ai.configure");
  return (
    <AdminShell user={user} title="AI" actions={<Link href="/admin/ai/examples" className={adminButton}>Training examples</Link>}>
      {sp.e ? <div className="mb-4"><Notice tone="danger" role="alert">{ERR[sp.e] ?? sp.e}</Notice></div> : null}
      {sp.ok ? <div className="mb-4"><Notice tone="olive" role="status">Saved.</Notice></div> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Provider</p>
          <p>{o.provider ? `${o.provider.name}${o.provider.mock ? " (mock test double, never for real customers)" : ""}` : "none configured"}</p>
          <p className="mt-1">Health: {o.health ? (o.health.ok ? `reachable (${o.health.latencyMs ?? "?"} ms)` : `unavailable: ${o.health.detail ?? ""}`) : "-"}</p>
          <p className="mt-1 text-muted">Environment: {o.env}. The website keeps working in search-only mode whenever AI is off or unavailable.</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
          <p className="font-semibold">Safety gate</p>
          <p className="text-ink-soft">Customer-facing AI answers need owner approval after the evaluation, privacy and security checks pass. In staging and production a real provider and an active, approved chat model are required.</p>
        </div>
      </div>
      <h2 className="mb-2 font-semibold">Feature flags</h2>
      <Table head={["Flag", "State", "Changed", ""]}>
        {o.flags.map((f) => (
          <tr key={f.key}>
            <Td className="font-mono text-xs">{f.key}</Td>
            <Td>{f.enabled ? <span className="font-semibold text-ok">on</span> : "off"}</Td>
            <Td>{f.updated_at.toISOString().slice(0, 16).replace("T", " ")}{f.by ? ` by ${f.by}` : ""}</Td>
            <Td>{canConfigure ? (
              <form action={flagAction} className="flex flex-wrap gap-1">
                <input type="hidden" name="key" value={f.key} />
                <input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
                {!f.enabled ? <input name="confirm" placeholder="Type ENABLE" className="min-h-9 w-28 rounded border border-line px-2 text-xs" /> : null}
                <button className="rounded border border-line px-2 text-xs">{f.enabled ? "Turn off" : "Turn on"}</button>
              </form>
            ) : null}</Td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-8 font-semibold">Models</h2>
      <Table head={["Name", "Purpose", "Provider", "Status", "Licence", ""]} empty={o.models.length === 0}>
        {o.models.map((m) => (
          <tr key={m.id}>
            <Td>{m.name}{m.quantization ? ` (${m.quantization})` : ""}</Td><Td>{m.purpose}</Td><Td>{m.provider}</Td><Td><StatusPill status={m.status} /></Td><Td>{m.license_note ?? "-"}</Td>
            <Td>{canConfigure ? (
              <form action={modelAction} className="flex gap-1"><input type="hidden" name="id" value={m.id} />
                {(NEXT_STATUS[m.status] ?? []).map((s) => <button key={s} name="status" value={s} className="rounded border border-line px-2 text-xs">{s}</button>)}
              </form>
            ) : null}</Td>
          </tr>
        ))}
      </Table>
      {canConfigure ? (
        <form action={registerAction} className="mt-4 grid max-w-3xl gap-2 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm sm:grid-cols-3">
          <h3 className="font-semibold sm:col-span-3">Register a candidate model (after the server audit)</h3>
          <input name="name" required placeholder="Model name, e.g. qwen3:14b" className={adminInput} />
          <select name="purpose" className={adminInput}><option>chat</option><option>embedding</option><option>rerank</option></select>
          <select name="provider" className={adminInput}><option value="flask">flask (owner server)</option></select>
          <input name="quantization" placeholder="Quantization" className={adminInput} />
          <input name="licenseNote" placeholder="Licence (verified from model card)" className={`${adminInput} sm:col-span-2`} />
          <input name="notes" placeholder="Notes" className={`${adminInput} sm:col-span-3`} />
          <div><button className={adminButton}>Register candidate</button></div>
        </form>
      ) : null}
      <h2 className="mb-2 mt-8 font-semibold">Evaluation runs</h2>
      <Table head={["Dataset", "Started", "Provider/model", "Summary"]} empty={o.runs.length === 0}>
        {o.runs.map((r) => (
          <tr key={r.id}>
            <Td>{r.dataset} v{r.version}</Td><Td>{r.started_at.toISOString().slice(0, 16).replace("T", " ")}</Td>
            <Td className="font-mono text-xs">{String(r.config.provider ?? "")} {String(r.config.model ?? "")}</Td>
            <Td className="font-mono text-xs">{JSON.stringify(r.summary)}</Td>
          </tr>
        ))}
      </Table>
    </AdminShell>
  );
}
