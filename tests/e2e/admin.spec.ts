import { expect, test } from "@playwright/test";
import { createUser, expectAccessible, newPage, PASSWORD, signInFirstTime } from "./admin-helpers";

test.describe("admin without signing in", () => {
  test("protected pages redirect to sign-in; sign-in is noindex and accessible", async ({
    page,
    request,
  }) => {
    for (const path of ["/admin", "/admin/users", "/admin/settings/payments", "/admin/audit-log"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers()["location"], path).toContain("/admin/login");
    }
    const res = await page.goto("/admin/login");
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
    await expectAccessible(page);
  });

  test("a wrong password gets one generic, focused message", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("not the password at all");
    await page.getByRole("button", { name: "Continue" }).click();
    const summary = page.locator("#login-summary");
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Email or password is incorrect.");
  });

  test("the 2FA step can't be reached without the password step", async ({ page }) => {
    await page.goto("/admin/2fa");
    await expect(page).toHaveURL(/\/admin\/login\?expired=1/);
  });
});

// ── Flows that write users: CI (thrown-away Postgres) or `npm run db:local` only.
test.describe("admin flows", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");
  test.describe.configure({ mode: "serial" });

  const email = (role: string) => `e2e-${role}-${Date.now()}@example.com`;

  let superAdmin = "";
  let recovery: string[] = [];

  test("Super Admin: first sign-in with 2FA setup, every screen accessible", async ({ page }) => {
    superAdmin = await createUser("super_admin");
    ({ codes: recovery } = await signInFirstTime(page, superAdmin));
    const nav = page.getByRole("navigation", { name: "Admin" });
    for (const name of [
      "Users",
      "Organization",
      "SEO",
      "Payments",
      "Email",
      "Receipts",
      "Appearance",
      "Audit log",
      "My account",
    ]) {
      await nav.getByRole("link", { name }).click();
      await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expectAccessible(page);
    }
  });

  test("settings save, appear on the public site and in the audit log", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(superAdmin);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Code").fill(recovery[0]!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome/ })).toBeVisible();

    const city = `Testpur ${Date.now() % 10000}`;
    await page.goto("/admin/settings/organization");
    await page.getByLabel("City").fill(city);
    await page.getByLabel("Trust PAN").fill("123");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#org-summary")).toBeFocused();
    await expect(page.getByLabel("Trust PAN")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("City")).toHaveValue(city); // nothing typed is lost
    await page.getByLabel("Trust PAN").fill("");
    await page
      .getByLabel("Official profiles")
      .fill("https://www.facebook.com/mswt\nhttps://instagram.com/mswt");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved");

    const contact = await newPage(page.context().browser()!);
    await contact.goto("/en/contact");
    await expect(contact.getByText(city)).toBeVisible();
    // Official profiles show as icon links in the footer.
    const follow = contact.getByRole("contentinfo").getByRole("navigation", { name: "Follow us" });
    await expect(follow.getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/mswt",
    );
    await expect(follow.getByRole("link", { name: "Instagram" })).toBeVisible();
    await expectAccessible(contact);

    await page.goto("/admin/audit-log?entity=organization_settings");
    await expect(page.getByRole("cell", { name: "settings.organization.update" }).first()).toBeVisible();

    // A recovery code works only once.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/signed-out=1/);
    await page.getByLabel("Email").fill(superAdmin);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Code").fill(recovery[0]!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#totp-summary")).toContainText("That code is not right");
  });

  test("invite a Content Editor: link → password → 2FA → only their sections", async ({ page, browser }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(superAdmin);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Code").fill(recovery[1]!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome/ })).toBeVisible();

    const editor = email("editor");
    await page.goto("/admin/users");
    await page.getByLabel("Full name").fill("E2E Editor");
    await page.getByLabel("Email").fill(editor);
    await page.getByLabel("Role").selectOption("content_editor");
    await page.getByRole("button", { name: "Create invite link" }).click();
    const message = await page.getByRole("status").textContent();
    const link = new URL(message!.match(/https?:\/\/\S+\/admin\/invite\/[A-Za-z0-9_-]{43}/)![0]!);

    const other = await newPage(browser);
    await other.goto(link.pathname);
    await other.getByLabel("New password").fill("editor passphrase for e2e");
    await other.getByLabel("Repeat the password").fill("editor passphrase for e2e");
    await other.getByRole("button", { name: "Save password" }).click();
    await expect(other).toHaveURL(/password=set/);
    await signInFirstTime(other, editor, "editor passphrase for e2e");

    const nav = other.getByRole("navigation", { name: "Admin" });
    // The page list under Pages is folded outside the Pages screens; its button opens it.
    const toggle = nav.getByRole("button", { name: "Pages: show the list" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("link", { name: "Privacy policy" })).toBeHidden();
    await toggle.click();
    await expect(nav.getByRole("button", { name: "Pages: hide the list" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "Pages",
      ...[
        "Home",
        "About",
        "Contact",
        "Causes (list)",
        "Events (list)",
        "News (list)",
        "Gallery (list)",
        "Testimonials (list)",
        "Team (list)",
        "Transparency",
        "Privacy policy",
        "Terms",
        "Refund policy",
        "80G disclaimer",
      ],
      "Causes",
      "Events",
      "News",
      "Testimonials",
      "Team",
      "Gallery",
      "Documents",
      "Media",
      "Menus",
      /^Messages\s*(\d+ new)?$/,
      "SEO",
      "Audit log",
      "My account",
    ]);
    for (const path of [
      "/admin/settings/payments",
      "/admin/settings/organization",
      "/admin/settings/receipts",
      "/admin/users",
    ]) {
      await other.goto(path);
      await expect(other.getByRole("heading", { name: /don’t have access/ }), path).toBeVisible();
    }
    // The invite link can't be used twice.
    await other.goto(link.pathname);
    await expect(other.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("five wrong passwords lock the account", async ({ page }) => {
    const address = await createUser("accountant");
    await page.goto("/admin/login");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Email").fill(address);
      await page.getByLabel("Password").fill(`wrong password ${i}`);
      // Wait for each submit to finish before typing the next attempt.
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")),
        page.getByRole("button", { name: "Continue" }).click(),
      ]);
      await expect(page.locator("#login-summary")).toBeVisible();
    }
    await expect(page.locator("#login-summary")).toContainText("locked for 15 minutes");
  });
});
