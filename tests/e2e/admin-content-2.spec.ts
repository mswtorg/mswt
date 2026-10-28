import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { E2E_REVALIDATE_SECRET } from "../../playwright.config";
import { createUser, expectAccessible, newPage, signInFirstTime } from "./admin-helpers";

const BASE_URL = "http://127.0.0.1:3100";

// Step 8c-2: events, news, gallery, documents, menus and photos everywhere. Writes to the
// database: CI or `npm run db:local` only.
test.describe("admin content 2", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");
  test.describe.configure({ mode: "serial" });

  let page: Page;
  const run = `e2e8c2-${Date.now()}`;
  const photos: { id: string; name: string }[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await newPage(browser);
  });
  test.afterAll(async ({}, testInfo) => {
    await page.context().close();
    // The phone project skips these tests: it must not clean up while the desktop one is running.
    if (testInfo.project.use.isMobile) return;
    const db = postgres(process.env.DATABASE_URL!);
    await db`delete from events where slug like ${run + "%"}`;
    await db`delete from news_posts where slug like ${run + "%"}`;
    await db`delete from gallery_albums where slug like ${run + "%"}`;
    await db`delete from reports where id in (select report_id from report_translations where title like ${run + "%"})`;
    await db`delete from menu_items`;
    await db`delete from page_translations where page_key = 'home'`;
    await db`update pages set hero_media_ids = '{}' where key = 'home'`;
    await db.end();
    await fetch(new URL("/api/revalidate", BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": E2E_REVALIDATE_SECRET },
      body: JSON.stringify({ tags: ["content"] }),
    });
  });

  /** Choose photos in the PhotoListField picker (single → one click; multi → click each, then Insert). */
  async function pick(fieldLabel: string, names: string[]) {
    const group = page.getByRole("group", { name: fieldLabel });
    await group.getByRole("button", { name: /Choose photo|Change photo|Add photos/ }).click();
    const dialog = page.getByRole("dialog");
    for (const n of names) await dialog.getByRole("button", { name: new RegExp(n) }).click();
    if (names.length > 1 || (await dialog.isVisible()))
      await dialog.getByRole("button", { name: /^Insert \d+ photos$/ }).click();
    await expect(dialog).toBeHidden();
  }

  test("upload three photos", async () => {
    await signInFirstTime(page, await createUser("content_editor"));
    for (const [i, color] of ["#2a6", "#a62", "#26a"].entries()) {
      const name = `${run}-p${i + 1}`;
      const jpeg = await sharp({ create: { width: 1300, height: 900, channels: 3, background: color } })
        .jpeg()
        .toBuffer();
      await page.goto("/admin/content/media");
      await page
        .locator("#upload-file")
        .setInputFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: jpeg });
      await page.locator("#upload-alt").fill(`Test photo ${i + 1}`);
      await page.getByRole("button", { name: "Upload photo" }).click();
      await expect(page.getByText(/Photo uploaded/)).toBeVisible();
      photos.push({ id: page.url().match(/media\/([0-9a-f-]{36})/)![1]!, name: `${name}.webp` });
    }
  });

  test("an event with a cover and a slider shows both, with a full-screen viewer", async () => {
    await page.goto("/admin/content/events/new");
    await page.locator("#item-slug").fill(`${run}-event`);
    await page.locator("#item-status").selectOption("published");
    await page.locator("#item-startsAt").fill("2026-12-05T10:00");
    await page.locator("#item-venueName").fill("Community hall, Pune");
    await pick("Cover photo", [photos[0]!.name]);
    await pick("Photo slider", [photos[1]!.name, photos[2]!.name]);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Create event" }).click();
    await expect(page.getByText(/Created\. Now write its text/)).toBeVisible();

    await page.locator("#item-text-title").fill("E2E health camp");
    await page.locator("#item-text-summary").fill("Free check-ups for families.");
    await page.locator("#item-text-body").fill("## What happens\n\nDoctors and volunteers.");
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText(/Saved\. It shows in this language once published/)).toBeVisible();

    await expect.poll(async () => (await page.request.get(`/en/events/${run}-event`)).status()).toBe(200);
    await page.goto(`/en/events/${run}-event`);
    await expect(page.getByRole("img", { name: "Test photo 1" }).first()).toBeVisible();
    const slider = page.getByRole("region", { name: "Photos" });
    await expect(slider).toBeVisible();
    await slider.getByRole("button", { name: "Next photo" }).click();
    await expect(slider.getByRole("button", { name: "Photo 2 of 2" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await slider.getByRole("button", { name: /View full screen: Test photo 2/ }).click();
    await expect(page.getByRole("dialog", { name: "Photos" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Photos" })).toBeHidden();
    await expectAccessible(page);
  });

  test("news with a cover appears first on the news page", async () => {
    await page.goto("/admin/content/news/new");
    await page.locator("#item-slug").fill(`${run}-news`);
    await page.locator("#item-status").selectOption("published");
    await pick("Cover photo", [photos[2]!.name]);
    await page.getByRole("button", { name: "Create post" }).click();
    await page.locator("#item-text-title").fill("E2E news headline");
    await page.locator("#item-text-summary").fill("Short excerpt.");
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    await page.goto("/en/news");
    const first = page.getByRole("article").first();
    await expect(first.getByRole("link", { name: "E2E news headline" })).toBeVisible();
    await expect(first.getByRole("img", { name: "Test photo 3" })).toBeVisible();
  });

  test("a gallery album shows a grid that opens the viewer", async () => {
    await page.goto("/admin/content/gallery/new");
    await page.locator("#album-slug").fill(`${run}-album`);
    await page.locator("#album-status").selectOption("published");
    await pick("Album photos", [photos[0]!.name, photos[1]!.name]);
    await page.getByRole("button", { name: "Create album" }).click();
    await page.locator("#album-text-title").fill("E2E album");
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    // Saves refresh content at once, but another worker may be rendering pages at the same moment.
    await expect.poll(async () => (await page.request.get(`/en/gallery/${run}-album`)).status()).toBe(200);
    await page.goto(`/en/gallery/${run}-album`);
    await page.getByRole("button", { name: /View full screen: Test photo 2/ }).click();
    const viewer = page.getByRole("dialog", { name: "Photos" });
    await expect(viewer.getByText("Photo 2 of 2")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("Photo 1 of 2")).toBeVisible();
  });

  test("a document PDF uploads and downloads from Transparency", async () => {
    await page.goto("/admin/content/documents/new");
    await page.locator("#document-fy").fill("2025-26");
    await page.locator("#document-status").selectOption("published");
    await page.getByRole("button", { name: "Create document" }).click();
    await expect(page.getByText(/Document created/)).toBeVisible();
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    await page
      .locator("#pdf-file")
      .setInputFiles({ name: "Annual report.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("button", { name: "Upload PDF" }).click();
    await expect(page.getByText("PDF uploaded.")).toBeVisible();
    await page.locator("#document-title-title").fill(`${run} annual report`);
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save", exact: true }).last().click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.goto("/en/transparency");
    const link = page.getByRole("link", { name: new RegExp(`Download PDF.*${run} annual report`) });
    const res = await page.request.get((await link.getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
  });

  test("the header menu can be renamed per language and reordered", async () => {
    await page.goto("/admin/content/menus?menu=header");
    await expectAccessible(page);
    // Built-in menu starts with About, Causes…; move Causes up and rename About.
    await page.getByRole("button", { name: "Move link 2 up" }).click();
    const list = page.locator("ol", { has: page.getByText("Rename in each language").first() });
    const about = list.getByRole("listitem").filter({ hasText: /About/ });
    await about.getByText("Rename in each language").click();
    await about.getByLabel("English").fill("Who we are");
    await about.getByLabel("हिन्दी").fill("हमारे बारे में");
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(page.getByText("Menu saved.")).toBeVisible();
    const visitor = await newPage(page.context().browser()!);
    for (const [locale, label] of [
      ["en", "Who we are"],
      ["hi", "हमारे बारे में"],
    ] as const) {
      const nav = visitor.locator("#site-nav nav");
      // Another worker may be rendering pages as the menu is saved: reload until it shows.
      await expect(async () => {
        await visitor.goto(`/${locale}`);
        await expect(nav.getByRole("link", { name: label })).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await expect(nav.getByRole("link").first()).not.toHaveText(label); // Causes is first now
    }
    await visitor.context().close();
  });

  test("a header link gets hand-picked sub-links, in the HTML in each language", async () => {
    await page.goto("/admin/content/menus?menu=header");
    const about = page.getByRole("listitem").filter({ hasText: "2. Who we are" });
    await about.getByLabel("Sub-links").selectOption("manual");
    const add = about.getByRole("group", { name: "Add a sub-link under link 2" });
    await add.getByLabel("Page, cause, news or event").selectOption("page:transparency");
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await add.getByLabel("Web link").fill("https://example.org/annual-report");
    await add.getByLabel("Label (English)").fill("Annual report");
    await add.getByRole("button", { name: "Add link" }).click();
    await expect(about.getByText("1. Transparency")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(page.getByText("Menu saved.")).toBeVisible();

    // Every sub-link is a plain link in the server HTML; the web link has no Hindi label.
    const panelOf = (html: string) => {
      const start = html.indexOf('aria-label="Who we are: more links"');
      return start < 0 ? "" : html.slice(start, html.indexOf("</ul>", start));
    };
    await expect(async () => {
      const en = panelOf(await (await page.request.get("/en/about")).text());
      expect(en).toContain('href="/en/transparency"');
      expect(en).toContain('href="https://example.org/annual-report"');
    }).toPass({ timeout: 15_000 });
    await expect(async () => {
      const html = await (await page.request.get("/hi/about")).text();
      const start = html.indexOf('aria-label="हमारे बारे में: और लिंक"');
      expect(start).toBeGreaterThan(0);
      const hi = html.slice(start, html.indexOf("</ul>", start));
      expect(hi).toContain('href="/hi/transparency"');
      expect(hi).not.toContain("example.org");
    }).toPass({ timeout: 15_000 });

    const visitor = await newPage(page.context().browser()!);
    await visitor.goto("/en/about");
    const toggle = visitor.getByRole("button", { name: "Who we are: more links" });
    const panel = visitor.locator(`#${await toggle.getAttribute("aria-controls")}`);
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel.getByRole("link", { name: "Annual report" })).toBeVisible();
    await expectAccessible(visitor);
    await panel.getByRole("link", { name: "Transparency" }).click();
    await expect(visitor).toHaveURL(/\/en\/transparency$/);
    await visitor.context().close();
  });

  test("the home page shows header photos as a slider", async () => {
    await page.goto("/admin/content/pages/home?lang=en");
    await pick("Photos", [photos[0]!.name, photos[1]!.name]);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
    const slider = page.getByRole("region", { name: "Photos" });
    await expect(async () => {
      await page.goto("/en");
      await expect(slider).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(slider.getByRole("img").first()).toHaveAttribute("loading", "eager");
  });

  // One photo is a plain image rendered on the server (this path once broke the stage build).
  test("a page with one header photo shows it as an image", async () => {
    await page.goto("/admin/content/pages/about?lang=en");
    await pick("Photos", [photos[0]!.name]);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
    await expect(async () => {
      const res = await page.goto("/en/about");
      expect(res?.status()).toBe(200);
      await expect(page.locator("main figure img").first()).toHaveAttribute("loading", "eager", {
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Photos" })).toHaveCount(0);
  });
});

test.describe("list pages from the admin", () => {
  test.skip(({ isMobile }) => !process.env.CI || isMobile, "writes to the database; CI only");

  test("the Causes list heading is edited in Hindi and shows on /hi/causes", async ({ page }) => {
    await signInFirstTime(page, await createUser("content_editor"));
    await page.goto("/admin/content/pages/causes?lang=hi");
    await expect(page.locator("#page-h1")).not.toHaveValue("");
    const heading = `सेवा कार्य ${Date.now() % 10000}`;
    await page.locator("#page-h1").fill(heading);
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/).first()).toBeVisible();
    await expect(async () => {
      await page.goto("/hi/causes");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });
});
