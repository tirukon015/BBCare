import { hostname } from "node:os";
import { createProvider } from "@bbcare/ai";
import { applyRetention, createSql, rollupDay } from "@bbcare/db";
import { claim, complete, enqueue, fail, recoverStale } from "./queue";
import { embedRevision } from "./jobs/embed";
import { checkListings } from "./jobs/link-check";

/**
 * BBCare worker: processes ops.jobs and schedules periodic maintenance.
 * Queues: embed_revision, rollup_day, retention, link_check.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = createSql({ url, max: 3, appName: "bbcare-worker" });
const provider = createProvider({ ...process.env, BBCARE_ENV: process.env.BBCARE_ENV ?? "development" });
const workerId = `${hostname()}:${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), app: "bbcare-worker", msg, ...extra }));

async function handle(queue: string, payload: Record<string, unknown>): Promise<string> {
  switch (queue) {
    case "embed_revision":
      return embedRevision(sql, provider, String(payload.revisionId));
    case "rollup_day":
      return `rows ${await rollupDay(sql, String(payload.day))}`;
    case "retention":
      return JSON.stringify(await applyRetention(sql));
    case "link_check":
      return process.env.BBCARE_LINK_CHECK === "1" ? checkListings(sql) : "skipped (BBCARE_LINK_CHECK not enabled)";
    default:
      throw new Error(`unknown queue ${queue}`);
  }
}

/** Idempotent schedule: enqueue periodic jobs keyed by date so each runs once per period. */
async function schedule() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  await enqueue(sql, "rollup_day", { day: yesterday }, { dedupeKey: `rollup:${yesterday}:final` });
  await enqueue(sql, "rollup_day", { day: today }, { dedupeKey: `rollup:${hour}` });
  await enqueue(sql, "retention", {}, { dedupeKey: `retention:${today}` });
  await enqueue(sql, "link_check", {}, { dedupeKey: `link_check:${today}` });
}

async function loop() {
  log("worker started", { workerId, provider: provider?.name ?? "none" });
  let lastSchedule = 0;
  while (!stopping) {
    if (Date.now() - lastSchedule > 10 * 60_000) {
      await recoverStale(sql);
      await schedule();
      lastSchedule = Date.now();
    }
    const job = await claim(sql, ["embed_revision", "rollup_day", "retention", "link_check"], workerId);
    if (!job) {
      if (once) break;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const started = Date.now();
    try {
      const result = await handle(job.queue, job.payload);
      await complete(sql, job.id);
      log("job done", { id: job.id, queue: job.queue, ms: Date.now() - started, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await fail(sql, job, message);
      log("job failed", { id: job.id, queue: job.queue, attempt: job.attempts, error: message });
    }
  }
  await sql.end();
  log("worker stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stopping = true; });
await loop();
