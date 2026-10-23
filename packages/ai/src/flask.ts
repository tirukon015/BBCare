import { AiUnavailableError, type AiProvider, type GenerateRequest, type GenerateResult, type ProviderHealth } from "./provider";
import { CircuitBreaker, Semaphore } from "./resilience";

/**
 * Adapter for the owner's existing Flask AI service. The service's real routes and payloads
 * are confirmed by the read-only server audit; until then paths are configurable and the
 * response parser accepts the common shapes (Ollama, OpenAI-compatible, plain text fields).
 * The service must only be reachable over a private network.
 */
export interface FlaskConfig {
  baseUrl: string;
  token: string;
  chatPath?: string;
  embedPath?: string;
  healthPath?: string;
  model?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  fetchImpl?: typeof fetch;
}

export function extractText(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.response === "string") return b.response;
  if (typeof b.text === "string") return b.text;
  if (typeof b.answer === "string") return b.answer;
  if (typeof b.output === "string") return b.output;
  const msg = b.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.content === "string") return msg.content;
  const choices = b.choices as Array<Record<string, unknown>> | undefined;
  const first = choices?.[0];
  const cm = first?.message as Record<string, unknown> | undefined;
  if (cm && typeof cm.content === "string") return cm.content;
  if (first && typeof first.text === "string") return first.text;
  return null;
}

function isPrivateHost(url: URL): boolean {
  const h = url.hostname;
  return (
    h === "localhost" ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    h.endsWith(".ts.net") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) ||
    h === "host.docker.internal" ||
    /^[a-z0-9-]+$/.test(h) // single-label service names (Docker networks)
  );
}

export class FlaskAiProvider implements AiProvider {
  readonly name = "flask" as const;
  readonly isMock = false;
  private readonly breaker = new CircuitBreaker();
  private readonly semaphore: Semaphore;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: FlaskConfig) {
    const url = new URL(cfg.baseUrl);
    if (!isPrivateHost(url)) {
      throw new Error("Flask AI service URL must be a private-network address (never a public endpoint)");
    }
    if (!cfg.token) throw new Error("Flask AI service token is required");
    this.semaphore = new Semaphore(cfg.maxConcurrency ?? 2);
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async call(path: string, body: unknown, signal?: AbortSignal, method = "POST"): Promise<unknown> {
    if (!this.breaker.canRequest()) throw new AiUnavailableError("AI service circuit open");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 30_000);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const res = await this.fetchImpl(new URL(path, this.cfg.baseUrl), {
        method,
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json", accept: "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new AiUnavailableError(`AI service returned HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      this.breaker.success();
      return data;
    } catch (err) {
      this.breaker.failure();
      if (err instanceof AiUnavailableError) throw err;
      throw new AiUnavailableError("AI service request failed", err);
    } finally {
      clearTimeout(timer);
    }
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.call(this.cfg.healthPath ?? "/health", undefined, signal, "GET");
      return { ok: true, provider: this.name, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, provider: this.name, detail: err instanceof Error ? err.message : "unavailable" };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const start = Date.now();
    const data = await this.semaphore.run(() =>
      this.call(
        this.cfg.chatPath ?? "/api/chat",
        {
          model: this.cfg.model,
          messages: req.messages,
          format: req.json ? "json" : undefined,
          stream: false,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 800,
          options: { temperature: req.temperature ?? 0.2, num_predict: req.maxTokens ?? 800 },
        },
        req.signal,
      ),
    );
    const text = extractText(data);
    if (text === null) throw new AiUnavailableError("AI service response had no text field");
    const model = (data as { model?: string })?.model ?? this.cfg.model ?? "unknown";
    return { text, model, latencyMs: Date.now() - start };
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<{ vectors: number[][]; model: string }> {
    const data = (await this.semaphore.run(() =>
      this.call(this.cfg.embedPath ?? "/api/embed", { model: this.cfg.model, input: texts }, signal),
    )) as Record<string, unknown>;
    const vectors = (data.embeddings ?? (data.data as Array<{ embedding: number[] }> | undefined)?.map((d) => d.embedding)) as
      | number[][]
      | undefined;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) throw new AiUnavailableError("Invalid embedding response");
    return { vectors, model: String(data.model ?? this.cfg.model ?? "unknown") };
  }
}
