import "server-only";
import { createProvider, type AiProvider } from "@bbcare/ai";
import { db } from "./db";
import { env } from "./env";

const g = globalThis as unknown as { __bbcareAi?: AiProvider | null };

export function aiProvider(): AiProvider | null {
  if (g.__bbcareAi === undefined) g.__bbcareAi = createProvider(env());
  return g.__bbcareAi;
}

export interface AiState { enabled: boolean; configured: boolean; mock: boolean; provider: string }

/** AI answers are used only when the flag for the locale is on AND a provider is configured. */
export async function aiState(locale: "en" | "ms"): Promise<AiState> {
  const provider = aiProvider();
  const [flag] = await db()<{ enabled: boolean }[]>`SELECT enabled FROM ai.flags WHERE key = ${`ai_answers.${locale}`}`;
  return { enabled: !!flag?.enabled && !!provider, configured: !!provider, mock: provider?.isMock ?? false, provider: provider?.name ?? "none" };
}
