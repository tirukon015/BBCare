import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DEMAND_STATUSES, SCENARIOS, type DemandStatus } from "@bbcare/core";
import { assertPermission, requireStaff } from "@/modules/identity/service";
import { detailForStaff, reviewResource, setDemandStatus, submitResourceForReview, uploadResource } from "@/modules/support/demand-admin";
import { AdminShell, StatusPill, Table, Td, adminButton, adminButtonSecondary, adminInput } from "@/components/admin-ui";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Missing resource" };

const CHANNEL_LABEL: Record<string, string> = { website: "BBCare website", shopee: "Shopee", qr_code: "QR code", direct_link: "Direct link", other: "Other", unknown: "Unknown" };
const ORIGIN_LABEL: Record<string, string> = { escalation: "Support request", assistant: "Support assistant", describe_box: "Typed description", router_page: "Router page" };
const ERR: Record<string, string> = {
  size: "File too large (images 3 MB, documents 25 MB, videos 200 MB).", type: "File content does not match the chosen type (PNG, JPEG, WebP, MP4, WebM or PDF).",
  kind: "Choose a resource type.", fields: "Give English and Malay titles.", scope: "Model not in the router catalogue.",
  self_review: "A different reviewer must approve a resource you uploaded.", not_found: "Resource not found.", approve_via_resource: "A demand is approved by approving a resource, not by hand.",
};

async function statusAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.write");
  const id = String(form.get("id"));
  const status = (DEMAND_STATUSES as readonly string[]).includes(String(form.get("status"))) ? (String(form.get("status")) as DemandStatus) : null;
  const r = status ? await setDemandStatus(user, id, status) : { ok: false as const, reason: "fields" };
  redirect(`/admin/demand/${id}${r.ok ? "?ok=1" : `?e=${r.reason}`}`);
}

async function uploadAction(form: FormData) {
  "use server";
  const user = await assertPermission("sources.upload");
  const id = String(form.get("id"));
  const file = form.get("file");
  if (!(file instanceof File)) redirect(`/admin/demand/${id}?e=type`);
  const r = await uploadResource(user, {
    kind: String(form.get("kind") ?? ""), file, titleEn: String(form.get("titleEn") ?? ""), titleMs: String(form.get("titleMs") ?? ""),
    description: String(form.get("description") ?? ""), sourceNote: String(form.get("sourceNote") ?? ""),
    locale: (["en", "ms", "both"] as const).find((l) => l === form.get("locale")) ?? "both",
    modelId: String(form.get("modelId")), supportMode: form.get("mode") === "ap" ? "ap" : "mesh", scenarioKey: String(form.get("scenario")), demandId: id,
  });
  if (r.ok) await submitResourceForReview(user, r.resourceId);
  redirect(`/admin/demand/${id}${r.ok ? "?ok=1" : `?e=${r.reason}`}`);
}

async function reviewAction(form: FormData) {
  "use server";
  const user = await assertPermission("knowledge.publish");
  const id = String(form.get("id"));
  const r = await reviewResource(user, String(form.get("resourceId")), form.get("decision") === "approved" ? "approved" : "rejected", String(form.get("note") ?? "").trim().slice(0, 1000) || null);
  redirect(`/admin/demand/${id}${r.ok ? "?ok=1" : `?e=${r.reason}`}`);
}

export default async function DemandDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("support.transcripts.read");
  const { id } = await params;
  const sp = await searchParams;
  const d = await detailForStaff(user, id);
  if (!d) notFound();
  const scenario = SCENARIOS.find((s) => s.key === d.demand.scenario_key);
  const canCases = user.permissions.has("cases.read_all") || user.permissions.has("cases.read_assigned");
  const fmt = (x: Date) => x.toISOString().slice(0, 16).replace("T", " ");
  return (
    <AdminShell user={user} title={d.demand.requirement}>
      <p className="mb-3 text-sm"><Link href="/admin/demand" className="text-olive underline">Customer Demand Intelligence</Link></p>
      {sp.e ? <p role="alert" className="mb-3 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{ERR[sp.e] ?? "Not saved."}</p> : null}
      {sp.ok ? <p role="status" className="mb-3 rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark">Saved.</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm" data-testid="demand-summary">
            <div className="flex flex-wrap items-center gap-2"><StatusPill status={d.demand.status} /><span className="text-muted">{d.demand.resource_type.replace("_", " ")} · {d.demand.locale === "ms" ? "Malay" : "English"}</span></div>
            <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <div><dt className="text-muted">Router model</dt><dd>{d.demand.model} ({d.demand.ecr_code}){d.demand.hardware_revision ? `, ${d.demand.hardware_revision}` : ""}</dd></div>
              <div><dt className="text-muted">Support category</dt><dd>{d.demand.support_mode === "ap" ? "Access Point (AP) Mode" : "Mesh Connection Mode"}</dd></div>
              <div><dt className="text-muted">Problem</dt><dd>{scenario?.en ?? d.demand.scenario_key}</dd></div>
              <div><dt className="text-muted">Requests / unique customers</dt><dd>{d.demand.requests} / {d.demand.customers}</dd></div>
              <div><dt className="text-muted">First requested</dt><dd>{fmt(d.demand.first_requested_at)}</dd></div>
              <div><dt className="text-muted">Latest requested</dt><dd>{fmt(d.demand.last_requested_at)}</dd></div>
              <div><dt className="text-muted">Source channels</dt><dd>{d.channels.map((c) => `${CHANNEL_LABEL[c.label] ?? c.label} ${c.value}`).join(", ") || "-"}</dd></div>
              {d.demand.fulfilled_at ? <div><dt className="text-muted">Fulfilled</dt><dd>{fmt(d.demand.fulfilled_at)}</dd></div> : null}
            </dl>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-white p-4" data-testid="demand-requests">
            <h2 className="font-semibold">Original customer questions</h2>
            <p className="mb-2 text-xs text-muted">Stored after removal of personal data and anything that looked like a password or code. The interpretation is rule-based until the AI is activated. This view is recorded in the audit log.</p>
            <Table head={["When", "Question", "Interpreted as", "Origin", "Channel", "Customer ref", "Case"]} empty={d.requests.length === 0}>
              {d.requests.map((q) => (
                <tr key={q.id}>
                  <Td className="whitespace-nowrap">{fmt(q.created_at)}</Td>
                  <Td><span lang={q.locale}>{q.question}</span></Td>
                  <Td className="text-xs">{q.interpreted} <span className="text-muted">({q.interpreted_by})</span></Td>
                  <Td>{ORIGIN_LABEL[q.origin] ?? q.origin}</Td>
                  <Td>{CHANNEL_LABEL[q.channel] ?? q.channel}</Td>
                  <Td className="font-mono text-xs">{q.customer_ref.startsWith("anon:") ? "anonymous" : q.customer_ref.slice(0, 12)}</Td>
                  <Td>{q.case_id ? (canCases ? <Link href={`/admin/cases/${q.case_id}`} className="font-mono text-olive underline">{q.case_reference}</Link> : <span className="font-mono">{q.case_reference}</span>) : "-"}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </section>

        <aside className="space-y-4">
          {d.demand.status === "approved" ? (
            <div className="rounded-[var(--radius-card)] border border-olive-soft bg-olive-soft p-4 text-sm text-olive-dark">
              <h3 className="font-semibold">Fulfilled</h3>
              <p>This requirement is met by an approved {d.demand.fulfilled_flow_id ? "verified guide" : "resource"}. It reopens automatically if a customer asks again after the resource is withdrawn.</p>
            </div>
          ) : user.permissions.has("knowledge.write") ? (
            <form action={statusAction} className="space-y-2 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
              <input type="hidden" name="id" value={d.demand.id} />
              <h3 className="font-semibold">Status</h3>
              <select name="status" defaultValue={d.demand.status} className={adminInput}>{["missing", "requested", "in_progress", "uploaded", "under_review"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
              <p className="text-xs text-muted">&quot;Approved&quot; is set automatically when a reviewer approves a matching resource or publishes a verified guide.</p>
              <button className={adminButtonSecondary}>Set status</button>
            </form>
          ) : null}

          {d.demand.resource_type === "text_guide" ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
              <h3 className="font-semibold">Fulfil with a verified guide</h3>
              <p className="text-xs text-muted">A text guide is fulfilled when a flow for this model, mode and problem is verified and published.</p>
              <ul className="mt-2 space-y-1">{d.flows.map((f) => <li key={f.id}><Link href={`/admin/flows/${f.id}`} className="text-olive underline">{f.title_en}</Link> <span className="text-muted">({f.status}, {f.verification_status.replace("_", " ")})</span></li>)}</ul>
              {d.flows.length === 0 ? <Link href="/admin/flows/new" className={`${adminButtonSecondary} mt-2`}>Create flow</Link> : null}
            </div>
          ) : (
            <>
              {user.permissions.has("sources.upload") ? (
                <form action={uploadAction} className="space-y-2 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm" encType="multipart/form-data" data-testid="resource-upload">
                  <input type="hidden" name="id" value={d.demand.id} /><input type="hidden" name="modelId" value={d.demand.model_id} /><input type="hidden" name="mode" value={d.demand.support_mode} /><input type="hidden" name="scenario" value={d.demand.scenario_key} />
                  <h3 className="font-semibold">Upload the missing {d.demand.resource_type}</h3>
                  <p className="text-xs text-muted">Goes under review. Customers and the AI see it only after a different reviewer approves it.</p>
                  <input type="hidden" name="kind" value={d.demand.resource_type} />
                  <label className="block">File<input type="file" name="file" required className="block text-xs" accept={d.demand.resource_type === "video" ? "video/mp4,video/webm" : d.demand.resource_type === "document" ? "application/pdf" : "image/png,image/jpeg,image/webp"} /></label>
                  <label className="block">Title (English)<input name="titleEn" required minLength={3} maxLength={200} className={adminInput} /></label>
                  <label className="block">Title (Malay)<input name="titleMs" required minLength={3} maxLength={200} className={adminInput} /></label>
                  <label className="block">Language<select name="locale" defaultValue={d.demand.locale} className={adminInput}><option value="both">Both (no spoken or written language)</option><option value="en">English</option><option value="ms">Malay</option></select></label>
                  <label className="block">Description (optional)<textarea name="description" rows={2} maxLength={1000} className={adminInput} /></label>
                  <label className="block">Source note (who made it, from which document)<input name="sourceNote" maxLength={500} className={adminInput} /></label>
                  <button className={adminButton}>Upload for review</button>
                </form>
              ) : null}
              <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm" data-testid="demand-resources">
                <h3 className="font-semibold">Resources for this requirement</h3>
                {d.resources.length === 0 ? <p className="text-muted">None uploaded yet.</p> : (
                  <ul className="mt-2 space-y-3">
                    {d.resources.map((r) => (
                      <li key={r.id} className="rounded-md border border-line p-2">
                        <div className="flex flex-wrap items-center gap-2"><StatusPill status={r.status} /><span>{r.title_en}</span><span className="text-xs text-muted">{r.locale} · by {r.uploader ?? "unknown"} · {fmt(r.created_at)}</span></div>
                        {r.status === "approved" ? <a href={`/media/resources/${r.id}`} className="text-xs text-olive underline" target="_blank" rel="noopener">Open</a> : null}
                        {user.permissions.has("knowledge.publish") && r.status === "under_review" ? (
                          <form action={reviewAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={d.demand.id} /><input type="hidden" name="resourceId" value={r.id} />
                            <input name="note" placeholder="Review note" maxLength={1000} className={`${adminInput} max-w-48`} />
                            <button name="decision" value="approved" className={adminButton} disabled={r.uploaded_by === user.id} title={r.uploaded_by === user.id ? "You uploaded this" : ""}>Approve</button>
                            <button name="decision" value="rejected" className={adminButtonSecondary}>Reject</button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <Notice role="note">Customer contact details are never shown here. Open the linked case to reveal them; each reveal is logged.</Notice>
        </aside>
      </div>
    </AdminShell>
  );
}
