import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const LOCALES = ["en", "hi", "mr", "gu"] as const;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  // Let entrance animations finish: mid-fade text would be measured with reduced contrast.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

for (const locale of LOCALES) {
  test(`/${locale}/donate renders, is accessible and offers DonateAction`, async ({ page }) => {
    const res = await page.goto(`/${locale}/donate`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("h1")).toHaveCount(1);
    // 3 or 4 suggested amounts (payment_settings rule).
    expect(await page.locator('input[name="preset"]').count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('input[name="preset"]').count()).toBeLessThanOrEqual(4);
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ld).toContain('"DonateAction"');
    await page.locator("#donate-wants80g").check();
    await expect(page.locator("#donate-pan")).toBeVisible();
    await expectAccessible(page);
  });

  test(`/${locale}/donate/thank-you is noindex and handles an unknown order`, async ({ page }) => {
    await page.goto(`/${locale}/donate/thank-you?order=MSWT-AAAAAAAAAAAAAAAA`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // The outcome heading replaces "Confirming…" and takes focus (it's localised, so not matched by text).
    await expect(page.locator("h1[tabindex='-1']")).toBeFocused();
    await expect(page.locator("h1")).toHaveCount(1);
    await expectAccessible(page);
  });
}

test("the donate form reports missing details next to each field", async ({ page }) => {
  await page.goto("/en/donate");
  await page.locator("#donate-wants80g").check();
  await page.getByRole("button", { name: /Donate ₹/ }).click();
  const summary = page.getByRole("alert").filter({ hasText: "Please fix the following" });
  await expect(summary).toBeFocused();
  for (const id of ["name", "email", "phone", "pan", "line1", "pincode", "citizen"])
    await expect(page.locator(`#donate-${id}`)).toHaveAttribute("aria-invalid", "true");
  // City and state are optional, even for an 80G receipt.
  for (const id of ["city", "state"])
    await expect(page.locator(`#donate-${id}`)).not.toHaveAttribute("aria-invalid", "true");
  // An error must not untick the 80G box (React resets a form after its action runs).
  await expect(page.locator("#donate-wants80g")).toBeChecked();
  await summary.getByRole("link", { name: "Enter your full name." }).click();
  await expect(page.locator("#donate-name")).toBeFocused();
});

test("above the PAN amount (₹1,000 by default) the 80G box is ticked and locked", async ({ page }) => {
  await page.goto("/en/donate");
  const custom = page.locator("#donate-custom");
  const box = page.locator("#donate-wants80g");
  const pan = page.locator("#donate-pan");
  await custom.fill("1000");
  await expect(box).not.toBeChecked();
  await expect(box).toBeEnabled();
  await expect(pan).toHaveCount(0);
  await custom.fill("5000");
  await expect(box).toBeChecked();
  await expect(box).toBeDisabled();
  await expect(page.getByText("Donations above ₹1,000 always get an 80G receipt")).toBeVisible();
  await expect(pan).toBeVisible();
  await expect(page.locator("#donate-line1")).toBeVisible();
  await page.getByRole("button", { name: /Donate ₹/ }).click();
  await expect(pan).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#donate-pan-error")).toContainText(
    "Enter your PAN: it is needed for donations above ₹1,000.",
  );
  for (const id of ["line1", "pincode"])
    await expect(page.locator(`#donate-${id}`)).toHaveAttribute("aria-invalid", "true");
  // Still ticked and locked after the server's answer.
  await expect(box).toBeChecked();
  await expect(box).toBeDisabled();
  await pan.fill("abcpe1234f");
  await pan.press("Tab");
  await expect(pan).not.toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page);
  // Back under the limit: the box is free again (and was not ticked by the donor).
  await custom.fill("500");
  await expect(box).toBeEnabled();
});

test("fields are checked as they are left, and the message clears once fixed", async ({ page }) => {
  await page.goto("/en/donate");
  const phone = page.locator("#donate-phone");
  await phone.fill("12345");
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toHaveCount(0); // not while typing
  await phone.press("Tab");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toBeVisible();
  await phone.fill("98765 43210");
  await expect(phone).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a 10-digit Indian mobile number.")).toHaveCount(0);

  await page.locator("#donate-wants80g").check();
  const pan = page.locator("#donate-pan");
  await pan.fill("ABCDE1234F"); // 4th letter D is not a PAN holder type
  await pan.press("Tab");
  await expect(page.getByText("Enter a valid PAN, for example ABCPE1234F.")).toBeVisible();
  await pan.fill("abcpe1234f");
  await expect(page.getByText("Enter a valid PAN, for example ABCPE1234F.")).toHaveCount(0);

  // Fields nobody has reached yet stay quiet; no summary until Donate is pressed.
  await expect(page.locator("#donate-name")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Please fix the following")).toHaveCount(0);
  await expectAccessible(page);
});

test("the contact form checks the email when it is left", async ({ page }) => {
  await page.goto("/en/contact");
  const email = page.locator("#contact-email");
  await email.fill("someone@");
  await email.press("Tab");
  await expect(page.getByText("Enter an email address in the format name@example.com")).toBeVisible();
  await email.fill("someone@example.com");
  await expect(page.getByText("Enter an email address in the format name@example.com")).toHaveCount(0);
  await expectAccessible(page);
});

test("payment APIs are never cached and refuse bad input", async ({ request }) => {
  const status = await request.get("/api/donations/MSWT-AAAAAAAAAAAAAAAA/status");
  expect(status.status()).toBe(404);
  expect(status.headers()["cache-control"]).toContain("no-store");
  expect(status.headers()["x-robots-tag"]).toContain("noindex");
  expect(
    (await request.post("/api/webhooks/cashfree", { data: { type: "PAYMENT_SUCCESS_WEBHOOK" } })).status(),
  ).toBe(401);
  expect((await request.get("/api/receipts/MSWT-AAAAAAAAAAAAAAAA?e=1&t=x")).status()).toBe(403);
  expect((await request.get("/api/cron/reconcile")).status()).toBe(401);
});

// ── Full payment flows with the fake gateway (PAYMENT_PROVIDER=fake). They write to the database,
// so they run only in CI, whose Postgres is thrown away after the run.
test.describe("payment flows", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");

  async function startDonation(page: Page, amount = "750") {
    await page.goto("/en/donate");
    await page.locator("#donate-custom").fill(amount);
    await page.locator("#donate-name").fill("E2E Donor");
    await page
      .locator("#donate-email")
      .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`);
    await page.locator("#donate-phone").fill("9876543210");
    await page.locator("#donate-citizen").check();
    // Cloudflare's test site key passes immediately; wait for the widget to write its token.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? "",
        ),
      )
      .not.toBe("");
    await page.getByRole("button", { name: `Donate ₹${amount}` }).click();
    await expect(page.getByRole("heading", { name: "Fake payment gateway" })).toBeVisible();
    return new URL(page.url()).searchParams.get("order")!;
  }

  test("success: the webhook confirms and the receipt downloads", async ({ page, request }) => {
    await startDonation(page);
    await page.getByRole("button", { name: "Pay (webhook now)" }).click();
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible();
    const receipt = page.getByRole("region", { name: "Your receipt" });
    await expect(receipt.getByText(/^MSWT\/ACK\/\d{4}-\d{2}\/\d{6}$/)).toBeVisible();
    await expect(receipt.getByText("Acknowledgement", { exact: true })).toBeVisible();
    await expect(receipt.getByText("General fund")).toBeVisible();
    await expect(page.getByRole("region", { name: "What happens next" }).getByRole("listitem")).toHaveCount(
      3,
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expectAccessible(page);
    const href = await page.getByRole("link", { name: "Download receipt (PDF)" }).getAttribute("href");
    const pdf = await request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("delayed and duplicate webhooks: the page waits, one receipt is issued", async ({ page }) => {
    await startDonation(page);
    await page.getByRole("button", { name: "Pay (webhook after 4 s)" }).click();
    await expect(page.getByText("Confirming your payment…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible({
      timeout: 20_000,
    });

    const order = await startDonation(page, "800");
    await page.getByRole("button", { name: "Pay (webhook sent twice)" }).click();
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible();
    const sql = postgres(process.env.DATABASE_URL!);
    const rows = await sql`select r.number from receipts r join donations d on d.id = r.donation_id
      where d.public_order_id = ${order}`;
    await sql.end();
    expect(rows).toHaveLength(1);
  });

  test("failure, then retry the same donation without re-entering details", async ({ page }) => {
    const order = await startDonation(page);
    await page.getByRole("button", { name: "Fail the payment" }).click();
    await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Your payment did not go through");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Fake payment gateway" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("order")).toBe(order);
    await page.getByRole("button", { name: "Pay (webhook now)" }).click();
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your receipt" })).toContainText(/MSWT\/ACK\//);
  });

  test("no webhook: the redirect alone never confirms; reconciliation does", async ({ page, request }) => {
    const order = await startDonation(page);
    await page.getByRole("button", { name: /no webhook/ }).click();
    await expect(page.getByText("Confirming your payment…")).toBeVisible();
    const before = await (await request.get(`/api/donations/${order}/status`)).json();
    expect(before.status).toBe("pending");
    const sql = postgres(process.env.DATABASE_URL!);
    await sql`update donations set created_at = now() - interval '31 minutes' where public_order_id = ${order}`;
    await sql.end();
    const cron = await request.get("/api/cron/reconcile", {
      // Same secret as the server: CRON_SECRET when set, else the development fallback.
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "development-cron-secret"}` },
    });
    expect(cron.status()).toBe(200);
    expect((await (await request.get(`/api/donations/${order}/status`)).json()).status).toBe("paid");
    await expect(page.getByRole("heading", { name: "Thank you for your donation" })).toBeVisible({
      timeout: 20_000,
    });
  });
});
