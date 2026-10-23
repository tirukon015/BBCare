/**
 * BBCare evaluation runner.
 *
 *   tsx run.ts --retrieval-only     retrieval, model resolution and abstention checks (no LLM, CI gate)
 *   tsx run.ts                      also generates answers with the configured provider (flask or mock)
 *   --no-record                     do not write ai.eval_runs / ai.eval_results
 *   --dataset datasets/x.jsonl      choose a dataset (default datasets/support-v1.jsonl)
 *
 * Results with the mock provider only exercise the pipeline; they say nothing about model quality.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createProvider, generateGroundedAnswer, type Evidence } from "@bbcare/ai";
import { classifyResolution, createSql, resolveModels, searchKnowledge } from "@bbcare/db";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const retrievalOnly = args.includes("--retrieval-only");
const record = !args.includes("--no-record");
const datasetPath = args.includes("--dataset") ? args[args.indexOf("--dataset") + 1]! : join(here, "datasets/support-v1.jsonl");
const MIN_COVERAGE = 0.5;

const caseSchema = z.object({
  key: z.string(),
  locale: z.enum(["en", "ms"]),
  question: z.string(),
  expect: z.object({
    model: z.string().optional(), article: z.string().optional(), notArticle: z.string().optional(),
    answer: z.boolean().optional(), clarify: z.boolean().optional(), safety: z.boolean().optional(), noPrice: z.boolean().optional(),
  }),
});
type Case = z.infer<typeof caseSchema>;

const cases: Case[] = readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((l) => caseSchema.parse(JSON.parse(l)));
const sql = createSql({ url: process.env.DATABASE_URL ?? "", max: 2 });
const provider = retrievalOnly ? null : createProvider({ ...process.env, BBCARE_ENV: process.env.BBCARE_ENV ?? "development", BBCARE_AI_PROVIDER: process.env.BBCARE_AI_PROVIDER ?? "mock" });

interface Result { key: string; passed: boolean; checks: Record<string, boolean>; detail: Record<string, unknown> }
const results: Result[] = [];
const latencies: number[] = [];

for (const c of cases) {
  const checks: Record<string, boolean> = {};
  const detail: Record<string, unknown> = {};
  const models = await resolveModels(sql, c.question);
  const state = classifyResolution(models);
  detail.resolution = state;
  detail.model = models[0]?.slug;
  if (c.expect.clarify) checks.clarify = state === "ambiguous";
  if (c.expect.model) checks.model = state === "resolved" && models[0]?.slug === c.expect.model;

  const resolved = state === "resolved" ? models[0]! : null;
  const all = await searchKnowledge(sql, { query: c.question, locale: c.locale, modelId: resolved?.id ?? null, categoryId: resolved?.categoryId ?? null, strictApplicability: true, limit: 6 });
  const hits = all.filter((h) => h.coverage >= MIN_COVERAGE);
  detail.hits = hits.map((h) => h.articleSlug);
  if (c.expect.article) checks.retrieval_top3 = hits.slice(0, 3).some((h) => h.articleSlug === c.expect.article);
  if (c.expect.notArticle) checks.no_wrong_model = !hits.some((h) => h.articleSlug === c.expect.notArticle);
  if (c.expect.answer === false) checks.abstain = hits.length === 0;
  if (c.expect.answer === true) checks.has_evidence = hits.length > 0;

  if (provider && hits.length > 0) {
    const chunks = await sql<{ id: string; revision_id: string; heading: string; content: string }[]>`
      SELECT id, revision_id, heading, content FROM knowledge.chunks WHERE id = ANY (${hits.slice(0, 4).map((h) => h.chunkId)}::uuid[])`;
    const evidence: Evidence[] = hits.slice(0, 4).flatMap((h, i) => {
      const ch = chunks.find((x) => x.id === h.chunkId);
      return ch ? [{ ref: `E${i + 1}`, chunkId: ch.id, revisionId: ch.revision_id, title: h.title, heading: ch.heading, text: ch.content, safetyLevel: h.safetyLevel }] : [];
    });
    const started = Date.now();
    const r = await generateGroundedAnswer(provider, { question: c.question, locale: c.locale, modelName: resolved?.displayName ?? null, evidence, products: [] });
    latencies.push(Date.now() - started);
    detail.ai = r.kind;
    if (r.kind === "answer") {
      const text = [...r.answer.confirmed, ...r.answer.steps, ...r.answer.possibleCauses, ...r.answer.warnings].join(" ");
      checks.citations_valid = r.answer.citations.length > 0 && r.answer.citations.every((e) => evidence.some((x) => x.chunkId === e.chunkId));
      checks.no_urls = !/https?:\/\/|www\./i.test(text);
      if (c.expect.noPrice) checks.no_price = !/\bRM\s?\d/i.test(text);
      if (c.expect.safety) checks.safety_warning = r.answer.warnings.length > 0;
      if (c.expect.answer === false) checks.abstain = false;
    } else if (c.expect.answer === true) {
      checks.answered = false;
    }
  }
  const passed = Object.values(checks).every(Boolean);
  results.push({ key: c.key, passed, checks, detail });
}

const total = results.length;
const passed = results.filter((r) => r.passed).length;
const metric = (name: string) => {
  const rel = results.filter((r) => name in r.checks);
  return rel.length ? Number((rel.filter((r) => r.checks[name]).length / rel.length).toFixed(3)) : null;
};
const summary = {
  cases: total, passed, pass_rate: Number((passed / total).toFixed(3)),
  retrieval_top3: metric("retrieval_top3"), model_resolution: metric("model"), clarify: metric("clarify"), abstention: metric("abstain"),
  no_wrong_model: metric("no_wrong_model"), citations_valid: metric("citations_valid"), safety_warning: metric("safety_warning"),
  p50_latency_ms: latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
  provider: provider?.name ?? "none", mock: provider?.isMock ?? null,
};

for (const r of results) console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.key.padEnd(22)} ${JSON.stringify(r.checks)}${r.passed ? "" : `  ${JSON.stringify(r.detail)}`}`);
console.log(JSON.stringify(summary, null, 2));

if (record) {
  const name = datasetPath.split("/").at(-1)!.replace(/\.jsonl$/, "");
  const [ds] = await sql<{ id: string }[]>`
    INSERT INTO ai.eval_datasets (name, version, description) VALUES (${name}, 1, 'Synthetic bilingual support cases') ON CONFLICT (name, version) DO UPDATE SET description = EXCLUDED.description RETURNING id`;
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO ai.eval_runs (dataset_id, config, summary, finished_at) VALUES (${ds!.id}, ${sql.json({ provider: summary.provider, mock: summary.mock, retrievalOnly } as never)}, ${sql.json(summary as never)}, now()) RETURNING id`;
  for (const r of results) {
    const [ec] = await sql<{ id: string }[]>`
      INSERT INTO ai.eval_cases (dataset_id, case_key, locale, question, expectation)
      VALUES (${ds!.id}, ${r.key}, ${cases.find((c) => c.key === r.key)!.locale}, ${cases.find((c) => c.key === r.key)!.question}, ${sql.json(cases.find((c) => c.key === r.key)!.expect as never)})
      ON CONFLICT (dataset_id, case_key) DO UPDATE SET question = EXCLUDED.question RETURNING id`;
    await sql`INSERT INTO ai.eval_results (run_id, case_id, passed, metrics, output) VALUES (${run!.id}, ${ec!.id}, ${r.passed}, ${sql.json(r.checks as never)}, ${sql.json(r.detail as never)})`;
  }
}
await sql.end();
// CI gate for the retrieval layer. Thresholds for AI answers are set by the owner after a baseline.
const gate = (summary.retrieval_top3 ?? 1) >= 0.9 && (summary.abstention ?? 1) >= 0.9 && (summary.no_wrong_model ?? 1) === 1;
process.exit(gate ? 0 : 1);
