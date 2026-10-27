import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { imageIds } from "@/lib/content/markup";
import { db } from "@/lib/db/client";
import { causes, causeTranslations, donations, media } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { rupeesToPaise } from "@/lib/money";
import { assertAltText, ContentError, notifySearchEngines, parseBody } from "./content";
import { parsePhotoIds } from "./photo-ids";

export const CAUSE_STATUSES = ["draft", "active", "closed"] as const;

export const CauseInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, e.g. school-kits")
    .max(80),
  status: z.enum(CAUSE_STATUSES),
  goal: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      try {
        const paise = rupeesToPaise(v);
        if (paise > 0) return paise;
      } catch {}
      ctx.addIssue({ code: "custom", message: "Enter the goal in rupees, or leave it empty" });
      return z.NEVER;
    }),
  is80gEligible: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  coverImageId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  photoIds: z
    .string()
    .default("")
    .transform((v) => parsePhotoIds(v)),
});
export type CauseInput = z.infer<typeof CauseInput>;

export const CauseTextInput = z.object({
  title: z.string().trim().min(1, "Enter the title").max(120),
  summary: z.string().trim().min(1, "Write a one- or two-sentence summary").max(300),
  body: z.string().max(60_000),
  seoTitle: z
    .string()
    .trim()
    .max(70)
    .transform((v) => v || null),
  seoDescription: z
    .string()
    .trim()
    .max(160)
    .transform((v) => v || null),
  reviewed: z.boolean(),
});
export type CauseTextInput = z.infer<typeof CauseTextInput>;

export async function listCauses() {
  const [rows, tr, counts] = await Promise.all([
    db.select().from(causes).orderBy(asc(causes.sortOrder), asc(causes.slug)),
    db
      .select({
        causeId: causeTranslations.causeId,
        locale: causeTranslations.locale,
        title: causeTranslations.title,
        reviewedAt: causeTranslations.reviewedAt,
      })
      .from(causeTranslations),
    db
      .select({ causeId: donations.causeId, n: count() })
      .from(donations)
      .where(eq(donations.status, "paid"))
      .groupBy(donations.causeId),
  ]);
  return rows.map((c) => ({
    ...c,
    translations: tr.filter((t) => t.causeId === c.id),
    paidDonations: counts.find((x) => x.causeId === c.id)?.n ?? 0,
  }));
}

export async function getCauseForEdit(id: string) {
  const [row] = await db.select().from(causes).where(eq(causes.id, id));
  if (!row) return null;
  const translations = await db.select().from(causeTranslations).where(eq(causeTranslations.causeId, id));
  const [donated] = await db.select({ n: count() }).from(donations).where(eq(donations.causeId, id));
  return { cause: row, translations, donationCount: donated?.n ?? 0 };
}

async function assertCover(id: string | null) {
  if (!id) return;
  const [m] = await db.select({ id: media.id }).from(media).where(eq(media.id, id));
  if (!m) throw new ContentError("coverImageId", "That photo no longer exists");
}

const isSlugClash = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  /causes_slug_idx/.test(
    String((e as { message?: string }).message) + String((e as { cause?: unknown }).cause),
  );

export async function createCause(input: CauseInput, actor: Actor): Promise<string> {
  await assertCover(input.coverImageId);
  try {
    return await withTx(async (tx) => {
      const [row] = await tx
        .insert(causes)
        .values({
          slug: input.slug,
          status: input.status,
          goalPaise: input.goal,
          is80gEligible: input.is80gEligible,
          sortOrder: input.sortOrder,
          coverImageId: input.coverImageId,
          photoIds: input.photoIds,
        })
        .returning({ id: causes.id });
      await recordAudit(tx, actor, {
        action: "cause.create",
        entityType: "cause",
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
  } catch (error) {
    if (isSlugClash(error)) throw new ContentError("slug", "Another cause already uses this address");
    throw error;
  }
}

export async function updateCause(id: string, input: CauseInput, actor: Actor) {
  await assertCover(input.coverImageId);
  try {
    await withTx(async (tx) => {
      const [before] = await tx.select().from(causes).where(eq(causes.id, id));
      if (!before) throw new ContentError("form", "That cause no longer exists");
      await tx
        .update(causes)
        .set({
          slug: input.slug,
          status: input.status,
          goalPaise: input.goal,
          is80gEligible: input.is80gEligible,
          sortOrder: input.sortOrder,
          coverImageId: input.coverImageId,
          photoIds: input.photoIds,
          updatedAt: new Date(),
        })
        .where(eq(causes.id, id));
      await recordAudit(tx, actor, {
        action: "cause.update",
        entityType: "cause",
        entityId: id,
        before: {
          slug: before.slug,
          status: before.status,
          goal: before.goalPaise,
          is80gEligible: before.is80gEligible,
          sortOrder: before.sortOrder,
          coverImageId: before.coverImageId,
        },
        after: input,
      });
    });
  } catch (error) {
    if (isSlugClash(error)) throw new ContentError("slug", "Another cause already uses this address");
    throw error;
  }
  if (input.status !== "draft") await notifyCause(id);
}

export async function saveCauseTranslation(id: string, locale: Locale, input: CauseTextInput, actor: Actor) {
  const body = parseBody(input.body);
  const [cause] = await db.select().from(causes).where(eq(causes.id, id));
  if (!cause) throw new ContentError("form", "That cause no longer exists");
  if (input.reviewed)
    await assertAltText(
      [...imageIds(body), ...(cause.coverImageId ? [cause.coverImageId] : []), ...cause.photoIds],
      locale,
    );
  await withTx(async (tx) => {
    const now = new Date();
    const values = {
      title: input.title,
      summary: input.summary,
      body,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    const [before] = await tx
      .select({ title: causeTranslations.title, reviewedAt: causeTranslations.reviewedAt })
      .from(causeTranslations)
      .where(and(eq(causeTranslations.causeId, id), eq(causeTranslations.locale, locale)));
    await tx
      .insert(causeTranslations)
      .values({ causeId: id, locale, ...values })
      .onConflictDoUpdate({ target: [causeTranslations.causeId, causeTranslations.locale], set: values });
    await recordAudit(tx, actor, {
      action: "cause.update",
      entityType: "cause",
      entityId: id,
      before: before ? { locale, title: before.title, reviewed: Boolean(before.reviewedAt) } : null,
      after: { locale, title: input.title, reviewed: input.reviewed, blocks: body.length },
    });
  });
  if (input.reviewed && cause.status !== "draft") await notifyCause(id);
}

export async function deleteCauseTranslation(id: string, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(causeTranslations)
      .where(and(eq(causeTranslations.causeId, id), eq(causeTranslations.locale, locale)))
      .returning({ title: causeTranslations.title });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "cause.translation.delete",
        entityType: "cause",
        entityId: id,
        before: { locale, title: gone[0]!.title },
      });
  });
}

/** Only a draft that never received a donation can be deleted; otherwise close it. */
export async function deleteCause(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const [cause] = await tx.select().from(causes).where(eq(causes.id, id));
    if (!cause) return;
    const [used] = await tx.select({ n: count() }).from(donations).where(eq(donations.causeId, id));
    if (cause.status !== "draft" || (used?.n ?? 0) > 0)
      throw new ContentError(
        "form",
        "Only a draft cause with no donations can be deleted. Close it instead.",
      );
    await tx.delete(causes).where(eq(causes.id, id));
    await recordAudit(tx, actor, {
      action: "cause.delete",
      entityType: "cause",
      entityId: id,
      before: { slug: cause.slug },
    });
  });
}

async function notifyCause(id: string) {
  const [cause] = await db.select({ slug: causes.slug }).from(causes).where(eq(causes.id, id));
  const tr = await db
    .select({ locale: causeTranslations.locale, reviewedAt: causeTranslations.reviewedAt })
    .from(causeTranslations)
    .where(eq(causeTranslations.causeId, id));
  if (!cause) return;
  await notifySearchEngines(
    tr
      .filter((t) => t.reviewedAt)
      .flatMap((t) => [`/${t.locale}/causes/${cause.slug}`, `/${t.locale}/causes`]),
  );
}
