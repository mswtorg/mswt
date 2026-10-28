import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { PAGES, pageHref, type PageKey } from "@/config/nav";
import { recordAudit, type Actor } from "@/lib/audit";
import { getCauses, getEvents, getNews, splitEvents } from "@/lib/content/queries";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG } from "@/lib/content/source";
import { db } from "@/lib/db/client";
import { menuItems } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";

// Header and footer menus (Step 8c-2). A location with no rows uses the built-in menu
// (src/config/nav.ts), so nothing changes until an admin saves one.

export const MENU_LOCATIONS = ["header", "footer_explore", "footer_trust", "footer_legal"] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

/** Header dropdowns that fill themselves: every cause, the latest news, the next events. */
export const MENU_AUTO = ["causes", "news", "events"] as const;
export type MenuAuto = (typeof MENU_AUTO)[number];
/** Sub-links per header link (one level only). */
export const MAX_SUB_LINKS = 12;
/** Automatic news and events dropdowns show this many items, then "View all". */
const AUTO_LIMIT = 5;

const LabelText = z.string().trim().max(60);
const LinkInput = z
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
/** A sub-link is a plain link: it can't have sub-links of its own. */
const SubLinkInput = LinkInput.and(
  z.object({ auto: z.null().optional(), children: z.array(z.never()).max(0).optional() }),
).transform(({ kind, target, hidden, labels }) => ({ kind, target, hidden, labels }));
export const MenuItemInput = LinkInput.and(
  z.object({
    auto: z.enum(MENU_AUTO).nullable().default(null),
    children: z.array(SubLinkInput).max(MAX_SUB_LINKS, `At most ${MAX_SUB_LINKS} sub-links`).default([]),
  }),
).superRefine((item, ctx) => {
  if (item.auto && item.children.length)
    ctx.addIssue({
      code: "custom",
      path: ["children"],
      message: "Choose either automatic sub-links or your own, not both",
    });
});
export const MenuInput = z.array(MenuItemInput).max(30, "At most 30 links per menu");
export type MenuItemInput = z.infer<typeof MenuItemInput>;

/** The menu as saved for `location`: only the header can have dropdowns. */
export const menuInputFor = (location: MenuLocation) =>
  MenuInput.superRefine((items, ctx) => {
    if (location === "header") return;
    items.forEach((it, n) => {
      if (it.auto || it.children.length)
        ctx.addIssue({
          code: "custom",
          path: [n, "children"],
          message: "Only header links can have sub-links",
        });
    });
  });

export async function menuRows(location: MenuLocation) {
  return db.select().from(menuItems).where(eq(menuItems.location, location)).orderBy(asc(menuItems.sort));
}

/** Replaces a menu's links in the given order. An empty list goes back to the built-in menu. */
export async function saveMenu(location: MenuLocation, items: z.input<typeof MenuInput>, actor: Actor) {
  const data = menuInputFor(location).parse(items);
  const describe = (i: { kind: string; target: string; hidden: boolean }) =>
    `${i.kind}:${i.target}${i.hidden ? " (hidden)" : ""}`;
  await withTx(async (tx) => {
    const before = await tx.select().from(menuItems).where(eq(menuItems.location, location));
    await tx.delete(menuItems).where(eq(menuItems.location, location));
    for (const [n, { children, ...item }] of data.entries()) {
      const [parent] = await tx
        .insert(menuItems)
        .values({ location, sort: n + 1, ...item })
        .returning({ id: menuItems.id });
      if (children.length)
        await tx
          .insert(menuItems)
          .values(children.map((c, m) => ({ location, parentId: parent!.id, sort: m + 1, ...c })));
    }
    await recordAudit(tx, actor, {
      action: "menu.update",
      entityType: "menu",
      before: {
        location,
        items: before.map(
          (b) => `${b.parentId ? "  ↳ " : ""}${b.kind}:${b.target}${b.auto ? ` [auto ${b.auto}]` : ""}`,
        ),
      },
      after: {
        location,
        items: data.flatMap((i) => [
          `${describe(i)}${i.auto ? ` [auto ${i.auto}]` : ""}`,
          ...i.children.map((c) => `  ↳ ${describe(c)}`),
        ]),
      },
    });
  });
}

const allMenuRows = unstable_cache(
  async () => db.select().from(menuItems).orderBy(asc(menuItems.sort)),
  ["menu-items"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

export type MenuLink = { key: string; href: string; label: string; page?: PageKey; external?: boolean };
/** A menu link, with its dropdown when it has one (header only). */
export type MenuEntry = MenuLink & { children?: MenuLink[]; all?: MenuLink };

type Row = Awaited<ReturnType<typeof allMenuRows>>[number];
/** The built-in header: Causes lists every cause, as before menus could be edited. */
const BUILT_IN_AUTO: Partial<Record<PageKey, MenuAuto>> = { causes: "causes" };
const AUTO_PAGE: Record<MenuAuto, PageKey> = { causes: "causes", news: "news", events: "events" };

/**
 * The links to show in a menu for `locale`. Pages that aren't live, hidden links and items that
 * aren't published in this language are left out. Falls back to `defaults` (built-in menu).
 * Header links can have a dropdown (hand-picked sub-links, or causes/news/events listed
 * automatically); one whose sub-links are all left out shows as a plain link.
 */
export async function resolveMenu(
  location: MenuLocation,
  locale: Locale,
  defaults: readonly PageKey[],
  pageLabel: (key: PageKey) => string,
  allLabel?: (auto: MenuAuto) => string,
): Promise<MenuEntry[]> {
  let rows: Row[];
  try {
    rows = (await allMenuRows()).filter((r) => r.location === location);
  } catch {
    rows = [];
  }
  const header = location === "header";
  const tops: { row: Pick<Row, "id" | "kind" | "target" | "hidden" | "labels" | "auto">; subs: Row[] }[] =
    rows.length
      ? rows
          .filter((r) => !r.parentId)
          .map((row) => ({ row, subs: rows.filter((c) => c.parentId === row.id) }))
      : defaults.map((k) => ({
          row: { id: k, kind: "page", target: k, hidden: false, labels: {}, auto: BUILT_IN_AUTO[k] ?? null },
          subs: [],
        }));
  const visible = tops.filter((t) => !t.row.hidden);
  const autos = header ? new Set(visible.flatMap((t) => (t.row.auto ? [t.row.auto] : []))) : new Set();
  const used = [...visible.map((t) => t.row), ...(header ? visible.flatMap((t) => t.subs) : [])].filter(
    (r) => !r.hidden,
  );
  const needs = (kind: string, auto: MenuAuto) => used.some((r) => r.kind === kind) || autos.has(auto);
  const [causes, news, events] = await Promise.all([
    needs("cause", "causes") ? getCauses(locale) : [],
    needs("news", "news") ? getNews(locale) : [],
    needs("event", "events") ? getEvents(locale) : [],
  ]);

  const link = (r: Pick<Row, "id" | "kind" | "target" | "hidden" | "labels">): MenuLink | null => {
    if (r.hidden) return null;
    const own = r.labels[locale];
    switch (r.kind) {
      case "page": {
        const k = r.target as PageKey;
        return k in PAGES && PAGES[k].ready
          ? { key: r.id, href: pageHref(locale, k), label: own ?? pageLabel(k), page: k }
          : null;
      }
      case "cause": {
        const c = causes.find((x) => x.slug === r.target);
        return c ? { key: r.id, href: `/${locale}/causes/${c.slug}`, label: own ?? c.title } : null;
      }
      case "news": {
        const n = news.find((x) => x.slug === r.target);
        return n ? { key: r.id, href: `/${locale}/news/${n.slug}`, label: own ?? n.headline } : null;
      }
      case "event": {
        const e = events.find((x) => x.slug === r.target);
        return e ? { key: r.id, href: `/${locale}/events/${e.slug}`, label: own ?? e.title } : null;
      }
      case "url":
        // A web link shows only in languages it has a label for (no English fallback).
        return own ? { key: r.id, href: r.target, label: own, external: true } : null;
    }
  };

  const automatic = (auto: MenuAuto, key: string): MenuLink[] => {
    const items =
      auto === "causes"
        ? causes.map((c) => ({ slug: c.slug, label: c.title, base: "causes" }))
        : auto === "news"
          ? news.slice(0, AUTO_LIMIT).map((n) => ({ slug: n.slug, label: n.headline, base: "news" }))
          : splitEvents(events)
              .upcoming.slice(0, AUTO_LIMIT)
              .map((e) => ({ slug: e.slug, label: e.title, base: "events" }));
    return items.map((x) => ({
      key: `${key}-${x.slug}`,
      href: `/${locale}/${x.base}/${x.slug}`,
      label: x.label,
    }));
  };

  return visible.flatMap(({ row, subs }): MenuEntry[] => {
    const own = link(row);
    if (!own) return [];
    if (!header) return [own];
    if (row.auto) {
      const children = automatic(row.auto, own.key);
      const page = AUTO_PAGE[row.auto];
      const all =
        PAGES[page].ready && allLabel
          ? { key: `${own.key}-all`, href: pageHref(locale, page), label: allLabel(row.auto) }
          : undefined;
      return [children.length ? { ...own, children, all } : own];
    }
    const children = subs.flatMap((c) => link(c) ?? []);
    return [children.length ? { ...own, children } : own];
  });
}
