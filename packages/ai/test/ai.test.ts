import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, Semaphore } from "../src/resilience";
import { FlaskAiProvider, extractText } from "../src/flask";
import { MockAiProvider } from "../src/mock";
import { validateAnswer } from "../src/validate";
import { generateGroundedAnswer } from "../src/answer";
import { createProvider } from "../src/factory";
import type { Evidence } from "../src/prompts";

const evidence: Evidence[] = [
  { ref: "E1", chunkId: "c1", revisionId: "r1", title: "Battery not charging", heading: "Battery > Safety", text: "If the battery is swollen, stop using the laptop. Firmware 1.2.0 fixes charging.", safetyLevel: "danger" },
  { ref: "E2", chunkId: "c2", revisionId: "r2", title: "Charger", heading: "Charger", text: "Use a charger with the correct wattage.", safetyLevel: "normal" },
];

const answer = (o: Record<string, unknown>) =>
  JSON.stringify({ sufficient: true, confirmed: [], possible_causes: [], steps: [], warnings: [], citations: ["E1"], product_refs: [], ...o });

describe("validateAnswer", () => {
  it("accepts grounded answers and maps citations", () => {
    const r = validateAnswer(answer({ steps: ["Use a charger with the correct wattage."], warnings: ["Stop if swollen."], citations: ["E1", "E2", "E9"] }), evidence, []);
    expect(r.ok && r.answer.citations.map((c) => c.ref)).toEqual(["E1", "E2"]);
  });
  it("rejects answers without valid citations", () => {
    expect(validateAnswer(answer({ steps: ["x"], citations: ["E7"] }), evidence, [])).toEqual({ ok: false, reason: "no_valid_citations" });
  });
  it("rejects insufficient, unparseable and human claims", () => {
    expect(validateAnswer(answer({ sufficient: false }), evidence, [])).toEqual({ ok: false, reason: "insufficient" });
    expect(validateAnswer("not json", evidence, [])).toEqual({ ok: false, reason: "unparseable" });
    expect(validateAnswer(answer({ steps: ["I am a human technician."] }), evidence, [])).toEqual({ ok: false, reason: "human_claim" });
    expect(validateAnswer(answer({ steps: ["Saya manusia."] }), evidence, [])).toEqual({ ok: false, reason: "human_claim" });
  });
  it("removes invented URLs, versions, prices and stock claims", () => {
    const r = validateAnswer(
      answer({ steps: ["Update to firmware 1.2.0.", "Update to firmware 9.9.9.", "Buy at https://evil.example", "It costs RM199.", "It is in stock.", "Restart the laptop."] }),
      evidence,
      [],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer.steps).toEqual(["Update to firmware 1.2.0.", "Restart the laptop."]);
      expect(r.removed.length).toBe(4);
    }
  });
  it("adds a default safety warning for danger evidence", () => {
    const r = validateAnswer(answer({ steps: ["Restart."] }), evidence, []);
    expect(r.ok && r.answer.warnings).toEqual(["__SAFETY_DEFAULT__"]);
  });
  it("only allows known product refs", () => {
    const r = validateAnswer(answer({ steps: ["Restart."], product_refs: ["P1", "P9"] }), evidence, [{ ref: "P1", productId: "prod-1", name: "Charger" }]);
    expect(r.ok && r.answer.productIds).toEqual(["prod-1"]);
  });
});

describe("pipeline with mock provider", () => {
  it("produces a cited answer", async () => {
    const r = await generateGroundedAnswer(new MockAiProvider(), { question: "battery", locale: "en", modelName: null, evidence, products: [] });
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") {
      expect(r.mock).toBe(true);
      expect(r.answer.citations.length).toBeGreaterThan(0);
    }
  });
  it("abstains without evidence", async () => {
    const r = await generateGroundedAnswer(new MockAiProvider(), { question: "x", locale: "en", modelName: null, evidence: [], products: [] });
    expect(r).toMatchObject({ kind: "abstain", reason: "no_evidence" });
  });
});

describe("Flask adapter", () => {
  it("refuses public endpoints and missing tokens", () => {
    expect(() => new FlaskAiProvider({ baseUrl: "https://ai.example.com", token: "t" })).toThrow(/private-network/);
    expect(() => new FlaskAiProvider({ baseUrl: "http://10.0.0.5:5000", token: "" })).toThrow(/token/);
  });
  it("sends bearer auth and parses common response shapes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: { content: "hello" }, model: "m1" }), { headers: { "content-type": "application/json" } }));
    const p = new FlaskAiProvider({ baseUrl: "http://10.0.0.5:5000", token: "secret-token", fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await p.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("hello");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
  });
  it("maps failures to unavailable and opens the circuit", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const p = new FlaskAiProvider({ baseUrl: "http://10.0.0.5:5000", token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    for (let i = 0; i < 3; i++) {
      const r = await generateGroundedAnswer(p, { question: "q", locale: "en", modelName: null, evidence, products: [] });
      expect(r.kind).toBe("unavailable");
    }
    const r = await generateGroundedAnswer(p, { question: "q", locale: "en", modelName: null, evidence, products: [] });
    expect(r).toMatchObject({ kind: "unavailable", reason: "AI service circuit open" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("extracts text from known shapes", () => {
    expect(extractText({ response: "a" })).toBe("a");
    expect(extractText({ choices: [{ message: { content: "b" } }] })).toBe("b");
    expect(extractText({ nothing: 1 })).toBeNull();
  });
});

describe("resilience and factory", () => {
  it("limits concurrency", async () => {
    const s = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 6 }, () => s.run(async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; })));
    expect(peak).toBe(2);
  });
  it("half-opens after cooldown", () => {
    let t = 0;
    const b = new CircuitBreaker(2, 1000, () => t);
    b.failure(); b.failure();
    expect(b.canRequest()).toBe(false);
    t = 1500;
    expect(b.state).toBe("half_open");
  });
  it("forbids mock in production", () => {
    expect(() => createProvider({ BBCARE_ENV: "production", BBCARE_AI_PROVIDER: "mock" })).toThrow();
    expect(createProvider({ BBCARE_ENV: "development", BBCARE_AI_PROVIDER: "none" })).toBeNull();
  });
});
