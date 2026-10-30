import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import postgres from "postgres";
import { createUser, PASSWORD } from "../../tests/e2e/admin-helpers";

// Takes the screenshots used by the admin guide (docs/admin-guide/img). Local throwaway database only.
const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Guide screenshots: local Postgres only");

const OUT = "docs/admin-guide/img";
const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82, fullPage });

/** Opens a page, waits for it to settle and takes its screenshot. */
async function capture(page: Page, path: string, name: string, fullPage = false) {
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot(page, name, fullPage);
}

/** Opens the first item linked from a list table and screenshots it. */
async function captureFirst(page: Page, listPath: string, name: string, fullPage = false) {
  await page.goto(listPath);
  const link = page.locator("table tbody a").first();
  await link.click();
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shot(page, name, fullPage);
}

test("admin guide screenshots", async ({ page }) => {
  // Sign in: password, two-step setup, recovery codes.
  const address = await createUser("super_admin");
  const db = postgres(url);
  await db`update users set name = 'Trust Admin' where email = ${address}`;
  await db.end();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(PASSWORD);
  await shot(page, "signin-1-login");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  await shot(page, "signin-2-setup");
  const key = (await page.locator("code").first().textContent())!.replace(/\s/g, "");
  await page.getByLabel(/6-digit code/).fill(new TOTP({ secret: Secret.fromBase32(key) }).generate());
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await shot(page, "signin-3-recovery");
  await page.getByRole("button", { name: /I have saved my codes/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Welcome/ })).toBeVisible();

  // Something to show: sample content, two offline donations and a team member.
  await page.goto("/admin/content/sample");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Load sample content" }).click();
  // It downloads 20 sample photos, so it can take a few minutes.
  await expect(page.getByText(/Sample content loaded/)).toBeVisible({ timeout: 280_000 });
  for (const [mode, amount, name, ref] of [
    ["cheque", "2500", "Asha Patel", "445566"],
    ["upi_offline", "750", "Ravi Kumar", "UPI123456"],
  ] as const) {
    await page.goto("/admin/donations/new");
    await page.locator("#offline-mode").selectOption(mode);
    await page.locator("#offline-amount").fill(amount);
    await page.locator("#offline-name").fill(name);
    await page.locator("#offline-email").fill(`${name.split(" ")[0]!.toLowerCase()}@example.com`);
    await page.locator("#offline-phone").fill("9876543210");
    const instrument = page.locator("#offline-instrumentRef");
    if (await instrument.count()) await instrument.fill(ref);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Save and issue receipt" }).click();
    await expect(page.getByText(/Offline donation recorded/)).toBeVisible();
  }
  await page.goto("/admin/content/team/new");
  await page.locator("#team-member-status").selectOption("published");
  await page.getByLabel("Show on the About page").check();
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText(/Team member added/)).toBeVisible();
  await page.locator("#team-member-text-name").fill("Munira Shoaib");
  await page.locator("#team-member-text-designation").fill("Founder Trustee");
  const editor = page.getByRole("textbox", { name: "Details", exact: true });
  await editor.click();
  await editor.pressSequentially("Founded the Trust to support education and health in Chennai.");
  await page.getByLabel(/Reviewed by a person/).check();
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  // Every module.
  await capture(page, "/admin", "dashboard");
  await capture(page, "/admin/account", "account");
  await capture(page, "/admin/donations", "donations-list");
  await capture(page, "/admin/donations/new", "donations-new", true);
  await captureFirst(page, "/admin/donations", "donations-detail", true);
  await capture(page, "/admin/donors", "donors-list");
  await captureFirst(page, "/admin/donors", "donors-detail");
  await capture(page, "/admin/reports", "reports");
  await capture(page, "/admin/content/pages", "pages-list");
  await capture(page, "/admin/content/pages/about?lang=en", "pages-about");
  await capture(page, "/admin/content/pages/home?lang=en", "pages-home");
  await capture(page, "/admin/content/causes", "causes-list");
  await captureFirst(page, "/admin/content/causes", "causes-edit");
  await capture(page, "/admin/content/events", "events-list");
  await captureFirst(page, "/admin/content/events", "events-edit");
  await capture(page, "/admin/content/news", "news-list");
  await captureFirst(page, "/admin/content/news", "news-edit");
  await capture(page, "/admin/content/testimonials", "testimonials-list");
  await capture(page, "/admin/content/testimonials/new", "testimonials-new");
  await capture(page, "/admin/content/team", "team-list");
  await captureFirst(page, "/admin/content/team", "team-edit");
  await capture(page, "/admin/content/gallery", "gallery-list");
  await captureFirst(page, "/admin/content/gallery", "gallery-edit");
  await capture(page, "/admin/content/documents", "documents-list");
  await capture(page, "/admin/content/documents/new", "documents-new");
  await capture(page, "/admin/content/media", "media-list");
  await capture(page, "/admin/content/menus", "menus");
  await capture(page, "/admin/content/messages", "messages");
  await capture(page, "/admin/content/sample", "sample");
  await capture(page, "/admin/settings/organization", "settings-organization");
  await capture(page, "/admin/settings/seo", "settings-seo");
  await capture(page, "/admin/settings/appearance", "settings-appearance");
  await capture(page, "/admin/settings/payments", "settings-payments");
  await capture(page, "/admin/settings/email", "settings-email");
  await capture(page, "/admin/settings/receipts", "settings-receipts");
  await capture(page, "/admin/users", "users");
  await capture(page, "/admin/audit-log", "audit-log");
  // The public Team page, as visitors see it.
  await capture(page, "/en/team", "public-team");
});
