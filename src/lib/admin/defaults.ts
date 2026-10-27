import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import drafts from "../../../data/content/content.json";
import en from "../../messages/en.json";
import gu from "../../messages/gu.json";
import hi from "../../messages/hi.json";
import mr from "../../messages/mr.json";
import { FOOTER_NAV, LEGAL_NAV, MAIN_NAV, type PageKey } from "../../config/nav";
import { ContentFileSchema } from "../content/format";
import * as schema from "../db/schema";

/**
 * The site's built-in texts and menus, copied into the database so every menu page is managed in
 * the admin (Content → Pages / Menus). Runs after migrations (scripts/migrate.ts) on every build.
 * Only fills gaps: a page language or menu that already exists is never touched, so admin edits
 * are never overwritten. Built-in texts go in as reviewed (they are what the site shows today);
 * the legal drafts from data/content keep their own review state (unreviewed: hidden in production).
 */
const MESSAGES = { en, hi, mr, gu } as const;
type Locale = keyof typeof MESSAGES;
type Messages = (typeof MESSAGES)["en"];
type PageKeyDb = (typeof schema.pageKey.enumValues)[number];

type PageText = {
  title: string;
  h1: string;
  intro: string | null;
  seoDescription?: string | null;
  extras?: Record<string, unknown>;
  sections?: unknown[];
  reviewed: boolean;
};

/** Built-in text for each fixed page in one language (from src/messages). */
export function builtInPages(m: Messages): Partial<Record<PageKeyDb, PageText>> {
  return {
    home: {
      title: m.Meta.homeTitle,
      h1: m.Home.h1,
      intro: m.Home.intro,
      seoDescription: m.Meta.homeDescription,
      extras: {
        eyebrow: m.Home.eyebrow,
        points: ([1, 2, 3] as const).map((n) => ({
          title: m.Home[`trust${n}t`],
          text: m.Home[`trust${n}`],
        })),
        sections: {
          whyTitle: m.Home.whyTitle,
          causesH: m.Home.causesH,
          causesLead: m.Home.causesLead,
          eventsH: m.Home.eventsH,
          newsH: m.Home.newsH,
          bandH: m.Home.bandH,
          bandP: m.Home.bandP,
        },
      },
      reviewed: true,
    },
    about: { title: m.About.title, h1: m.About.title, intro: m.About.description, reviewed: true },
    contact: { title: m.Contact.title, h1: m.Contact.title, intro: m.Contact.description, reviewed: true },
    transparency: {
      title: m.Transparency.title,
      h1: m.Transparency.title,
      intro: m.Transparency.lead,
      seoDescription: m.Transparency.description,
      reviewed: true,
    },
    causes: {
      title: m.Causes.title,
      h1: m.Causes.title,
      intro: m.Causes.lead,
      seoDescription: m.Causes.description,
      reviewed: true,
    },
    gallery: { title: m.Gallery.title, h1: m.Gallery.title, intro: m.Gallery.description, reviewed: true },
    events: { title: m.Events.title, h1: m.Events.title, intro: m.Events.description, reviewed: true },
    news: { title: m.News.title, h1: m.News.title, intro: m.News.description, reviewed: true },
  };
}

/** Legal drafts (data/content), with their own review state. */
function draftPages(locale: Locale): Partial<Record<PageKeyDb, PageText>> {
  const file = ContentFileSchema.parse(drafts);
  return Object.fromEntries(
    Object.entries(file.pages).flatMap(([key, byLocale]) => {
      const tr = byLocale?.[locale];
      return tr
        ? [
            [
              key,
              {
                title: tr.title,
                h1: tr.h1,
                intro: tr.intro ?? null,
                sections: tr.sections,
                seoDescription: tr.seoDescription ?? null,
                reviewed: tr.reviewed,
              },
            ],
          ]
        : [];
    }),
  );
}

export const BUILT_IN_MENUS: Record<(typeof schema.menuLocation.enumValues)[number], readonly PageKey[]> = {
  header: MAIN_NAV,
  footer_explore: FOOTER_NAV.explore,
  footer_trust: FOOTER_NAV.trust,
  footer_legal: LEGAL_NAV,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PgDatabase<PgQueryResultHKT, typeof schema, any>;

export async function ensureDefaults(db: Db): Promise<{ pages: number; menus: number }> {
  return db.transaction(async (tx) => {
    let pages = 0;
    let menus = 0;
    const existing = await tx
      .select({ key: schema.pageTranslations.pageKey, locale: schema.pageTranslations.locale })
      .from(schema.pageTranslations);
    for (const locale of Object.keys(MESSAGES) as Locale[]) {
      const all = { ...builtInPages(MESSAGES[locale] as Messages), ...draftPages(locale) };
      for (const [key, text] of Object.entries(all) as [PageKeyDb, PageText][]) {
        if (existing.some((e) => e.key === key && e.locale === locale)) continue;
        await tx.insert(schema.pages).values({ key }).onConflictDoNothing();
        await tx
          .insert(schema.pageTranslations)
          .values({
            pageKey: key,
            locale,
            title: text.title,
            h1: text.h1,
            intro: text.intro,
            sections: (text.sections ?? []) as never,
            extras: text.extras ?? null,
            seoDescription: text.seoDescription ?? null,
            reviewedAt: text.reviewed ? sql`now()` : null,
          })
          .onConflictDoNothing();
        pages++;
      }
    }
    for (const [location, keys] of Object.entries(BUILT_IN_MENUS) as [
      keyof typeof BUILT_IN_MENUS,
      readonly PageKey[],
    ][]) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.menuItems)
        .where(eq(schema.menuItems.location, location));
      if ((row?.n ?? 0) > 0) continue;
      await tx
        .insert(schema.menuItems)
        .values(keys.map((target, i) => ({ location, sort: i + 1, kind: "page" as const, target })));
      menus++;
    }
    if (pages || menus)
      await tx.insert(schema.auditLog).values({
        actorUserId: null,
        action: "content.defaults",
        entityType: "content",
        after: { pageTranslations: pages, menus },
      });
    return { pages, menus };
  });
}

/** For tests: has a page language been filled? */
export async function hasPageText(db: Db, key: PageKeyDb, locale: Locale) {
  const [row] = await db
    .select({ key: schema.pageTranslations.pageKey })
    .from(schema.pageTranslations)
    .where(and(eq(schema.pageTranslations.pageKey, key), eq(schema.pageTranslations.locale, locale)));
  return Boolean(row);
}
