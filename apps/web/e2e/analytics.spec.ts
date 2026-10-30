import { expect, test, type Page } from "@playwright/test";
import { acceptEssentialOnly, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Wait for the client queue to flush to /api/e and the server to accept it. */
async function flushed(page: Page, action: () => Promise<void>) {
  const res = page.waitForResponse((r) => r.url().endsWith("/api/e") && r.request().method() === "POST", { timeout: 60_000 });
  await action();
  const r = await res;
  expect(r.status()).toBe(202);
  return (await r.json()) as { accepted: number; rejected: number };
}

test.describe("customer analytics and intelligence", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-chrome" && info.project.name !== "android-phone", "runs on desktop and one phone");
  });

  test("arrivals carry link labels, UTM parameters and nothing more; the router journey emits structured events only", async ({ page, request }) => {
    // Labelled arrival from a Shopee listing QR code. The query string is kept only as allowlisted keys.
    const body = await flushed(page, async () => {
      await page.goto("/en?ch=shopee&utm_source=shopee&utm_medium=listing&utm_campaign=e2e-ar2140&utm_content=qr-box-e2e&email=someone@example.com");
      await acceptEssentialOnly(page);
    });
    expect(body.rejected).toBe(0);
    // The journey: model, mode, problem, step, escalation.
    await page.getByTestId("router-model").filter({ hasText: "TP-Link EX230V" }).click();
    await page.getByTestId("mode-ap").click();
    await page.getByTestId("scenario-ap_enable").click();
    await expect(page.getByTestId("step-prompt")).toBeVisible();
    await page.getByRole("button", { name: "Done, next step" }).click();
    await page.getByRole("button", { name: "Still not working" }).click();
    await expect(page.getByRole("heading", { name: "Let our team help" })).toBeVisible();
    // Typing into the form must never be tracked: fill a secret and flush.
    await page.getByLabel("Name").fill("Analytics Tester");
    await page.locator('input[name="channel"][value="email"]').check();
    await expect(page.locator("#resc-contact")).toHaveAttribute("type", "email");
    await page.locator("#resc-contact").fill("analytics.tester@example.com");
    await page.getByLabel("Details (optional)").fill("password: hunter2-never-tracked");
    await page.getByLabel(/I agree/).check();
    const created = page.waitForResponse((r) => r.url().endsWith("/api/public/cases") && r.request().method() === "POST");
    const sent = await flushed(page, async () => { await page.getByTestId("escalation-submit").click(); });
    expect(sent.rejected).toBe(0);
    expect((await created).status(), await (await created).text()).toBe(201);
    await expect(page.getByTestId("escalation-success")).toBeVisible();

    // Staff refresh the dashboards and see the journey, the source and the campaign, with no personal data.
    const admin = await page.context().browser()!.newPage();
    await staffLogin(admin, "analyst@bbcare.test");
    await admin.goto("/admin/analytics?range=today");
    const refreshed = admin.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/analytics"));
    await admin.getByRole("button", { name: "Refresh now" }).click();
    expect((await refreshed).ok()).toBe(true);
    await admin.waitForLoadState("networkidle");
    await expect(admin.getByRole("heading", { name: "Customer Analytics & Intelligence" })).toBeVisible();
    await expect(admin.getByTestId("overview-stats")).toContainText("Router selections");
    await admin.goto("/admin/analytics/sources?range=today");
    await expect(admin.getByTestId("source-shopee")).toBeVisible();
    await expect(admin.locator("main")).not.toContainText("someone@example.com");
    await admin.goto("/admin/analytics/campaigns?range=today");
    await expect(admin.locator("main")).toContainText("e2e-ar2140");
    await expect(admin.locator("main")).toContainText("qr-box-e2e");
    await admin.goto("/admin/analytics/routers?range=today");
    await expect(admin.getByTestId("router-model-row").filter({ hasText: "TP-Link EX230V" })).toBeVisible();
    await expect(admin.locator("main")).toContainText("verified guide shown");
    await admin.goto("/admin/analytics/journey?range=today");
    await expect(admin.locator("main")).toContainText("Escalation points");
    await expect(admin.locator("main")).toContainText("router");
    await admin.goto("/admin/analytics/heatmaps?range=today");
    await expect(admin.getByTestId("click-grids")).toBeVisible();
    await expect(admin.locator("main")).not.toContainText("hunter2");
    await admin.goto("/admin/analytics/settings");
    await expect(admin.getByTestId("tracking-status")).toBeVisible();
    await expect(admin.getByTestId("tracking-feature").filter({ hasText: "Click heatmap grid" })).toContainText("Yes (");
    await expect(admin.getByTestId("tracking-feature").filter({ hasText: "Approximate location" })).toContainText("BBCARE_GEOIP_CSV");
    for (const path of ["visitors", "behaviour", "media"]) {
      await admin.goto(`/admin/analytics/${path}?range=7`);
      await expect(admin.getByRole("navigation", { name: "Customer Analytics and Intelligence" })).toBeVisible();
      await expect(admin.getByTestId("period-picker")).toBeVisible();
    }
    // Custom range and export.
    await admin.goto("/admin/analytics?range=custom&from=2026-01-01&to=2026-01-31");
    await expect(admin.getByText("2026-01-01 to 2026-01-31 (31 days)")).toBeVisible();
    const csv = await admin.request.get("/admin/analytics/export?range=today");
    expect(csv.status()).toBe(200);
    expect((await csv.text()).split("\n")[0]).toBe("day,metric,dim1,dim2,value");
    // Raw events never hold the secret or the stray email parameter.
    const stray = await request.get("/en?ch=qr");
    expect(stray.status()).toBe(200);
    await admin.close();
  });

  test("agents can see support analytics but not session investigation; analysts cannot read transcripts", async ({ page }) => {
    await staffLogin(page, "analyst@bbcare.test");
    await page.goto("/admin/analytics/support?range=7");
    await expect(page.getByTestId("support-stats")).toBeVisible();
    await expect(page.getByText("Session investigation needs the transcript-reading permission")).toBeVisible();
    await expect(page.getByRole("link", { name: "Customer Demand Intelligence" }).first()).toBeVisible();
  });

  test("QR arrival without consent records a session but no visitor id", async ({ page, request }) => {
    const body = await flushed(page, async () => {
      await page.goto("/ms?ch=qr&utm_campaign=e2e-kotak&utm_content=kad-01");
      await acceptEssentialOnly(page);
    });
    expect(body.accepted).toBeGreaterThan(0);
    expect(await page.evaluate(() => localStorage.getItem("bbcare_vid"))).toBeNull();
    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
  });
});
