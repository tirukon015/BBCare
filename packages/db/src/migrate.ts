import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";
import type { Sql } from "./client";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Apply SQL migrations in lexical order. Each file runs in its own transaction and is
 * recorded with its checksum. Editing an applied migration is treated as an error.
 */
export async function migrate(pool: Sql, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  // The advisory lock is per session: take it, use it and release it on one reserved connection.
  // (With a pool, an unlock could otherwise run on a different connection and leave the lock held.)
  const sql = await pool.reserve();
  try {
    return await migrateOn(sql, dir);
  } finally {
    sql.release();
  }
}

async function migrateOn(sql: postgres.ReservedSql, dir: string): Promise<MigrationResult> {
  await sql`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
  // Serialize concurrent runners (for example two containers starting together).
  await sql`SELECT pg_advisory_lock(727274)`;
  try {
    const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
    const rows = await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM public.schema_migrations`;
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));
    const result: MigrationResult = { applied: [], skipped: [] };
    for (const file of files) {
      const body = await readFile(join(dir, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const existing = applied.get(file);
      if (existing) {
        if (existing !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
        result.skipped.push(file);
        continue;
      }
      await sql`BEGIN`;
      try {
        await sql.unsafe(body);
        await sql`INSERT INTO public.schema_migrations (name, checksum) VALUES (${file}, ${checksum})`;
        await sql`COMMIT`;
      } catch (err) {
        await sql`ROLLBACK`;
        throw err;
      }
      result.applied.push(file);
    }
    return result;
  } finally {
    await sql`SELECT pg_advisory_unlock(727274)`;
  }
}

/** Drop every BBCare schema. Refuses to run unless the database name marks it disposable. */
export async function resetDatabase(sql: Sql): Promise<void> {
  const rows = await sql<{ db: string }[]>`SELECT current_database() AS db`;
  const db = rows[0]?.db ?? "";
  if (!/(_dev|_test|_ci|_preview)$/.test(db)) {
    throw new Error(`Refusing to reset database "${db}": name must end with _dev, _test, _ci or _preview`);
  }
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS identity, catalog, commerce, knowledge, support, analytics, ai, ops CASCADE;
    DROP TABLE IF EXISTS public.schema_migrations;
    DROP TEXT SEARCH CONFIGURATION IF EXISTS public.bbcare;
    DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;
  `);
}
