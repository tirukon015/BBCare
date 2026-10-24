import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptEssentialOnly, expectNoHorizontalScroll } from "./helpers";

const MODELS = [
  ["TP-Link Archer AX20", "AX20"], ["TP-Link EX510", "EX5"], ["TP-Link EX230V", "EX2"], ["TP-Link EX820V", "EX8"],
  ["TP-Link EB431V", "EB4"], ["Kaon AR2140", "KAO"], ["Huawei LG-8245-X6", "HUA"],
] as const;

test.describe("router support journey", () => {
  test("catalogue shows exactly the seven models, codes and no fictional models", async ({ page }) => {
    await page.goto("/en/routers");
    await acceptEssentialOnly(page);
    const cards = page.getByTestId("router-model");
    await expect(cards).toHaveCount(7);
    for (const [i, [name, ecr]] of MODELS.entries()) {
      await expect(cards.nth(i)).toContainText(name);
      await expect(cards.nth(i)).toContainText(ecr);
    }
    await expect(page.locator("main")).not.toContainText(/Nimbus|Kestrel|sample/i);
    // No photo is verified yet, so none is shown.
    await expect(page.getByTestId("image-pending")).toHaveCount(7);
    await expectNoHorizontalScroll(page);
  });

  test("home lists the router models and laptop support is gone", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("router-model")).toHaveCount(7);
    await expect(page.getByRole("navigation", { name: "Main" })).not.toContainText("Laptop");
    expect((await page.goto("/en/laptops"))?.status()).toBe(404);
  });

  test("model page shows name, code, identity note and both modes", async ({ page }) => {
    await page.goto("/en/routers/huawei-lg-8245-x6");
    await expect(page.getByTestId("model-name")).toHaveText("Huawei LG-8245-X6");
    await expect(page.getByTestId("model-ecr")).toHaveText("HUA");
    await expect(page.getByRole("note")).toContainText("LG8245X6-10");
    await expect(page.getByTestId("mode-mesh")).toBeVisible();
    await expect(page.getByTestId("mode-ap")).toBeVisible();
  });

  test("own words in Malay are matched, unverified problem asks questions and escalates with follow-up", async ({ page }) => {
    await page.goto("/ms/routers/kaon-ar2140/mesh");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Atau terangkan masalah/).fill("mesh tak boleh pair");
    await page.getByRole("button", { name: "Cari masalah saya" }).click();
    await expect(page.getByTestId("scenario-matches").getByTestId("scenario-mesh_pairing")).toBeVisible();
    await page.getByTestId("scenario-matches").getByTestId("scenario-mesh_pairing").click();
    await expect(page.getByTestId("scenario-title")).toHaveText("Pairing mesh tidak berjaya");
    await expect(page.getByTestId("not-verified")).toContainText("Kami tidak akan meneka");
    await expect(page.getByTestId("no-secrets")).toBeVisible();
    // Only the questions for this problem are asked.
    for (const q of ["unit_role", "link_type", "distance", "reset_done"]) await expect(page.getByTestId(`intake-${q}`)).toBeVisible();
    await expect(page.getByTestId("intake-page_result")).toHaveCount(0);
    await page.getByTestId("intake-unit_role").getByLabel("Unit kedua").check();
    await page.getByTestId("intake-link_type").getByLabel("Wi-Fi sahaja").check();
    await page.getByLabel("Nama").fill("Pelanggan Ujian");
    await page.getByRole("radio", { name: "E-mel" }).check();
    await page.getByRole("textbox", { name: "E-mel" }).fill("pelanggan@example.com");
    await page.getByLabel("Butiran (pilihan)").fill("kata laluan: rahsia123 tolong bantu");
    await page.getByLabel(/Saya bersetuju/).check();
    await page.getByTestId("escalation-submit").click();
    await expect(page.getByTestId("escalation-success")).toContainText(/BBC-\d{4}-\d{6}/);
    await expect(page.getByTestId("escalation-success")).toContainText("membuang sesuatu");
    const reference = (await page.getByTestId("case-reference").innerText()).trim();
    const code = (await page.getByTestId("case-code").innerText()).trim();

    await page.goto("/ms/support/case");
    await page.getByLabel("Nombor rujukan").fill(reference);
    await page.getByLabel("Kod susulan").fill(code);
    await page.getByTestId("case-lookup").click();
    await expect(page.getByTestId("case-status")).toHaveText("Diterima");
    await page.getByLabel("Tambah mesej untuk pasukan kami").fill("Sudah cuba sekali lagi, masih gagal");
    await page.getByTestId("case-send").click();
    await expect(page.getByTestId("case-view")).toContainText("Sudah cuba sekali lagi");
    await expectNoHorizontalScroll(page);
  });

  test("a wrong follow-up code reveals nothing", async ({ request }) => {
    const res = await request.post("/api/public/cases/status", { data: { reference: "BBC-2026-000001", code: "wrong-code-123" } });
    expect(res.status()).toBe(404);
  });

  test("verified guide shows expected results, warns before a reset, cites sources and escalates on failure", async ({ page }) => {
    await page.goto("/en/routers/tp-link-ex230v/ap");
    await acceptEssentialOnly(page);
    await expect(page.getByTestId("scenario-ap_enable")).toContainText("Verified guide");
    await expect(page.getByTestId("scenario-ap_no_internet")).toContainText("Staff help");
    await page.getByTestId("scenario-ap_enable").click();
    await expect(page.getByTestId("step-prompt")).toHaveText("[Test fixture] Step one.");
    await expect(page.getByTestId("step-expected")).toContainText("You see the result of step one.");
    await expect(page.getByTestId("flow-sources")).toContainText("E2E test fixture source");
    await expect(page.getByTestId("flow-sources")).toContainText("Section 1");
    await page.getByRole("button", { name: "Done, next step" }).click();
    await expect(page.getByTestId("step-warning")).toContainText("This erases settings.");
    await expect(page.getByRole("button", { name: "That fixed it" })).toBeDisabled();
    await page.getByTestId("destructive-ack").check();
    await expect(page.getByRole("button", { name: "That fixed it" })).toBeEnabled();
    await page.getByRole("button", { name: "Still not working" }).click();
    await expect(page.getByRole("heading", { name: "Let our team help" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("Malay verified guide is in Malay", async ({ page }) => {
    await page.goto("/ms/routers/tp-link-ex230v/ap/ap_enable");
    await expect(page.getByTestId("step-prompt")).toHaveText("[Fixture ujian] Langkah satu.");
  });

  test("support assistant links router problems into the journey", async ({ page }) => {
    await page.goto("/en/support?model=kaon-ar2140");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Describe the problem/).fill("mesh cannot pair with WPS");
    await page.getByTestId("support-send").click();
    await expect(page.getByTestId("router-suggestion").getByRole("link")).toHaveAttribute("href", "/en/routers/kaon-ar2140/mesh/mesh_pairing");
  });

  for (const path of ["/en/routers/kaon-ar2140", "/ms/routers/kaon-ar2140/ap", "/en/routers/kaon-ar2140/mesh/mesh_pairing", "/en/support/case"]) {
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
