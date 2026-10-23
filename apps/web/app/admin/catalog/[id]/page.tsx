import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { addAlias, addFirmware, addVariant, getModelAdmin, removeAlias, updateModel } from "@/modules/catalog/admin";
import { AdminShell, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Model" };

async function updateAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const p = z.object({ id: z.uuid(), displayName: z.string().trim().min(2).max(120), status: z.enum(["active", "legacy", "hidden"]), summaryEn: z.string().max(300), summaryMs: z.string().max(300), year: z.string() }).parse(Object.fromEntries(form));
  await updateModel(user, p.id, { ...p, year: p.year ? Number(p.year) : null });
  redirect(`/admin/catalog/${p.id}?ok=1`);
}
async function aliasAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const id = String(form.get("id"));
  if (form.get("remove")) await removeAlias(user, String(form.get("remove")));
  else { const alias = String(form.get("alias") ?? "").trim().slice(0, 80); if (alias.length >= 2) await addAlias(user, id, alias); }
  redirect(`/admin/catalog/${id}`);
}
async function variantAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const id = String(form.get("id"));
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  if (label) await addVariant(user, id, { label, hardwareRevision: String(form.get("hw") ?? "") || undefined, region: String(form.get("region") ?? "") || undefined, sku: String(form.get("sku") ?? "") || undefined }).catch(() => {});
  redirect(`/admin/catalog/${id}`);
}
async function firmwareAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const id = String(form.get("id"));
  const version = String(form.get("version") ?? "").trim().slice(0, 60);
  if (version) await addFirmware(user, id, { version, releasedOn: String(form.get("released") ?? ""), notes: String(form.get("notes") ?? "").slice(0, 300) || undefined });
  redirect(`/admin/catalog/${id}`);
}

export default async function ModelAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("catalog.read");
  const m = await getModelAdmin((await params).id);
  if (!m) notFound();
  const w = user.permissions.has("catalog.write");
  return (
    <AdminShell user={user} title={m.display_name}>
      <p className="mb-4 text-sm text-muted">{m.brand} · {m.category} · <span className="font-mono">{m.model_number}</span> · /{m.slug}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={updateAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
          <input type="hidden" name="id" value={m.id} />
          <h2 className="font-semibold">Details</h2>
          <label className="block">Display name<input name="displayName" defaultValue={m.display_name} disabled={!w} className={adminInput} /></label>
          <label className="block">Status<select name="status" defaultValue={m.status} disabled={!w} className={adminInput}><option>active</option><option>legacy</option><option>hidden</option></select></label>
          <label className="block">Release year<input name="year" type="number" defaultValue={m.released_year ?? ""} disabled={!w} className={adminInput} /></label>
          <label className="block">Summary (English)<input name="summaryEn" defaultValue={m.summary_en ?? ""} disabled={!w} className={adminInput} /></label>
          <label className="block">Summary (Malay)<input name="summaryMs" defaultValue={m.summary_ms ?? ""} disabled={!w} className={adminInput} /></label>
          {w ? <button className={adminButton}>Save</button> : null}
        </form>
        <div className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Aliases (used for model resolution)</h2>
            <ul className="mt-2 flex flex-wrap gap-2">{m.aliases.map((a) => (
              <li key={a.id} className="flex items-center gap-1 rounded-full border border-line px-3 py-1">{a.alias}
                {w ? <form action={aliasAction}><input type="hidden" name="id" value={m.id} /><button name="remove" value={a.id} aria-label={`Remove alias ${a.alias}`} className="text-danger">×</button></form> : null}
              </li>))}
            </ul>
            {w ? <form action={aliasAction} className="mt-3 flex gap-2"><input type="hidden" name="id" value={m.id} /><input name="alias" placeholder="New alias" className={adminInput} /><button className={adminButtonSecondary}>Add</button></form> : null}
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Hardware variants</h2>
            <ul className="mt-2 list-disc pl-5">{m.variants.map((v) => <li key={v.id}>{v.label}{v.hardware_revision ? ` · HW ${v.hardware_revision}` : ""}{v.region ? ` · ${v.region}` : ""}{v.sku ? ` · ${v.sku}` : ""}</li>)}</ul>
            {w ? <form action={variantAction} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="id" value={m.id} /><input name="label" placeholder="Label" className={adminInput} /><input name="hw" placeholder="Hardware rev" className={adminInput} /><input name="region" placeholder="Region" className={adminInput} /><input name="sku" placeholder="SKU" className={adminInput} /><button className={adminButtonSecondary}>Add variant</button></form> : null}
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Firmware on record</h2>
            <p className="text-xs text-muted">Record only versions confirmed by the manufacturer.</p>
            <ul className="mt-2 list-disc pl-5">{m.firmware.map((f) => <li key={f.id}>{f.version}{f.released_on ? ` (${f.released_on})` : ""}{f.variant ? ` · ${f.variant}` : ""}{f.notes ? ` · ${f.notes}` : ""}</li>)}</ul>
            {w ? <form action={firmwareAction} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="id" value={m.id} /><input name="version" placeholder="Version" className={adminInput} /><input name="released" type="date" className={adminInput} /><input name="notes" placeholder="Notes / source" className={`${adminInput} col-span-2`} /><button className={adminButtonSecondary}>Add firmware</button></form> : null}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
