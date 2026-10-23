import type { AiProvider, GenerateRequest, GenerateResult, ProviderHealth } from "./provider";

/**
 * Deterministic test double. It builds a structured answer from the evidence present in the
 * prompt so that the full pipeline (parsing, validation, citations, UI) can be exercised
 * without the real AI server. It is never a substitute for real AI in front of customers:
 * the UI labels mock answers, and production configuration rejects this provider.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly isMock = true;
  constructor(private readonly opts: { failHealth?: boolean; latencyMs?: number } = {}) {}

  async health(): Promise<ProviderHealth> {
    return this.opts.failHealth ? { ok: false, provider: "mock", detail: "simulated outage" } : { ok: true, provider: "mock", latencyMs: 1 };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const user = req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const blocks = [...user.matchAll(/<<EVIDENCE (E\d+)>>\nTitle: (.*)\nSection: (.*)\nSafety: (.*)\n([\s\S]*?)\n<<END \1>>/g)];
    if (blocks.length === 0) {
      return { text: JSON.stringify({ sufficient: false, confirmed: [], possible_causes: [], steps: [], warnings: [], citations: [], product_refs: [] }), model: "mock-deterministic", latencyMs: Date.now() - start };
    }
    const top = blocks.slice(0, 2);
    const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const steps = top.flatMap((b) => sentences(b[5]!).slice(0, 2));
    const warnings = top.filter((b) => b[4] === "danger" || b[4] === "caution").map((b) => sentences(b[5]!).find((s) => /stop|berhenti|warning|amaran|jangan|do not/i.test(s)) ?? "").filter(Boolean);
    const productRef = /\n(P\d+): /.exec(user)?.[1];
    const body = {
      sufficient: true,
      confirmed: [`${top[0]![2]}: ${(top[0]![3] ?? "").split(" > ").at(-1)}`],
      possible_causes: [],
      steps,
      warnings,
      citations: top.map((b) => b[1]),
      product_refs: productRef ? [productRef] : [],
    };
    return { text: JSON.stringify(body), model: "mock-deterministic", latencyMs: Date.now() - start };
  }

  async embed(texts: string[]): Promise<{ vectors: number[][]; model: string }> {
    // Hash-based pseudo-embeddings for tests only.
    const vectors = texts.map((t) => {
      const v = new Array<number>(16).fill(0);
      for (let i = 0; i < t.length; i++) v[i % 16]! += t.charCodeAt(i) / 1000;
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
    return { vectors, model: "mock-embed-16" };
  }
}
