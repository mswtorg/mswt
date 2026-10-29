import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createUser, expectAccessible, signInFirstTime } from "./admin-helpers";

// Settings → Receipts: build the receipt PDFs and email. Desktop only: it changes shared settings.
test("receipt templates can be edited, previewed, checked and reset", async ({ page, isMobile }) => {
  test.skip(isMobile, "changes shared settings; runs once");
  const db = postgres(process.env.DATABASE_URL!);
  try {
    await signInFirstTime(page, await createUser("super_admin"));
    await page.goto("/admin/settings/receipts");
    await expect(page.getByRole("heading", { name: "Receipts", level: 1 })).toBeVisible();
    await expect(page.getByText("This is the built-in template.")).toBeVisible();
    await expectAccessible(page);

    // Removing the donor PAN row from the 80G receipt is refused.
    await expect(page.locator("#receipt-80g-blocks-6-value")).toHaveValue("{donor.pan}");
    await page.getByRole("button", { name: "Remove block 7" }).click();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.locator("#receipt-80g-summary")).toContainText("An 80G receipt must show: Donor PAN");

    // Acknowledgement: edit the closing line with a field, add a block, preview, save.
    await page.goto("/admin/settings/receipts?tab=acknowledgement");
    const closing = page.locator("#receipt-acknowledgement-blocks-15-text");
    await expect(closing).toHaveValue(/no goods or services/);
    await closing.fill("Thank you, ");
    await page.getByLabel("Insert field into Block 16: text").selectOption("donor.name");
    await expect(closing).toHaveValue("Thank you, {donor.name}");
    await page
      .getByRole("group", { name: "Add a block at the end" })
      .getByRole("combobox")
      .selectOption("footer");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const footers = page.getByLabel(/footer text$/);
    await footers.last().fill("Registered charity {trust.name}");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Preview" }).click();
    const file = await (await download).path();
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page.getByRole("status").filter({ hasText: "Sample PDF downloaded" })).toBeVisible();
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
