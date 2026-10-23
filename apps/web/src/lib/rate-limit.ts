import "server-only";
import { sha256Hex } from "@bbcare/core";
import { db } from "./db";

export interface Limit { capacity: number; refillPerSecond: number }

export const LIMITS = {
  events: { capacity: 120, refillPerSecond: 2 },
  supportMessage: { capacity: 12, refillPerSecond: 0.2 },
  supportSession: { capacity: 10, refillPerSecond: 0.05 },
  escalation: { capacity: 5, refillPerSecond: 0.01 },
  feedback: { capacity: 30, refillPerSecond: 0.5 },
  login: { capacity: 8, refillPerSecond: 0.02 },
  search: { capacity: 60, refillPerSecond: 1 },
} satisfies Record<string, Limit>;

/**
 * Token bucket stored in an UNLOGGED Postgres table so limits are shared across processes.
 * Keys are hashed so raw IPs are not stored.
 */
export async function rateLimit(scope: keyof typeof LIMITS, subject: string): Promise<boolean> {
  const { capacity, refillPerSecond } = LIMITS[scope];
  const key = `${scope}:${sha256Hex(subject).slice(0, 32)}`;
  const [row] = await db()<{ allowed: boolean }[]>`
    INSERT INTO ops.rate_limits (key, tokens, updated_at) VALUES (${key}, ${capacity - 1}, now())
    ON CONFLICT (key) DO UPDATE SET
      tokens = LEAST(${capacity}::float8, ops.rate_limits.tokens + EXTRACT(EPOCH FROM (now() - ops.rate_limits.updated_at)) * ${refillPerSecond}::float8) - 1,
      updated_at = now()
    RETURNING tokens >= 0 AS allowed`;
  return row?.allowed ?? false;
}
