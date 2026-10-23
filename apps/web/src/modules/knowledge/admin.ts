import "server-only";
import { evaluateTransition, normalizeText, type RevisionAction, type RevisionStatus } from "@bbcare/core";
import { indexRevision, type TxSql } from "@bbcare/db";
import { db } from "@/lib/db";
import { audit } from "@/modules/audit/service";
import type { StaffUser } from "@/modules/identity/service";

export async function listArticlesAdmin(filter: { q?: string; status?: string }) {
  const q = filter.q ? `%${normalizeText(filter.q)}%` : null;
  return db()<{ id: string; slug: string; kind: string; category: string; archived_at: Date | null; title: string | null; en: string | null; ms: string | null; updated: Date }[]>`
    SELECT a.id, a.slug, a.kind, c.name_en AS category, a.archived_at,
      (SELECT title FROM knowledge.revisions r WHERE r.article_id = a.id ORDER BY (r.locale = 'en') DESC, r.revision_no DESC LIMIT 1) AS title,
      (SELECT status FROM knowledge.revisions r WHERE r.article_id = a.id AND r.locale = 'en' ORDER BY r.revision_no DESC LIMIT 1) AS en,
      (SELECT status FROM knowledge.revisions r WHERE r.article_id = a.id AND r.locale = 'ms' ORDER BY r.revision_no DESC LIMIT 1) AS ms,
      COALESCE((SELECT max(created_at) FROM knowledge.revisions r WHERE r.article_id = a.id), a.created_at) AS updated
    FROM knowledge.articles a JOIN catalog.categories c ON c.id = a.category_id
    WHERE (${q}::text IS NULL OR a.slug ILIKE ${q} OR EXISTS (SELECT 1 FROM knowledge.revisions r WHERE r.article_id = a.id AND lower(r.title) LIKE ${q}))
    ORDER BY updated DESC LIMIT 300`;
}

export async function getArticleAdmin(articleId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(articleId)) return null;
  const sql = db();
  const [a] = await sql<{ id: string; slug: string; kind: string; category_id: string; category: string; archived_at: Date | null }[]>`
    SELECT a.id, a.slug, a.kind, a.category_id, c.name_en AS category, a.archived_at FROM knowledge.articles a JOIN catalog.categories c ON c.id = a.category_id WHERE a.id = ${articleId}`;
  if (!a) return null;
  const revisions = await sql<{
    id: string; locale: "en" | "ms"; revision_no: number; title: string; summary: string; body_md: string; status: RevisionStatus; safety_level: string;
    author: string | null; author_id: string | null; reviewer: string | null; created_at: Date; review_note: string | null; change_note: string | null; self_approved: boolean; machine_translated: boolean;
  }[]>`
    SELECT r.id, r.locale, r.revision_no, r.title, r.summary, r.body_md, r.status, r.safety_level, ua.display_name AS author, r.author_id,
           ur.display_name AS reviewer, r.created_at, r.review_note, r.change_note, r.self_approved, r.machine_translated
    FROM knowledge.revisions r LEFT JOIN identity.users ua ON ua.id = r.author_id LEFT JOIN identity.users ur ON ur.id = r.reviewer_id
    WHERE r.article_id = ${articleId} ORDER BY r.locale, r.revision_no DESC`;
  const applicability = await sql<{ revision_id: string; category_id: string | null; model_id: string | null; model: string | null; firmware_versions: string[] | null }[]>`
    SELECT ap.revision_id, ap.category_id, ap.model_id, m.display_name AS model, ap.firmware_versions FROM knowledge.applicability ap
    LEFT JOIN catalog.product_models m ON m.id = ap.model_id WHERE ap.revision_id = ANY (${revisions.map((r) => r.id)}::uuid[])`;
  const sources = await sql<{ revision_id: string; source_id: string; title: string }[]>`
    SELECT rs.revision_id, rs.source_id, s.title FROM knowledge.revision_sources rs JOIN knowledge.sources s ON s.id = rs.source_id
    WHERE rs.revision_id = ANY (${revisions.map((r) => r.id)}::uuid[])`;
  return { ...a, revisions, applicability, sources };
}

export async function createArticle(user: StaffUser, input: { slug: string; categoryId: string; kind: string; locale: "en" | "ms"; title: string; summary: string; body: string; safety: string; modelIds: string[]; sourceIds: string[] }) {
  return db().begin(async (tx) => {
    const [a] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.articles (category_id, slug, kind, created_by) VALUES (${input.categoryId}, ${input.slug}, ${input.kind}, ${user.id}) RETURNING id`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.revisions (article_id, locale, revision_no, title, summary, body_md, safety_level, author_id)
      VALUES (${a!.id}, ${input.locale}, 1, ${input.title}, ${input.summary}, ${input.body}, ${input.safety}, ${user.id}) RETURNING id`;
    await writeApplicability(tx, r!.id, input.categoryId, input.modelIds);
    for (const s of input.sourceIds) await tx`INSERT INTO knowledge.revision_sources (revision_id, source_id) VALUES (${r!.id}, ${s}) ON CONFLICT DO NOTHING`;
    await audit({ actorId: user.id, action: "knowledge.article_create", entityType: "article", entityId: a!.id, summary: { slug: input.slug, locale: input.locale } }, tx);
    return a!.id;
  });
}

async function writeApplicability(tx: TxSql, revisionId: string, categoryId: string, modelIds: string[]) {
  await tx`DELETE FROM knowledge.applicability WHERE revision_id = ${revisionId}`;
  if (modelIds.length === 0) await tx`INSERT INTO knowledge.applicability (revision_id, category_id) VALUES (${revisionId}, ${categoryId})`;
  for (const m of modelIds) await tx`INSERT INTO knowledge.applicability (revision_id, model_id) VALUES (${revisionId}, ${m})`;
}

/** Create a new draft revision (for a locale) based on the latest one, or save edits to an existing draft. */
export async function saveDraft(user: StaffUser, input: { articleId: string; revisionId?: string; locale: "en" | "ms"; title: string; summary: string; body: string; safety: string; changeNote: string; modelIds: string[]; sourceIds: string[]; machineTranslated: boolean }) {
  return db().begin(async (tx) => {
    const [art] = await tx<{ category_id: string }[]>`SELECT category_id FROM knowledge.articles WHERE id = ${input.articleId}`;
    if (!art) throw new Error("not_found");
    let revisionId = input.revisionId;
    if (revisionId) {
      const [r] = await tx<{ status: string }[]>`SELECT status FROM knowledge.revisions WHERE id = ${revisionId} AND article_id = ${input.articleId}`;
      if (!r || !["draft", "rejected"].includes(r.status)) revisionId = undefined; // never edit reviewed content; branch instead
    }
    if (revisionId) {
      await tx`UPDATE knowledge.revisions SET title = ${input.title}, summary = ${input.summary}, body_md = ${input.body}, safety_level = ${input.safety},
               change_note = ${input.changeNote}, machine_translated = ${input.machineTranslated}, status = 'draft' WHERE id = ${revisionId}`;
    } else {
      const [n] = await tx<{ next: number }[]>`SELECT COALESCE(max(revision_no), 0) + 1 AS next FROM knowledge.revisions WHERE article_id = ${input.articleId} AND locale = ${input.locale}`;
      const [r] = await tx<{ id: string }[]>`
        INSERT INTO knowledge.revisions (article_id, locale, revision_no, title, summary, body_md, safety_level, author_id, change_note, machine_translated)
        VALUES (${input.articleId}, ${input.locale}, ${n!.next}, ${input.title}, ${input.summary}, ${input.body}, ${input.safety}, ${user.id}, ${input.changeNote}, ${input.machineTranslated}) RETURNING id`;
      revisionId = r!.id;
    }
    await writeApplicability(tx, revisionId, art.category_id, input.modelIds);
    await tx`DELETE FROM knowledge.revision_sources WHERE revision_id = ${revisionId}`;
    for (const s of input.sourceIds) await tx`INSERT INTO knowledge.revision_sources (revision_id, source_id) VALUES (${revisionId}, ${s}) ON CONFLICT DO NOTHING`;
    await audit({ actorId: user.id, action: "knowledge.draft_save", entityType: "revision", entityId: revisionId, summary: { locale: input.locale } }, tx);
    return revisionId;
  });
}

export type TransitionOutcome = { ok: true } | { ok: false; reason: string };

/** Apply a workflow action. Publishing supersedes the previous published revision and re-indexes. */
export async function transitionRevision(user: StaffUser, revisionId: string, action: RevisionAction, note?: string): Promise<TransitionOutcome> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; article_id: string; locale: string; status: RevisionStatus; author_id: string | null; source_count: number }[]>`
      SELECT r.id, r.article_id, r.locale, r.status, r.author_id, (SELECT count(*)::int FROM knowledge.revision_sources s WHERE s.revision_id = r.id) AS source_count
      FROM knowledge.revisions r WHERE r.id = ${revisionId} FOR UPDATE`;
    if (!r) return { ok: false, reason: "not_found" };
    const res = evaluateTransition({ action, current: r.status, actorId: user.id, authorId: r.author_id ?? "", actorPermissions: user.permissions, actorIsAdmin: user.roles.includes("admin") });
    if (!res.ok) return { ok: false, reason: res.reason };
    if ((action === "approve" || action === "publish") && r.source_count === 0) return { ok: false, reason: "source_required" };
    if (action === "publish") {
      await tx`UPDATE knowledge.revisions SET status = 'superseded' WHERE article_id = ${r.article_id} AND locale = ${r.locale} AND status = 'published'`;
      await tx`UPDATE knowledge.revisions SET status = 'published', published_at = now() WHERE id = ${revisionId}`;
      await indexRevision(tx, revisionId);
      await tx`INSERT INTO ops.jobs (queue, payload, dedupe_key) VALUES ('embed_revision', ${tx.json({ revisionId })}, ${revisionId}) ON CONFLICT DO NOTHING`;
    } else if (action === "approve" || action === "reject") {
      await tx`UPDATE knowledge.revisions SET status = ${res.to}, reviewer_id = ${user.id}, reviewed_at = now(), review_note = ${note ?? null}, self_approved = ${res.selfApproved} WHERE id = ${revisionId}`;
    } else if (action === "submit") {
      await tx`UPDATE knowledge.revisions SET status = 'in_review', submitted_at = now() WHERE id = ${revisionId}`;
    } else {
      await tx`UPDATE knowledge.revisions SET status = ${res.to} WHERE id = ${revisionId}`;
      if (action === "archive") await tx`DELETE FROM knowledge.chunks WHERE revision_id = ${revisionId}`;
    }
    await audit({ actorId: user.id, action: `knowledge.${action}`, entityType: "revision", entityId: revisionId, summary: { from: r.status, to: res.to, selfApproved: res.selfApproved || undefined } }, tx);
    return { ok: true };
  });
}

export async function reviewQueue() {
  return db()<{ id: string; article_id: string; slug: string; locale: string; title: string; author: string | null; submitted_at: Date | null; status: string; safety_level: string }[]>`
    SELECT r.id, r.article_id, a.slug, r.locale, r.title, u.display_name AS author, r.submitted_at, r.status, r.safety_level
    FROM knowledge.revisions r JOIN knowledge.articles a ON a.id = r.article_id LEFT JOIN identity.users u ON u.id = r.author_id
    WHERE r.status IN ('in_review', 'approved') ORDER BY r.status DESC, r.submitted_at NULLS LAST LIMIT 200`;
}

export async function listSources() {
  return db()<{ id: string; kind: string; title: string; publisher: string | null; status: string; trust_level: string; injection_flag: boolean; created_at: Date; has_file: boolean }[]>`
    SELECT id, kind, title, publisher, status, trust_level, injection_flag, created_at, media_asset_id IS NOT NULL AS has_file FROM knowledge.sources ORDER BY created_at DESC LIMIT 500`;
}

export async function listGaps(status = "open") {
  return db()<{ id: string; query_normalized: string; locale: string; occurrences: number; last_source: string; last_seen: Date; model: string | null; category: string | null; status: string }[]>`
    SELECT g.id, g.query_normalized, g.locale, g.occurrences, g.last_source, g.last_seen, m.display_name AS model, c.name_en AS category, g.status
    FROM support.unresolved_questions g LEFT JOIN catalog.product_models m ON m.id = g.model_id LEFT JOIN catalog.categories c ON c.id = g.category_id
    WHERE g.status = ${status} ORDER BY g.occurrences DESC, g.last_seen DESC LIMIT 300`;
}

export async function setGapStatus(user: StaffUser, id: string, status: "open" | "in_progress" | "resolved" | "dismissed") {
  await db()`UPDATE support.unresolved_questions SET status = ${status} WHERE id = ${id}`;
  await audit({ actorId: user.id, action: "knowledge.gap_status", entityType: "gap", entityId: id, summary: { status } });
}
