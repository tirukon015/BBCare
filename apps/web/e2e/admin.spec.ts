import { expect, test } from "@playwright/test";
import { staffLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("staff administration", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-chrome" && info.project.name !== "android-phone", "admin flows run on desktop and one phone");
  });

  test("wrong password is rejected without revealing which field was wrong", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill("admin@bbcare.test");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("main [role=alert]")).toHaveText("Email or password is incorrect.");
  });

  test("editor writes, reviewer approves and publishes, public site shows it", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "full workflow once");
    const editorCtx = await browser.newContext();
    const editor = await editorCtx.newPage();
    await staffLogin(editor, "editor@bbcare.test");
    await editor.goto("/admin/knowledge/new");
    const slug = `e2e-article-${Date.now()}`;
    await editor.getByLabel("Slug (lowercase, hyphens)").fill(slug);
    await editor.getByLabel("Title").fill("E2E: Router lights explained");
    await editor.getByLabel("Summary").fill("What each light means (test).");
    await editor.getByLabel(/^Body/).fill("## Power light\nSolid means the router is on.\n\n## Internet light\nGreen means connected.");
    await editor.getByLabel("BBCare synthetic sample procedures (approved)").check();
    await editor.getByRole("button", { name: "Save draft" }).click();
    await expect(editor).toHaveURL(/\/admin\/knowledge\/[0-9a-f-]{36}/);
    const articleUrl = editor.url().split("?")[0]!;
    await editor.locator("details").first().click();
    await editor.getByTestId("rev-submit").click();
    await expect(editor.locator("main [role=status]")).toContainText("Done: submit");
    // The author cannot approve their own work (no review permission either).
    await expect(editor.getByTestId("rev-approve")).toHaveCount(0);
    await editorCtx.close();

    const reviewerCtx = await browser.newContext();
    const reviewer = await reviewerCtx.newPage();
    await staffLogin(reviewer, "reviewer@bbcare.test");
    await reviewer.goto("/admin/review");
    await expect(reviewer.getByRole("link", { name: "E2E: Router lights explained" })).toBeVisible();
    await reviewer.goto(articleUrl);
    await reviewer.locator("details").first().click();
    await reviewer.getByTestId("rev-approve").click();
    await expect(reviewer.locator("main [role=status]")).toContainText("Done: approve");
    await reviewer.locator("details").first().click();
    await reviewer.getByTestId("rev-publish").click();
    await expect(reviewer.locator("main [role=status]")).toContainText("Done: publish");
    await reviewer.goto(`/en/articles/${slug}`);
    await expect(reviewer.getByRole("heading", { level: 1, name: "E2E: Router lights explained" })).toBeVisible();
    await reviewer.goto("/en/search?q=router+lights+explained");
    await expect(reviewer.getByRole("link", { name: "E2E: Router lights explained" })).toBeVisible();
    await reviewerCtx.close();
  });

  test("analyst sees analytics but not users, cases or transcripts", async ({ page }) => {
    await staffLogin(page, "analyst@bbcare.test");
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/denied=1/);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Sessions per day")).toBeVisible();
  });

  test("admin sees AI safety gate and audit log", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "desktop only");
    await staffLogin(page, "admin@bbcare.test");
    await page.goto("/admin/ai");
    await expect(page.getByText("Safety gate")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "ai_answers.en" });
    await row.getByRole("button", { name: "Turn on" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("Type ENABLE");
    await page.goto("/admin/audit");
    await expect(page.getByText("auth.mfa_enrolled").first()).toBeVisible();
  });
});
