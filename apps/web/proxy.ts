import { NextResponse, type NextRequest } from "next/server";
import { negotiateLocale } from "@bbcare/core/locale";

/**
 * Edge request handling:
 * - optional HTTP basic-auth gate for preview and staging (credentials set on the host only);
 * - locale prefixing for public pages;
 * - nonce-based Content Security Policy.
 */
function previewGate(req: NextRequest): NextResponse | null {
  const user = process.env.BBCARE_PREVIEW_USER;
  const pass = process.env.BBCARE_PREVIEW_PASSWORD;
  if (!user || !pass) return null;
  if (req.nextUrl.pathname.startsWith("/api/health")) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(":");
    if (u === user && p === pass) return null;
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="BBCare preview"' } });
}

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const gate = previewGate(req);
  if (gate) return gate;
  const { pathname } = req.nextUrl;

  const isPublicPage =
    !pathname.startsWith("/api") && !pathname.startsWith("/admin") && !pathname.startsWith("/go/") && !pathname.startsWith("/_next") && !/\.[a-z0-9]+$/i.test(pathname);
  if (isPublicPage && !/^\/(en|ms)(\/|$)/.test(pathname)) {
    const locale = negotiateLocale(req.headers.get("accept-language"));
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", policy);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)" }],
};
