import { expect, test, type Page } from "@playwright/test";

// Step 9: installable PWA with an offline fallback (docs/standards.md PWA-01..06).

async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // The first visit isn't controlled yet (no forced takeover mid-page); a reload is.
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });

test("the manifest makes the site installable", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "MS Welfare Trust", start_url: "/en", scope: "/", display: "standalone" });
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);

  await page.goto("/en");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", /^#[0-9a-f]{6}$/);
  await serviceWorkerReady(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

test("the service worker registers on public pages, never from the admin", async ({ browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await adminPage.goto("/admin/login");
  await adminPage.waitForLoadState("networkidle");
  expect(
    await adminPage.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
  await admin.close();

  const pub = await browser.newContext();
  const page = await pub.newPage();
  await page.goto("/en");
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  expect(new URL(scope).pathname).toBe("/");
  await pub.close();
});

test("offline, an unsaved page shows the offline page in its language", async ({ page, context }) => {
  await page.goto("/hi");
  await serviceWorkerReady(page);
  await context.setOffline(true);
  // A new tab, so the offline navigation doesn't race the previous page's own requests.
  const tab = await context.newPage();
  await tab.goto("/hi/transparency");
  await expect(tab).toHaveURL(/\/hi\/transparency$/);
  await expect(tab.getByRole("heading", { level: 1 })).toHaveText("आप ऑफ़लाइन हैं");
  await expect(tab.locator("html")).toHaveAttribute("lang", "hi");
  // A page visited online opens offline from the cache.
  await tab.goto("/hi");
  await expect(tab.getByRole("heading", { level: 1 })).not.toHaveText("आप ऑफ़लाइन हैं");
  await context.setOffline(false);
});

test("donate pages are never saved by the service worker (PWA-05)", async ({ page }) => {
  await page.goto("/en");
  await serviceWorkerReady(page);
  await page.goto("/en/donate");
  await page.goto("/en/donate");
  await page.goto("/en/about");
  await expect.poll(() => cachedUrls(page)).toContain("/en/about");
  // (Offline, `next start` would still show it from Chrome's HTTP cache because of its
  // stale-while-revalidate header; Vercel sends browsers max-age=0, must-revalidate.)
  const urls = await cachedUrls(page);
  expect(
    urls.filter((u) => u.includes("/donate") || u.startsWith("/admin") || u.startsWith("/api/")),
  ).toEqual([]);
});
