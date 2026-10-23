import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSql, type Sql } from "../src/index";
import { migrate, MIGRATIONS_DIR, resetDatabase } from "../src/migrate";
import { seed } from "../src/seed";
import { classifyResolution, resolveModels, searchKnowledge } from "../src/repos/search";
import { rollupDay } from "../src/repos/analytics";
import { indexRevision } from "../src/repos/indexing";

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;
let sql: Sql;

d("database integration (real Postgres)", () => {
  beforeAll(async () => {
    sql = createSql({ url: url!, max: 2 });
    await resetDatabase(sql);
    await migrate(sql);
    await seed(sql, { password: "integration-test-password", credentialsFile: null });
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("migrations are idempotent", async () => {
    const r = await migrate(sql);
    expect(r.applied).toEqual([]);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it("detects edits to applied migrations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bbcare-mig-"));
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    await writeFile(join(dir, "0001_initial_schema.sql"), "-- tampered\n");
    await expect(migrate(sql, dir)).rejects.toThrow(/modified after being applied/);
  });

  it("approved revisions are immutable", async () => {
    const [r] = await sql<{ id: string }[]>`SELECT id FROM knowledge.revisions WHERE status = 'published' LIMIT 1`;
    await expect(sql`UPDATE knowledge.revisions SET body_md = 'changed' WHERE id = ${r!.id}`).rejects.toThrow(/immutable/);
    await sql`UPDATE knowledge.revisions SET review_note = 'metadata ok' WHERE id = ${r!.id}`;
  });

  it("only one published revision per article and locale", async () => {
    const [r] = await sql<{ article_id: string }[]>`SELECT article_id FROM knowledge.revisions WHERE status = 'published' AND locale = 'en' LIMIT 1`;
    await expect(sql`
      INSERT INTO knowledge.revisions (article_id, locale, revision_no, title, body_md, status) VALUES (${r!.article_id}, 'en', 99, 't', 'b', 'published')`).rejects.toThrow(/revisions_one_published/);
  });

  it("audit log is append-only", async () => {
    await sql`INSERT INTO identity.audit_logs (action) VALUES ('test.event')`;
    await expect(sql`UPDATE identity.audit_logs SET action = 'x'`).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM identity.audit_logs`).rejects.toThrow(/append-only/);
  });

  it("listing URLs must be on allowlisted domains", async () => {
    const [p] = await sql<{ id: string }[]>`SELECT id FROM commerce.products LIMIT 1`;
    await expect(sql`INSERT INTO commerce.product_listings (product_id, channel, url) VALUES (${p!.id}, 'shopee', 'https://evil.example/x')`).rejects.toThrow(/check/);
    await expect(sql`INSERT INTO commerce.product_listings (product_id, channel, url) VALUES (${p!.id}, 'shopee', 'http://shopee.com.my/x')`).rejects.toThrow(/check/);
  });

  it("search returns only published content and respects strict applicability", async () => {
    const [draft] = await sql<{ id: string }[]>`SELECT id FROM knowledge.revisions WHERE status = 'in_review' LIMIT 1`;
    await indexRevision(sql, draft!.id); // even if indexed, unpublished content must not be returned
    const hits = await searchKnowledge(sql, { query: "pair mesh node", locale: "en" });
    expect(hits.every((h) => h.title !== "Mesh M2: add a second node")).toBe(true);

    const [other] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE slug = 'nb-ax3000-pro'`;
    const strict = await searchKnowledge(sql, { query: "wifi slow rooms", locale: "en", modelId: other!.id, strictApplicability: true });
    expect(strict.some((h) => h.appliesToModels.includes("Nimbus NB-AX3000"))).toBe(false);
    const loose = await searchKnowledge(sql, { query: "wifi slow rooms", locale: "en" });
    expect(loose.some((h) => h.appliesToModels.includes("Nimbus NB-AX3000"))).toBe(true);
  });

  it("falls back to the other locale when needed", async () => {
    const hits = await searchKnowledge(sql, { query: "kotak fiber", locale: "en" });
    expect(hits[0]?.localeFallback).toBe(true);
  });

  it("resolves models exactly, by alias and flags ambiguity", async () => {
    expect(classifyResolution(await resolveModels(sql, "my NB-AX3000 is slow"))).toBe("resolved");
    expect((await resolveModels(sql, "AX3000 Pro"))[0]?.slug).toBe("nb-ax3000-pro");
    // Regression: a variant suffix in a longer sentence must not resolve to the base model.
    const pro = await resolveModels(sql, "NB-AX3000 Pro wifi slow in some rooms");
    expect(pro[0]?.slug).toBe("nb-ax3000-pro");
    expect(classifyResolution(pro)).toBe("resolved");
    expect(classifyResolution(await resolveModels(sql, "kestrel"))).toBe("ambiguous");
    expect(await resolveModels(sql, "hello there")).toEqual([]);
  });

  it("analytics rollup is idempotent", async () => {
    await sql`
      INSERT INTO analytics.events (id, name, occurred_at, session_id, consent, page_type, device_category, props)
      VALUES (gen_random_uuid(), 'page_view', now(), 'sess-a', 'essential', 'home', 'mobile', '{}'), (gen_random_uuid(), 'page_view', now(), 'sess-b', 'essential', 'home', 'desktop', '{}')`;
    const day = new Date().toISOString().slice(0, 10);
    const first = await rollupDay(sql, day);
    const second = await rollupDay(sql, day);
    expect(second).toBe(first);
    const [s] = await sql<{ v: number }[]>`SELECT sum(value)::int AS v FROM analytics.agg_daily WHERE day = ${day}::date AND metric = 'sessions'`;
    expect(s!.v).toBeGreaterThanOrEqual(2);
  });

  it("job claims are exclusive across concurrent workers", async () => {
    const { claim } = await import("../../../apps/worker/src/queue");
    for (let i = 0; i < 5; i++) await sql`INSERT INTO ops.jobs (queue, payload) VALUES ('test_q', '{}')`;
    const other = createSql({ url: url!, max: 1 });
    const claimed = await Promise.all(Array.from({ length: 10 }, (_, i) => claim(i % 2 ? sql : other, ["test_q"], `w${i}`)));
    await other.end();
    const ids = claimed.filter(Boolean).map((j) => j!.id);
    expect(ids.length).toBe(5);
    expect(new Set(ids).size).toBe(5);
  });
});
