import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { createArticle } from "@/modules/knowledge/admin";
import { catalogOptions } from "@/modules/catalog/options";
import { AdminShell, adminInput } from "@/components/admin-ui";
import { RevisionFields } from "@/components/revision-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New article" };

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  categoryId: z.uuid(),
  kind: z.enum(["guide", "troubleshooting", "faq", "reference"]),
  locale: z.enum(["en", "ms"]),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(300),
  body: z.string().trim().min(10).max(50000),
  safety: z.enum(["normal", "caution", "danger"]),
});

async function createAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/knowledge/new?e=${encodeURIComponent(parsed.error.issues.map((i) => i.path.join(".")).join(","))}`);
  let id: string;
  try {
    id = await createArticle(user, { ...parsed.data, modelIds: form.getAll("models").map(String), sourceIds: form.getAll("sources").map(String) });
  } catch {
    redirect("/admin/knowledge/new?e=slug_taken");
  }
  redirect(`/admin/knowledge/${id}`);
}

export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await requireStaff("knowledge.write");
  const opts = await catalogOptions();
  const { e } = await searchParams;
  return (
    <AdminShell user={user} title="New article">
      {e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">Please check: {e}</p> : null}
      <form action={createAction} className="max-w-3xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Slug (lowercase, hyphens)
            <input name="slug" required pattern="[a-z0-9-]{3,80}" className={adminInput} />
          </label>
          <label className="block text-sm font-medium">Category
            <select name="categoryId" className={adminInput}>{opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select>
          </label>
          <label className="block text-sm font-medium">Type
            <select name="kind" className={adminInput}>{["guide", "troubleshooting", "faq", "reference"].map((k) => <option key={k}>{k}</option>)}</select>
          </label>
          <label className="block text-sm font-medium">First language
            <select name="locale" className={adminInput}><option value="en">English</option><option value="ms">Malay</option></select>
          </label>
        </div>
        <RevisionFields
          models={opts.models.map((m) => ({ id: m.id, label: `${m.brand}: ${m.display_name}` }))}
          sources={opts.sources.map((s) => ({ id: s.id, label: `${s.title} (${s.status})` }))}
          selectedModels={[]}
          selectedSources={[]}
        />
      </form>
    </AdminShell>
  );
}
