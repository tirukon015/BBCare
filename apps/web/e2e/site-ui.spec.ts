import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptEssentialOnly, expectNoHorizontalScroll } from "./helpers";

test.describe("customer website UI", () => {
  test("homepage: hero search, product cards, troubleshooting, routers, guides, AI entry and brand", async ({ page }) => {
    await page.goto("/en");
    await acceptEssentialOnly(page);
    await expect(page.getByRole("heading", { level: 1, name: /How can we help you today\?/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "No internet", exact: true })).toBeVisible();
    await expect(page.getByTestId("entry-laptop")).toBeVisible();
    await expect(page.getByTestId("entry-router")).toBeVisible();
    await expect(page.getByTestId("popular-issues").getByRole("link")).toHaveCount(9);
    await expect(page.getByTestId("router-model")).toHaveCount(7);
    await expect(page.getByRole("banner").getByRole("link", { name: /BBCare/ }).first()).toBeVisible();
    // Popular search term leads to the results page with the filters.
    await page.getByRole("link", { name: "Router setup", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/search\?q=Router(%20|\+)setup/);
    await expect(page.getByTestId("search-filters")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("navigation: five sections, search, AI entry, mobile menu", async ({ page }) => {
    await page.goto("/en/troubleshooting");
    await acceptEssentialOnly(page);
    await expect(page.getByRole("heading", { level: 1, name: "Troubleshooting" })).toBeVisible();
    // The header switches to the full navigation at the lg breakpoint (1024px); choose by viewport, not by project name.
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const nav = page.getByRole("navigation", { name: "Main" });
      for (const l of ["Home", "Laptops", "Routers", "Troubleshooting", "Guides"]) await expect(nav.getByRole("link", { name: l })).toBeVisible();
      await expect(page.getByRole("link", { name: "Search" })).toBeVisible();
      await page.getByTestId("header-open-assistant").click();
      await expect(page.getByTestId("assistant-panel")).toBeVisible();
    } else {
      await page.getByTestId("menu-toggle").click();
      await expect(page.getByTestId("mobile-nav").getByRole("link", { name: "Guides" })).toBeVisible();
      await page.getByTestId("mobile-nav").getByRole("link", { name: "Guides" }).click();
      await expect(page).toHaveURL(/\/en\/guides$/);
    }
    await expectNoHorizontalScroll(page);
  });

  test("router support: brands, models, problems; model page tabs lead to the mesh journey", async ({ page }) => {
    await page.goto("/en/routers");
    await acceptEssentialOnly(page);
    await expect(page.getByRole("heading", { level: 1, name: "Find your router. Get connected." })).toBeVisible();
    await expect(page.getByTestId("brand-tp-link")).toBeVisible();
    await page.getByTestId("brand-kaon").click();
    await expect(page).toHaveURL(/brand=kaon/);
    await expect(page.getByTestId("router-model")).toHaveCount(1);
    await expect(page.getByTestId("router-issues").getByTestId("issue-easymesh")).toBeVisible();
    await page.goto("/en/models/tp-link-ex510");
    await expect(page.getByTestId("model-name")).toHaveText("TP-Link EX510");
    await expect(page.getByTestId("model-ecr")).toHaveText("ECR EX5");
    await expect(page.getByTestId("model-tabs")).toContainText("FAQs");
    await page.getByTestId("model-mesh-journey").click();
    await expect(page).toHaveURL(/\/en\/routers\/tp-link-ex510\/mesh$/);
    await expectNoHorizontalScroll(page);
  });

  test("search filters split troubleshooting, guides and products; article page has reading time, feedback and AI entry", async ({ page }) => {
    await page.goto("/en/search?q=battery+not+charging");
    await acceptEssentialOnly(page);
    await expect(page.getByTestId("search-results").getByRole("link").first()).toBeVisible();
    await page.getByTestId("search-filters").getByRole("link", { name: /^Guides/ }).click();
    await expect(page).toHaveURL(/f=guides/);
    await page.goto("/en/articles/laptop-battery-not-charging");
    await expect(page.getByText(/min read/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask BBCare AI about this" })).toBeVisible();
    await expect(page.getByTestId("feedback-yes")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("floating assistant shows the BBCare identity, welcome, suggestions, timestamps and typing state", async ({ page }) => {
    await page.goto("/en/guides");
    await acceptEssentialOnly(page);
    await page.getByTestId("assistant-launcher").click();
    const panel = page.getByTestId("assistant-panel");
    await expect(panel.getByRole("heading", { name: "BBCare AI Assistant" })).toBeVisible();
    await expect(panel.getByTestId("chat-welcome")).toContainText("virtual support assistant");
    await panel.getByTestId("chat-suggestions").getByRole("button", { name: "WiFi not working" }).click();
    await expect(panel.getByTestId("assistant-log").locator("time").first()).toBeVisible();
    await expect(panel.getByTestId("assistant-log").locator("li").nth(1)).toBeVisible();
    await expect(panel.locator("img").first()).toHaveAttribute("src", /bbcare-logo-icon/);
  });

  for (const path of ["/en/laptops", "/en/troubleshooting", "/en/guides", "/en/models/kaon-ar2140", "/en/search?q=mesh"]) {
    test(`has no serious accessibility violations: ${path}`, async ({ page }) => {
      await page.goto(path);
      await acceptEssentialOnly(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      await expectNoHorizontalScroll(page);
    });
  }
});
