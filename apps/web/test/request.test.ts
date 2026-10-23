import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { isSameOrigin, originAllowedByPattern } = await import("../src/lib/request");

const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers });

describe("same-origin check", () => {
  it("accepts same host and forwarded host", () => {
    expect(isSameOrigin(req({ origin: "http://localhost:3000" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://abc-3000.app.github.dev", "x-forwarded-host": "abc-3000.app.github.dev" }))).toBe(true);
  });
  it("rejects other origins", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://evil.example", "x-forwarded-host": "abc-3000.app.github.dev" }))).toBe(false);
  });
  it("matches wildcard patterns safely", () => {
    expect(originAllowedByPattern("abc-3000.app.github.dev", "*.app.github.dev")).toBe(true);
    expect(originAllowedByPattern("app.github.dev.evil.example", "*.app.github.dev")).toBe(false);
    expect(originAllowedByPattern("evilapp.github.dev", "*.app.github.dev")).toBe(false);
  });
});
