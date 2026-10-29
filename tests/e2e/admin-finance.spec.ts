import { expect, test, type Page } from "@playwright/test";
import {
  createUser,
  expectAccessible,
  latestEmailTo,
  newPage,
  signInFirstTime,
  uniqueEmail,
} from "./admin-helpers";

// Accountant flows (Step 8b). They write to the database: CI or `npm run db:local` only.
test.describe("admin finance", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");
  test.describe.configure({ mode: "serial" });

  // One signed-in Accountant shared by the serial tests below.
  let page: Page;
  let accountant = "";
  let donationPath = "";
  const donorEmail = uniqueEmail("donor");

  test.beforeAll(async ({ browser }) => {
    page = await newPage(browser);
  });
  test.afterAll(async () => {
    await page.context().close();
  });

  async function recordOffline(fields: Record<string, string>, mode: string) {
    await page.goto("/admin/donations/new");
    await page.locator("#offline-mode").selectOption(mode);
    for (const [name, value] of Object.entries(fields)) await page.locator(`#offline-${name}`).fill(value);
  }

  test("offline entry: cash above ₹2,000 warns and gets an acknowledgement", async () => {
    accountant = await createUser("accountant");
    await signInFirstTime(page, accountant);
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "Donations",
      "Donors",
      "Reports",
      "Causes",
      /^Messages\s*(\d+ new)?$/,
      "Audit log",
      "My account",
    ]);
    await expectAccessible(page);

    await recordOffline(
      { amount: "5000", name: "Cash Donor E2E", email: uniqueEmail("cash"), phone: "9876543210" },
      "cash",
    );
    await expect(page.getByText(/can’t get an 80G receipt/)).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expectAccessible(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Save and issue receipt" }).click();
    await expect(page.getByText(/Offline donation recorded with receipt MSWT\/ACK\//)).toBeVisible();

    await recordOffline(
      {
        amount: "2500",
        name: "Cheque Donor E2E",
        email: donorEmail,
        phone: "9876500000",
        instrumentRef: "445566",
      },
      "cheque",
    );
    await page.getByRole("button", { name: "Save and issue receipt" }).click();
    await expect(page.getByText(/Offline donation recorded with receipt MSWT\/ACK\//)).toBeVisible();
    donationPath = new URL(page.url()).pathname;
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectAccessible(page);
  });

  test("find it, resend, then reissue with PAN as an 80G receipt", async () => {
    await page.goto(`/admin/donations?q=${encodeURIComponent(donorEmail)}`);
    const link = page.getByRole("link", { name: "Cheque Donor E2E" });
    await expect(link).toBeVisible();
    await expectAccessible(page);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${donationPath}$`));

    await page.getByRole("button", { name: "Resend receipt" }).click();
    await expect(page.getByText("Receipt emailed again.")).toBeVisible();

    await page.locator("#reissue-wants80g").check();
    await page.locator("#reissue-pan").fill("ABCPE1234F");
    await page.locator("#reissue-line1").fill("12 MG Road");
    await page.locator("#reissue-city").fill("Pune");
    await page.locator("#reissue-state").fill("Maharashtra");
    await page.locator("#reissue-pincode").fill("411001");
    await page.locator("#reissue-reason").fill("Donor sent PAN for 80G");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Reissue receipt" }).click();
    await expect(page.getByText(/New receipt MSWT\/\d{4}-\d{2}\/\d{6} issued/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem").getByText("Void", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem").getByText("80G", { exact: true })).toBeVisible();
    await expect(page.getByText(/receipt\.reissue by E2E accountant/)).toBeVisible();
  });

  test("full PAN needs the emailed code; CSV and Excel downloads", async () => {
    await page.goto(donationPath);
    await expect(page.getByText("XXXXXX234F", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/We emailed a 6-digit code/)).toBeVisible();
    const code = latestEmailTo(accountant)?.subject.match(/(\d{6})$/)?.[1];
    expect(code).toBeTruthy();
    await page.getByLabel("Code from the email").fill(code!);
    await page.getByRole("button", { name: "Show full PANs" }).click();
    await expect(page.getByText(/Full PANs are visible until/)).toBeVisible();
    await page.reload();
    await expect(page.getByText("ABCPE1234F", { exact: true })).toBeVisible();

    for (const format of ["csv", "xlsx"]) {
      const res = await page.request.get(
        `/admin/donations/export?q=${encodeURIComponent(donorEmail)}&format=${format}`,
      );
      expect(res.status(), format).toBe(200);
      expect(res.headers()["cache-control"]).toContain("no-store");
      const body = await res.body();
      if (format === "csv") expect(body.toString()).toContain("ABCPE1234F");
      else expect(body.subarray(0, 2).toString()).toBe("PK");
    }
    const report = await page.request.get(`/admin/reports/register?fy=${currentFy()}&format=csv`);
    expect(report.status()).toBe(200);
    expect((await report.body()).toString()).toContain("Cheque Donor E2E");

    for (const path of ["/admin", "/admin/reports", "/admin/donors"]) {
      await page.goto(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expectAccessible(page);
    }
  });

  test("a Content Editor can't reach finance pages or downloads", async ({ page: editorPage }) => {
    await signInFirstTime(editorPage, await createUser("content_editor"));
    for (const path of ["/admin/donations", "/admin/donations/new", "/admin/donors", "/admin/reports"]) {
      await editorPage.goto(path);
      await expect(editorPage.getByRole("heading", { name: /don’t have access/ }), path).toBeVisible();
    }
    for (const path of [
      "/admin/donations/export?format=csv",
      `/admin/reports/register?fy=${currentFy()}&format=csv`,
    ]) {
      const res = await editorPage.request.get(path);
      expect(res.status(), path).toBe(403);
    }
  });
});

function currentFy(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const y = ist.getUTCMonth() + 1 >= 4 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
