import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { HomeExtras } from "@/lib/content/home";
import { imageIds, markupToBlocks } from "@/lib/content/markup";
import { db } from "@/lib/db/client";
import { pages, pageTranslations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { siteUrl } from "@/lib/seo/site";
import { getSeoSettings } from "@/lib/settings";
import { contentPage, type ContentPageKey } from "./content-pages";
import { missingAlt } from "./media";

/** A save the editor must fix; `field` names the form field (or "form"). */
export class ContentError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

const Seo = {
  seoTitle: z
    .string()
    .trim()
    .max(70, "At most 70 characters")
    .transform((v) => v || null),
  seoDescription: z
    .string()
    .trim()
    .max(160, "At most 160 characters")
    .transform((v) => v || null),
};

export const PageInput = z.object({
  title: z.string().trim().min(1, "Enter the page title").max(120),
  h1: z.string().trim().min(1, "Enter the heading").max(160),
  intro: z
    .string()
    .trim()
    .max(600)
    .transform((v) => v || null),
  body: z.string().max(60_000),
  ...Seo,
  reviewed: z.boolean(),
});
export type PageInput = z.infer<typeof PageInput>;

/** Text → blocks, with editor errors reported against `field`. */
export function parseBody(body: string, field = "body") {
  const { blocks, errors } = markupToBlocks(body);
  if (errors.length) throw new ContentError(field, errors[0]!.message);
  return blocks;
}

/** Reviewed text can't use a photo that has no alt text in that language. */
export async function assertAltText(ids: string[], locale: Locale, field = "reviewed") {
  if ((await missingAlt(ids, locale)).length)
    throw new ContentError(
      field,
      "A photo used here (the cover or one in the text) has no alt text in this language. Add it under Content → Media, then mark this reviewed.",
    );
}

export async function pageHeroIds(key: ContentPageKey): Promise<string[]> {
  const [row] = await db.select({ ids: pages.heroMediaIds }).from(pages).where(eq(pages.key, key));
  return row?.ids ?? [];
}

export async function pageTranslationsFor(key: ContentPageKey) {
  return db.select().from(pageTranslations).where(eq(pageTranslations.pageKey, key));
}

/** Saves one language of a fixed page; reviewed text is announced to search engines (IndexNow). */
export async function savePageTranslation(
  key: ContentPageKey,
  locale: Locale,
  input: PageInput,
  extras: unknown,
  actor: Actor,
  /** Header photo(s); the same in every language. Undefined leaves them unchanged. */
  heroIds?: string[],
): Promise<void> {
  const sections = key === "home" ? [] : parseBody(input.body);
  const home = key === "home" ? HomeExtras.safeParse(extras) : null;
  if (home && !home.success)
    throw new ContentError("point1Title", "Fill in all three points (title and text).");
  if (input.reviewed) await assertAltText([...imageIds(sections), ...(heroIds ?? [])], locale);
  await withTx(async (tx) => {
    const [before] = await tx
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, key), eq(pageTranslations.locale, locale)));
    const now = new Date();
    const values = {
      title: input.title,
      h1: input.h1,
      intro: input.intro,
      sections,
      extras: home?.data ?? null,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    await tx
      .insert(pages)
      .values({ key, ...(heroIds ? { heroMediaIds: heroIds } : {}) })
      .onConflictDoUpdate({
        target: pages.key,
        set: { updatedAt: now, ...(heroIds ? { heroMediaIds: heroIds } : {}) },
      });
    await tx
      .insert(pageTranslations)
      .values({ pageKey: key, locale, ...values })
      .onConflictDoUpdate({ target: [pageTranslations.pageKey, pageTranslations.locale], set: values });
    await recordAudit(tx, actor, {
      action: "content.page.update",
      entityType: "page",
      entityId: null,
      before: before ? { key, locale, title: before.title, reviewed: Boolean(before.reviewedAt) } : null,
      after: {
        key,
        locale,
        title: input.title,
        reviewed: input.reviewed,
        blocks: sections.length,
        ...(heroIds ? { headerPhotos: heroIds.length } : {}),
      },
    });
  });
  if (input.reviewed) await notifySearchEngines([publicPath(key, locale)]);
}

export async function deletePageTranslation(key: ContentPageKey, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, key), eq(pageTranslations.locale, locale)))
      .returning({ title: pageTranslations.title });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "content.page.translation.delete",
        entityType: "page",
        before: { key, locale, title: gone[0]!.title },
      });
  });
}

export const publicPath = (key: ContentPageKey, locale: Locale) => `/${locale}${contentPage(key)!.path}`;

/** IndexNow for changed public URLs (production only, with a key in SEO settings; never throws). */
export async function notifySearchEngines(paths: string[]) {
  if (process.env.VERCEL_ENV !== "production" || !paths.length) return;
  try {
    const seo = await getSeoSettings();
    await pingIndexNow(
      paths.map((p) => new URL(p, siteUrl()).toString()),
      { key: seo?.indexnowKey },
    );
  } catch (error) {
    console.error("IndexNow after publish failed", error);
  }
}
