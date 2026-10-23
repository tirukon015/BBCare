import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
import { createSql } from "@bbcare/db";
import { migrate, resetDatabase } from "@bbcare/db/migrate";
import { seed } from "@bbcare/db/seed";

/** Reset the disposable test database, migrate, and seed synthetic data with a per-run password. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is required for end-to-end tests");
  const sql = createSql({ url, max: 1 });
  try {
    await resetDatabase(sql);
    await migrate(sql);
    const password = `e2e-${randomBytes(12).toString("hex")}`;
    await seed(sql, { password, credentialsFile: null });
    writeFileSync(join(here, ".e2e-state.json"), JSON.stringify({ password }), { mode: 0o600 });
  } finally {
    await sql.end();
  }
}
