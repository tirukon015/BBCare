import { expect, test } from "@playwright/test";

test.describe("security controls", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-chrome", "API checks run once");
  });

  test("sets security headers including a nonce CSP", async ({ request }) => {
    const res = await request.get("/en");
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("admin pages require authentication", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("support API rejects cross-origin and token-less access", async ({ request }) => {
    const cross = await request.post("/api/public/support/sessions", { data: { locale: "en" }, headers: { origin: "https://evil.example" } });
    expect(cross.status()).toBe(403);
    const created = await request.post("/api/public/support/sessions", { data: { locale: "en" }, headers: { origin: "http://localhost:3100" } });
    expect(created.status()).toBe(201);
    const { sessionId } = (await created.json()) as { sessionId: string };
    const ok = await request.post(`/api/public/support/sessions/${sessionId}/messages`, { data: { text: "wifi slow" }, headers: { origin: "http://localhost:3100" } });
    expect(ok.status()).toBe(200);
    const stolen = await request.post(`/api/public/support/sessions/${sessionId}/messages`, { data: { text: "x" }, headers: { origin: "http://localhost:3100", cookie: "bbcare_support=forged.token" } });
    expect(stolen.status()).toBe(404);
  });

  test("event endpoint rejects unknown properties and server-only events", async ({ request }) => {
    const base = { event_id: crypto.randomUUID(), occurred_at: new Date().toISOString(), session_id: "abcdefghijklmnop1234", page_path: "/en", locale: "en" };
    const res = await request.post("/api/e", {
      data: { events: [{ ...base, name: "page_view", props: { keystrokes: "secret" } }, { ...base, event_id: crypto.randomUUID(), name: "shopee_outbound_click", props: {} }] },
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120" },
    });
    expect(res.status()).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0, rejected: 2 });
  });

  test("referral redirect only resolves known recommendations", async ({ request }) => {
    const res = await request.get("/go/r/00000000-0000-0000-0000-000000000000", { maxRedirects: 0 });
    expect(res.status()).toBe(410);
    const bad = await request.get("/go/r/https%3A%2F%2Fevil.example", { maxRedirects: 0 });
    expect(bad.status()).toBe(410);
  });

  test("health endpoints report status without detail leakage", async ({ request }) => {
    expect((await request.get("/api/health")).status()).toBe(200);
    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
    expect(Object.keys(await ready.json())).toEqual(["status", "migrations", "routerModels"]);
  });
});

test.describe("rate limiting", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-chrome", "once");
  });
  test("support session creation is rate limited per client", async ({ request }) => {
    // The e2e server scales limits by 50, so the session bucket holds 500 tokens for this client IP.
    let limited = false;
    for (let i = 0; i < 600 && !limited; i++) {
      const res = await request.post("/api/public/support/sessions", { data: { locale: "en" }, headers: { origin: "http://localhost:3100", "x-forwarded-for": "198.51.100.77" } });
      if (res.status() === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});
