import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { imageIds } from "@/lib/content/markup";
import { db } from "@/lib/db/client";
import { media, testimonials, testimonialTranslations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { assertAltText, ContentError, notifySearchEngines, parseBody } from "./content";
import { slug } from "./events";

export const TestimonialInput = z.object({
  slug,
  status: z.enum(["draft", "published"]),
  /** The story's date (a calendar day, the same in every language). */
  storyDate: z.iso.date("Choose the date"),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  showOnHome: z.boolean(),
  photoId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});
export type TestimonialInput = z.infer<typeof TestimonialInput>;

export const TestimonialTextInput = z.object({
  title: z.string().trim().min(1, "Enter the heading").max(160),
  /** The story in the editor's text format (parsed into blocks on save). */
  body: z.string().max(60_000),
  summary: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  name: z.string().trim().min(1, "Enter who said it").max(80),
  role: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null),
  reviewed: z.boolean(),
});
export type TestimonialTextInput = z.infer<typeof TestimonialTextInput>;

const isSlugClash = (e: unknown) =>
  /testimonials_slug_idx/.test(
    String((e as { message?: string }).message) + String((e as { cause?: unknown }).cause),
  );
const slugTaken = () => new ContentError("slug", "Another testimonial already uses this address");

export async function listTestimonials() {
  const [rows, tr] = await Promise.all([
    db
      .select()
      .from(testimonials)
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.storyDate), desc(testimonials.createdAt)),
    db
      .select({
        testimonialId: testimonialTranslations.testimonialId,
        locale: testimonialTranslations.locale,
        title: testimonialTranslations.title,
        name: testimonialTranslations.name,
        reviewedAt: testimonialTranslations.reviewedAt,
      })
      .from(testimonialTranslations),
  ]);
  return rows.map((t) => ({ ...t, translations: tr.filter((x) => x.testimonialId === t.id) }));
}

export async function getTestimonialForEdit(id: string) {
  const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id));
  if (!row) return null;
  const translations = await db
    .select()
    .from(testimonialTranslations)
    .where(eq(testimonialTranslations.testimonialId, id));
  return { testimonial: row, translations };
}

async function assertPhoto(id: string | null) {
  if (!id) return;
  const [m] = await db.select({ id: media.id }).from(media).where(eq(media.id, id));
  if (!m) throw new ContentError("photoId", "That photo no longer exists");
}

/** Tells search engines about a published story's reviewed languages (production only). */
async function notifyStory(id: string) {
  const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id));
  if (!row || row.status !== "published") return;
  const tr = await db
    .select({ locale: testimonialTranslations.locale, reviewedAt: testimonialTranslations.reviewedAt })
    .from(testimonialTranslations)
    .where(eq(testimonialTranslations.testimonialId, id));
  await notifySearchEngines(
    tr
      .filter((t) => t.reviewedAt)
      .flatMap((t) => [`/${t.locale}/testimonials/${row.slug}`, `/${t.locale}/testimonials`]),
  );
}

export async function createTestimonial(input: TestimonialInput, actor: Actor): Promise<string> {
  await assertPhoto(input.photoId);
  try {
    return await withTx(async (tx) => {
      const [row] = await tx.insert(testimonials).values(input).returning({ id: testimonials.id });
      await recordAudit(tx, actor, {
        action: "testimonial.create",
        entityType: "testimonial",
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
  } catch (error) {
    if (isSlugClash(error)) throw slugTaken();
    throw error;
  }
}

export async function updateTestimonial(id: string, input: TestimonialInput, actor: Actor) {
  await assertPhoto(input.photoId);
  try {
    await withTx(async (tx) => {
      const [before] = await tx.select().from(testimonials).where(eq(testimonials.id, id));
      if (!before) throw new ContentError("form", "That testimonial no longer exists");
      await tx
        .update(testimonials)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(testimonials.id, id));
      await recordAudit(tx, actor, {
        action: "testimonial.update",
        entityType: "testimonial",
        entityId: id,
        before: {
          slug: before.slug,
          status: before.status,
          storyDate: before.storyDate,
          sortOrder: before.sortOrder,
          showOnHome: before.showOnHome,
          photoId: before.photoId,
        },
        after: input,
      });
    });
  } catch (error) {
    if (isSlugClash(error)) throw slugTaken();
    throw error;
  }
  await notifyStory(id);
}

export async function saveTestimonialTranslation(
  id: string,
  locale: Locale,
  input: TestimonialTextInput,
  actor: Actor,
) {
  const body = parseBody(input.body);
  if (input.reviewed) await assertAltText(imageIds(body), locale);
  await withTx(async (tx) => {
    const [t] = await tx.select({ id: testimonials.id }).from(testimonials).where(eq(testimonials.id, id));
    if (!t) throw new ContentError("form", "That testimonial no longer exists");
    const now = new Date();
    const values = {
      title: input.title,
      body,
      summary: input.summary,
      name: input.name,
      role: input.role,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    const [before] = await tx
      .select({ title: testimonialTranslations.title, reviewedAt: testimonialTranslations.reviewedAt })
      .from(testimonialTranslations)
      .where(and(eq(testimonialTranslations.testimonialId, id), eq(testimonialTranslations.locale, locale)));
    await tx
      .insert(testimonialTranslations)
      .values({ testimonialId: id, locale, ...values })
      .onConflictDoUpdate({
        target: [testimonialTranslations.testimonialId, testimonialTranslations.locale],
        set: values,
      });
    await recordAudit(tx, actor, {
      action: "testimonial.update",
      entityType: "testimonial",
      entityId: id,
      before: before ? { locale, title: before.title, reviewed: Boolean(before.reviewedAt) } : null,
      after: { locale, title: input.title, name: input.name, reviewed: input.reviewed },
    });
  });
  if (input.reviewed) await notifyStory(id);
}

export async function deleteTestimonialTranslation(id: string, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(testimonialTranslations)
      .where(and(eq(testimonialTranslations.testimonialId, id), eq(testimonialTranslations.locale, locale)))
      .returning({ title: testimonialTranslations.title });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "testimonial.translation.delete",
        entityType: "testimonial",
        entityId: id,
        before: { locale, title: gone[0]!.title },
      });
  });
}

export async function deleteTestimonial(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx.delete(testimonials).where(eq(testimonials.id, id)).returning();
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "testimonial.delete",
        entityType: "testimonial",
        entityId: id,
        before: { slug: gone[0]!.slug, status: gone[0]!.status, photoId: gone[0]!.photoId },
      });
  });
}
