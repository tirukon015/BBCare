import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BBCARE_ENV: z.enum(["development", "test", "preview", "staging", "production"]).default("development"),
  BBCARE_BASE_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().startsWith("postgres"),
  BBCARE_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes base64"),
  BBCARE_SESSION_SECRET: z.string().min(32),
  BBCARE_AI_PROVIDER: z.enum(["none", "mock", "flask"]).default("none"),
  BBCARE_FLASK_AI_URL: z.string().optional(),
  BBCARE_FLASK_AI_TOKEN: z.string().optional(),
  BBCARE_FLASK_AI_CHAT_PATH: z.string().optional(),
  BBCARE_FLASK_AI_EMBED_PATH: z.string().optional(),
  BBCARE_FLASK_AI_HEALTH_PATH: z.string().optional(),
  BBCARE_FLASK_AI_MODEL: z.string().optional(),
  BBCARE_AI_TIMEOUT_MS: z.string().optional(),
  BBCARE_AI_MAX_CONCURRENCY: z.string().optional(),
  BBCARE_STORAGE_DIR: z.string().default("./storage"),
  BBCARE_GEOIP_CSV: z.string().optional(),
  BBCARE_LISTING_VERIFICATION_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  BBCARE_SUPPORT_CONTACT_WHATSAPP: z.string().regex(/^\d{8,15}$/).optional().or(z.literal("")),
  BBCARE_SUPPORT_CONTACT_EMAIL: z.email().optional().or(z.literal("")),
  BBCARE_HEALTH_TOKEN: z.string().optional(),
  BBCARE_STAFF_LOGIN_DOMAIN: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment. Fails closed with a message that names variables but never values. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid BBCare environment configuration: ${names}`);
  }
  if (parsed.data.BBCARE_ENV === "production" && parsed.data.BBCARE_AI_PROVIDER === "mock") {
    throw new Error("BBCARE_AI_PROVIDER=mock is not allowed in production");
  }
  cached = parsed.data;
  return cached;
}

export function isProductionLike(): boolean {
  const e = env().BBCARE_ENV;
  return e === "production" || e === "staging";
}
