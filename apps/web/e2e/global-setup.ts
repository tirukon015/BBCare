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
    await seed(sql, { password, credentialsFile: null, samples: true });
    await addVerifiedFixtureFlow(sql);
    writeFileSync(join(here, ".e2e-state.json"), JSON.stringify({ password }), { mode: 0o600 });
  } finally {
    await sql.end();
  }
}

/**
 * One verified, published router flow so the verified-guide path can be tested. Test database
 * only, and labelled as a fixture: it is not real guidance for the TP-Link EX230V.
 */
async function addVerifiedFixtureFlow(sql: ReturnType<typeof createSql>) {
  const [reviewer] = await sql<{ id: string }[]>`SELECT id FROM identity.users WHERE email = 'reviewer@bbcare.test'`;
  const [model] = await sql<{ id: string; category_id: string }[]>`SELECT id, category_id FROM catalog.product_models WHERE ecr_code = 'EX2'`;
  const [source] = await sql<{ id: string }[]>`
    INSERT INTO knowledge.sources (kind, title, publisher, trust_level, status, reviewed_by) VALUES ('staff_authored', 'E2E test fixture source', 'BBCare tests', 'reviewed', 'approved', ${reviewer!.id}) RETURNING id`;
  const [flow] = await sql<{ id: string }[]>`
    INSERT INTO knowledge.flows (category_id, slug, title_en, title_ms, model_id, support_mode, scenario_key, verification_status, verified_by, verified_at, verification_note)
    VALUES (${model!.category_id}, 'e2e-fixture-ex2-ap-enable', 'Set up Access Point mode', 'Tetapkan mod Titik Akses', ${model!.id}, 'ap', 'ap_enable', 'verified', ${reviewer!.id}, now(), 'E2E fixture')
    RETURNING id`;
  const steps = [
    { key: "s1", start: true, en: "[Test fixture] Step one.", ms: "[Fixture ujian] Langkah satu.", exp_en: "[Test fixture] You see the result of step one.", exp_ms: "[Fixture ujian] Anda melihat hasil langkah satu.", destructive: false,
      options: [{ key: "done", label_en: "Done, next step", label_ms: "Selesai, langkah seterusnya", next: "s2" }] },
    { key: "s2", start: false, en: "[Test fixture] Reset step.", ms: "[Fixture ujian] Langkah tetapan semula.", exp_en: null, exp_ms: null, destructive: true,
      options: [{ key: "fixed", label_en: "That fixed it", label_ms: "Masalah selesai", outcome: "resolved" }, { key: "not_fixed", label_en: "Still not working", label_ms: "Masih tidak berfungsi", outcome: "escalate" }] },
  ];
  for (const st of steps) {
    await sql`
      INSERT INTO knowledge.flow_steps (flow_id, step_key, is_start, prompt_en, prompt_ms, options, expected_en, expected_ms, warning_en, warning_ms, destructive, safety_level)
      VALUES (${flow!.id}, ${st.key}, ${st.start}, ${st.en}, ${st.ms}, ${sql.json(st.options)}, ${st.exp_en}, ${st.exp_ms},
        ${st.destructive ? "[Test fixture] This erases settings." : null}, ${st.destructive ? "[Fixture ujian] Ini memadam tetapan." : null}, ${st.destructive}, ${st.destructive ? "danger" : "normal"})`;
  }
  await sql`INSERT INTO knowledge.flow_sources (flow_id, source_id, locator) VALUES (${flow!.id}, ${source!.id}, 'Section 1')`;
  await sql`UPDATE knowledge.flows SET status = 'published' WHERE id = ${flow!.id}`;
}
