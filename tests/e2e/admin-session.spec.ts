import { expect, test } from "@playwright/test";
import { createUser, signInFirstTime } from "./admin-helpers";

// Admin sessions end after 2 hours idle; a form being written in keeps the session alive.
test("the session lasts 2 hours idle and an unsaved form being written renews it", async ({
  page,
  isMobile,
}) => {
  test.skip(!process.env.CI || isMobile, "writes to the database; CI only, once");
  await page.clock.install();
  await signInFirstTime(page, await createUser("content_editor"));

  const sessionCookie = async () =>
    (await page.context().cookies()).find((c) => /authjs\.session-token/.test(c.name));
  const hoursLeft = async () => ((await sessionCookie())!.expires * 1000 - Date.now()) / 3_600_000;
  expect(await hoursLeft()).toBeGreaterThan(1.9);
  expect(await hoursLeft()).toBeLessThanOrEqual(2.01);

  await page.goto("/admin/content/causes/new");
  const renewals: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/auth/session") renewals.push(r.url());
  });

  // Nothing unsaved: no renewal.
  await page.clock.runFor(6 * 60_000);
  expect(renewals).toHaveLength(0);

  // Typing makes the form unsaved: the session is renewed while the person keeps writing.
  await page.locator("#cause-slug").fill("keep-session-check");
  await page.clock.runFor(5 * 60_000 + 1000);
  await expect.poll(() => renewals.length).toBe(1);
  // No typing since: no further renewal (a forgotten tab still times out).
  await page.clock.runFor(10 * 60_000);
  expect(renewals).toHaveLength(1);
  await page.locator("#cause-slug").pressSequentially("-2");
  await page.clock.runFor(5 * 60_000 + 1000);
  await expect.poll(() => renewals.length).toBe(2);
});
