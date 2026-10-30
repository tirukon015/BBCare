/**
 * Compatibility check for the owner's private Flask AI gateway, run from the BBCare host:
 *
 *   BBCARE_FLASK_AI_URL=... BBCARE_FLASK_AI_TOKEN=... pnpm --filter @bbcare/ai gateway-check
 *
 * Read-only: it makes a health call and two short chat calls, writes nothing to the database and
 * changes no flag. Exit code 0 when every check passes, 1 otherwise. The report never prints the
 * token. See docs/integration/flask-gateway-contract.md for what each check means.
 */
import { generateGroundedAnswer } from "./answer";
import { FlaskAiProvider, extractText } from "./flask";
import type { Evidence } from "./prompts";
import { routerFlowEvidence } from "./router-evidence";

interface Check { name: string; ok: boolean; detail: string }
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const env = process.env;
const url = env.BBCARE_FLASK_AI_URL ?? "";
const token = env.BBCARE_FLASK_AI_TOKEN ?? "";
const cfg = {
  chatPath: env.BBCARE_FLASK_AI_CHAT_PATH, healthPath: env.BBCARE_FLASK_AI_HEALTH_PATH, embedPath: env.BBCARE_FLASK_AI_EMBED_PATH,
  model: env.BBCARE_FLASK_AI_MODEL || undefined,
  timeoutMs: env.BBCARE_AI_TIMEOUT_MS ? Number(env.BBCARE_AI_TIMEOUT_MS) : undefined,
};

// A fixed, clearly synthetic evidence passage: the check must not depend on database content.
const FIXTURE_EVIDENCE: Evidence[] = routerFlowEvidence({
  id: "gateway-check", title: "Gateway check (synthetic)", modelName: "Gateway Check Router",
  steps: [{ key: "s1", prompt: "Press the blue button on the back of the unit for two seconds.", expected: "The ring light blinks green.", warning: null, safetyLevel: "normal" }],
  sources: [{ title: "Synthetic check document", locator: "p. 1" }],
});

async function main(): Promise<number> {
  console.log(`BBCare gateway check against ${url.replace(/\/\/([^@/]+@)/, "//")} (token: ${token ? "set" : "missing"})\n`);

  // 1. Configuration sanity: the adapter refuses public hosts and empty tokens.
  try { new FlaskAiProvider({ baseUrl: "https://ai.example.com", token: "x" }); record("adapter refuses public URL", false); }
  catch { record("adapter refuses public URL", true); }
  try { new FlaskAiProvider({ baseUrl: "http://127.0.0.1:1", token: "" }); record("adapter refuses empty token", false); }
  catch { record("adapter refuses empty token", true); }

  let provider: FlaskAiProvider;
  try { provider = new FlaskAiProvider({ baseUrl: url, token, ...cfg }); record("configured URL is private and token present", true); }
  catch (err) { record("configured URL is private and token present", false, err instanceof Error ? err.message : String(err)); return 1; }

  // 2. Health.
  const health = await provider.health(AbortSignal.timeout(cfg.timeoutMs ?? 30_000));
  record("health endpoint reachable (2xx)", health.ok, health.ok ? `${health.latencyMs} ms` : health.detail ?? "");
  if (!health.ok) return 1;

  // 3. Authentication: a request without the token must be rejected.
  try {
    const res = await fetch(new URL(cfg.healthPath ?? "/health", url), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    record("gateway rejects a request without a bearer token", res.status === 401 || res.status === 403, `HTTP ${res.status}`);
  } catch (err) {
    record("gateway rejects a request without a bearer token", false, err instanceof Error ? err.message : String(err));
  }

  // 4. Chat with fixture evidence: shape, JSON validity, citation.
  const started = Date.now();
  let rawShape = "unknown";
  const probing = new FlaskAiProvider({
    baseUrl: url, token, ...cfg,
    fetchImpl: async (input, init) => {
      const res = await fetch(input, init);
      const clone = res.clone();
      try {
        const body = (await clone.json()) as Record<string, unknown>;
        rawShape = body.response !== undefined ? "response" : body.text !== undefined ? "text" : body.answer !== undefined ? "answer" : body.output !== undefined ? "output"
          : body.message !== undefined ? "message.content" : body.choices !== undefined ? "choices[0]" : `keys: ${Object.keys(body).join(",")}`;
        if (extractText(body) === null) rawShape += " (no recognised text field)";
      } catch { rawShape = "not JSON"; }
      return res;
    },
  });
  const r = await generateGroundedAnswer(probing, { question: "How do I pair the unit?", locale: "en", modelName: "Gateway Check Router", evidence: FIXTURE_EVIDENCE, products: [] });
  const latency = Date.now() - started;
  record("chat returns a recognised response shape", !rawShape.startsWith("not JSON") && !rawShape.includes("no recognised") && !rawShape.startsWith("keys:"), rawShape);
  if (r.kind === "answer") {
    record("chat answer is valid grounded JSON", true, `model ${r.model}, ${latency} ms, prompt ${r.promptVersion}`);
    record("chat answer cites the evidence", r.answer.citations.some((c) => c.chunkId === FIXTURE_EVIDENCE[0]!.chunkId), r.answer.citations.map((c) => c.chunkId).join(",") || "no citations");
    record("chat answer contains no URLs", !/https?:\/\/|www\./i.test([...r.answer.steps, ...r.answer.confirmed].join(" ")));
  } else {
    record("chat answer is valid grounded JSON", false, `${r.kind}: ${r.reason}`);
  }

  // 5. Safety path: without evidence BBCare must abstain without calling the gateway.
  let called = false;
  const silent = new FlaskAiProvider({ baseUrl: url, token, ...cfg, fetchImpl: async (i, n) => { called = true; return fetch(i, n); } });
  const a = await generateGroundedAnswer(silent, { question: "anything", locale: "ms", modelName: null, evidence: [], products: [] });
  record("abstains without evidence and does not call the gateway", a.kind === "abstain" && !called);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.${failed.length ? ` Failed: ${failed.map((f) => f.name).join("; ")}` : ""}`);
  console.log("No database rows were written and no flag was changed. Customer-facing AI remains off.");
  return failed.length ? 1 : 0;
}

process.exitCode = await main();
