import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { createProduct, listProductsAdmin } from "@/modules/commerce/admin";
import { catalogOptions } from "@/modules/catalog/options";
import { listBrandsAdmin } from "@/modules/catalog/admin";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products & listings" };

async function createAction(form: FormData) {
  "use server";
  const user = await assertPermission("commerce.write");
  const p = z.object({
    sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,60}$/), categoryId: z.uuid(), brandId: z.uuid().or(z.literal("")), modelId: z.uuid().or(z.literal("")),
    kind: z.enum(["device", "accessory", "part", "service"]), nameEn: z.string().trim().min(2).max(160), nameMs: z.string().trim().min(2).max(160),
    summaryEn: z.string().max(300).optional(), summaryMs: z.string().max(300).optional(),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) redirect("/admin/products?e=invalid");
  let id: string;
  try { id = await createProduct(user, { ...p.data, brandId: p.data.brandId || null, modelId: p.data.modelId || null }); } catch { redirect("/admin/products?e=sku_exists"); }
  redirect(`/admin/products/${id}`);
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await requireStaff("commerce.read");
  const [rows, opts, brands] = await Promise.all([listProductsAdmin(), catalogOptions(), listBrandsAdmin()]);
  const { e } = await searchParams;
  return (
    <AdminShell user={user} title="Products & listings">
      <p className="mb-4 text-sm text-muted">Only active listings verified within the configured window, on allowlisted domains, and for products with verified compatibility are shown to customers. Prices and stock are not shown unless an authorised, current source exists.</p>
      {e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">Could not save ({e.replace("_", " ")}).</p> : null}
      <Table head={["Product", "SKU", "Type", "Category", "Status", "Listings", "Verified compatibility"]} empty={rows.length === 0}>
        {rows.map((p) => (
          <tr key={p.id}>
            <Td><Link className="text-olive underline" href={`/admin/products/${p.id}`}>{p.name_en}</Link></Td>
            <Td className="font-mono text-xs">{p.sku}</Td><Td>{p.kind}</Td><Td>{p.category}</Td><Td><StatusPill status={p.status} /></Td>
            <Td>{p.active_listings}/{p.listings} active{p.stale ? <span className="ml-1 text-warn">({p.stale} need re-verification)</span> : null}</Td>
            <Td>{p.compat}</Td>
          </tr>
        ))}
      </Table>
      {user.permissions.has("commerce.write") ? (
        <form action={createAction} className="mt-8 grid max-w-3xl gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Add product</h2>
          <label>SKU<input name="sku" required className={adminInput} /></label>
          <label>Type<select name="kind" className={adminInput}>{["device", "accessory", "part", "service"].map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Category<select name="categoryId" className={adminInput}>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></label>
          <label>Brand<select name="brandId" className={adminInput}><option value="">(none)</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label className="sm:col-span-2">Is this product itself a catalog model?<select name="modelId" className={adminInput}><option value="">No (accessory or other)</option>{opts.models.map((m) => <option key={m.id} value={m.id}>{m.brand}: {m.display_name}</option>)}</select></label>
          <label>Name (English)<input name="nameEn" required className={adminInput} /></label>
          <label>Name (Malay)<input name="nameMs" required className={adminInput} /></label>
          <label>Summary (English)<input name="summaryEn" className={adminInput} /></label>
          <label>Summary (Malay)<input name="summaryMs" className={adminInput} /></label>
          <div className="sm:col-span-2"><button className={adminButton}>Add product</button></div>
        </form>
      ) : null}
    </AdminShell>
  );
}
