import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { E2E_REVALIDATE_SECRET } from "../../playwright.config";
import { createUser, expectAccessible, newPage, signInFirstTime } from "./admin-helpers";

const BASE_URL = "http://127.0.0.1:3100";

/** Drags a list row by its grip (pointer down, move in steps, up) onto the top half of `target`. */
async function dragTo(page: Page, grip: Locator, target: Locator) {
  // The mouse only reaches what's on screen.
  await target.scrollIntoViewIfNeeded();
  await grip.scrollIntoViewIfNeeded();
  const g = (await grip.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const [x0, y0, y1] = [g.x + g.width / 2, g.y + g.height / 2, t.y + t.height / 4];
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0, y0 + ((y1 - y0) * i) / 10);
  await page.mouse.up();
}

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
    await db`delete from testimonials where id in (select testimonial_id from testimonial_translations where name like ${run + "%"})`;
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
    // The Text view takes the text format directly.
    await page.getByRole("button", { name: "Text", exact: true }).click();
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

  test("a registration certificate has no year and shows in its own section", async () => {
    await page.goto("/admin/content/documents/new");
    await page.locator("#document-kind").selectOption({ label: "Certificate: 80G registration" });
    // A year is refused for certificates.
    await page.locator("#document-fy").fill("2025-26");
    await page.getByRole("button", { name: "Create document" }).click();
    await expect(page.getByText(/Certificates have no financial year/).first()).toBeVisible();
    await page.locator("#document-fy").fill("");
    await page.locator("#document-status").selectOption("published");
    await page.getByRole("button", { name: "Create document" }).click();
    await expect(page.getByText(/Document created/)).toBeVisible();
    await expect(page.getByText(/blank out home addresses, signatures/)).toBeVisible();
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
    await page
      .locator("#pdf-file")
      .setInputFiles({ name: "80G.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.getByRole("button", { name: "Upload PDF" }).click();
    await expect(page.getByText("PDF uploaded.")).toBeVisible();
    await page.locator("#document-title-title").fill(`${run} 80G certificate`);
    await page.getByLabel(/Reviewed by a person/).check();
    await page.getByRole("button", { name: "Save", exact: true }).last().click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.goto("/admin/content/documents");
    await expect(
      page.getByRole("table", { name: "Registration certificates" }).getByText(`${run} 80G certificate`),
    ).toBeVisible();
    await expectAccessible(page);

    // Transparency: "Registration certificates" comes before the yearly reports.
    await expect(async () => {
      await page.goto("/en/transparency");
      await expect(page.locator("#certificates")).toContainText(`${run} 80G certificate`, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    const headings = await page.locator("main h2").allTextContents();
    expect(headings[0]).toBe("Registration certificates");
    const link = page
      .locator("#certificates")
      .getByRole("link", { name: new RegExp(`${run} 80G certificate`) });
    expect((await page.request.get((await link.getAttribute("href"))!)).status()).toBe(200);
    await expectAccessible(page);

    // About links to the certificates (its cached copy refreshes within a load or two).
    await expect(async () => {
      await page.goto("/en/about");
      await expect(
        page.getByRole("link", { name: "Read our annual reports, audited accounts and certificates" }),
      ).toHaveAttribute("href", "/en/transparency#certificates", { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });

  test("the header menu can be renamed per language and reordered", async () => {
    await page.goto("/admin/content/menus?menu=header");
    await expectAccessible(page);
    // Built-in menu starts with About, Causes…; move Causes up and rename About.
    const list = page.locator("ol", { has: page.getByText("Rename in each language").first() });
    await dragTo(
      page,
      page.getByRole("button", { name: "Reorder link 2" }),
      list.getByRole("listitem").first(),
    );
    await expect(list.getByRole("listitem").first()).toContainText("Causes");
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
    // Photo 2 dragged above photo 1.
    const heroIds = page.locator('input[name="heroMediaIds"]');
    const [first, second] = (await heroIds.inputValue()).split(",");
    const photoList = page.getByRole("group", { name: "Photos", exact: true }).getByRole("listitem");
    await dragTo(page, page.getByRole("button", { name: "Reorder photo 2" }), photoList.first());
    await expect(heroIds).toHaveValue(`${second},${first}`);
    // The Donate band, switched off in an earlier test, comes back in the same place.
    await page.getByRole("switch", { name: "Show Donate band on the page" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
    const slider = page.getByRole("region", { name: "Photos" });
    await expect(async () => {
      await page.goto("/en");
      await expect(slider).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(slider.getByRole("img").first()).toHaveAttribute("loading", "eager");
    const ids = await page
      .locator("main section[aria-labelledby]")
      .evaluateAll((s) => s.map((x) => x.getAttribute("aria-labelledby")));
    expect(ids.at(-1)).toBe("transparency-h");
  });

  test("Home impact numbers, Our story and testimonial stories on Home, About and their own pages", async () => {
    await page.goto("/admin/content/pages/home?lang=en");
    await page.locator("#page-impact1Value").fill("1,200+");
    await page.locator("#page-impact1Label").fill("families helped");
    const story = page.getByRole("textbox", { name: "Story", exact: true });
    await story.click();
    await story.pressSequentially(`${run} began with one relief camp.`);
    // Sections: News dragged above Causes.
    const order = page.getByRole("group", { name: "Sections" });
    const rows = order.getByRole("listitem");
    await dragTo(
      page,
      order.getByRole("button", { name: "Reorder News" }),
      rows.filter({ hasText: "Causes" }),
    );
    await expect(rows.nth(3)).toContainText("News");
    await expect(rows.nth(4)).toContainText("Causes");
    // Keyboard: Space picks a row up, the arrow keys move it, Escape puts it back.
    const why = order.getByRole("button", { name: "Reorder Why give (three points)" });
    await why.focus();
    await why.press("Space");
    await expect(why).toHaveAttribute("aria-pressed", "true");
    await why.press("ArrowDown");
    await expect(rows.nth(2)).toContainText("Why give");
    await expect(why).toBeFocused();
    await why.press("Escape");
    await expect(rows.nth(1)).toContainText("Why give");
    // Switched off: the Donate band leaves the Home page but keeps its place in the list.
    await order.getByRole("switch", { name: "Show Donate band on the page" }).uncheck();
    await expect(rows.last()).toContainText("Hidden");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();

    await page.goto("/admin/content/testimonials");
    await page.getByRole("link", { name: "New testimonial" }).click();
    await page.locator("#testimonial-slug").fill(`${run}-asha`);
    await page.locator("#testimonial-storyDate").fill("2026-03-14");
    await page.locator("#testimonial-status").selectOption("published");
    await pick("Photo", [photos[2]!.name]);
    await expect(page.getByLabel("Show on the home page")).toBeChecked();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Create testimonial" }).click();
    await expect(page.getByText(/Testimonial created/)).toBeVisible();
    await page.locator("#testimonial-text-title").fill(`${run} Back to school`);
    // The whole story, in the visual editor.
    const editor = page.getByRole("textbox", { name: "Story", exact: true });
    await editor.click();
    await editor.pressSequentially("After the floods we lost our books.");
    await editor.press("Enter");
    await editor.pressSequentially("The Trust paid the fees; she is in class 6 now.");
    await page.locator("#testimonial-text-name").fill(`${run} Asha`);
    await page.locator("#testimonial-text-role").fill("Parent, Pune");
    await page.getByLabel(/Reviewed by a person/).check();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Save text" }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();

    const visitor = await newPage(page.context().browser()!);
    const cards = visitor.getByRole("region", { name: "What people say" });
    await expect(async () => {
      await visitor.goto("/en");
      await expect(cards).toContainText(`${run} Back to school`, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    // The card: date, heading, the story's first lines (no summary written) and who it's from.
    await expect(cards).toContainText("14 March 2026");
    await expect(cards).toContainText("After the floods we lost our books.");
    await expect(cards).toContainText(`${run} Asha`);
    // The photo is decorative: the name is right beside it.
    await expect(cards.locator("img")).toHaveAttribute("alt", "");
    await expect(cards.getByRole("link", { name: "All testimonials" })).toHaveAttribute(
      "href",
      "/en/testimonials",
    );
    const impact = visitor.getByRole("region", { name: "Our impact in numbers" });
    // The figure counts up to its value once in view; screen readers get the value itself.
    await impact.scrollIntoViewIfNeeded();
    await expect(impact.locator("[data-count-up]")).toHaveText("1,200+", { timeout: 5000 });
    await expect(impact.locator(".sr-only")).toHaveText("1,200+");
    await expect(impact).toContainText("families helped");
    // Impact comes first under the headline, and News now comes before Causes.
    const ids = await visitor
      .locator("main section[aria-labelledby]")
      .evaluateAll((s) => s.map((x) => x.getAttribute("aria-labelledby")))
      // The header's donate box always comes before the sortable sections.
      .then((all) => all.filter((id) => id !== "quick-donate-h"));
    expect(ids[0]).toBe("impact-h");
    expect(ids.indexOf("news-h")).toBeLessThan(ids.indexOf("causes-h"));
    expect(ids).not.toContain("transparency-h");
    // With "reduce motion" the value shows straight away, with no counting.
    const still = await page.context().browser()!.newContext({ reducedMotion: "reduce" });
    const stillPage = await still.newPage();
    await stillPage.goto("/en");
    await expect(stillPage.locator("[data-count-up]").first()).toHaveText("1,200+", { timeout: 300 });
    await still.close();
    const ourStory = visitor.getByRole("region", { name: "Our story" });
    await expect(ourStory).toContainText(`${run} began with one relief camp.`);
    await expect(ourStory.getByRole("link", { name: "Read our story" })).toHaveAttribute("href", "/en/about");
    await expectAccessible(visitor);
    // No Review markup (Google's self-serving reviews policy).
    expect(await visitor.locator('script[type="application/ld+json"]').textContent()).not.toContain("Review");

    await expect(async () => {
      await visitor.goto("/en/about");
      await expect(visitor.getByRole("region", { name: "What people say" })).toContainText(
        `${run} Back to school`,
        { timeout: 1000 },
      );
    }).toPass({ timeout: 15_000 });

    // The list page, then the story's own page with the whole story.
    await expect(async () => {
      await visitor.goto("/en/testimonials");
      await expect(visitor.getByRole("heading", { level: 2, name: `${run} Back to school` })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expectAccessible(visitor);
    await visitor.getByRole("link", { name: `${run} Back to school` }).click();
    await expect(visitor).toHaveURL(new RegExp(`/en/testimonials/${run}-asha$`));
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(`${run} Back to school`);
    await expect(visitor.locator("main")).toContainText("The Trust paid the fees; she is in class 6 now.");
    await expect(visitor.locator("main time")).toHaveText("14 March 2026");
    await expect(visitor.getByRole("navigation", { name: /breadcrumb/i })).toContainText("Testimonials");
    const ld = await visitor.locator('script[type="application/ld+json"]').textContent();
    expect(ld).toContain("BreadcrumbList");
    expect(ld).not.toContain("Review");
    await expectAccessible(visitor);

    // Written only in English: not in Hindi, and its Hindi address is a 404.
    await visitor.goto("/hi/about");
    await expect(visitor.getByText(`${run} Back to school`)).toHaveCount(0);
    const hi = await visitor.request.get(`/hi/testimonials/${run}-asha`);
    expect(hi.status()).toBe(404);
    await visitor.context().close();
  });

  // One photo is a plain image rendered on the server (this path once broke the stage build).
  test("a page with one header photo shows it as an image", async () => {
    await page.goto("/admin/content/pages/about?lang=en");
    await pick("Photos", [photos[0]!.name]);
    // A short banner instead of the standard 16:9.
    await page.getByLabel("Header photo size").selectOption({ label: "Short banner" });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
    await expect(page.getByLabel("Header photo size")).toHaveValue("short");
    await expect(async () => {
      const res = await page.goto("/en/about");
      expect(res?.status()).toBe(200);
      await expect(page.locator("main figure img").first()).toHaveAttribute("loading", "eager", {
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Photos" })).toHaveCount(0);
    const box = (await page.locator("main figure img").first().boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(3, 1);
  });

  test("a trustee photo shows on About; a trustee without one shows initials", async ({ browser }) => {
    const db = postgres(process.env.DATABASE_URL!);
    const [before] = await db`select trustees from organization_settings where id = 1`;
    const admin = await newPage(browser);
    try {
      await signInFirstTime(admin, await createUser("super_admin"));
      await admin.goto("/admin/settings/organization");
      await admin.getByLabel("Trustees").fill(`${run} Trustee | Trustee\n${run} President | President`);
      await admin.getByRole("button", { name: "Save" }).click();
      await expect(admin.getByRole("status")).toContainText("Saved");
      await admin.reload();
      const group = admin.getByRole("group", { name: `${run} Trustee (Trustee)` });
      await group.getByRole("button", { name: /Choose photo/ }).click();
      await admin
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(photos[0]!.name) })
        .click();
      await expect(admin.getByRole("dialog")).toBeHidden();
      await admin.getByRole("button", { name: "Save" }).click();
      await expect(admin.getByRole("status")).toContainText("Saved");

      const trustees = page.locator("section", { has: page.locator("#trustees-h") });
      await expect(async () => {
        await page.goto("/en/about");
        await expect(trustees.getByRole("img", { name: "Test photo 1" })).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await expect(trustees.getByRole("heading", { name: `${run} President` })).toBeVisible();
      // No photo: a circle with the initials (first and last word), hidden from screen readers.
      await expect(trustees.locator("[data-initials]")).toHaveText(["EP"]);
      await expect(trustees.locator("[data-initials]")).toHaveAttribute("aria-hidden", "true");
      await expect(trustees.locator("img")).toHaveCount(1);
    } finally {
      await db`update organization_settings set trustees = ${db.json(before!.trustees)} where id = 1`;
      await db.end();
      await admin.context().close();
    }
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
