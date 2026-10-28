import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// resolveMenu reads saved rows through unstable_cache; outside Next, read straight through.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

const { menuRows, resolveMenu, saveMenu } = await import("@/lib/admin/menus");
const { getCauses } = await import("@/lib/content/queries");
const { hashPassword } = await import("@/lib/auth/password");
const { db } = await import("@/lib/db/client");
const { auditLog, menuItems, users } = await import("@/lib/db/schema");

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

let editor: { id: string };
const actor = () => ({ userId: editor.id });
const label = (k: string) => `label:${k}`;
const allLabel = (a: string) => `all:${a}`;
const page = (target: string, extra: object = {}) => ({ kind: "page" as const, target, ...extra });

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `menus-${Date.now()}@example.com`,
      name: "Menu Tester",
      role: "content_editor",
      passwordHash: await hashPassword("menu tester passphrase"),
    })
    .returning({ id: users.id });
  editor = u!;
});
afterAll(async () => {
  await saveMenu("header", [], actor());
});

describe("header dropdowns", () => {
  it("the seeded header (npm run db:migrate on a fresh database) keeps Causes on all causes", async () => {
    const seeded = await menuRows("header");
    expect(seeded.find((r) => r.target === "causes")?.auto).toBe("causes");
    expect(seeded.filter((r) => r.target !== "causes").every((r) => r.auto === null)).toBe(true);
  });

  it("built-in header: Causes lists every cause, then View all", async () => {
    await saveMenu("header", [], actor());
    const causes = await getCauses("en");
    const menu = await resolveMenu("header", "en", ["about", "causes"], label, allLabel);
    const item = menu.find((m) => m.page === "causes")!;
    expect(item.children?.map((c) => c.href) ?? []).toEqual(causes.map((c) => `/en/causes/${c.slug}`));
    if (causes.length) expect(item.all).toMatchObject({ href: "/en/causes", label: "all:causes" });
    expect(menu.find((m) => m.page === "about")!.children).toBeUndefined();
  });

  it("saves hand-picked sub-links in order, drops hidden and untranslated ones, audits them", async () => {
    await saveMenu(
      "header",
      [
        page("about", {
          children: [
            page("contact", { labels: { hi: "संपर्क करें" } }),
            page("gallery", { hidden: true }),
            { kind: "url", target: "https://example.org/report", labels: { en: "Annual report" } },
          ],
        }),
        page("causes", { auto: "causes" }),
        // Every sub-link is left out: shows as a plain link.
        page("contact", { children: [page("about", { hidden: true })] }),
      ],
      actor(),
    );
    const rows = await menuRows("header");
    expect(rows.filter((r) => !r.parentId).map((r) => [r.target, r.sort, r.auto])).toEqual([
      ["about", 1, null],
      ["causes", 2, "causes"],
      ["contact", 3, null],
    ]);
    const about = rows.find((r) => r.target === "about" && !r.parentId)!;
    expect(rows.filter((r) => r.parentId === about.id).map((r) => [r.target, r.sort])).toEqual([
      ["contact", 1],
      ["gallery", 2],
      ["https://example.org/report", 3],
    ]);

    const en = await resolveMenu("header", "en", [], label, allLabel);
    expect(en[0]!.children!.map((c) => c.label)).toEqual(["label:contact", "Annual report"]);
    expect(en[0]!.all).toBeUndefined();
    expect(en[2]).not.toHaveProperty("children");
    // The web link has no Hindi label, so it isn't shown in Hindi.
    const hi = await resolveMenu("header", "hi", [], label, allLabel);
    expect(hi[0]!.children!.map((c) => [c.href, c.label])).toEqual([["/hi/contact", "संपर्क करें"]]);

    const [log] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "menu.update"), eq(auditLog.actorUserId, editor.id)))
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(1);
    expect((log!.after as { items: string[] }).items).toEqual([
      "page:about",
      "  ↳ page:contact",
      "  ↳ page:gallery (hidden)",
      "  ↳ url:https://example.org/report",
      "page:causes [auto causes]",
      "page:contact",
      "  ↳ page:about (hidden)",
    ]);

    // Removing a parent removes its sub-links.
    await saveMenu("header", [page("about")], actor());
    expect((await menuRows("header")).map((r) => r.target)).toEqual(["about"]);
  });

  it("refuses sub-links outside the header, grandchildren, and auto with sub-links", async () => {
    await expect(saveMenu("footer_trust", [page("about", { auto: "news" })], actor())).rejects.toThrow();
    await expect(
      saveMenu("footer_trust", [page("about", { children: [page("contact")] })], actor()),
    ).rejects.toThrow();
    await expect(
      saveMenu(
        "header",
        [page("about", { children: [page("contact", { children: [page("news")] })] })],
        actor(),
      ),
    ).rejects.toThrow();
    await expect(
      saveMenu("header", [page("about", { auto: "events", children: [page("contact")] })], actor()),
    ).rejects.toThrow();
  });

  it("the migration backfill turns a saved Causes header link into all causes", async () => {
    await saveMenu("header", [page("causes"), page("about")], actor());
    expect((await menuRows("header")).map((r) => r.auto)).toEqual([null, null]);
    const migration = readFileSync("drizzle/0010_menu_dropdowns.sql", "utf8");
    const backfill = migration
      .split("--> statement-breakpoint")
      .find((s) => /^\s*(--.*\n)*\s*UPDATE/m.test(s))!;
    await db.execute(sql.raw(backfill));
    expect(
      (await db.select().from(menuItems).where(eq(menuItems.location, "header"))).map((r) => [
        r.target,
        r.auto,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["causes", "causes"],
        ["about", null],
      ]),
    );
  });
});
