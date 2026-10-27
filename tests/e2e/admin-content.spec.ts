import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { E2E_REVALIDATE_SECRET } from "../../playwright.config";
import { createUser, expectAccessible, newPage, signInFirstTime, uniqueEmail } from "./admin-helpers";

const BASE_URL = "http://127.0.0.1:3100";

// Content Editor flows (Step 8c-1). They write to the database: CI or `npm run db:local` only.
test.describe("admin content", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");
  test.describe.configure({ mode: "serial" });

  let page: Page;
  let photoId = "";
  const slug = `e2e-camp-${Date.now()}`;
  // The photo's file name becomes "<slug>.webp", unique per run.

  test.beforeAll(async ({ browser }) => {
    page = await newPage(browser);
  });
  test.afterAll(async () => {
    await page.context().close();
    // Leave the shared test database as found: public-page tests rely on the sample causes.
    const db = postgres(process.env.DATABASE_URL!);
    await db`delete from causes where slug = ${slug}`;
    if (photoId) await db`delete from media where id = ${photoId}`;
    await db`delete from page_translations where page_key = 'terms' and locale = 'hi'`;
    await db`delete from messages where subject = 'E2E volunteering'`;
    await db.end();
    const res = await fetch(new URL("/api/revalidate", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": E2E_REVALIDATE_SECRET },
      body: JSON.stringify({ tags: ["content"] }),
    });
    expect(res.status).toBe(200);
  });

  test("Content Editor sees the Content menu and edits a page in Hindi", async () => {
    await signInFirstTime(page, await createUser("content_editor"));
    const nav = page.getByRole("navigation", { name: "Admin" });
    // Messages may carry a "3 new" count in its name.
    for (const name of [
      /^Pages$/,
      /^Causes$/,
      /^Media$/,
      /^Messages\s*(\d+ new)?$/,
      /^About$/,
      /^Privacy policy$/,
    ])
      await expect(nav.getByRole("link", { name })).toBeVisible();

    await nav.getByRole("link", { name: "Terms", exact: true }).click();
    await page.getByRole("link", { name: /हिन्दी/ }).click();
    await expect(page).toHaveURL(/\/admin\/content\/pages\/terms\?lang=hi/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.locator("#page-title").fill("नियम और शर्तें");
    await page.locator("#page-h1").fill("नियम और शर्तें (परीक्षण)");
    const editor = page.locator("#page-body");
    await editor.fill("## उपयोग\n\nयह **परीक्षण** पाठ है।\n\n- पहला\n- दूसरा");
    // Keyboard shortcut from the toolbar: Ctrl/Cmd+B wraps the selection in **.
    await editor.press("End");
    await editor.press("Enter");
    await editor.press("Enter");
    await editor.press("ControlOrMeta+b");
    await expect(editor).toHaveValue(/\*\*bold text\*\*$/);
    const preview = page.getByRole("region", { name: "Preview" });
    await expect(preview.getByRole("heading", { name: "उपयोग" })).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveCount(2);
    await expectAccessible(page);
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved and published in this language.")).toBeVisible();

    const visitor = await newPage(page.context().browser()!);
    await visitor.goto("/hi/terms");
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("नियम और शर्तें (परीक्षण)");
    await expect(visitor.getByRole("heading", { name: "उपयोग" })).toBeVisible();
    await visitor.context().close();
  });

  test("uploads a photo, uses it in a cause, and the cause page shows it with srcset", async () => {
    await page.goto("/admin/content/media");
    await expectAccessible(page);
    const jpeg = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: "#5a8" } })
      .jpeg()
      .toBuffer();
    await page
      .locator("#upload-file")
      .setInputFiles({ name: `${slug}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
    await page.locator("#upload-alt").fill("Volunteers at an e2e health camp");
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText(/Photo uploaded/)).toBeVisible();
    photoId = page.url().match(/media\/([0-9a-f-]{36})/)![1]!;
    await expect(page.getByText("640px, 1280px, 1400px")).toBeVisible();
    await expectAccessible(page);

    await page.goto("/admin/content/causes/new");
    await page.locator("#cause-slug").fill(slug);
    await page.locator("#cause-status").selectOption("active");
    await page.locator("#cause-goal").fill("25000");
    await page
      .getByRole("group", { name: "Cover photo" })
      .getByRole("button", { name: "Choose photo" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`${slug}\\.webp`) })
      .click();
    await expect(page.locator("#cause-coverImageId")).toHaveValue(photoId);
    await page.getByRole("button", { name: "Create cause" }).click();
    await expect(page.getByText(/Cause created as active/)).toBeVisible();

    await page.locator("#cause-text-title").fill("E2E health camps");
    await page.locator("#cause-text-summary").fill("Free health camps, tested end to end.");
    await page.locator("#cause-text-body").fill("## What we do\n\nMonthly camps.");
    // Insert the photo with the toolbar's picker.
    await page.getByRole("button", { name: "Insert image" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`${slug}\\.webp`) })
      .click();
    await expect(page.locator("#cause-text-body")).toHaveValue(new RegExp(`!\\[\\]\\(media:${photoId}\\)`));
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText(/Saved\. It shows in this language/)).toBeVisible();
    await expectAccessible(page);

    // Hindi can't be marked reviewed while the photo has no Hindi alt text.
    await page.getByRole("link", { name: /हिन्दी/ }).click();
    await expect(page).toHaveURL(/lang=hi/);
    await expect(page.locator("#cause-text-title")).toHaveAttribute("lang", "hi");
    await page.locator("#cause-text-title").fill("ई2ई शिविर");
    await page.locator("#cause-text-summary").fill("परीक्षण");
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText(/has no alt text in this language/).first()).toBeVisible();

    const res = await page.request.get(`/en/causes/${slug}`);
    const html = await res.text();
    expect(html).toContain(`media/${photoId}/${slug}-640.webp 640w`);
    expect(html).toContain('alt="Volunteers at an e2e health camp"');
  });

  test("a used photo can't be deleted", async () => {
    await page.goto(`/admin/content/media/${photoId}`);
    await expect(page.getByRole("link", { name: `Cause: ${slug}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete photo" })).toHaveCount(0);
  });

  test("messages: new ones are counted, opened, assigned and marked replied", async () => {
    const db = postgres(process.env.DATABASE_URL!);
    const [m] = await db`insert into messages (name, email, subject, body, locale, ip_hash)
      values ('E2E Sender', ${uniqueEmail("sender")}, 'E2E volunteering', 'Can I help on Sundays?', 'en', 'x')
      returning id`;
    await db.end();
    await page.goto("/admin/content/messages?status=new");
    await expect(page.getByRole("navigation", { name: "Admin" }).getByText(/\d+ new/)).toBeAttached();
    await expectAccessible(page);
    await page.getByRole("link", { name: "E2E Sender" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/content/messages/${m!.id}`));
    await expect(page.getByRole("link", { name: "Reply by email" })).toHaveAttribute("href", /^mailto:/);
    await page.locator("#message-status").selectOption("replied");
    await page.locator("#message-assignedTo").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Message updated.")).toBeVisible();
    await expectAccessible(page);
  });

  test("an Accountant reads causes and messages but can't edit content", async ({ page: acc }) => {
    await signInFirstTime(acc, await createUser("accountant"));
    await acc.goto("/admin/content/causes");
    await expect(acc.getByRole("link", { name: "New cause" })).toHaveCount(0);
    await acc.goto("/admin/content/messages");
    await expect(acc.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
    for (const path of [
      "/admin/content/pages",
      "/admin/content/pages/about",
      "/admin/content/media",
      "/admin/content/causes/new",
    ]) {
      await acc.goto(path);
      await expect(acc.getByRole("heading", { name: /don’t have access/ }), path).toBeVisible();
    }
  });
});
