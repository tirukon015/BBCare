import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { createBrand, createModel, listBrandsAdmin, listModelsAdmin } from "@/modules/catalog/admin";
import { catalogOptions } from "@/modules/catalog/options";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

const slug = z.string().regex(/^[a-z0-9-]{2,80}$/);

async function brandAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const p = z.object({ name: z.string().trim().min(1).max(100), slug }).safeParse(Object.fromEntries(form));
  if (!p.success) redirect("/admin/catalog?e=brand");
  try { await createBrand(user, p.data.name, p.data.slug); } catch { redirect("/admin/catalog?e=brand_exists"); }
  redirect("/admin/catalog?ok=brand");
}

async function modelAction(form: FormData) {
  "use server";
  const user = await assertPermission("catalog.write");
  const p = z.object({
    brandId: z.uuid(), categoryId: z.uuid(), modelNumber: z.string().trim().min(2).max(80), displayName: z.string().trim().min(2).max(120), slug,
    summaryEn: z.string().trim().max(300).optional(), summaryMs: z.string().trim().max(300).optional(), year: z.coerce.number().int().min(1990).max(2100).optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) redirect("/admin/catalog?e=model");
  let id: string;
  try { id = await createModel(user, { ...p.data, year: p.data.year === "" ? undefined : p.data.year }); } catch { redirect("/admin/catalog?e=model_exists"); }
  redirect(`/admin/catalog/${id}`);
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ c?: string; e?: string; ok?: string }> }) {
  const user = await requireStaff("catalog.read");
  const sp = await searchParams;
  const [models, brands, opts] = await Promise.all([listModelsAdmin(sp.c === "router" || sp.c === "laptop" ? sp.c : undefined), listBrandsAdmin(), catalogOptions()]);
  const canWrite = user.permissions.has("catalog.write");
  return (
    <AdminShell user={user} title="Catalog">
      {sp.e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">Could not save ({sp.e.replace("_", " ")}). Check the fields and that the slug is unique.</p> : null}
      <nav className="mb-4 flex gap-2 text-sm"><Link href="/admin/catalog" className="rounded-full border border-line bg-white px-3 py-1">All</Link><Link href="/admin/catalog?c=router" className="rounded-full border border-line bg-white px-3 py-1">Routers</Link><Link href="/admin/catalog?c=laptop" className="rounded-full border border-line bg-white px-3 py-1">Laptops</Link></nav>
      <Table head={["Model", "Number", "Brand", "Category", "Status", "Aliases", "Published guides"]} empty={models.length === 0}>
        {models.map((m) => (
          <tr key={m.id}>
            <Td><Link className="text-olive underline" href={`/admin/catalog/${m.id}`}>{m.display_name}</Link></Td>
            <Td className="font-mono text-xs">{m.model_number}</Td><Td>{m.brand}</Td><Td>{m.category}</Td>
            <Td><StatusPill status={m.status} /></Td><Td>{m.aliases}</Td><Td>{m.articles === 0 ? <span className="text-warn">0</span> : m.articles}</Td>
          </tr>
        ))}
      </Table>
      {canWrite ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <form action={modelAction} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Add model</h2>
            <label className="block">Category<select name="categoryId" className={adminInput}>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></label>
            <label className="block">Brand<select name="brandId" className={adminInput}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label className="block">Model number<input name="modelNumber" required className={adminInput} /></label>
            <label className="block">Display name<input name="displayName" required className={adminInput} /></label>
            <label className="block">Slug<input name="slug" required pattern="[a-z0-9-]{2,80}" className={adminInput} /></label>
            <label className="block">Release year<input name="year" type="number" className={adminInput} /></label>
            <label className="block">Summary (English)<input name="summaryEn" className={adminInput} /></label>
            <label className="block">Summary (Malay)<input name="summaryMs" className={adminInput} /></label>
            <button className={adminButton}>Add model</button>
          </form>
          <form action={brandAction} className="h-fit space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
            <h2 className="font-semibold">Add brand</h2>
            <label className="block">Name<input name="name" required className={adminInput} /></label>
            <label className="block">Slug<input name="slug" required pattern="[a-z0-9-]{2,80}" className={adminInput} /></label>
            <button className={adminButton}>Add brand</button>
          </form>
        </div>
      ) : null}
    </AdminShell>
  );
}
