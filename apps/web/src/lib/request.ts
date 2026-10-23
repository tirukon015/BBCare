import "server-only";
import { headers } from "next/headers";

/**
 * Client IP from the reverse proxy. Only the first X-Forwarded-For hop set by our own Nginx or
 * Cloudflare is trusted. The IP is used transiently (rate limiting, geo lookup) and never
 * stored in analytics.
 */
export function clientIpFrom(h: Headers): string {
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() ?? "0.0.0.0";
}

export async function requestInfo() {
  const h = await headers();
  return { ip: clientIpFrom(h), userAgent: h.get("user-agent") ?? "", requestId: h.get("x-request-id") ?? crypto.randomUUID() };
}

/** Same-origin check for state-changing JSON endpoints (defence in depth with SameSite cookies). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === new URL(req.url).host || origin === process.env.BBCARE_BASE_URL;
  } catch {
    return false;
  }
}

export async function readJson(req: Request, maxBytes = 32_768): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new Error("payload_too_large");
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("payload_too_large");
  return JSON.parse(text);
}

export function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
}
