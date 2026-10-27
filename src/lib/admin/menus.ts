import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { PAGES, pageHref, type PageKey } from "@/config/nav";
import { recordAudit, type Actor } from "@/lib/audit";
import { getCauses, getEvents, getNews } from "@/lib/content/queries";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG } from "@/lib/content/source";
import { db } from "@/lib/db/client";
import { menuItems } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";

// Header and footer menus (Step 8c-2). A location with no rows uses the built-in menu
// (src/config/nav.ts), so nothing changes until an admin saves one.

export const MENU_LOCATIONS = ["header", "footer_explore", "footer_trust", "footer_legal"] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

const LabelText = z.string().trim().max(60);
export const MenuItemInput = z
  .object({
    kind: z.enum(["page", "cause", "news", "event", "url"]),
    target: z.string().trim().min(1).max(300),
    hidden: z.boolean().default(false),
    labels: z
      .object({ en: LabelText, hi: LabelText, mr: LabelText, gu: LabelText })
      .partial()
      .default({})
      .transform((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v))),
  })
  .superRefine((item, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["target"], message });
    if (item.kind === "page" && !(item.target in PAGES)) bad(`Unknown page “${item.target}”`);
    if (["cause", "news", "event"].includes(item.kind) && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.target))
      bad("Choose an item from the list");
    if (item.kind === "url" && !/^https:\/\/[^\s]+$/.test(item.target)) bad("Links must start with https://");
    if (item.kind === "url" && !item.labels.en) bad("A web link needs a label (at least in English)");
  });
export const MenuInput = z.array(MenuItemInput).max(30, "At most 30 links per menu");
export type MenuItemInput = z.infer<typeof MenuItemInput>;

export async function menuRows(location: MenuLocation) {
  return db.select().from(menuItems).where(eq(menuItems.location, location)).orderBy(asc(menuItems.sort));
}

/** Replaces a menu's links in the given order. An empty list goes back to the built-in menu. */
export async function saveMenu(location: MenuLocation, items: MenuItemInput[], actor: Actor) {
  await withTx(async (tx) => {
    const before = await tx.select().from(menuItems).where(eq(menuItems.location, location));
    await tx.delete(menuItems).where(eq(menuItems.location, location));
    if (items.length)
      await tx.insert(menuItems).values(items.map((i, n) => ({ location, sort: n + 1, ...i })));
    await recordAudit(tx, actor, {
      action: "menu.update",
      entityType: "menu",
      before: { location, items: before.map((b) => `${b.kind}:${b.target}`) },
      after: { location, items: items.map((i) => `${i.kind}:${i.target}${i.hidden ? " (hidden)" : ""}`) },
    });
  });
}

const allMenuRows = unstable_cache(
  async () => db.select().from(menuItems).orderBy(asc(menuItems.sort)),
  ["menu-items"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

export type MenuLink = { key: string; href: string; label: string; page?: PageKey; external?: boolean };

/**
 * The links to show in a menu for `locale`. Pages that aren't live, hidden links and items that
 * aren't published in this language are left out. Falls back to `defaults` (built-in menu).
 */
export async function resolveMenu(
  location: MenuLocation,
  locale: Locale,
  defaults: readonly PageKey[],
  pageLabel: (key: PageKey) => string,
): Promise<MenuLink[]> {
  const builtIn = () =>
    defaults
      .filter((k) => PAGES[k].ready)
      .map((k) => ({ key: k, href: pageHref(locale, k), label: pageLabel(k), page: k }));
  let rows: Awaited<ReturnType<typeof allMenuRows>>;
  try {
    rows = (await allMenuRows()).filter((r) => r.location === location);
  } catch {
    return builtIn();
  }
  if (!rows.length) return builtIn();
  const needs = (k: string) => rows.some((r) => r.kind === k && !r.hidden);
  const [causes, news, events] = await Promise.all([
    needs("cause") ? getCauses(locale) : [],
    needs("news") ? getNews(locale) : [],
    needs("event") ? getEvents(locale) : [],
  ]);
  return rows.flatMap((r): MenuLink[] => {
    if (r.hidden) return [];
    const own = r.labels[locale];
    switch (r.kind) {
      case "page": {
        const k = r.target as PageKey;
        return k in PAGES && PAGES[k].ready
          ? [{ key: r.id, href: pageHref(locale, k), label: own ?? pageLabel(k), page: k }]
          : [];
      }
      case "cause": {
        const c = causes.find((x) => x.slug === r.target);
        return c ? [{ key: r.id, href: `/${locale}/causes/${c.slug}`, label: own ?? c.title }] : [];
      }
      case "news": {
        const n = news.find((x) => x.slug === r.target);
        return n ? [{ key: r.id, href: `/${locale}/news/${n.slug}`, label: own ?? n.headline }] : [];
      }
      case "event": {
        const e = events.find((x) => x.slug === r.target);
        return e ? [{ key: r.id, href: `/${locale}/events/${e.slug}`, label: own ?? e.title }] : [];
      }
      case "url":
        // A web link shows only in languages it has a label for (no English fallback).
        return own ? [{ key: r.id, href: r.target, label: own, external: true }] : [];
    }
  });
}
