import { expect, test } from "@playwright/test";
import { acceptEssentialOnly, expectNoHorizontalScroll } from "./helpers";

test.describe("global floating AI assistant", () => {
  test("launcher is on customer pages, opens, minimises, closes and reopens without leaving the page", async ({ page }) => {
    await page.goto("/en");
    await acceptEssentialOnly(page);
    const launcher = page.getByTestId("assistant-launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\/en$/);
    await expect(panel.getByRole("heading", { name: "BBCare AI Assistant" })).toBeVisible();
    await expect(page.getByTestId("assistant-disclosure")).toContainText("AI assistant, not a person");
    // Without a router the assistant asks for one instead of guessing.
    await expect(page.getByTestId("assistant-no-router")).toContainText("I need your router model");
    await page.getByTestId("assistant-minimise").click();
    await expect(page.getByTestId("assistant-body")).toHaveCount(0);
    await page.getByTestId("assistant-minimise").click();
    await expect(page.getByTestId("assistant-body")).toBeVisible();
    await page.getByTestId("assistant-close").click();
    await expect(panel).toHaveCount(0);
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(panel).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("carries the selected router, ECR identifier and problem into the chat and uses the shared support API", async ({ page }) => {
    await page.goto("/en/routers/tp-link-ex510/mesh/mesh_pairing");
    await acceptEssentialOnly(page);
    await page.getByTestId("assistant-launcher").click();
    const ctx = page.getByTestId("assistant-context");
    await expect(ctx).toContainText("TP-Link EX510");
    await expect(ctx).toContainText("ECR EX5");
    await expect(ctx).toContainText("Mesh Connection");
    await expect(ctx).toContainText("Mesh pairing does not work");
    // The same session and message endpoints as the full support page, with the journey context attached.
    const created = page.waitForRequest((r) => r.url().endsWith("/api/public/support/sessions") && r.method() === "POST");
    const message = page.waitForRequest((r) => /\/api\/public\/support\/sessions\/[^/]+\/messages$/.test(r.url()) && r.method() === "POST");
    await page.getByTestId("assistant-panel").getByPlaceholder("Type your question").fill("second unit cannot pair");
    await page.getByTestId("assistant-panel").getByTestId("support-send").click();
    expect((await created).postDataJSON()).toMatchObject({ locale: "en", model: "tp-link-ex510" });
    expect((await message).postDataJSON()).toMatchObject({ text: "second unit cannot pair", context: { mode: "mesh", scenario: "mesh_pairing" } });
    const log = page.getByTestId("assistant-log");
    await expect(log.getByText("second unit cannot pair")).toBeVisible();
    await expect(log.locator("li").nth(1)).toBeVisible();
    // Switching router pages updates the context; no second router selection is needed.
    await page.getByTestId("assistant-close").click();
    await page.goto("/ms/routers/kaon-ar2140/mesh");
    await page.getByTestId("assistant-launcher").click();
    await expect(page.getByTestId("assistant-context")).toContainText("ECR KAO");
    await expect(page.getByTestId("assistant-disclosure")).toContainText("bukan manusia");
  });

  test("inline entry points on the router page open the same panel", async ({ page }) => {
    await page.goto("/en/routers/huawei-lg-8245-x6/mesh");
    await acceptEssentialOnly(page);
    await page.getByTestId("open-assistant").click();
    await expect(page.getByTestId("assistant-panel")).toBeVisible();
    await expect(page.getByTestId("assistant-context")).toContainText("ECR HUA");
  });

  test("launcher does not cover the send button of the full support page or the escalation form", async ({ page }) => {
    await page.goto("/en/support?model=kaon-ar2140");
    await acceptEssentialOnly(page);
    const send = page.getByTestId("support-send");
    await send.scrollIntoViewIfNeeded();
    const a = await send.boundingBox();
    const b = await page.getByTestId("assistant-launcher").boundingBox();
    expect(a && b && (a.x + a.width <= b.x || a.y + a.height <= b.y || a.y >= b.y + b.height)).toBe(true);
  });
});
