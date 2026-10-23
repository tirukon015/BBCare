import type { Sql } from "@bbcare/db";

export interface Job { id: number; queue: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }

/** Claim one due job with FOR UPDATE SKIP LOCKED so several workers never take the same job. */
export async function claim(sql: Sql, queues: string[], workerId: string): Promise<Job | null> {
  const [job] = await sql<Job[]>`
    UPDATE ops.jobs SET status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    WHERE id = (
      SELECT id FROM ops.jobs WHERE status = 'queued' AND run_at <= now() AND queue = ANY (${queues}::text[])
      ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, queue, payload, attempts, max_attempts`;
  return job ?? null;
}

export async function complete(sql: Sql, id: number) {
  await sql`UPDATE ops.jobs SET status = 'done', finished_at = now(), locked_at = NULL WHERE id = ${id}`;
}

/** Retry with exponential backoff (30 s, 2 min, 8 min, ...) until max_attempts, then mark failed. */
export async function fail(sql: Sql, job: Job, error: string) {
  const final = job.attempts >= job.max_attempts;
  const delay = Math.min(3600, 30 * 4 ** (job.attempts - 1));
  await sql`
    UPDATE ops.jobs SET status = ${final ? "failed" : "queued"}, last_error = ${error.slice(0, 500)}, locked_at = NULL,
      run_at = now() + make_interval(secs => ${final ? 0 : delay}), finished_at = ${final ? new Date() : null}
    WHERE id = ${job.id}`;
}

/** Requeue jobs whose worker died mid-run (locked for more than 15 minutes). */
export async function recoverStale(sql: Sql) {
  await sql`UPDATE ops.jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < now() - interval '15 minutes'`;
}

export async function enqueue(sql: Sql, queue: string, payload: Record<string, unknown>, opts: { dedupeKey?: string; runAt?: Date } = {}) {
  await sql`
    INSERT INTO ops.jobs (queue, payload, dedupe_key, run_at) VALUES (${queue}, ${sql.json(payload as never)}, ${opts.dedupeKey ?? null}, ${opts.runAt ?? new Date()})
    ON CONFLICT DO NOTHING`;
}
