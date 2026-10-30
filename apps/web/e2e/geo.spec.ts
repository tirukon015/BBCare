import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoHorizontalScroll, staffLogin } from "./helpers";

/**
 * The geographic pipeline end to end: synthetic events arrive from RFC 5737 test addresses, the
 * server resolves them against the test geolocation fixture (state for everyone, city only with
 * analytics consent), the rollup aggregates them, the admin API returns them and the map shows them.
 * No real addresses are involved anywhere.
 */
const base = { occurred_at: new Date().toISOString(), page_path: "/en", locale: "en" };
const ua = { "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36" };

function events(session: string, names: string[], extra: Record<string, unknown> = {}) {
  return names.map((name, i) => ({ ...base, ...extra, event_id: crypto.randomUUID(), occurred_at: new Date(Date.now() - 60_000 + i * 1000).toISOString(), session_id: session, name, page_type: "home", props: name === "page_view" ? { landing: true } : {} }));
}

test.describe("geographic analytics pipeline", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop-chrome", "one browser is enough for the pipeline"); });

  test("events from Malaysian test addresses are aggregated by state, cities only with consent, unknown stays unknown", async ({ request, page }) => {
    const stamp = Date.now().toString(36);
    const post = (ip: string, consent: "analytics" | "essential", body: unknown) =>
      request.post("/api/e", { data: body, headers: { ...ua, "x-forwarded-for": ip, cookie: `bbcare_consent=2026-10%3A${consent}` } });
    // Selangor: two sessions, one consented (city allowed), one essential (state only).
    let r = await post("198.51.100.10", "analytics", { events: events(`geo${stamp}sel1xxxxxxxxx`, ["session_started", "page_view", "router_model_selected"]).map((e) => (e.name === "router_model_selected" ? { ...e, props: { model_id: "00000000-0000-0000-0000-000000000000", ecr: "EX5" } } : e)) });
    expect(r.status()).toBe(202);
    r = await post("198.51.100.20", "essential", { events: events(`geo${stamp}sel2xxxxxxxxx`, ["session_started", "page_view"]) });
    expect(r.status()).toBe(202);
    // Kuala Lumpur, Singapore and an address outside every range.
    for (const [ip, sid] of [["192.0.2.33", "kl1"], ["203.0.113.5", "sg1"], ["233.252.0.9", "unk1"]] as const) {
      r = await post(ip, "essential", { events: events(`geo${stamp}${sid}xxxxxxxxxx`, ["session_started", "page_view"]) });
      expect(r.status()).toBe(202);
    }
    // Duplicate delivery of the same event ids must not double count.
    const dup = events(`geo${stamp}dupxxxxxxxxxxx`, ["session_started", "page_view"]);
    expect((await post("198.51.100.30", "essential", { events: dup })).status()).toBe(202);
    expect(await (await post("198.51.100.30", "essential", { events: dup })).json()).toMatchObject({ accepted: 2 });

    await staffLogin(page, "analyst@bbcare.test");
    await page.goto("/admin/analytics?range=today");
    const refreshed = page.waitForResponse((x) => x.request().method() === "POST" && x.url().includes("/admin/analytics"));
    await page.getByRole("button", { name: "Refresh now" }).click();
    expect((await refreshed).ok()).toBe(true);

    // Admin API: Selangor has three sessions (two plus the duplicate-delivered one), the city appears once, the unknown share is counted.
    const api = await page.request.get("/api/admin/analytics/geo?range=today");
    expect(api.status()).toBe(200);
    const summary = (await api.json()) as { states: { code: string; sessions: number; router: number }[]; unknownSessions: number; countries: { country: string; sessions: number }[]; geo: { configured: boolean; ranges: number } };
    expect(summary.geo).toEqual({ configured: true, ranges: 4 });
    const selangor = summary.states.find((s) => s.code === "MY-10")!;
    expect(selangor.sessions).toBeGreaterThanOrEqual(3);
    expect(selangor.router).toBeGreaterThanOrEqual(1);
    expect(summary.states.find((s) => s.code === "MY-14")!.sessions).toBeGreaterThanOrEqual(1);
    expect(summary.countries.find((c) => c.country === "SG")?.sessions).toBeGreaterThanOrEqual(1);
    expect(summary.unknownSessions).toBeGreaterThanOrEqual(1);
    const detail = await page.request.get("/api/admin/analytics/geo?range=today&region=MY-10");
    const d = (await detail.json()) as { cities: { label: string; value: number }[]; name: string };
    expect(d.name).toBe("Selangor");
    expect(d.cities.find((c) => c.label === "Shah Alam")?.value).toBe(1);
    expect(d.cities.some((c) => c.label === "George Town")).toBe(false);

    // The map: states render, the busiest state is shaded, clicking it shows the drill-down.
    await page.goto("/admin/analytics/geo?range=today");
    await expect(page.getByTestId("malaysia-map")).toBeVisible();
    await expect(page.locator("[data-testid^=geo-state-]")).toHaveCount(16);
    await expect(page.getByTestId("geo-state-MY-10")).toHaveAttribute("data-band", /[0-4]/);
    await expect(page.getByTestId("geo-state-MY-09")).toHaveAttribute("data-band", "-1");
    await expect(page.getByTestId("geo-legend")).toContainText("Highest");
    await page.getByTestId("geo-state-MY-10").click();
    await expect(page.getByTestId("geo-detail")).toContainText("Selangor");
    await expect(page.getByTestId("geo-detail")).toContainText("Router selections");
    await expect(page.getByTestId("geo-detail")).toContainText("Shah Alam");
    await page.getByTestId("geo-back").click();
    await expect(page.getByTestId("geo-detail")).toHaveCount(0);
    await expect(page.getByTestId("geo-row-MY-10")).toContainText("Selangor");
    // Accessibility of the map page: no serious or critical WCAG violations, no horizontal scroll.
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expectNoHorizontalScroll(page);
    // Raw addresses never reach the page.
    await expect(page.locator("main")).not.toContainText("198.51.100");
  });

  test("a period with no data shows the honest empty state and other roles cannot read geography", async ({ page }) => {
    await staffLogin(page, "analyst@bbcare.test");
    await page.goto("/admin/analytics/geo?range=custom&from=2025-01-01&to=2025-01-07");
    await expect(page.getByTestId("geo-empty")).toHaveText("No geographic visitor data available yet.");
    await expect(page.getByTestId("geo-state-MY-10")).toHaveAttribute("data-band", "-1");
    // The audit log records state drill-downs.
    await page.request.get("/api/admin/analytics/geo?range=today&region=MY-14");
    await page.context().clearCookies();
    await staffLogin(page, "agent@bbcare.test");
    expect((await page.request.get("/api/admin/analytics/geo?range=today")).status()).toBe(403);
    await page.goto("/admin/analytics/geo");
    await expect(page).toHaveURL(/denied=1/);
    await page.context().clearCookies();
    await staffLogin(page, "admin@bbcare.test");
    await page.goto("/admin/audit");
    await expect(page.getByText("analytics.geo.region").first()).toBeVisible();
  });
});
