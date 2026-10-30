import { expect, test } from "@playwright/test";
import { acceptEssentialOnly, staffLogin } from "./helpers";

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
    await expect(reviewer.getByRole("link", { name: "E2E: Router lights explained" }).first()).toBeVisible();
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
    await expect(reviewer.getByRole("link", { name: "E2E: Router lights explained" }).first()).toBeVisible();
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

test.describe("historical import (synthetic export)", () => {
  test("stages, scrubs, and promotes to an unverified source", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "desktop only");
    const run = Date.now().toString(36);
    const title = `Router keeps dropping ${run}`;
    const exportJson = [
      { id: `synthetic-1-${run}`, title, create_time: 1700000000, current_node: "b", mapping: {
        a: { id: "a", parent: null, message: { author: { role: "user" }, content: { content_type: "text", parts: [`My router NB-AX3000 drops wifi at night (${run}). Email me test@example.com`] } } },
        b: { id: "b", parent: "a", message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Try changing the wifi channel."] } } } } },
      { id: `synthetic-2-${run}`, title: "Holiday plans", current_node: "x", mapping: { x: { id: "x", parent: null, message: { author: { role: "user" }, content: { content_type: "text", parts: ["Where to go in Penang?"] } } } } },
    ];
    await staffLogin(page, "admin@bbcare.test");
    await page.goto("/admin/imports");
    await page.locator('input[name="file"]').setInputFiles({ name: "conversations.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exportJson)) });
    await page.getByLabel(/owner has authorised/).check();
    await page.getByRole("button", { name: "Stage import" }).click();
    await expect(page).toHaveURL(/\/admin\/imports\/[0-9a-f-]{36}/);
    await expect(page.getByText(title)).toBeVisible();
    await page.getByText("Show conversation").click();
    await expect(page.getByText("[email]")).toBeVisible();
    await expect(page.getByText("test@example.com")).toHaveCount(0);
    await page.getByRole("button", { name: "Promote to unverified source" }).click();
    // Wait for the server action to finish: the record leaves the "valid" list once promoted.
    await expect(page.getByText(title)).toHaveCount(0);
    await page.goto(`${page.url().split("?")[0]}?status=promoted`);
    await expect(page.getByText(title)).toBeVisible();
    await page.goto("/admin/knowledge/sources");
    const row = page.getByRole("row").filter({ hasText: `Historical chat: ${title}` });
    await expect(row).toContainText("pending");
    await expect(row).toContainText("unverified");
  });
});

test.describe("router support administration", () => {
  test("router coverage, verification guard and router case context", async ({ browser, request }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "once");
    const created = await request.post("/api/public/cases", { data: {
      locale: "en", name: "Router Tester", channel: "email", contact: "router.tester@example.com", subject: "Kaon AR2140 (KAO): Mesh pairing does not work", consent: true,
      router: { model: "KAO", mode: "mesh", scenario: "mesh_pairing", answers: { unit_role: "second", link_type: "cable", injected: "x" }, outcome: "not_verified" },
    } });
    expect(created.status()).toBe(201);
    const { reference, followUpCode } = (await created.json()) as { reference: string; followUpCode: string };
    expect(followUpCode.length).toBeGreaterThan(8);

    const reviewerCtx = await browser.newContext();
    const reviewer = await reviewerCtx.newPage();
    await staffLogin(reviewer, "reviewer@bbcare.test");
    await reviewer.goto("/admin/routers");
    for (const code of ["AX20", "EX5", "EX2", "EX8", "EB4", "KAO", "HUA"]) await expect(reviewer.locator("main")).toContainText(code);
    await expect(reviewer.locator("main")).toContainText("Needs BBTech confirmation");
    await expect(reviewer.getByRole("link", { name: "Live" })).toHaveCount(1);
    await reviewer.goto("/admin/flows");
    await reviewer.getByRole("link", { name: "Mesh pairing does not work" }).first().click();
    await expect(reviewer.getByTestId("flow-verification")).toBeVisible();
    await reviewer.getByLabel(/What did you check/).fill("Maxis manual, all pages, checked against steps");
    await reviewer.getByRole("button", { name: /mark verified/ }).click();
    await expect(reviewer.locator("main [role=alert]")).toContainText(/source|PERLU TERJEMAHAN/);
    await expect(reviewer.getByRole("button", { name: "Publish" })).toBeVisible();
    await reviewer.getByRole("button", { name: "Publish" }).click();
    await expect(reviewer.locator("main [role=alert]")).toBeVisible();
    await reviewerCtx.close();

    const agentCtx = await browser.newContext();
    const agent = await agentCtx.newPage();
    await staffLogin(agent, "agent@bbcare.test");
    await agent.goto("/admin/cases");
    await agent.getByRole("link", { name: reference }).click();
    await expect(agent.getByTestId("case-router")).toContainText("Kaon AR2140 (KAO)");
    await expect(agent.getByTestId("case-router")).toContainText("Mesh pairing does not work");
    await expect(agent.getByTestId("case-router")).toContainText("Ethernet cable");
    await expect(agent.getByTestId("case-router")).not.toContainText("injected");
    await agent.getByLabel("Assign to me").check();
    await agent.getByRole("button", { name: "Save", exact: true }).click();
    await expect(agent.getByText(/assigned by Amir Agent/)).toBeVisible();
    await agent.waitForLoadState("networkidle");
    await agent.locator("textarea[name=reply]").fill("Please try the cable once more and tell us the light colour.");
    await agent.getByRole("button", { name: "Send to customer" }).click();
    await expect(agent.getByText("Current: Please try the cable once more")).toBeVisible();
    await agentCtx.close();

    const status = await request.post("/api/public/cases/status", { data: { reference, code: followUpCode } });
    expect(status.status()).toBe(200);
    const view = (await status.json()) as { status: string; customerNote: string };
    expect(view.status).toBe("open");
    expect(view.customerNote).toContain("light colour");
  });
});
test.describe("customer demand intelligence", () => {
  test("records demand with provenance and channel, shows it to authorised staff, fulfils it with an approved resource", async ({ browser, request, page }, info) => {
    test.skip(info.project.name !== "desktop-chrome", "once");
    // A customer arrives from a Shopee link, describes the problem in Malay and escalates.
    await page.goto("/ms/routers/kaon-ar2140/mesh?ch=shopee");
    await acceptEssentialOnly(page);
    await page.getByLabel(/Atau terangkan masalah/).fill("ada video tak tunjuk cara pair mesh kaon");
    await page.getByRole("button", { name: "Cari masalah saya" }).click();
    await page.getByTestId("scenario-matches").getByTestId("scenario-mesh_pairing").click();
    await page.getByLabel("Nama").fill("Demand Tester");
    await page.getByRole("radio", { name: "E-mel" }).check();
    await page.getByRole("textbox", { name: "E-mel" }).fill("demand.tester@example.com");
    await page.getByLabel("Butiran (pilihan)").fill("boleh tunjuk video pairing? password wifi saya abc123");
    await page.getByLabel(/Saya bersetuju/).check();
    await page.getByTestId("escalation-submit").click();
    const reference = (await page.getByTestId("case-reference").innerText()).trim();

    // A second customer with no attribution at all, from the API, asks the same thing in English.
    const created = await request.post("/api/public/cases", { data: {
      locale: "en", name: "Second Tester", channel: "email", contact: "second.tester@example.com", subject: "Kaon AR2140 (KAO): Mesh pairing does not work", description: "show me a video please", consent: true,
      router: { model: "KAO", mode: "mesh", scenario: "mesh_pairing", answers: {}, outcome: "not_verified" },
    } });
    expect(created.status()).toBe(201);

    // Analyst: aggregates yes, original questions no.
    const analystCtx = await browser.newContext();
    const analyst = await analystCtx.newPage();
    await staffLogin(analyst, "analyst@bbcare.test");
    await analyst.goto("/admin/demand");
    await expect(analyst.getByTestId("demand-stats")).toContainText("Missing resources");
    const row = analyst.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Shopee");
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(analyst.locator("main")).not.toContainText("tunjuk cara pair");
    // Filters narrow the table.
    await analyst.goto("/admin/demand?type=document");
    await expect(analyst.getByTestId("demand-row")).toHaveCount(0);
    await analyst.goto("/admin/demand?locale=ms&type=video");
    await expect(analyst.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" })).toBeVisible();
    await analystCtx.close();

    // Reviewer (transcripts permission): sees the original questions, scrubbed, with case links and channels; cannot approve own upload later.
    const editorCtx = await browser.newContext();
    const editor = await editorCtx.newPage();
    await staffLogin(editor, "editor@bbcare.test");
    await editor.goto("/admin/demand");
    await expect(editor.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" })).toBeVisible();
    // The editor lacks the transcripts permission: the requirement is plain text, not a link.
    await expect(editor.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" }).getByRole("link")).toHaveCount(0);
    await editorCtx.close();

    const agentCtx = await browser.newContext();
    const agent = await agentCtx.newPage();
    await staffLogin(agent, "agent@bbcare.test");
    await agent.goto("/admin/demand");
    await expect(agent.getByRole("heading", { name: /Customer Demand Intelligence/ })).toHaveCount(0);
    await agentCtx.close();

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await staffLogin(admin, "admin@bbcare.test");
    await admin.goto("/admin/demand?locale=ms&type=video");
    await admin.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" }).getByRole("link").click();
    await expect(admin.getByTestId("demand-summary")).toContainText("Kaon AR2140 (KAO)");
    await expect(admin.getByTestId("demand-summary")).toContainText("Shopee 1");
    const requests = admin.getByTestId("demand-requests");
    await expect(requests).toContainText("ada video tak tunjuk cara pair mesh kaon");
    await expect(requests).not.toContainText("abc123");
    await expect(requests).toContainText("[removed]");
    await expect(requests.getByRole("link", { name: reference })).toBeVisible();
    await expect(requests).toContainText("Typed description");
    await expect(requests).toContainText("Support request");
    // The English request is a separate requirement.
    await admin.goto("/admin/demand?locale=en&type=video");
    await expect(admin.getByTestId("demand-row").filter({ hasText: "Video in English: Kaon AR2140, Mesh pairing" })).toContainText("Unknown");

    // Upload a video for the Malay requirement (admin), then approve as reviewer (different person).
    await admin.goto("/admin/demand?locale=ms&type=video");
    await admin.getByTestId("demand-row").filter({ hasText: "Video in Malay: Kaon AR2140, Mesh pairing" }).getByRole("link").click();
    await admin.waitForURL(/\/admin\/demand\/[0-9a-f-]{36}/);
    const detailUrl = admin.url().split("?")[0]!;
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(16)]);
    await admin.getByTestId("resource-upload").locator("input[type=file]").setInputFiles({ name: "pairing.mp4", mimeType: "video/mp4", buffer: mp4 });
    await admin.getByLabel("Title (English)").fill("Pairing a second AR2140 (test fixture)");
    await admin.getByLabel("Title (Malay)").fill("Memasangkan AR2140 kedua (fixture ujian)");
    await admin.getByRole("button", { name: "Upload for review" }).click();
    await expect(admin.getByTestId("demand-summary")).toContainText("under review");
    await expect(admin.getByTestId("demand-resources").getByRole("button", { name: "Approve" })).toBeDisabled();
    await adminCtx.close();

    const reviewerCtx = await browser.newContext();
    const reviewer = await reviewerCtx.newPage();
    await staffLogin(reviewer, "reviewer@bbcare.test");
    // The reviewer has no transcripts permission, so the detail page (customer questions) is refused;
    // approval happens in the resource library.
    await reviewer.goto(detailUrl);
    await expect(reviewer.getByTestId("demand-requests")).toHaveCount(0);
    await reviewer.goto("/admin/resources?status=under_review");
    const libRow = reviewer.getByRole("row").filter({ hasText: "Pairing a second AR2140 (test fixture)" });
    await libRow.getByRole("button", { name: "Approve" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Saved");
    await reviewer.goto("/admin/resources?status=approved");
    await expect(reviewer.getByRole("row").filter({ hasText: "Pairing a second AR2140 (test fixture)" })).toBeVisible();
    await reviewerCtx.close();

    // History is preserved after fulfilment and the demand is now approved.
    const adminCtx2 = await browser.newContext();
    const admin2 = await adminCtx2.newPage();
    await staffLogin(admin2, "admin@bbcare.test");
    await admin2.goto(detailUrl);
    await expect(admin2.getByTestId("demand-summary")).toContainText("approved");
    await expect(admin2.getByTestId("demand-requests")).toContainText("ada video tak tunjuk cara pair mesh kaon");
    await adminCtx2.close();

    // The customer now sees the approved video on the scenario page, and a new identical request is not recorded as missing.
    await page.goto("/ms/routers/kaon-ar2140/mesh/mesh_pairing");
    await expect(page.getByTestId("resource-video")).toContainText("Memasangkan AR2140 kedua");
    const media = await request.get(page.url().replace(/\/ms\/.*$/, "") + (await page.getByTestId("resource-video").locator("source").getAttribute("src")));
    expect(media.status()).toBe(200);
    expect(media.headers()["content-type"]).toBe("video/mp4");
  });
});
