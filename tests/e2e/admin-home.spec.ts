import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createUser, expectAccessible, latestEmailTo, newPage, signInFirstTime } from "./admin-helpers";

// Settings → Payments → quick donate box on Home, and Settings → Email → Send summary now.
// Desktop only: both change shared settings, so the two admin projects must not race, and the
// tests in this file run one after the other.
test.describe.configure({ mode: "serial" });
test("the Home donate box switch and Send summary now", async ({ page, isMobile }) => {
  test.skip(isMobile, "changes shared settings; runs once");
  const db = postgres(process.env.DATABASE_URL!);
  const rows = await db<{ recipients: string[] }[]>`
    select admin_alert_recipients as recipients from email_settings limit 1`;
  if (!rows.length) await db`insert into email_settings default values`;
  const recipients = rows[0]?.recipients ?? [];
  try {
    await signInFirstTime(page, await createUser("super_admin"));

    await page.goto("/admin/settings/payments");
    const box = page.getByLabel("Show the quick donate box on Home");
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    // The cached page refreshes in the background: the change shows within a load or two.
    const home = await newPage(page.context().browser()!);
    await expect(async () => {
      await home.goto("/en");
      await expect(home.getByRole("region", { name: "Donate now" })).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(home.locator("h1")).toHaveCount(1);

    await box.check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await expect(async () => {
      await home.goto("/en");
      await expect(home.getByRole("region", { name: "Donate now" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    await db`update email_settings set admin_alert_recipients = ${["e2e-alerts@example.com"]}`;
    await page.goto("/admin/settings/email");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Send yesterday's summary now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Summary sent" })).toBeVisible();

    await page.goto("/admin/audit-log");
    await expect(page.getByRole("cell", { name: "email.summary_sent" }).first()).toBeVisible();
  } finally {
    await db`update email_settings set admin_alert_recipients = ${recipients}`;
    await db.end();
  }
});

// Settings → Payments → Bank transfer, UPI and cheque: shown on Donate and linked from Contact,
// and every change is emailed to the alert recipients.
test("bank details: entered by the Super Admin, shown on Donate, alert sent", async ({ page, isMobile }) => {
  test.skip(isMobile, "changes shared settings; runs once");
  const db = postgres(process.env.DATABASE_URL!);
  const rows = await db<{ recipients: string[] }[]>`
    select admin_alert_recipients as recipients from email_settings limit 1`;
  if (!rows.length) await db`insert into email_settings default values`;
  const recipients = rows[0]?.recipients ?? [];
  const alerts = "e2e-bank-alerts@example.com";
  await db`update email_settings set admin_alert_recipients = ${[alerts]}`;
  try {
    await signInFirstTime(page, await createUser("super_admin"));
    await page.goto("/admin/settings/payments");
    await page.getByLabel("Account name").fill("Munira Shoaib Welfare Trust");
    await page.getByLabel("Account number").fill("1234 5678 9012");
    await page.getByLabel("IFSC").fill("SBIN000123");
    await page.getByLabel("UPI ID").fill("mswt@sbi");
    await page.getByLabel("Cheque / DD in favour of").fill("Munira Shoaib Welfare Trust");
    await page.getByLabel("Show these details on the site").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#pay-bankIfsc-error")).toContainText("11-character IFSC");
    await page.getByLabel("IFSC").fill("sbin0001234");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await expect(async () => {
      const mail = latestEmailTo(alerts);
      expect(mail?.subject).toMatch(/^\[MSWT\] \[Bank details\] Changed by/);
      expect(mail?.text).toContain("XXXXXXXX9012");
      expect(mail?.text).not.toContain("123456789012");
    }).toPass({ timeout: 10_000 });

    const site = await newPage(page.context().browser()!);
    const section = site.getByRole("region", { name: "Bank transfer, UPI or cheque" });
    await expect(async () => {
      await site.goto("/en/donate");
      await expect(section).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(section.getByText("123456789012", { exact: true })).toBeVisible();
    await expect(section.getByText("SBIN0001234", { exact: true })).toBeVisible();
    await expect(section.getByRole("img", { name: /UPI ID mswt@sbi/ })).toBeVisible();
    await expect(section.getByRole("button", { name: "Copy the Account number" })).toBeVisible();
    await expect(section.getByText(/can.t accept foreign contributions/)).toBeVisible();
    // Bank details stay out of the structured data.
    expect(await site.locator('script[type="application/ld+json"]').allTextContents()).not.toContain(
      expect.stringContaining("123456789012"),
    );
    await expectAccessible(site);
    await site.goto("/en/contact");
    await expect(site.getByRole("link", { name: "Donate by bank transfer, UPI or cheque" })).toHaveAttribute(
      "href",
      "/en/donate#bank-transfer",
    );

    await page.getByLabel("Show these details on the site").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await expect(async () => {
      await site.goto("/en/donate");
      await expect(section).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  } finally {
    await db`update payment_settings set bank_details_public = false`;
    await db`update email_settings set admin_alert_recipients = ${recipients}`;
    await db.end();
  }
});
