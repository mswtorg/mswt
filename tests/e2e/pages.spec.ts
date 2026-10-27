import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["en", "hi", "mr", "gu"] as const;
// Sample content (data/sample) is used because e2e builds have no CMS content.
const ROUTES: { path: string; types: string[] }[] = [
  { path: "/about", types: ["AboutPage", "BreadcrumbList"] },
  { path: "/causes", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/causes/school-support", types: ["WebPage", "BreadcrumbList"] },
  { path: "/gallery", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/gallery/health-camp-photos", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/events", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/events/health-camp-2027", types: ["WebPage", "BreadcrumbList", "Event"] },
  { path: "/news", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/news/annual-report-published", types: ["WebPage", "BreadcrumbList", "NewsArticle"] },
  { path: "/transparency", types: ["CollectionPage", "BreadcrumbList"] },
  { path: "/contact", types: ["ContactPage", "BreadcrumbList"] },
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks).toHaveLength(1);
  return (JSON.parse(blocks[0]!)["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
}

for (const locale of LOCALES) {
  for (const route of ROUTES) {
    test(`/${locale}${route.path} renders, is accessible and has its structured data`, async ({ page }) => {
      const res = await page.goto(`/${locale}${route.path}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("nav ol").first()).toBeVisible();
      expect((await jsonLdTypes(page)).sort()).toEqual(expect.arrayContaining(route.types));
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
}

test("previews label sample content", async ({ page }) => {
  await page.goto("/en/causes");
  await expect(page.getByText("Sample content for review")).toBeVisible();
});

test("unknown slugs and missing translations are 404", async ({ page }) => {
  expect((await page.goto("/en/causes/does-not-exist"))?.status()).toBe(404);
  // sample-update-1 exists only in English: no fallback in Marathi.
  expect((await page.goto("/mr/news/sample-update-1"))?.status()).toBe(404);
  expect((await page.goto("/en/news/sample-update-1"))?.status()).toBe(200);
});

test("news is paginated with self-canonical pages", async ({ page }) => {
  await page.goto("/en/news");
  await expect(page.locator("main ul > li")).toHaveCount(9);
  await page.getByRole("link", { name: /Next/ }).click();
  await expect(page).toHaveURL(/\/en\/news\?page=2$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/news\?page=2$/);
  await expect(page.locator("main ul > li")).toHaveCount(3);
});

test("events are split into upcoming and past", async ({ page }) => {
  await page.goto("/en/events");
  const upcoming = page.locator("section", { has: page.getByRole("heading", { name: "Upcoming events" }) });
  const past = page.locator("section", { has: page.getByRole("heading", { name: "Past events" }) });
  await expect(upcoming.getByRole("link", { name: "Free health check-up camp" })).toBeVisible();
  await expect(past.getByRole("link", { name: "School kit distribution" })).toBeVisible();
  await expect(upcoming.getByText("Postponed", { exact: true })).toBeVisible();
});

test("legal drafts show a review banner, are noindex, and exist only where written", async ({ page }) => {
  const res = await page.goto("/en/privacy");
  expect(res?.status()).toBe(200);
  await expect(page.getByText(/Draft – pending review/)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect((await page.goto("/hi/privacy"))?.status()).toBe(404);
});

test("main navigation links to the new pages", async ({ page, isMobile }) => {
  await page.goto("/en");
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["About", "Causes", "Gallery", "Events", "News", "Transparency", "Contact"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

for (const path of ["/hi/causes/school-support", "/gu/events/health-camp-2027", "/en/contact"]) {
  test(`no horizontal scroll at 320px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
  });
}

test.describe("contact form", () => {
  test("shows linked errors and focuses the summary", async ({ page }) => {
    await page.goto("/en/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Please correct the following" });
    await expect(summary).toBeFocused();
    await expect(page.getByLabel(/Your name/)).toHaveAttribute("aria-invalid", "true");
    await summary.getByRole("link", { name: "Enter your name" }).click();
    await expect(page.getByLabel(/Your name/)).toBeFocused();
  });

  test("sends a message (Turnstile test key)", async ({ page, isMobile }) => {
    // Writes to the database: only in CI, whose Postgres is thrown away after the run.
    test.skip(!process.env.CI || isMobile, "writes to the database; CI only");
    await page.goto("/en/contact");
    await page.getByLabel(/Your name/).fill("E2E Tester");
    await page.getByLabel(/^Email/).fill("e2e@example.com");
    await page.getByLabel(/Subject/).selectOption("other");
    await page.getByLabel(/Message/).fill("This is an automated test message.");
    // Turnstile renders in a closed shadow root, so don't depend on its iframe. With Cloudflare's
    // test secret the server accepts the documented dummy token; supply it if the widget hasn't
    // produced a token yet. The server still calls Cloudflare's real siteverify endpoint.
    await page.evaluate(() => {
      const form = document.querySelector("form")!;
      let input = form.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "cf-turnstile-response";
        form.appendChild(input);
      }
      if (!input.value) input.value = "XXXX.DUMMY.TOKEN.XXXX";
    });
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you" })).toBeVisible();
  });
});
