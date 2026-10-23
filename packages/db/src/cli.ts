import { createSql } from "./client";
import { migrate, resetDatabase } from "./migrate";
import { seed } from "./seed";

const command = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = createSql({ url, max: 1, appName: "bbcare-cli" });

try {
  if (command === "migrate") {
    const r = await migrate(sql);
    console.log(`Applied: ${r.applied.join(", ") || "none"}; already applied: ${r.skipped.length}`);
  } else if (command === "seed") {
    const r = await seed(sql, { password: process.env.BBCARE_SEED_PASSWORD || undefined });
    console.log(r.created ? "Seeded synthetic data. Credentials written to packages/db/.seed-credentials.txt (or BBCARE_SEED_PASSWORD)." : "Seed skipped: data already present.");
  } else if (command === "reset") {
    await resetDatabase(sql);
    const r = await migrate(sql);
    console.log(`Reset complete. Applied: ${r.applied.join(", ")}`);
  } else {
    console.error("Usage: cli.ts migrate|seed|reset");
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
