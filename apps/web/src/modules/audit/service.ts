import "server-only";
import type { Sql, TxSql } from "@bbcare/db";
import { db } from "@/lib/db";

/** Append an audit record. Summaries must never contain secrets or contact details. */
export async function audit(
  entry: { actorId: string | null; action: string; entityType?: string; entityId?: string; summary?: Record<string, unknown>; requestId?: string },
  sql: Sql | TxSql = db(),
) {
  await sql`
    INSERT INTO identity.audit_logs (actor_user_id, action, entity_type, entity_id, summary, request_id)
    VALUES (${entry.actorId}, ${entry.action}, ${entry.entityType ?? null}, ${entry.entityId ?? null}, ${sql.json((entry.summary ?? {}) as never)}, ${entry.requestId ?? null})`;
}
