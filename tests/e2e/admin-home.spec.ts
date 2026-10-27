import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createUser, expectAccessible, newPage, signInFirstTime } from "./admin-helpers";

// Settings → Payments → quick donate box on Home, and Settings → Email → Send summary now.
// Desktop only: both change shared settings, so the two admin projects must not race.
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
