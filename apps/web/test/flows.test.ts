import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: () => { throw new Error("no db in unit tests"); } }));
vi.mock("@/modules/audit/service", () => ({ audit: async () => {} }));
const { flowStepsSchema, validateFlowGraph } = await import("../src/modules/knowledge/flows-admin");

const base = [
  { key: "a", start: true, prompt_en: "Is it on?", prompt_ms: "Adakah hidup?", options: [{ key: "y", label_en: "Yes", label_ms: "Ya", next: "b" }, { key: "n", label_en: "No", label_ms: "Tidak", outcome: "escalate" as const }] },
  { key: "b", prompt_en: "Fixed?", prompt_ms: "Selesai?", options: [{ key: "y", label_en: "Yes", label_ms: "Ya", outcome: "resolved" as const }] },
];

describe("flow graph validation", () => {
  it("accepts a valid flow", () => {
    expect(validateFlowGraph(flowStepsSchema.parse(base))).toEqual([]);
  });
  it("rejects missing targets, dead ends, orphans and multiple starts", () => {
    const bad = flowStepsSchema.parse([
      { ...base[0]!, options: [{ key: "y", label_en: "Yes", label_ms: "Ya", next: "zzz" }] },
      { ...base[1]!, start: true },
      { key: "c", prompt_en: "Orphan?", prompt_ms: "Yatim?", options: [{ key: "x", label_en: "X", label_ms: "X" }] },
    ]);
    const errors = validateFlowGraph(bad).join(" ");
    expect(errors).toMatch(/Exactly one step/);
    expect(errors).toMatch(/missing step "zzz"/);
    expect(errors).toMatch(/needs "next" or "outcome"/);
  });
  it("rejects unknown fields", () => {
    expect(flowStepsSchema.safeParse([{ ...base[0], script: "x" }]).success).toBe(false);
  });
});

describe("router flow step rules", () => {
  it("requires warnings in both languages and danger safety for destructive steps", () => {
    const steps = flowStepsSchema.parse([{ ...base[0]!, destructive: true }, base[1]]);
    expect(validateFlowGraph(steps).join(" ")).toMatch(/destructive/);
    const ok = flowStepsSchema.parse([{ ...base[0]!, destructive: true, safety: "danger", warning_en: "This erases settings.", warning_ms: "Ini memadam tetapan." }, base[1]]);
    expect(validateFlowGraph(ok)).toEqual([]);
  });
  it("requires expected results in both languages together", () => {
    const steps = flowStepsSchema.parse([{ ...base[0]!, expected_en: "The light turns on." }, base[1]]);
    expect(validateFlowGraph(steps).join(" ")).toMatch(/expected_en and expected_ms/);
  });
});
