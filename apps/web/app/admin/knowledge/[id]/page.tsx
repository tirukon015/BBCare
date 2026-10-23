import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RevisionAction } from "@bbcare/core";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { getArticleAdmin, saveDraft, transitionRevision } from "@/modules/knowledge/admin";
import { catalogOptions } from "@/modules/catalog/options";
import { AdminShell, StatusPill, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { RevisionFields } from "@/components/revision-form";
import { Markdown } from "@/components/markdown";

export const dynamic = "force-dynamic";
export const metadata = { title: "Article" };

const draftSchema = z.object({
  articleId: z.uuid(),
  revisionId: z.uuid().optional().or(z.literal("")),
  locale: z.enum(["en", "ms"]),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(300),
  body: z.string().trim().min(10).max(50000),
  safety: z.enum(["normal", "caution", "danger"]),
  changeNote: z.string().trim().max(300),
});

async function saveAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const parsed = draftSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/knowledge/${String(form.get("articleId"))}?e=invalid`);
  await saveDraft(user, {
    ...parsed.data,
    revisionId: parsed.data.revisionId || undefined,
    modelIds: form.getAll("models").map(String),
    sourceIds: form.getAll("sources").map(String),
    machineTranslated: form.get("machineTranslated") === "1",
  });
  revalidatePath(`/admin/knowledge/${parsed.data.articleId}`);
  redirect(`/admin/knowledge/${parsed.data.articleId}?saved=1&locale=${parsed.data.locale}`);
}

const ACTION_PERMISSION: Record<RevisionAction, "knowledge.write" | "knowledge.review" | "knowledge.publish"> = {
  submit: "knowledge.write", reopen: "knowledge.write", approve: "knowledge.review", reject: "knowledge.review", publish: "knowledge.publish", archive: "knowledge.publish",
};

async function transitionAction(form: FormData) {
  "use server";
  const action = String(form.get("action")) as RevisionAction;
  if (!(action in ACTION_PERMISSION)) throw new Error("invalid action");
  const user = await assertPermission(ACTION_PERMISSION[action]);
  const articleId = String(form.get("articleId"));
  const res = await transitionRevision(user, String(form.get("revisionId")), action, String(form.get("note") ?? "").slice(0, 500) || undefined);
  revalidatePath(`/admin/knowledge/${articleId}`);
  redirect(`/admin/knowledge/${articleId}?${res.ok ? `done=${action}` : `e=${res.reason}`}`);
}

const ERRORS: Record<string, string> = {
  invalid: "Please complete all required fields.",
  invalid_transition: "That action is not allowed in the revision's current state.",
  forbidden: "You do not have permission for that action.",
  separation_of_duties: "A different person must review content they did not write.",
  source_required: "Add at least one source before approval or publication.",
};

const ACTIONS_FOR: Record<string, RevisionAction[]> = {
  draft: ["submit", "archive"], in_review: ["approve", "reject"], approved: ["publish", "archive"], published: ["archive"], rejected: ["reopen", "archive"],
};

export default async function ArticleAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; saved?: string; done?: string; locale?: string; edit?: string }> }) {
  const user = await requireStaff("knowledge.read");
  const { id } = await params;
  const sp = await searchParams;
  const [a, opts] = await Promise.all([getArticleAdmin(id), catalogOptions()]);
  if (!a) notFound();
  const editLocale = sp.locale === "ms" ? "ms" : "en";
  const latest = a.revisions.find((r) => r.locale === editLocale);
  const editable = latest && ["draft", "rejected"].includes(latest.status) ? latest : null;
  const base = latest ?? a.revisions[0];
  const appl = base ? a.applicability.filter((x) => x.revision_id === base.id && x.model_id).map((x) => x.model_id!) : [];
  const srcs = base ? a.sources.filter((x) => x.revision_id === base.id).map((x) => x.source_id) : [];
  const models = opts.models.filter((m) => m.category_id === a.category_id);
  return (
    <AdminShell user={user} title={base?.title ?? a.slug} actions={<Link href={`/en/articles/${a.slug}`} className={adminButtonSecondary}>View public page</Link>}>
      {sp.e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{ERRORS[sp.e] ?? sp.e}</p> : null}
      {sp.saved || sp.done ? <p role="status" className="mb-4 rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark">{sp.done ? `Done: ${sp.done}` : "Draft saved."}</p> : null}
      <p className="mb-4 text-sm text-muted">{a.category} · {a.kind} · <span className="font-mono">{a.slug}</span></p>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Revisions</h2>
        <div className="space-y-2">
          {a.revisions.map((r) => (
            <details key={r.id} className="rounded-[var(--radius-card)] border border-line bg-white p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">{r.locale.toUpperCase()} v{r.revision_no}</span><StatusPill status={r.status} />
                <span>{r.title}</span>
                <span className="text-muted">by {r.author ?? "unknown"}{r.reviewer ? `, reviewed by ${r.reviewer}` : ""}{r.self_approved ? " (self-approved by admin)" : ""}{r.machine_translated ? " · machine translation" : ""}</span>
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-line p-3"><Markdown source={r.body_md} /></div>
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted">Applies to:</span> {a.applicability.filter((x) => x.revision_id === r.id).map((x) => x.model ?? "whole category").join(", ")}</p>
                  <p><span className="text-muted">Sources:</span> {a.sources.filter((x) => x.revision_id === r.id).map((x) => x.title).join(", ") || "none"}</p>
                  {r.change_note ? <p><span className="text-muted">Change note:</span> {r.change_note}</p> : null}
                  {r.review_note ? <p><span className="text-muted">Review note:</span> {r.review_note}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(ACTIONS_FOR[r.status] ?? []).filter((act) => user.permissions.has(ACTION_PERMISSION[act])).map((act) => (
                      <form key={act} action={transitionAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="revisionId" value={r.id} />
                        <input type="hidden" name="articleId" value={a.id} />
                        <input type="hidden" name="action" value={act} />
                        {act === "reject" || act === "approve" ? <input name="note" placeholder="Review note" maxLength={500} className={`${adminInput} w-48`} /> : null}
                        <button className={act === "archive" || act === "reject" ? adminButtonSecondary : "inline-flex min-h-11 items-center rounded-lg bg-olive px-4 text-sm font-semibold text-white"} data-testid={`rev-${act}`}>{act}</button>
                      </form>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {user.permissions.has("knowledge.write") ? (
        <section className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{editable ? "Edit draft" : "New revision"}</h2>
            <nav className="flex gap-2 text-sm">
              <Link href={`/admin/knowledge/${a.id}?locale=en`} aria-current={editLocale === "en" ? "page" : undefined} className={`rounded-full border px-3 py-1 ${editLocale === "en" ? "border-olive bg-olive-soft" : "border-line"}`}>English</Link>
              <Link href={`/admin/knowledge/${a.id}?locale=ms`} aria-current={editLocale === "ms" ? "page" : undefined} className={`rounded-full border px-3 py-1 ${editLocale === "ms" ? "border-olive bg-olive-soft" : "border-line"}`}>Malay</Link>
            </nav>
          </div>
          {!latest ? <p className="mb-3 text-sm text-muted">No {editLocale === "ms" ? "Malay" : "English"} version yet. Start from the other language below.</p> : null}
          <form action={saveAction} key={`${editLocale}-${editable?.id ?? "new"}`}>
            <input type="hidden" name="articleId" value={a.id} />
            <input type="hidden" name="revisionId" value={editable?.id ?? ""} />
            <input type="hidden" name="locale" value={editLocale} />
            <RevisionFields
              defaults={{ title: base?.title, summary: base?.summary, body: base?.body_md, safety: base?.safety_level, machineTranslated: editable?.machine_translated }}
              models={models.map((m) => ({ id: m.id, label: `${m.brand}: ${m.display_name}` }))}
              sources={opts.sources.map((s) => ({ id: s.id, label: `${s.title} (${s.status})` }))}
              selectedModels={appl}
              selectedSources={srcs}
            />
          </form>
        </section>
      ) : null}
    </AdminShell>
  );
}
