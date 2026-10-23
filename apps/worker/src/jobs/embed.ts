import type { AiProvider } from "@bbcare/ai";
import type { Sql } from "@bbcare/db";

/**
 * Compute embeddings for a published revision's chunks. Runs only when the ai_embeddings flag
 * is on and a real (non-mock) provider with embed support is configured; otherwise it is a
 * no-op, and search stays lexical.
 */
export async function embedRevision(sql: Sql, provider: AiProvider | null, revisionId: string): Promise<string> {
  const [flag] = await sql<{ enabled: boolean }[]>`SELECT enabled FROM ai.flags WHERE key = 'ai_embeddings'`;
  if (!flag?.enabled || !provider?.embed || provider.isMock) return "skipped (embeddings disabled or unavailable)";
  const chunks = await sql<{ id: string; heading: string; content: string }[]>`
    SELECT c.id, c.heading, c.content FROM knowledge.chunks c JOIN knowledge.revisions r ON r.id = c.revision_id
    WHERE c.revision_id = ${revisionId} AND r.status = 'published' ORDER BY c.ordinal`;
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16);
    const { vectors, model } = await provider.embed(batch.map((c) => `${c.heading}\n${c.content}`));
    for (const [j, c] of batch.entries()) {
      const v = vectors[j]!;
      await sql`
        INSERT INTO knowledge.chunk_embeddings (chunk_id, model, dims, embedding) VALUES (${c.id}, ${model}, ${v.length}, ${`[${v.join(",")}]`}::vector)
        ON CONFLICT (chunk_id, model) DO UPDATE SET embedding = EXCLUDED.embedding, dims = EXCLUDED.dims, created_at = now()`;
    }
  }
  return `embedded ${chunks.length} chunks`;
}
