import { expect, test } from "@playwright/test";
import { acceptEssentialOnly, expectNoHorizontalScroll } from "./helpers";

test.describe("support assistant (search-first, AI off)", () => {
  test("answers with verified guides and discloses that AI is not used", async ({ page }) => {
    await page.goto("/en/support");
    await acceptEssentialOnly(page);
    await expect(page.getByRole("note").filter({ hasText: "does not use AI right now" })).toBeVisible();
    await page.getByLabel(/Describe the problem/).fill("NB-AX3000 wifi slow upstairs");
    await page.getByTestId("support-send").click();
    await expect(page.getByRole("link", { name: /NB-AX3000: slow Wi-Fi/ })).toBeVisible();
    await expect(page.getByText("Your model:")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("asks which model when ambiguous", async ({ page }) => {
    await page.goto("/en/support");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Describe the problem/).fill("kestrel");
    await page.getByTestId("support-send").click();
    await expect(page.getByText("Which model do you have?")).toBeVisible();
    await page.getByTestId("clarify-option").filter({ hasText: "Kestrel Air 14" }).click();
    await expect(page.getByText("Kestrel Air 14 (Gen 3)").first()).toBeVisible();
  });

  test("Malay question gets Malay guidance", async ({ page }) => {
    await page.goto("/ms/support");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Terangkan masalah/).fill("laptop sy xleh cas");
    await page.getByTestId("support-send").click();
    await expect(page.getByRole("link", { name: /Bateri laptop tidak mengecas/ })).toBeVisible();
  });

  test("escalation creates a case reference", async ({ page }) => {
    await page.goto("/en/support");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Describe the problem/).fill("router keeps rebooting every hour");
    await page.getByTestId("support-send").click();
    await expect(page.locator("ol[aria-live] li").nth(1)).toBeVisible();
    await page.getByTestId("escalate-open").click();
    await page.getByLabel("Name").fill("Test Customer");
    await page.getByLabel("Email", { exact: true }).check().catch(() => {});
    await page.getByRole("radio", { name: "Email" }).check();
    await page.getByRole("textbox", { name: "Email" }).fill("customer@example.com");
    await page.getByLabel(/agree that BBTech.shop/).check();
    await page.getByTestId("escalation-submit").click();
    await expect(page.getByTestId("escalation-success")).toContainText(/BBC-\d{4}-\d{6}/);
  });
});
