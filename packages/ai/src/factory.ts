import { FlaskAiProvider } from "./flask";
import { MockAiProvider } from "./mock";
import type { AiProvider } from "./provider";

export interface AiEnv {
  BBCARE_ENV: string;
  BBCARE_AI_PROVIDER?: string;
  BBCARE_FLASK_AI_URL?: string;
  BBCARE_FLASK_AI_TOKEN?: string;
  BBCARE_FLASK_AI_CHAT_PATH?: string;
  BBCARE_FLASK_AI_EMBED_PATH?: string;
  BBCARE_FLASK_AI_HEALTH_PATH?: string;
  BBCARE_FLASK_AI_MODEL?: string;
  BBCARE_AI_TIMEOUT_MS?: string;
  BBCARE_AI_MAX_CONCURRENCY?: string;
}

/** Build the configured provider. Returns null when AI is not configured ("none"). */
export function createProvider(env: AiEnv): AiProvider | null {
  const kind = env.BBCARE_AI_PROVIDER ?? "none";
  if (kind === "none") return null;
  if (kind === "mock") {
    if (env.BBCARE_ENV === "production") throw new Error("The mock AI provider is not allowed in production");
    return new MockAiProvider();
  }
  if (kind === "flask") {
    return new FlaskAiProvider({
      baseUrl: env.BBCARE_FLASK_AI_URL ?? "",
      token: env.BBCARE_FLASK_AI_TOKEN ?? "",
      chatPath: env.BBCARE_FLASK_AI_CHAT_PATH,
      embedPath: env.BBCARE_FLASK_AI_EMBED_PATH,
      healthPath: env.BBCARE_FLASK_AI_HEALTH_PATH,
      model: env.BBCARE_FLASK_AI_MODEL,
      timeoutMs: env.BBCARE_AI_TIMEOUT_MS ? Number(env.BBCARE_AI_TIMEOUT_MS) : undefined,
      maxConcurrency: env.BBCARE_AI_MAX_CONCURRENCY ? Number(env.BBCARE_AI_MAX_CONCURRENCY) : undefined,
    });
  }
  throw new Error(`Unknown AI provider "${kind}"`);
}
