import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { createUser, expectAccessible, signInFirstTime } from "./admin-helpers";

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const previewSrc = (page: Page) =>
  page.getByTitle("Receipt preview (PDF)").getAttribute("src", { timeout: 15_000 });

// Settings → Receipts on a phone: read-only (opens the page), checks nothing runs off the side.
test("the receipt builder fits a phone screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await signInFirstTime(page, await createUser("super_admin"));
  await page.goto("/admin/settings/receipts");
  await expect(page.getByTitle("Receipt preview (PDF)")).toBeAttached({ timeout: 15_000 });
  await page.getByRole("button", { name: "Edit block 1", exact: true }).click();
  expect(await noSidewaysScroll(page)).toBe(true);
});

// Settings → Receipts: build the receipt PDFs and email. Desktop only: it changes shared settings.
test("receipt templates can be edited, previewed, checked and reset", async ({ page, isMobile }) => {
  test.skip(isMobile, "changes shared settings; runs once");
  const db = postgres(process.env.DATABASE_URL!);
  try {
    await signInFirstTime(page, await createUser("super_admin"));
    await page.goto("/admin/settings/receipts");
    await expect(page.getByRole("heading", { name: "Receipts", level: 1 })).toBeVisible();
    await expect(page.getByText("This is the built-in template.")).toBeVisible();
    // The sample PDF shows beside the blocks, and nothing runs off the side.
    expect(await previewSrc(page)).toMatch(/^blob:/);
    expect(await noSidewaysScroll(page)).toBe(true);
    await expectAccessible(page);

    // Removing the donor PAN row from the 80G receipt is refused.
    const blocks = page.locator("#receipt-80g-blocks > li");
    await expect(blocks.nth(6)).toContainText("Detail line");
    await expect(blocks.nth(6)).toContainText("Donor PAN: [Donor PAN (masked)]");
    await page.getByRole("button", { name: "Edit block 7" }).click();
    await expect(page.locator("#receipt-80g-blocks-6-value")).toHaveValue("{donor.pan}");
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.getByRole("button", { name: "Remove block 7" }).click();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.locator("#receipt-80g-summary")).toContainText("An 80G receipt must show: Donor PAN");

    // Acknowledgement: edit the closing line with a field, add a block, preview, save.
    await page.goto("/admin/settings/receipts?tab=acknowledgement");
    const before = await previewSrc(page);
    await page.getByRole("button", { name: "Edit block 16" }).click();
    const closing = page.locator("#receipt-acknowledgement-blocks-15-text");
    await expect(closing).toHaveValue(/no goods or services/);
    await closing.fill("Thank you, ");
    await page.getByLabel("Insert field into Block 16, paragraph: Text").selectOption("donor.name");
    await expect(closing).toHaveValue("Thank you, {donor.name}");
    // The preview follows the edit.
    await expect.poll(() => previewSrc(page), { timeout: 15_000 }).not.toBe(before);
    await page.getByRole("group", { name: "Add a block" }).getByRole("combobox").selectOption("footer");
    await page.getByRole("button", { name: "Add after block 16" }).click();
    await page.locator("#receipt-acknowledgement-blocks-16-text").fill("Registered charity {trust.name}");
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    const file = await (await download).path();
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    const [row] = await db<{ blocks: { text?: string }[] }[]>`select pdf_ack as blocks from receipt_settings`;
    expect(JSON.stringify(row?.blocks)).toContain("Thank you, {donor.name}");
    await page.reload();
    await expect(page.getByText("This template has been edited.")).toBeVisible();
    await expectAccessible(page);

    // Email: edit the Hindi subject, preview it (axe runs before the sandboxed preview frame is shown).
    await page.goto("/admin/settings/receipts?tab=email");
    await expectAccessible(page);
    await page.getByRole("button", { name: "हिन्दी" }).click();
    const subject = page.getByLabel("Subject", { exact: true }).first();
    await subject.fill("रसीद {receipt.number}");
    await page.getByRole("button", { name: "Preview" }).first().click();
    await expect(page.getByText("Subject: रसीद MSWT/2026-27/000123")).toBeVisible();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    const [email] = await db<{ email: Record<string, Record<string, { subject: string }>> }[]>`
      select email from receipt_settings`;
    expect(email?.email["80g"]?.hi?.subject).toBe("रसीद {receipt.number}");
    expect(email?.email["80g"]?.en).toBeUndefined();

    // Reset puts back the built-in acknowledgement.
    await page.goto("/admin/settings/receipts?tab=acknowledgement");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reset to the built-in template" }).click();
    await expect(page.getByRole("status").filter({ hasText: "built-in template is back" })).toBeVisible();
    const [after] = await db<{ ack: unknown }[]>`select pdf_ack as ack from receipt_settings`;
    expect(after?.ack).toBeNull();
  } finally {
    await db`update receipt_settings set pdf_80g = null, pdf_ack = null, email = null`;
    await db.end();
  }
});
