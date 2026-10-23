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
/** Hosts allowed by BBCARE_ALLOWED_ORIGINS, e.g. "*.app.github.dev" for Codespaces previews. */
export function originAllowedByPattern(host: string, patterns = process.env.BBCARE_ALLOWED_ORIGINS ?? ""): boolean {
  return patterns
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .some((p) => (p.startsWith("*.") ? host.endsWith(p.slice(1)) && host.length > p.length - 1 : host === p));
}

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = new URL(origin).host.toLowerCase();
    // Behind a forwarding proxy (Nginx, Cloudflare, Codespaces) the public host arrives in
    // X-Forwarded-Host / Host. Browsers cannot set these on cross-site requests without a
    // preflight, which these endpoints do not allow.
    const candidates = [new URL(req.url).host, req.headers.get("x-forwarded-host"), req.headers.get("host")]
      .filter((h): h is string => !!h)
      .map((h) => h.split(",")[0]!.trim().toLowerCase());
    return candidates.includes(host) || origin === process.env.BBCARE_BASE_URL || originAllowedByPattern(host);
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
