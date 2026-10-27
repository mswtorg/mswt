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
  test.skip(isMobile, "large screens only; phones list the causes in the Menu");
  await page.goto("/en/about");
  const causes = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Causes", exact: true });
  const toggle = page.getByRole("button", { name: "Causes list" });
  const panel = page.locator("#causes-menu");
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

test("phone Menu lists the causes under Causes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  await page.goto("/en");
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.locator("#site-nav");
  await expect(menu.getByRole("link", { name: "Medical help for patients" })).toBeVisible();
  await menu.getByRole("link", { name: "Medical help for patients" }).click();
  await expect(page).toHaveURL(/\/en\/causes\/medical-help$/);
});
