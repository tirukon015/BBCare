import { formatTranscript, type ImportedConversation, type ParseReport } from "@bbcare/core";
import type { Sql } from "../client";

/**
 * Stage a parsed ChatGPT export. Every conversation becomes an import record:
 *   valid      relevant to routers/laptops (or matching keywords), not seen before
 *   duplicate  identical content already staged in any batch
 *   discarded  not relevant
 * Nothing is published. Promotion creates an unverified, pending "historical_chat" source.
 */
export async function stageChatGptImport(sql: Sql, report: ParseReport, opts: { fileSha256: string; userId: string | null }) {
  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`SELECT id FROM ops.import_batches WHERE kind = 'chatgpt_export' AND file_sha256 = ${opts.fileSha256}`;
    if (existing) return { batchId: existing.id, alreadyImported: true, counts: null };
    const [batch] = await tx<{ id: string }[]>`
      INSERT INTO ops.import_batches (kind, file_sha256, status, created_by) VALUES ('chatgpt_export', ${opts.fileSha256}, 'staged', ${opts.userId}) RETURNING id`;
    const counts = { total: report.total, invalid: report.invalid, valid: 0, duplicate: 0, discarded: 0, attachmentsMissing: 0 };
    for (const c of report.conversations) {
      const [dup] = await tx<{ id: string }[]>`SELECT id FROM ops.import_records WHERE content_sha256 = ${c.contentSha256} LIMIT 1`;
      const status = dup ? "duplicate" : c.relevant ? "valid" : "discarded";
      counts[status]++;
      counts.attachmentsMissing += c.attachmentsMissing;
      await tx`
        INSERT INTO ops.import_records (batch_id, external_id, content_sha256, status, duplicate_of, data, validation_errors)
        VALUES (${batch!.id}, ${c.externalId}, ${c.contentSha256}, ${status}, ${dup?.id ?? null}, ${tx.json(c as never)},
                ${tx.json((c.injectionFlags ? ["possible_prompt_injection"] : []) as never)})
        ON CONFLICT (batch_id, external_id) DO NOTHING`;
    }
    await tx`UPDATE ops.import_batches SET status = 'validated', counts = ${tx.json(counts as never)} WHERE id = ${batch!.id}`;
    return { batchId: batch!.id, alreadyImported: false, counts };
  });
}

export async function promoteImportRecord(sql: Sql, recordId: string, userId: string): Promise<string | null> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; status: string; data: ImportedConversation; promoted_source_id: string | null }[]>`
      SELECT id, status, data, promoted_source_id FROM ops.import_records WHERE id = ${recordId} FOR UPDATE`;
    if (!r || r.status !== "valid") return null;
    const [s] = await tx<{ id: string }[]>`
      INSERT INTO knowledge.sources (kind, title, publisher, extracted_text, trust_level, status, injection_flag, created_by, sha256)
      VALUES ('historical_chat', ${`Historical chat: ${r.data.title}`.slice(0, 200)}, 'ChatGPT export (unverified)', ${formatTranscript(r.data)},
              'unverified', 'pending', ${r.data.injectionFlags > 0}, ${userId}, ${r.data.contentSha256})
      ON CONFLICT (sha256) DO NOTHING RETURNING id`;
    if (!s) return null;
    await tx`UPDATE ops.import_records SET status = 'promoted', promoted_source_id = ${s.id} WHERE id = ${recordId}`;
    return s.id;
  });
}
