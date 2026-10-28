import { expect, test } from "@playwright/test";
import { expectAccessible } from "./admin-helpers";

// Home hero row, quick donate box, sticky header and the Causes dropdown (sample content).

test("the quick donate box opens the donate page with the amount and cause filled in", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("h1")).toHaveCount(1);
  const box = page.getByRole("region", { name: "Donate now" });
  await expect(box).toBeVisible();
  await box.getByRole("radio", { name: "₹2,500" }).check();
  // Only causes the donate form accepts (sample causes can't take donations, so none here).
  await expect(box.getByLabel("Donate towards")).toHaveCount(0);
  await box.getByRole("button", { name: "Donate" }).click();
  await expect(page).toHaveURL(/\/en\/donate\?preset=250000&custom=$/);
  await expect(page.getByRole("radio", { name: "₹2,500" })).toBeChecked();

  await page.goto("/en");
  await page.getByRole("region", { name: "Donate now" }).getByLabel("Other amount (₹)").fill("750");
  await page.getByRole("region", { name: "Donate now" }).getByRole("button", { name: "Donate" }).click();
  await expect(page.locator("#donate-custom")).toHaveValue("750");
  await expect(page.getByText("₹750").first()).toBeVisible();
});

test("the header stays on screen and gets a shadow after scrolling", async ({ page }) => {
  await page.goto("/en");
  const header = page.locator("#site-header");
  await expect(header).not.toHaveAttribute("data-scrolled");
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(header).toHaveAttribute("data-scrolled", "");
  expect((await header.boundingBox())!.y).toBe(0);
  await expect(header).toBeInViewport();
});

test("every cause link is in the HTML without JavaScript", async ({ request }) => {
  for (const locale of ["en", "hi"]) {
    const html = await (await request.get(`/${locale}/about`)).text();
    for (const slug of ["school-support", "medical-help", "relief-kits"])
      expect(html).toContain(`href="/${locale}/causes/${slug}"`);
  }
});

test("Causes dropdown: mouse, keyboard and Esc", async ({ page, isMobile }) => {
  test.skip(isMobile, "large screens; phones are tested below");
  await page.goto("/en/about");
  const causes = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Causes", exact: true });
  const toggle = page.getByRole("button", { name: "Causes: more links" });
  const panel = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  await causes.hover();
  await expect(panel.getByRole("link", { name: "School support for children" })).toBeVisible();
  await page.mouse.move(5, 600);
  await expect(panel).toBeHidden();

  await causes.focus();
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "School support for children" })).toBeFocused();
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await panel.getByRole("link", { name: "View all causes" }).click();
  await expect(page).toHaveURL(/\/en\/causes$/);
});

test("phone Menu keeps the causes folded until the arrow is tapped", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  await page.goto("/en");
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.locator("#site-nav");
  const cause = menu.getByRole("link", { name: "Medical help for patients" });
  const toggle = menu.getByRole("button", { name: "Causes: more links" });
  await expect(menu.getByRole("link", { name: "Causes", exact: true })).toBeVisible();
  await expect(cause).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(cause).toBeVisible();
  await expectAccessible(page);
  await toggle.click();
  await expect(cause).toBeHidden();
  await toggle.click();
  await cause.click();
  await expect(page).toHaveURL(/\/en\/causes\/medical-help$/);
});

test("Home WebSite JSON-LD names the site and its other names", async ({ request }) => {
  const html = await (await request.get("/en")).text();
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!)[
    "@graph"
  ] as { "@type": string; name?: string; alternateName?: string[] }[];
  const site = graph.find((n) => n["@type"] === "WebSite")!;
  expect(site.name).toBe("MS Welfare Trust");
  // The other names come from Settings → Organization (empty in a bare CI database).
  const ngo = graph.find((n) => n["@type"] === "NGO") as { legalName?: string } | undefined;
  test.skip(!ngo, "no organization settings in this database");
  expect(site.alternateName).toContain(ngo!.legalName);
  expect(site.alternateName).not.toContain(site.name);
});
