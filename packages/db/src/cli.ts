import { createSql } from "./client";
import { migrate, resetDatabase } from "./migrate";
import { seed } from "./seed";
import { readFile } from "node:fs/promises";
import { parseChatGptExport, sha256Hex } from "@bbcare/core";
import { stageChatGptImport } from "./repos/imports";

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
  } else if (command === "import-chatgpt") {
    // Stages records only; nothing is published. Use only with the owner's authorization for real data.
    const file = process.argv[3];
    if (!file) throw new Error("Usage: cli.ts import-chatgpt <conversations.json> [keyword,keyword]");
    const buf = await readFile(file);
    const keywords = (process.argv[4] ?? "").split(",").filter(Boolean);
    const report = parseChatGptExport(JSON.parse(buf.toString("utf8")), { keywords });
    const r = await stageChatGptImport(sql, report, { fileSha256: sha256Hex(buf), userId: null });
    console.log(r.alreadyImported ? "This file was already imported." : `Staged: ${JSON.stringify(r.counts)}`);
  } else {
    console.error("Usage: cli.ts migrate|seed|reset|import-chatgpt");
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
