import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { addCompatibility, addListing, getProductAdmin, verifyListing } from "@/modules/commerce/admin";
import { catalogOptions } from "@/modules/catalog/options";
import { AdminShell, StatusPill, Table, Td, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product" };

async function listingAction(form: FormData) {
  "use server";
  const user = await assertPermission("commerce.write");
  const p = z.object({ id: z.uuid(), channel: z.enum(["bbtech_shop", "shopee"]), url: z.url().max(500), externalItemId: z.string().max(60).optional() }).safeParse(Object.fromEntries(form));
  if (!p.success) redirect(`/admin/products/${String(form.get("id"))}?e=invalid_url`);
  const r = await addListing(user, p.data.id, { channel: p.data.channel, url: p.data.url, externalItemId: p.data.externalItemId || undefined });
  redirect(`/admin/products/${p.data.id}${r.ok ? "" : `?e=${r.reason}`}`);
}
async function verifyAction(form: FormData) {
  "use server";
  const user = await assertPermission("commerce.verify");
  const result = (["ok", "broken", "not_found"] as const).find((r) => r === form.get("result"));
  if (!result) return;
  await verifyListing(user, String(form.get("listingId")), result, String(form.get("note") ?? "").slice(0, 300) || null);
  redirect(`/admin/products/${String(form.get("id"))}`);
}
async function compatAction(form: FormData) {
  "use server";
  const verified = form.get("verified") === "1";
  const user = await assertPermission(verified ? "commerce.verify" : "commerce.write");
  const p = z.object({ id: z.uuid(), modelId: z.uuid(), relation: z.enum(["compatible_with", "accessory_for", "replacement_for", "upgrade_for"]) }).parse(Object.fromEntries(form));
  await addCompatibility(user, p.id, p.modelId, p.relation, verified);
  redirect(`/admin/products/${p.id}`);
}

export default async function ProductAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const user = await requireStaff("commerce.read");
  const [p, opts] = await Promise.all([getProductAdmin((await params).id), catalogOptions()]);
  if (!p) notFound();
  const { e } = await searchParams;
  const canWrite = user.permissions.has("commerce.write");
  const canVerify = user.permissions.has("commerce.verify");
  return (
    <AdminShell user={user} title={p.name_en}>
      {e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{e === "domain_not_allowed" ? "Only https://www.bbtech.shop/ and https://shopee.com.my/ URLs are accepted, and the channel must match the domain." : e.replace("_", " ")}</p> : null}
      <p className="mb-4 text-sm text-muted"><span className="font-mono">{p.sku}</span> · {p.kind} · {p.name_ms}{p.model ? ` · catalog model ${p.model}` : ""}</p>
      <h2 className="mb-2 font-semibold">Listings</h2>
      <Table head={["Channel", "URL", "Status", "Last verified", ""]} empty={p.listings.length === 0}>
        {p.listings.map((l) => (
          <tr key={l.id}>
            <Td>{l.channel}</Td>
            <Td className="max-w-xs break-all font-mono text-xs">{l.url}</Td>
            <Td><StatusPill status={l.status} /></Td>
            <Td>{l.last_verified_at ? `${l.last_verified_at.toISOString().slice(0, 10)} by ${l.verifier ?? "?"}` : "never"}</Td>
            <Td>{canVerify ? (
              <form action={verifyAction} className="flex flex-wrap gap-1">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="listingId" value={l.id} />
                <input name="note" placeholder="Note" className="min-h-9 w-28 rounded border border-line px-2 text-xs" />
                <button name="result" value="ok" className="rounded border border-line px-2 text-xs">Verified OK</button>
                <button name="result" value="broken" className="rounded border border-line px-2 text-xs">Broken</button>
                <button name="result" value="not_found" className="rounded border border-line px-2 text-xs">Delisted</button>
              </form>
            ) : null}</Td>
          </tr>
        ))}
      </Table>
      {canWrite ? (
        <form action={listingAction} className="mt-3 flex max-w-3xl flex-wrap gap-2 text-sm">
          <input type="hidden" name="id" value={p.id} />
          <select name="channel" className="min-h-11 rounded-lg border border-line px-2"><option value="shopee">Shopee</option><option value="bbtech_shop">BBTech.shop</option></select>
          <input name="url" type="url" required placeholder="https://shopee.com.my/..." className={`${adminInput} flex-1`} />
          <input name="externalItemId" placeholder="Listing ID (optional)" className={`${adminInput} w-40`} />
          <button className={adminButtonSecondary}>Add listing</button>
        </form>
      ) : null}
      <h2 className="mb-2 mt-8 font-semibold">Compatibility</h2>
      <Table head={["Model", "Relation", "Verified"]} empty={p.compat.length === 0}>
        {p.compat.map((c) => <tr key={c.id}><Td>{c.model}</Td><Td>{c.relation.replace("_", " ")}</Td><Td>{c.verified_at ? `${c.verified_at.toISOString().slice(0, 10)} by ${c.verifier ?? "?"}` : <span className="text-warn">unverified</span>}</Td></tr>)}
      </Table>
      {canWrite ? (
        <form action={compatAction} className="mt-3 flex max-w-3xl flex-wrap gap-2 text-sm">
          <input type="hidden" name="id" value={p.id} />
          <select name="modelId" className="min-h-11 rounded-lg border border-line px-2">{opts.models.map((m) => <option key={m.id} value={m.id}>{m.brand}: {m.display_name}</option>)}</select>
          <select name="relation" className="min-h-11 rounded-lg border border-line px-2">{["accessory_for", "compatible_with", "replacement_for", "upgrade_for"].map((r) => <option key={r}>{r}</option>)}</select>
          {canVerify ? <label className="flex items-center gap-1"><input type="checkbox" name="verified" value="1" /> I verified this</label> : null}
          <button className={adminButton}>Save</button>
        </form>
      ) : null}
      {p.history.length ? (
        <>
          <h2 className="mb-2 mt-8 font-semibold">Verification history</h2>
          <ul className="space-y-1 text-sm">{p.history.map((h, i) => <li key={i}>{h.checked_at.toISOString().slice(0, 16).replace("T", " ")} · {h.method} · {h.result}{h.checker ? ` · ${h.checker}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
        </>
      ) : null}
    </AdminShell>
  );
}
