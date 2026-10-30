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
    await seed(sql, { password: "integration-test-password", credentialsFile: null, samples: true });
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

  it("rollup produces source, campaign, journey, heatmap and media aggregates from events", async () => {
    const [model] = await sql<{ id: string }[]>`SELECT id::text FROM catalog.product_models WHERE slug = 'kaon-ar2140'`;
    const [flow] = await sql<{ id: string }[]>`SELECT id::text FROM knowledge.flows LIMIT 1`;
    const [res] = await sql<{ id: string }[]>`SELECT id::text FROM knowledge.resources LIMIT 1`;
    const resId = res?.id ?? "00000000-0000-0000-0000-000000000001";
    const sid = "rollup-metrics-sessionA";
    const t = (sec: number) => new Date(Date.now() - 60_000 + sec * 1000);
    const ev = (name: string, props: Parameters<typeof sql.json>[0], pageType: string, at: number, extra: Record<string, unknown> = {}) =>
      sql`INSERT INTO analytics.events ${sql({ id: crypto.randomUUID(), name, occurred_at: t(at), session_id: sid, consent: "essential", page_type: pageType, device_category: "mobile", props: sql.json(props), ...extra })}`;
    await ev("session_started", {}, "home", 0, { utm_source: "shopee", utm_medium: "listing", utm_campaign: "ar2140-box", utm_content: "qr-box-01", link_label: "shopee", channel: "shopee", referrer_domain: "shopee.com.my" });
    await ev("page_view", { landing: true }, "home", 1);
    await ev("page_view", {}, "router_model", 2);
    await ev("router_model_selected", { model_id: model!.id, ecr: "KAO" }, "router_model", 2);
    await ev("router_mode_selected", { model_id: model!.id, mode: "mesh" }, "router_mode", 3);
    await ev("page_view", {}, "router_scenario", 4);
    await ev("router_scenario_selected", { model_id: model!.id, mode: "mesh", scenario: "mesh_pairing_fails", verified: false }, "router_scenario", 4);
    await ev("support_started", { surface: "router" }, "router_scenario", 5);
    await ev("click_area", { x_pct: 40, y_pct: 20, target: "button", viewport: "phone" }, "router_scenario", 6);
    await ev("resource_open", { resource_id: resId, kind: "video" }, "router_scenario", 7);
    await ev("video_progress", { resource_id: resId, pct: 50 }, "router_scenario", 8);
    if (flow) await ev("flow_step", { flow_id: flow.id, step_key: "step1", action: "next" }, "flow", 9);
    await ev("escalation_submitted", { origin: "router", scenario: "mesh_pairing_fails" }, "router_scenario", 10);
    await ev("navigation_exit", { max_scroll_pct: 50 }, "router_scenario", 11);
    // A second session that chose a problem and left without resolving or escalating.
    const sid2 = "rollup-metrics-sessionB";
    await sql`INSERT INTO analytics.events ${sql({ id: crypto.randomUUID(), name: "session_started", occurred_at: t(20), session_id: sid2, consent: "essential", page_type: "home", device_category: "desktop", props: sql.json({}), channel: "unknown" })}`;
    await sql`INSERT INTO analytics.events ${sql({ id: crypto.randomUUID(), name: "page_view", occurred_at: t(21), session_id: sid2, consent: "essential", page_type: "router_scenario", device_category: "desktop", props: sql.json({}) })}`;
    await sql`INSERT INTO analytics.events ${sql({ id: crypto.randomUUID(), name: "router_scenario_selected", occurred_at: t(22), session_id: sid2, consent: "essential", page_type: "router_scenario", device_category: "desktop", props: sql.json({ model_id: model!.id, mode: "ap", scenario: "ap_no_internet", verified: false }) })}`;
    const day = new Date().toISOString().slice(0, 10);
    await rollupDay(sql, day);
    const rows = await sql<{ metric: string; dim1: string; dim2: string; value: number }[]>`SELECT metric, dim1, dim2, value::int FROM analytics.agg_daily WHERE day = ${day}::date`;
    const has = (metric: string, dim1?: string, dim2?: string) => rows.some((r) => r.metric === metric && (dim1 === undefined || r.dim1 === dim1) && (dim2 === undefined || r.dim2 === dim2) && r.value >= 1);
    expect(has("sources", "shopee", "shopee.com.my")).toBe(true);
    expect(has("link_labels", "shopee")).toBe(true);
    expect(has("campaigns", "ar2140-box", "shopee/listing")).toBe(true);
    expect(has("campaign_content", "ar2140-box", "qr-box-01")).toBe(true);
    expect(has("router_models", model!.id)).toBe(true);
    expect(has("router_modes", model!.id, "mesh")).toBe(true);
    expect(has("router_scenarios", "mesh:mesh_pairing_fails", model!.id)).toBe(true);
    expect(has("router_scenarios_unverified", "mesh:mesh_pairing_fails", model!.id)).toBe(true);
    expect(has("click_grid", "router_scenario|phone", "40,20")).toBe(true);
    expect(has("resource_opens", resId, "video")).toBe(true);
    expect(has("video_progress", resId, "50")).toBe(true);
    expect(has("escalations", "router", "mesh_pairing_fails")).toBe(true);
    expect(has("nav_paths", "home", "router_model")).toBe(true);
    expect(has("journey_exit", "router_scenario", "left_after_problem")).toBe(true);
    expect(rows.find((r) => r.metric === "journey_exit" && r.dim2 === "left_after_problem")?.value).toBe(1);
    expect(has("channel_router", "shopee")).toBe(true);
    expect(has("channel_support", "shopee")).toBe(true);
    expect(has("channel_escalated", "shopee")).toBe(true);
    expect(has("campaign_support", "ar2140-box")).toBe(true);
    // Nothing in the aggregates carries the raw click position, a referrer path or a visitor id.
    expect(rows.some((r) => /\//.test(r.dim2) && r.metric === "sources")).toBe(false);
    await sql`DELETE FROM analytics.events WHERE session_id IN (${sid}, ${sid2})`;
  });

  it("aggregates sessions by Malaysian state and country, without storing addresses or coordinates", async () => {
    const [model] = await sql<{ id: string }[]>`SELECT id::text FROM catalog.product_models WHERE slug = 'tp-link-ex510'`;
    let tick = 0;
    const t = () => new Date(Date.now() - 120_000 + tick++ * 1000);
    const ins = (sid: string, name: string, props: Record<string, unknown>, extra: Record<string, unknown>) =>
      sql`INSERT INTO analytics.events ${sql({ id: crypto.randomUUID(), name, occurred_at: t(), session_id: sid, consent: "essential", page_type: "home", device_category: "mobile", props: sql.json(props as never), ...extra })}`;
    // Synthetic sessions: three in Selangor (one with a consented city), one in Kuala Lumpur, one in Singapore, one unknown.
    for (const [sid, extra] of [
      ["geo-sel-1", { country: "MY", region: "MY-10", city: "Shah Alam", consent: "analytics", visitor_id: "geo-visitor-1", channel: "shopee" }],
      ["geo-sel-2", { country: "MY", region: "MY-10", channel: "unknown" }], ["geo-sel-3", { country: "MY", region: "MY-10", channel: "qr_code" }],
      ["geo-kl-1", { country: "MY", region: "MY-14", channel: "unknown" }], ["geo-sg-1", { country: "SG", channel: "unknown" }], ["geo-unknown-1", { channel: "unknown" }],
    ] as [string, Record<string, unknown>][]) {
      await ins(sid, "session_started", {}, extra);
      await ins(sid, "page_view", { landing: true }, extra);
    }
    await ins("geo-sel-1", "router_model_selected", { model_id: model!.id, ecr: "EX5" }, { country: "MY", region: "MY-10" });
    await ins("geo-sel-1", "router_mode_selected", { model_id: model!.id, mode: "mesh" }, { country: "MY", region: "MY-10" });
    await ins("geo-sel-1", "router_scenario_selected", { model_id: model!.id, mode: "mesh", scenario: "mesh_pairing", verified: false }, { country: "MY", region: "MY-10" });
    await ins("geo-sel-2", "support_started", { support_session: "geo-chat-1" }, { country: "MY", region: "MY-10" });
    await ins("geo-sel-2", "escalation_submitted", { origin: "chat" }, { country: "MY", region: "MY-10" });
    const day = new Date().toISOString().slice(0, 10);
    await rollupDay(sql, day);
    const rows = await sql<{ metric: string; dim1: string; dim2: string; value: number }[]>`SELECT metric, dim1, dim2, value::int FROM analytics.agg_daily WHERE day = ${day}::date AND metric LIKE 'geo_%'`;
    const get = (metric: string, dim1: string, dim2 = "") => rows.find((r) => r.metric === metric && r.dim1 === dim1 && r.dim2 === dim2)?.value ?? 0;
    expect(get("geo_sessions", "MY", "MY-10")).toBe(3);
    expect(get("geo_sessions", "MY", "MY-14")).toBe(1);
    expect(get("geo_sessions", "SG", "")).toBe(1);
    expect(get("geo_sessions", "", "")).toBeGreaterThanOrEqual(1);
    expect(get("geo_visitors", "MY", "MY-10")).toBe(1);
    expect(get("geo_new_sessions", "MY", "MY-10")).toBe(3);
    expect(get("geo_page_views", "MY", "MY-10")).toBe(3);
    expect(get("geo_router", "MY-10")).toBe(1);
    expect(get("geo_mesh", "MY-10")).toBe(1);
    expect(get("geo_problem", "MY-10")).toBe(1);
    expect(get("geo_ai", "MY-10")).toBe(1);
    expect(get("geo_escalated", "MY-10")).toBe(1);
    expect(get("geo_model", "MY-10", model!.id)).toBe(1);
    expect(get("geo_scenario", "MY-10", "mesh:mesh_pairing")).toBe(1);
    expect(get("geo_source", "MY-10", "shopee")).toBe(1);
    expect(get("geo_city", "MY-10", "Shah Alam")).toBe(1);
    // Nothing geographic is stored beyond country, state and (consented) city.
    const cols = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'events'`;
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(expect.arrayContaining(["country", "region", "city"]));
    expect(names.some((n) => /ip|latitude|longitude|lat$|lon$/.test(n))).toBe(false);
    // Idempotent: a second rollup does not double count.
    await rollupDay(sql, day);
    expect((await sql<{ v: number }[]>`SELECT value::int AS v FROM analytics.agg_daily WHERE day = ${day}::date AND metric = 'geo_sessions' AND dim1 = 'MY' AND dim2 = 'MY-10'`)[0]!.v).toBe(3);
    await sql`DELETE FROM analytics.events WHERE session_id LIKE 'geo-%'`;
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

  describe("router support", () => {
    it("catalogue holds exactly the seven router models with ECR codes", async () => {
      const rows = await sql<{ ecr_code: string; display_name: string }[]>`
        SELECT m.ecr_code, m.display_name FROM catalog.product_models m JOIN catalog.categories c ON c.id = m.category_id
        WHERE m.ecr_code IS NOT NULL AND c.slug = 'router' AND c.active ORDER BY m.ecr_code`;
      expect(rows.map((r) => `${r.ecr_code}=${r.display_name}`)).toEqual([
        "AX20=TP-Link Archer AX20", "EB4=TP-Link EB431V", "EX2=TP-Link EX230V", "EX5=TP-Link EX510", "EX8=TP-Link EX820V", "HUA=Huawei LG-8245-X6", "KAO=Kaon AR2140",
      ]);
      const [fake] = await sql`SELECT 1 FROM catalog.product_models m JOIN catalog.categories c ON c.id = m.category_id WHERE c.slug = 'router' AND m.ecr_code IS NULL`;
      expect(fake).toBeUndefined();
    });

    it("catalogue seeding is idempotent and keeps names exact", async () => {
      const { seedRouterCatalog } = await import("../src/router-catalog");
      await sql.begin((tx) => seedRouterCatalog(tx));
      const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM catalog.product_models WHERE ecr_code IS NOT NULL`;
      expect(n!.n).toBe(7);
    });

    it("imports research only as unpublished, unverified drafts with Malay placeholders", async () => {
      const rows = await sql<{ status: string; verification_status: string; placeholders: number }[]>`
        SELECT f.status, f.verification_status,
          (SELECT count(*)::int FROM knowledge.flow_steps s WHERE s.flow_id = f.id AND s.prompt_ms LIKE '[PERLU TERJEMAHAN]%') AS placeholders
        FROM knowledge.flows f WHERE f.research_ref IS NOT NULL`;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.status).toBe("draft");
        expect(r.verification_status).not.toBe("verified");
        expect(r.placeholders).toBeGreaterThan(0);
      }
      const [reset] = await sql<{ destructive: boolean; warning_en: string | null; safety_level: string }[]>`
        SELECT s.destructive, s.warning_en, s.safety_level FROM knowledge.flow_steps s JOIN knowledge.flows f ON f.id = s.flow_id WHERE f.research_ref = 'KAO-RESET'`;
      expect(reset).toMatchObject({ destructive: true, safety_level: "danger" });
      expect(reset!.warning_en).toMatch(/erases all settings/);
    });

    it("verification and publishing need a held, approved source; retrieval sees only verified flows", async () => {
      const { loadVerifiedRouterFlow, verifiedScenarioKeys } = await import("../src/repos/router");
      const [f] = await sql<{ id: string; model_id: string }[]>`SELECT id, model_id FROM knowledge.flows WHERE research_ref = 'HUA-MESH-PAIR'`;
      const [u] = await sql<{ id: string }[]>`SELECT id FROM identity.users WHERE email = 'reviewer@bbcare.test'`;
      const verify = () => sql`UPDATE knowledge.flows SET verification_status = 'verified', verified_by = ${u!.id}, verified_at = now() WHERE id = ${f!.id}`;
      // Draft and unverified: cannot publish, and retrieval returns nothing.
      await expect(sql`UPDATE knowledge.flows SET status = 'published' WHERE id = ${f!.id}`).rejects.toThrow();
      expect(await loadVerifiedRouterFlow(sql, f!.model_id, "mesh", "mesh_pairing")).toBeNull();
      // Source still pending: cannot be marked verified.
      await expect(verify()).rejects.toThrow(/held in BBCare/);
      // Source approved but only a URL (the manual was never available): still refused.
      await sql`UPDATE knowledge.sources SET status = 'approved', trust_level = 'reviewed' WHERE id IN (SELECT source_id FROM knowledge.flow_sources WHERE flow_id = ${f!.id})`;
      await expect(verify()).rejects.toThrow(/held in BBCare/);
      // Document text held in BBCare: verification allowed.
      await sql`UPDATE knowledge.sources SET extracted_text = 'Synthetic stored manual text for this integration test only.' WHERE id IN (SELECT source_id FROM knowledge.flow_sources WHERE flow_id = ${f!.id})`;
      await verify();
      // Malay placeholders block publishing; translated text is accepted.
      await expect(sql`UPDATE knowledge.flows SET status = 'published' WHERE id = ${f!.id}`).rejects.toThrow(/Malay/);
      expect(await loadVerifiedRouterFlow(sql, f!.model_id, "mesh", "mesh_pairing")).toBeNull();
      await sql`UPDATE knowledge.flow_steps SET prompt_ms = 'Langkah ' || step_key, expected_ms = CASE WHEN expected_ms IS NULL THEN NULL ELSE 'Dijangka' END,
        warning_ms = CASE WHEN warning_ms IS NULL THEN NULL ELSE 'Amaran' END WHERE flow_id = ${f!.id}`;
      await sql`UPDATE knowledge.flows SET status = 'published' WHERE id = ${f!.id}`;
      const live = await loadVerifiedRouterFlow(sql, f!.model_id, "mesh", "mesh_pairing");
      expect(live?.id).toBe(f!.id);
      expect(live!.sources.length).toBeGreaterThan(0);
      expect(await verifiedScenarioKeys(sql, f!.model_id, "mesh")).toEqual(["mesh_pairing"]);
      // Other models and other scenarios get nothing from this flow.
      const [kao] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'KAO'`;
      expect(await loadVerifiedRouterFlow(sql, kao!.id, "mesh", "mesh_pairing")).toBeNull();
      expect(await loadVerifiedRouterFlow(sql, f!.model_id, "ap", "ap_enable")).toBeNull();
      // A live flow cannot lose its only held source.
      await expect(sql`DELETE FROM knowledge.flow_sources WHERE flow_id = ${f!.id}`).rejects.toThrow(/must keep/);
      // A second live flow for the same model, mode and problem is refused.
      const [other] = await sql<{ id: string }[]>`SELECT id FROM knowledge.flows WHERE research_ref = 'HUA-MESH-PLACEMENT'`;
      await sql`UPDATE knowledge.flow_steps SET prompt_ms = 'Langkah', expected_ms = CASE WHEN expected_ms IS NULL THEN NULL ELSE 'Dijangka' END, warning_ms = CASE WHEN warning_ms IS NULL THEN NULL ELSE 'Amaran' END WHERE flow_id = ${other!.id}`;
      await expect(sql`UPDATE knowledge.flows SET scenario_key = 'mesh_pairing', verification_status = 'verified', verified_by = ${u!.id}, verified_at = now(), status = 'published' WHERE id = ${other!.id}`).rejects.toThrow(/flows_one_published_scenario/);
      // If the source is later rejected, retrieval stops returning the flow immediately.
      await sql`UPDATE knowledge.sources SET status = 'rejected' WHERE id IN (SELECT source_id FROM knowledge.flow_sources WHERE flow_id = ${f!.id})`;
      expect(await loadVerifiedRouterFlow(sql, f!.model_id, "mesh", "mesh_pairing")).toBeNull();
      // Clean up for later tests.
      await sql`UPDATE knowledge.flows SET status = 'draft', verification_status = 'unverified', verified_by = NULL, verified_at = NULL WHERE id = ${f!.id}`;
    });

    it("rejects a destructive step without warnings in both languages", async () => {
      const [f] = await sql<{ id: string }[]>`SELECT id FROM knowledge.flows WHERE research_ref = 'KAO-RESET'`;
      await expect(sql`INSERT INTO knowledge.flow_steps (flow_id, step_key, prompt_en, prompt_ms, destructive, safety_level) VALUES (${f!.id}, 'bad', 'Reset it', 'Reset', true, 'danger')`).rejects.toThrow();
    });

    it("training examples need a privacy screen and a different reviewer", async () => {
      const [u] = await sql<{ id: string }[]>`SELECT id FROM identity.users WHERE email = 'agent@bbcare.test'`;
      const [e] = await sql<{ id: string }[]>`
        INSERT INTO ai.training_examples (locale, question, answer, proposed_by) VALUES ('en', 'mesh will not pair', 'Use the verified pairing guide.', ${u!.id}) RETURNING id`;
      await expect(sql`UPDATE ai.training_examples SET status = 'approved', privacy_screened = true, reviewed_by = ${u!.id}, reviewed_at = now() WHERE id = ${e!.id}`).rejects.toThrow();
      await expect(sql`UPDATE ai.training_examples SET status = 'approved', privacy_screened = false, reviewed_by = gen_random_uuid(), reviewed_at = now() WHERE id = ${e!.id}`).rejects.toThrow();
    });

    it("case intake and follow-up columns store only structured data", async () => {
      const [m] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'KAO'`;
      await expect(sql`INSERT INTO support.cases (subject, locale, model_id, support_mode, scenario_key) VALUES ('x', 'en', ${m!.id}, 'wifi', 'mesh_pairing')`).rejects.toThrow();
      const [c] = await sql<{ intake: Record<string, string> }[]>`
        INSERT INTO support.cases (subject, locale, model_id, support_mode, scenario_key, intake) VALUES ('KAO pairing', 'en', ${m!.id}, 'mesh', 'mesh_pairing', ${sql.json({ unit_role: "second" })}) RETURNING intake`;
      expect(c!.intake).toEqual({ unit_role: "second" });
    });
  });

  describe("customer demand intelligence", () => {
    it("records attribution only from what was reported, and unknown otherwise", async () => {
      const { recordAttribution, attributionFor } = await import("../src/repos/demand");
      const [s1] = await sql<{ id: string }[]>`INSERT INTO support.sessions (public_id, token_hash, locale, expires_at) VALUES ('att-1', decode('01', 'hex'), 'en', now() + interval '1 day') RETURNING id`;
      const ch = await recordAttribution(sql, { sessionId: s1!.id }, { latest: { referrer: "https://shopee.com.my/bbtech.shop?token=secret", landing_path: "/en/routers", utm_source: "shopee" }, first: { ch: "qr", landing_path: "/en", at: "2026-10-01T00:00:00Z" } }, { ownHosts: ["support.bbtech.com.my"], consent: "essential" });
      expect(ch).toBe("shopee");
      const a = await attributionFor(sql, { sessionId: s1!.id });
      expect(a).toMatchObject({ channel: "shopee", channel_evidence: "utm", referrer_host: "shopee.com.my", landing_path: "/en/routers", first_channel: "qr_code", first_landing_path: "/en" });
      expect(JSON.stringify(a)).not.toContain("secret");
      const [s2] = await sql<{ id: string }[]>`INSERT INTO support.sessions (public_id, token_hash, locale, expires_at) VALUES ('att-2', decode('02', 'hex'), 'ms', now() + interval '1 day') RETURNING id`;
      expect(await recordAttribution(sql, { sessionId: s2!.id }, null, { ownHosts: [], consent: "essential" })).toBe("unknown");
      expect(await attributionFor(sql, { sessionId: s2!.id })).toMatchObject({ channel: "unknown", channel_evidence: "none", referrer_host: null, first_channel: null });
      await expect(sql`INSERT INTO support.attribution (channel, channel_evidence) VALUES ('shopee', 'utm')`).rejects.toThrow();
    });

    it("groups equivalent requests, counts unique customers once, keeps every original question", async () => {
      const { recordDemand, listDemands, demandDetail, demandSummary } = await import("../src/repos/demand");
      const [kao] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'KAO'`;
      const [c1] = await sql<{ id: string }[]>`INSERT INTO support.cases (subject, locale, model_id, support_mode, scenario_key) VALUES ('KAO pairing video', 'ms', ${kao!.id}, 'mesh', 'mesh_pairing') RETURNING id`;
      const base = { modelId: kao!.id, supportMode: "mesh" as const, scenarioKey: "mesh_pairing", resourceType: "video" as const, locale: "ms" as const, origin: "escalation" as const, hadTextGuide: false };
      const r1 = await recordDemand(sql, { ...base, hardwareRevision: "v1", question: "ada video tak cara pair kaon", customerRef: "cust-A", caseId: c1!.id, channel: "shopee" });
      const r2 = await recordDemand(sql, { ...base, hardwareRevision: "V1.0", question: "video pairing please", customerRef: "cust-A", caseId: c1!.id, channel: "shopee" });
      const r3 = await recordDemand(sql, { ...base, hardwareRevision: "v1", question: "tunjuk video mesh kaon", customerRef: "cust-B", channel: "unknown", origin: "describe_box" });
      const other = await recordDemand(sql, { ...base, hardwareRevision: "v1", locale: "en", question: "show me a video", customerRef: "cust-C", hadTextGuide: false });
      expect(r1?.created).toBe(true);
      expect(r2?.demandId).toBe(r1!.demandId);
      expect(r3?.demandId).toBe(r1!.demandId);
      expect(other?.demandId).not.toBe(r1!.demandId);
      const detail = (await demandDetail(sql, r1!.demandId))!;
      expect(detail.demand).toMatchObject({ requests: 3, customers: 2, hardware_revision: "V1", status: "missing", resource_type: "video", locale: "ms" });
      expect(detail.requests.map((q) => q.question).sort()).toEqual(["ada video tak cara pair kaon", "tunjuk video mesh kaon", "video pairing please"]);
      expect(detail.requests.filter((q) => q.case_id === c1!.id)).toHaveLength(2);
      expect(detail.channels).toEqual([{ label: "shopee", value: 2 }, { label: "unknown", value: 1 }]);
      const window = { since: new Date(Date.now() - 86_400_000), until: new Date(Date.now() + 86_400_000) };
      const list = await listDemands(sql, window);
      expect(list.find((d) => d.id === r1!.demandId)).toMatchObject({ requests: 3, customers: 2, top_channel: "shopee" });
      const summary = await demandSummary(sql, window);
      expect(summary.totals.requests).toBeGreaterThanOrEqual(4);
      expect(summary.byType.video).toBeGreaterThanOrEqual(2);
      expect(summary.byChannel.find((c) => c.label === "shopee")?.value).toBeGreaterThanOrEqual(2);
      expect(summary.byLocale.ms).toBeGreaterThanOrEqual(1);
      // Filters narrow correctly.
      expect((await listDemands(sql, { ...window, locale: "en" })).every((d) => d.locale === "en")).toBe(true);
      expect((await demandSummary(sql, { ...window, resourceType: "document" })).totals.requests).toBe(0);
    });

    it("does not record a demand that an approved resource already satisfies; approval fulfils open demands and keeps history", async () => {
      const { recordDemand, resourceExists, fulfilDemandsForResource, approvedResources, demandDetail } = await import("../src/repos/demand");
      const [kao] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'KAO'`;
      const [editor] = await sql<{ id: string }[]>`SELECT id FROM identity.users WHERE email = 'editor@bbcare.test'`;
      const [reviewer] = await sql<{ id: string }[]>`SELECT id FROM identity.users WHERE email = 'reviewer@bbcare.test'`;
      const d = await recordDemand(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "ap_enable", resourceType: "diagram", locale: "en", question: "which port diagram", customerRef: "cust-D", origin: "assistant", hadTextGuide: false });
      expect(d?.created).toBe(true);
      const [asset] = await sql<{ id: string }[]>`INSERT INTO knowledge.media_assets (storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by) VALUES ('2026-10/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', 'ports.png', 'image/png', 10, 'x', ${editor!.id}) RETURNING id`;
      const [res] = await sql<{ id: string }[]>`
        INSERT INTO knowledge.resources (kind, media_asset_id, title_en, title_ms, model_id, support_mode, scenario_key, locale, uploaded_by)
        VALUES ('diagram', ${asset!.id}, 'AR2140 rear ports', 'Port belakang AR2140', ${kao!.id}, 'ap', 'ap_enable', 'both', ${editor!.id}) RETURNING id`;
      // Under review: still missing, uploader cannot approve their own upload.
      expect(await resourceExists(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "ap_enable", resourceType: "diagram", locale: "en" })).toBe(false);
      await expect(sql`UPDATE knowledge.resources SET status = 'approved', reviewed_by = ${editor!.id}, reviewed_at = now() WHERE id = ${res!.id}`).rejects.toThrow();
      await sql`UPDATE knowledge.resources SET status = 'approved', reviewed_by = ${reviewer!.id}, reviewed_at = now() WHERE id = ${res!.id}`;
      expect(await fulfilDemandsForResource(sql, res!.id)).toEqual([d!.demandId]);
      const detail = (await demandDetail(sql, d!.demandId))!;
      expect(detail.demand).toMatchObject({ status: "approved", fulfilled_resource_id: res!.id, requests: 1 });
      expect(detail.requests[0]!.question).toBe("which port diagram");
      expect(await resourceExists(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "ap_enable", resourceType: "diagram", locale: "ms" })).toBe(true);
      expect((await approvedResources(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "ap_enable", locale: "ms" })).map((r) => r.title)).toEqual(["Port belakang AR2140"]);
      // A later identical request is not recorded because the resource now exists.
      expect(await recordDemand(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "ap_enable", resourceType: "diagram", locale: "en", question: "diagram again", customerRef: "cust-E", origin: "assistant", hadTextGuide: false })).toBeNull();
    });

    it("retention removes old question text but keeps the counts", async () => {
      const { applyRetention } = await import("../src/repos/analytics");
      const { recordDemand, demandDetail } = await import("../src/repos/demand");
      const [hua] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'HUA'`;
      const d = await recordDemand(sql, { modelId: hua!.id, supportMode: "mesh", scenarioKey: "mesh_unstable", resourceType: "image", locale: "en", question: "what colour should the light be, got picture?", customerRef: "cust-R", origin: "assistant", hadTextGuide: false });
      await sql`UPDATE support.resource_demand_requests SET created_at = now() - interval '200 days' WHERE demand_id = ${d!.demandId}`;
      const out = await applyRetention(sql);
      expect(out.demandQuestions).toBeGreaterThanOrEqual(1);
      const detail = (await demandDetail(sql, d!.demandId))!;
      expect(detail.demand.requests).toBe(1);
      expect(detail.requests[0]!.question).toBe("[removed after retention period]");
    });

    it("rejects unknown resource types, scenarios and languages at the database", async () => {
      const [kao] = await sql<{ id: string }[]>`SELECT id FROM catalog.product_models WHERE ecr_code = 'KAO'`;
      await expect(sql`INSERT INTO support.resource_demands (model_id, support_mode, scenario_key, resource_type, locale, requirement) VALUES (${kao!.id}, 'mesh', 'mesh_pairing', 'hologram', 'en', 'x')`).rejects.toThrow();
      await expect(sql`INSERT INTO support.resource_demands (model_id, support_mode, scenario_key, resource_type, locale, requirement) VALUES (${kao!.id}, 'mesh', 'mesh_pairing', 'video', 'ar', 'x')`).rejects.toThrow();
      const { recordDemand } = await import("../src/repos/demand");
      expect(await recordDemand(sql, { modelId: kao!.id, supportMode: "ap", scenarioKey: "mesh_pairing", resourceType: "video", locale: "en", question: "q", customerRef: "x", origin: "assistant", hadTextGuide: false })).toBeNull();
    });
  });

  // Regression: databases seeded before the router-first change showed an empty catalogue,
  // because schema migrations add no rows and the seed skipped existing data. Runs last: it
  // rebuilds the database.
  describe("router catalogue on an upgraded database", () => {
    it("an old seeded database gains all seven models and loses no data", async () => {
      const { ROUTER_MODELS, normalizeModelNumber } = await import("@bbcare/core");
      await resetDatabase(sql);
      const only1 = await mkdtemp(join(tmpdir(), "bbcare-mig1-"));
      await cp(join(MIGRATIONS_DIR, "0001_initial_schema.sql"), join(only1, "0001_initial_schema.sql"));
      await migrate(sql, only1);
      // Shape of the pre-router-first seed: a router category holding fictional models only.
      const [cat] = await sql<{ id: string }[]>`INSERT INTO catalog.categories (slug, name_en, name_ms) VALUES ('router', 'Router Support', 'Sokongan Penghala') RETURNING id`;
      await sql`INSERT INTO catalog.categories (slug, name_en, name_ms) VALUES ('laptop', 'Laptop Support', 'Sokongan Laptop')`;
      const [nimbus] = await sql<{ id: string }[]>`INSERT INTO catalog.brands (slug, name) VALUES ('nimbus', 'Nimbus (sample)') RETURNING id`;
      await sql`INSERT INTO catalog.product_models (brand_id, category_id, model_number, normalized, slug, display_name) VALUES (${nimbus!.id}, ${cat!.id}, 'NB-AX3000', 'NBAX3000', 'nb-ax3000', 'Nimbus NB-AX3000')`;
      await sql`INSERT INTO identity.users (email, display_name, password_hash) VALUES ('editor@bbcare.test', 'Eddie Editor', 'x')`;

      await migrate(sql);
      const rows = await sql<{ ecr_code: string; display_name: string; slug: string; model_number: string; normalized: string; identity_status: string }[]>`
        SELECT m.ecr_code, m.display_name, m.slug, m.model_number, m.normalized, m.identity_status
        FROM catalog.product_models m JOIN catalog.categories c ON c.id = m.category_id
        WHERE m.ecr_code IS NOT NULL AND m.status = 'active' AND c.slug = 'router' AND c.active`;
      // The SQL data migration must match the code catalogue exactly.
      const byEcr = new Map(rows.map((r) => [r.ecr_code, r]));
      expect(rows).toHaveLength(7);
      for (const m of ROUTER_MODELS) {
        expect(byEcr.get(m.ecr)).toEqual({ ecr_code: m.ecr, display_name: m.name, slug: m.slug, model_number: m.modelNumber, normalized: normalizeModelNumber(m.modelNumber), identity_status: m.identityStatus });
      }
      // Fictional data is kept but moved out of customer view.
      const [old] = await sql<{ status: string; cat: string; active: boolean }[]>`
        SELECT m.status, c.slug AS cat, c.active FROM catalog.product_models m JOIN catalog.categories c ON c.id = m.category_id WHERE m.slug = 'nb-ax3000'`;
      expect(old).toEqual({ status: "hidden", cat: "sample", active: false });
      const [laptop] = await sql<{ active: boolean }[]>`SELECT active FROM catalog.categories WHERE slug = 'laptop'`;
      expect(laptop!.active).toBe(false);

      // The seed on an existing database keeps data and tops up the catalogue and drafts.
      const r = await seed(sql, { credentialsFile: null });
      expect(r).toMatchObject({ created: false, routerModels: 7 });
      const [drafts] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM knowledge.flows WHERE research_ref IS NOT NULL AND status = 'draft'`;
      expect(drafts!.n).toBeGreaterThan(0);
      const [users] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM identity.users`;
      expect(users!.n).toBe(1);
    });

    it("a fresh database has the seven models straight after migrations, before any seed", async () => {
      await resetDatabase(sql);
      await migrate(sql);
      const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM catalog.product_models WHERE ecr_code IS NOT NULL AND status = 'active'`;
      expect(n!.n).toBe(7);
      const [fake] = await sql`SELECT 1 FROM catalog.product_models WHERE ecr_code IS NULL`;
      expect(fake).toBeUndefined();
    });
  });
});