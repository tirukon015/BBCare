import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
import { expect, type Page } from "@playwright/test";
import { totp } from "@bbcare/core";

interface State { password: string; secrets?: Record<string, string>; steps?: Record<string, number> }
const statePath = join(here, ".e2e-state.json");
const readState = (): State => JSON.parse(readFileSync(statePath, "utf8")) as State;

export function seedPassword(): string {
  return readState().password;
}

/** TOTP secrets of test accounts are kept in the per-run state file so every worker can sign in. */
const secrets = {
  get: (email: string) => readState().secrets?.[email],
  set: (email: string, secret: string) => {
    const st = readState();
    writeFileSync(statePath, JSON.stringify({ ...st, secrets: { ...st.secrets, [email]: secret } }), { mode: 0o600 });
  },
};
const lastStep = {
  get: (email: string) => readState().steps?.[email],
  set: (email: string, step: number) => {
    const st = readState();
    writeFileSync(statePath, JSON.stringify({ ...st, steps: { ...st.steps, [email]: step } }), { mode: 0o600 });
  },
};

/** Wait until a fresh 30-second TOTP step so a code is never reused (replay protection). */
async function freshCode(email: string): Promise<string> {
  const secret = secrets.get(email)!;
  let step = Math.floor(Date.now() / 30_000);
  while (lastStep.get(email) !== undefined && step <= lastStep.get(email)!) {
    await new Promise((r) => setTimeout(r, 1000));
    step = Math.floor(Date.now() / 30_000);
  }
  lastStep.set(email, step);
  return totp(secret);
}

/** Sign in a seed staff user, enrolling TOTP on first use. */
export async function staffLogin(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(seedPassword());
  await page.getByRole("button", { name: "Continue" }).click();
  const heading = page.getByRole("heading", { level: 1, name: /two-factor authentication/i });
  await expect(heading).toBeVisible();
  if ((await heading.innerText()).startsWith("Set up")) {
    const key = (await page.locator("p.font-mono").first().innerText()).trim();
    secrets.set(email, key);
    await page.getByLabel("6-digit code").fill(await freshCode(email));
    await page.getByRole("button", { name: /Turn on two-factor/ }).click();
    await expect(page.getByRole("heading", { name: "Two-factor authentication is on" })).toBeVisible();
    await page.getByRole("link", { name: "Continue to admin" }).click();
  } else {
    await page.getByLabel("Code").fill(await freshCode(email));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(1);
}

/** Choose "Essential only" when the banner is shown. The banner renders after hydration, so wait for it unless a choice is already stored. */
export async function acceptEssentialOnly(page: Page) {
  const chosen = (await page.context().cookies()).some((c) => c.name === "bbcare_consent");
  if (chosen) return;
  const reject = page.getByTestId("consent-reject");
  await reject.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (await reject.isVisible().catch(() => false)) await reject.click();
}
