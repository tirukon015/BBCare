import "server-only";
import { cookies } from "next/headers";
import { attributionInputSchema, type AttributionInput } from "@bbcare/core";
import { recordAttribution } from "@bbcare/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Hosts that count as "the BBCare website" when they appear as a referrer. */
export function ownHosts(req?: Request): string[] {
  const hosts = new Set<string>();
  try { hosts.add(new URL(env().BBCARE_BASE_URL).host.toLowerCase()); } catch {}
  for (const h of [req?.headers.get("x-forwarded-host"), req?.headers.get("host")]) if (h) hosts.add(h.split(",")[0]!.trim().toLowerCase());
  return [...hosts];
}

export async function consentFromCookie(): Promise<"essential" | "analytics"> {
  const raw = (await cookies()).get("bbcare_consent")?.value ?? "";
  return decodeURIComponent(raw).endsWith(":analytics") ? "analytics" : "essential";
}

/** Validate a client-supplied attribution object; anything malformed is treated as absent. */
export function parseAttribution(raw: unknown): AttributionInput | null {
  const parsed = attributionInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function storeAttribution(req: Request, subject: { sessionId?: string | null; caseId?: string | null }, raw: unknown) {
  return recordAttribution(db(), subject, parseAttribution(raw), { ownHosts: ownHosts(req), consent: await consentFromCookie() });
}
