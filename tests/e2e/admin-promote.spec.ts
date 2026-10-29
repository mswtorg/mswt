import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { freshStageCopy, onStage } from "../stage-db";
import { createUser, expectAccessible, signInFirstTime } from "./admin-helpers";

// Admin → Move from stage, against a second local database playing "stage" (playwright.config.ts).
// Desktop only: it changes shared content.
test("a change made on stage is compared and moved to production", async ({ page, isMobile }) => {
  test.skip(isMobile, "changes shared content; runs once");
  const url = process.env.DATABASE_URL!;
  const db = postgres(url, { onnotice: () => {} });
  const id = randomUUID();
  const title = `Promote e2e ${id.slice(0, 8)}`;
  try {
    // On "production": a published cause. "Stage" starts as a copy, then its title is edited there.
    await db`insert into causes (id, slug, status) values (${id}, ${`promote-${id.slice(0, 8)}`}, 'active')`;
    await db`insert into cause_translations (cause_id, locale, title, summary, reviewed_at)
             values (${id}, 'en', ${title}, 'Summary', now())`;
    await freshStageCopy(url);
    await onStage(
      url,
      (s) => s`update cause_translations set title = ${`${title} (edited)`} where cause_id = ${id}`,
    );

    await signInFirstTime(page, await createUser("super_admin"));
    await page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Move from stage" })
      .click();
    await expect(page.getByRole("heading", { name: "Move from stage", level: 1 })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: `${title} (edited)` });
    await expect(row.getByText("Changed", { exact: true })).toBeVisible();
    await row.getByText(/View changes/).click();
    await expect(row.getByText("English: Title")).toBeVisible();
    await expect(row.getByText(title, { exact: true })).toBeVisible(); // production's value
    await expectAccessible(page);

    await row.getByRole("checkbox").check();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Move selected to production" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: `Moved to production: “${title} (edited)”` }),
    ).toBeVisible({ timeout: 30_000 });

    const [t] = await db`select title, reviewed_by from cause_translations where cause_id = ${id}`;
    expect(t?.title).toBe(`${title} (edited)`);
    expect(t?.reviewed_by).not.toBeNull();
    const [audit] = await db`select action from audit_log where entity_id = ${id} order by id desc limit 1`;
    expect(audit?.action).toBe("promote.cause.move");
  } finally {
    await db`delete from causes where id = ${id}`;
    await db.end();
  }
});
