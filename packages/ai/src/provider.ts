/** Provider-neutral AI interface. No paid hosted provider is implemented (ADR 0005). */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  /** Ask the provider for a JSON object response where supported. */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
  latencyMs: number;
}

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  detail?: string;
  latencyMs?: number;
}

export interface AiProvider {
  readonly name: "mock" | "flask";
  /** True for test doubles; their output must never be presented as real AI to customers. */
  readonly isMock: boolean;
  health(signal?: AbortSignal): Promise<ProviderHealth>;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  embed?(texts: string[], signal?: AbortSignal): Promise<{ vectors: number[][]; model: string }>;
}

export class AiUnavailableError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "AiUnavailableError";
  }
}
