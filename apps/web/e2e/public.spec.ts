import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptEssentialOnly, expectNoHorizontalScroll } from "./helpers";

test.describe("public site", () => {
  test("redirects to a locale and renders the home page in English and Malay", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(en|ms)$/);
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1, name: /How can we help you today\?/ })).toBeVisible();
    await acceptEssentialOnly(page);
    await page.getByRole("link", { name: /Bahasa Melayu/ }).click();
    await expect(page).toHaveURL(/\/ms$/);
    await expect(page.getByRole("heading", { level: 1, name: /membantu anda hari ini\?/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ms");
    await expectNoHorizontalScroll(page);
  });

  test("search finds guides and resolves models", async ({ page }) => {
    await page.goto("/en");
    await acceptEssentialOnly(page);
    await page.getByLabel("Search guides and models").fill("NB-AX3000 wifi slow");
    await page.getByRole("button", { name: "Search", exact: true }).first().click();
    await expect(page.getByRole("link", { name: /NB-AX3000: slow Wi-Fi/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Nimbus NB-AX3000/ }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("search with no results offers help", async ({ page }) => {
    await page.goto("/en/search?q=printer+paper+jam");
    await expect(page.getByText("No guides matched your search.")).toBeVisible();
  });

  test("article shows safety warning, sources and feedback", async ({ page }) => {
    await page.goto("/en/articles/laptop-battery-not-charging");
    await acceptEssentialOnly(page);
    await expect(page.getByRole("heading", { level: 1, name: "Laptop battery not charging" })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "Safety warning" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await page.getByTestId("feedback-yes").click();
    await expect(page.getByRole("status")).toHaveText("Thank you for your feedback.");
    await expectNoHorizontalScroll(page);
  });

  test("model page lists guides and verified products with referral links", async ({ page }) => {
    await page.goto("/en/models/kestrel-air-14");
    await expect(page.getByRole("heading", { level: 1, name: "Kestrel Air 14 (Gen 3)" })).toBeVisible();
    const link = page.getByRole("link", { name: "View on Shopee" }).first();
    await expect(link).toHaveAttribute("href", /^\/go\/r\/[0-9a-f-]{36}$/);
    await expectNoHorizontalScroll(page);
  });

  test("troubleshooting flow reaches an outcome", async ({ page }) => {
    await page.goto("/en/flows/no-internet");
    await acceptEssentialOnly(page);
    await page.getByRole("button", { name: "No, it is off or red" }).click();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await expect(page.getByText("This needs a closer look.")).toBeVisible();
  });

  test("unknown pages return 404", async ({ page }) => {
    const res = await page.goto("/en/does-not-exist");
    expect(res?.status()).toBe(404);
  });

  for (const path of ["/en", "/ms/routers", "/en/articles/router-no-internet", "/en/support", "/ms/privacy"]) {
    test(`has no serious accessibility violations: ${path}`, async ({ page }) => {
      await page.goto(path);
      await acceptEssentialOnly(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      await expectNoHorizontalScroll(page);
    });
  }
});
