import { chunkMarkdown, markdownToPlain, normalizeForSearch } from "@bbcare/core";
import type { Sql, TxSql } from "../client";

/**
 * Rebuild chunks for one revision. Search text is normalized with the same function used
 * at query time. Embeddings are produced separately by the worker when enabled.
 */
export async function indexRevision(sql: Sql | TxSql, revisionId: string): Promise<number> {
  const [rev] = await sql<{ title: string; summary: string; body_md: string }[]>`
    SELECT title, summary, body_md FROM knowledge.revisions WHERE id = ${revisionId}`;
  if (!rev) throw new Error(`Revision ${revisionId} not found`);
  const body = rev.summary ? `${rev.summary}\n\n${rev.body_md}` : rev.body_md;
  const chunks = chunkMarkdown(body, rev.title);
  await sql`DELETE FROM knowledge.chunks WHERE revision_id = ${revisionId}`;
  for (const c of chunks) {
    const plain = markdownToPlain(c.content);
    await sql`
      INSERT INTO knowledge.chunks (revision_id, ordinal, heading, content, search_text, word_count)
      VALUES (${revisionId}, ${c.ordinal}, ${c.heading}, ${plain},
              ${normalizeForSearch(`${c.heading} ${plain}`)}, ${c.wordCount})`;
  }
  return chunks.length;
}
