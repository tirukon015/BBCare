import Link from "next/link";
import { redirect } from "next/navigation";
import { SCENARIOS } from "@bbcare/core";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { routerCoverage, uploadModelImage, verifyModelImage } from "@/modules/catalog/admin";
import { routerCaseBreakdown } from "@/modules/support/admin";
import { AdminShell, Table, Td, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Router coverage" };

async function uploadAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const file = form.get("image");
  const src = String(form.get("sourceUrl") ?? "").trim();
  if (!(file instanceof File)) redirect("/admin/routers?e=type");
  const r = await uploadModelImage(user, String(form.get("id")), file, /^https:\/\/\S{4,500}$/.test(src) ? src : null);
  redirect(r.ok ? "/admin/routers?ok=1" : `/admin/routers?e=${r.reason}`);
}

async function verifyAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.verify");
  const r = await verifyModelImage(user, String(form.get("id")), form.get("verified") === "1");
  redirect(r.ok ? "/admin/routers?ok=1" : `/admin/routers?e=${r.reason}`);
}

const ERR: Record<string, string> = {
  size: "Image must be under 3 MB.", type: "Use a PNG, JPEG or WebP photo.", no_image: "Upload a photo first.", self_verify: "A different reviewer must verify a photo you uploaded.",
};

export default async function RouterCoveragePage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const sp = await searchParams;
  const [{ models, flows }, cases] = await Promise.all([routerCoverage(), user.permissions.has("cases.read_all") || user.permissions.has("analytics.read") ? routerCaseBreakdown() : Promise.resolve([])]);
  const cell = (modelId: string, mode: string, key: string) => {
    const fs = flows.filter((f) => f.model_id === modelId && f.support_mode === mode && f.scenario_key === key);
    const live = fs.find((f) => f.status === "published");
    if (live) return <Link href={`/admin/flows/${live.id}`} className="font-semibold text-olive-dark underline">Live</Link>;
    if (fs.length) return <Link href={`/admin/flows/${fs[0]!.id}`} className="text-warn underline">Draft ({fs[0]!.verification_status.replace("_", " ")})</Link>;
    return <span className="text-muted">Staff help</span>;
  };
  const columns = SCENARIOS.flatMap((s) => s.modes.map((mode) => ({ mode, key: s.key, label: `${mode === "ap" ? "AP" : "Mesh"}: ${s.en}` })));
  return (
    <AdminShell user={user} title="Router coverage">
      <div className="mb-4 space-y-2 text-sm">
        <Notice role="note">Customers see step-by-step guidance only where a flow is Live: published after a named reviewer verified it against an approved source. Everywhere else they answer intake questions and reach staff.</Notice>
        {sp.e ? <p role="alert" className="text-danger">{ERR[sp.e] ?? "Not saved."}</p> : null}
        {sp.ok ? <p role="status" className="text-olive-dark">Saved.</p> : null}
      </div>

      <h2 className="mb-2 font-semibold">Models and photos</h2>
      <Table head={["Code", "Model", "Identity", "Photo", "Actions"]}>
        {models.map((m) => (
          <tr key={m.id}>
            <Td className="font-mono">{m.ecr_code}</Td>
            <Td><Link href={`/admin/catalog/${m.id}`} className="underline">{m.display_name}</Link></Td>
            <Td>{m.identity_status === "confirmed" ? "Confirmed" : <span className="text-warn" title={m.identity_note ?? ""}>Needs BBTech confirmation</span>}</Td>
            <Td>{m.image_verified_at ? "Verified" : m.image_asset_id ? "Uploaded, not verified" : "None"}{m.image_source_url ? <a href={m.image_source_url} className="ml-1 underline" target="_blank" rel="noopener noreferrer">source</a> : null}</Td>
            <Td>
              <div className="flex flex-col gap-2">
                {user.permissions.has("catalog.write") ? (
                  <form action={uploadAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required className="text-xs" aria-label={`Photo for ${m.display_name}`} />
                    <input name="sourceUrl" placeholder="Official source URL (https)" className={`${adminInput} max-w-48`} />
                    <button className={adminButtonSecondary}>Upload</button>
                  </form>
                ) : null}
                {user.permissions.has("knowledge.verify") && m.image_asset_id ? (
                  <form action={verifyAction} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    {m.image_verified_at
                      ? <button name="verified" value="0" className={adminButtonSecondary}>Withdraw verification</button>
                      : <button name="verified" value="1" className={adminButton}>Verify photo shows this exact model</button>}
                  </form>
                ) : null}
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-2 mt-8 font-semibold">Troubleshooting coverage</h2>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
        <table className="min-w-full text-xs">
          <thead><tr><th className="p-2 text-left">Model</th>{columns.map((c) => <th key={`${c.mode}-${c.key}`} className="p-2 text-left align-bottom font-medium">{c.label}</th>)}</tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <th className="p-2 text-left font-mono">{m.ecr_code}</th>
                {columns.map((c) => <td key={`${c.mode}-${c.key}`} className="p-2">{cell(m.id, c.mode, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cases.length ? (
        <>
          <h2 className="mb-2 mt-8 font-semibold">Recurring router problems (cases, last 90 days)</h2>
          <Table head={["Model", "Mode", "Problem", "Cases", "Open", "Confirmed fixed"]}>
            {cases.map((c, i) => (
              <tr key={i}><Td className="font-mono">{c.ecr_code}</Td><Td>{c.support_mode ?? "-"}</Td><Td>{SCENARIOS.find((s) => s.key === c.scenario_key)?.en ?? c.scenario_key ?? "Not specified"}</Td><Td>{c.total}</Td><Td>{c.open}</Td><Td>{c.resolved_verified}</Td></tr>
            ))}
          </Table>
        </>
      ) : null}
    </AdminShell>
  );
}
