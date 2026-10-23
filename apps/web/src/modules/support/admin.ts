import "server-only";
import { decryptSecret } from "@bbcare/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export const CASE_STATUSES = ["new", "open", "waiting_customer", "resolved", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export async function listCases(user: StaffUser, opts: { status?: string; mine?: boolean }) {
  const all = user.permissions.has("cases.read_all");
  const status = CASE_STATUSES.includes(opts.status as CaseStatus) ? opts.status! : null;
  return db()<{ id: string; reference: string; status: string; priority: string; subject: string; locale: string; created_at: Date; assigned: string | null; model: string | null }[]>`
    SELECT c.id, c.reference, c.status, c.priority, c.subject, c.locale, c.created_at, u.display_name AS assigned, m.display_name AS model
    FROM support.cases c LEFT JOIN identity.users u ON u.id = c.assigned_to LEFT JOIN catalog.product_models m ON m.id = c.model_id
    WHERE (${status}::text IS NULL OR c.status = ${status})
      AND (${all} OR c.assigned_to = ${user.id} OR (c.assigned_to IS NULL AND c.status = 'new'))
      AND (NOT ${opts.mine ?? false} OR c.assigned_to = ${user.id})
    ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.created_at DESC
    LIMIT 200`;
}

async function canAccess(user: StaffUser, caseId: string): Promise<boolean> {
  if (user.permissions.has("cases.read_all")) return true;
  const [c] = await db()<{ ok: boolean }[]>`SELECT (assigned_to = ${user.id} OR (assigned_to IS NULL AND status = 'new')) AS ok FROM support.cases WHERE id = ${caseId}`;
  return !!c?.ok;
}

export async function getCase(user: StaffUser, caseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !(await canAccess(user, caseId))) return null;
  const sql = db();
  const [c] = await sql<{
    id: string; reference: string; status: string; priority: string; subject: string; description: string | null; locale: string;
    preferred_channel: string | null; assigned_to: string | null; session_id: string | null; created_at: Date; contact_purged_at: Date | null;
    model: string | null; category: string | null;
  }[]>`
    SELECT c.id, c.reference, c.status, c.priority, c.subject, c.description, c.locale, c.preferred_channel, c.assigned_to, c.session_id,
           c.created_at, c.contact_purged_at, m.display_name AS model, cat.name_en AS category
    FROM support.cases c LEFT JOIN catalog.product_models m ON m.id = c.model_id LEFT JOIN catalog.categories cat ON cat.id = c.category_id
    WHERE c.id = ${caseId}`;
  if (!c) return null;
  const events = await sql<{ at: Date; kind: string; data: Record<string, unknown>; actor: string | null }[]>`
    SELECT e.at, e.kind, e.data, u.display_name AS actor FROM support.case_events e LEFT JOIN identity.users u ON u.id = e.actor_user_id
    WHERE e.case_id = ${caseId} ORDER BY e.at`;
  const transcript = c.session_id && user.permissions.has("support.transcripts.read")
    ? await sql<{ role: string; content: string; created_at: Date; outcome: string | null }[]>`
        SELECT role, content, created_at, outcome FROM support.messages WHERE session_id = ${c.session_id} ORDER BY created_at LIMIT 100`
    : [];
  return { ...c, events, transcript };
}

/** Decrypt contact details for an authorized agent. Every reveal is audited. */
export async function revealContact(user: StaffUser, caseId: string) {
  if (!(await canAccess(user, caseId))) return null;
  const [c] = await db()<{ contact_name_enc: string | null; contact_email_enc: string | null; contact_phone_enc: string | null }[]>`
    SELECT contact_name_enc, contact_email_enc, contact_phone_enc FROM support.cases WHERE id = ${caseId}`;
  if (!c) return null;
  const key = env().BBCARE_ENCRYPTION_KEY;
  await audit({ actorId: user.id, action: "cases.contact_revealed", entityType: "case", entityId: caseId });
  const dec = (v: string | null) => (v ? decryptSecret(v, key) : null);
  return { name: dec(c.contact_name_enc), email: dec(c.contact_email_enc), phone: dec(c.contact_phone_enc) };
}

export async function updateCase(user: StaffUser, caseId: string, change: { status?: CaseStatus; priority?: string; assignToMe?: boolean; note?: string }) {
  if (!(await canAccess(user, caseId))) throw new Error("forbidden");
  const sql = db();
  await sql.begin(async (tx) => {
    if (change.status) {
      await tx`UPDATE support.cases SET status = ${change.status}, closed_at = ${change.status === "closed" ? new Date() : null} WHERE id = ${caseId}`;
      await tx`INSERT INTO support.case_events (case_id, actor_user_id, kind, data) VALUES (${caseId}, ${user.id}, 'status_changed', ${tx.json({ to: change.status })})`;
    }
    if (change.priority && ["low", "normal", "high", "urgent"].includes(change.priority)) {
      await tx`UPDATE support.cases SET priority = ${change.priority} WHERE id = ${caseId}`;
      await tx`INSERT INTO support.case_events (case_id, actor_user_id, kind, data) VALUES (${caseId}, ${user.id}, 'priority_changed', ${tx.json({ to: change.priority })})`;
    }
    if (change.assignToMe) {
      await tx`UPDATE support.cases SET assigned_to = ${user.id}, status = CASE WHEN status = 'new' THEN 'open' ELSE status END WHERE id = ${caseId}`;
      await tx`INSERT INTO support.case_events (case_id, actor_user_id, kind, data) VALUES (${caseId}, ${user.id}, 'assigned', ${tx.json({ to: user.displayName })})`;
    }
    if (change.note) {
      await tx`INSERT INTO support.case_events (case_id, actor_user_id, kind, data) VALUES (${caseId}, ${user.id}, 'note', ${tx.json({ text: change.note.slice(0, 2000) })})`;
    }
    await audit({ actorId: user.id, action: "cases.update", entityType: "case", entityId: caseId, summary: { status: change.status, priority: change.priority, assigned: change.assignToMe, note: !!change.note } }, tx);
  });
}

export async function purgeContact(user: StaffUser, caseId: string) {
  if (!(await canAccess(user, caseId))) throw new Error("forbidden");
  const sql = db();
  await sql`UPDATE support.cases SET contact_name_enc = NULL, contact_email_enc = NULL, contact_phone_enc = NULL, contact_purged_at = now() WHERE id = ${caseId}`;
  await sql`INSERT INTO support.case_events (case_id, actor_user_id, kind) VALUES (${caseId}, ${user.id}, 'contact_purged')`;
  await audit({ actorId: user.id, action: "cases.contact_purged", entityType: "case", entityId: caseId });
}

export async function overviewStats() {
  const sql = db();
  const [r] = await sql<{ open_cases: number; new_cases: number; in_review: number; open_gaps: number; sessions_7d: number; escalated_7d: number; resolved_7d: number }[]>`
    SELECT
      (SELECT count(*)::int FROM support.cases WHERE status IN ('new','open','waiting_customer')) AS open_cases,
      (SELECT count(*)::int FROM support.cases WHERE status = 'new') AS new_cases,
      (SELECT count(*)::int FROM knowledge.revisions WHERE status = 'in_review') AS in_review,
      (SELECT count(*)::int FROM support.unresolved_questions WHERE status = 'open') AS open_gaps,
      (SELECT count(*)::int FROM support.sessions WHERE created_at > now() - interval '7 days') AS sessions_7d,
      (SELECT count(*)::int FROM support.sessions WHERE created_at > now() - interval '7 days' AND status = 'escalated') AS escalated_7d,
      (SELECT count(*)::int FROM support.sessions WHERE created_at > now() - interval '7 days' AND status = 'resolved') AS resolved_7d`;
  return r!;
}
