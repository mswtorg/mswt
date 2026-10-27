import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { imageIds } from "@/lib/content/markup";
import { isoIst } from "@/lib/dates/format";
import { db } from "@/lib/db/client";
import { events, eventTranslations, newsPosts, newsTranslations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { assertAltText, ContentError, notifySearchEngines, parseBody } from "./content";
import { parsePhotoIds } from "./photo-ids";

// Events and news (Step 8c-2): settings + text per language, like causes.

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, e.g. health-camp-2026")
  .max(80);
const photo = z.union([z.literal(""), z.uuid()]).transform((v) => v || null);
const photos = z
  .string()
  .default("")
  .transform((v) => parsePhotoIds(v));
/** "2026-11-05T10:00" typed in an IST date-time field → the instant. */
const istDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time")
  .transform((v) => new Date(`${v}:00+05:30`));
const optionalIstDateTime = z.union([z.literal(""), istDateTime]).transform((v) => (v === "" ? null : v));
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/** The value for an IST date-time field. */
export const istInputValue = (d: Date | null | undefined) => (d ? isoIst(d).slice(0, 16) : "");

const isSlugClash = (e: unknown, index: string) =>
  new RegExp(index).test(
    String((e as { message?: string }).message) + String((e as { cause?: unknown }).cause),
  );

export const TextInput = z.object({
  title: z.string().trim().min(1, "Enter the title").max(160),
  summary: z.string().trim().min(1, "Write a one- or two-sentence summary").max(400),
  body: z.string().max(60_000),
  seoTitle: text(70),
  seoDescription: text(160),
  reviewed: z.boolean(),
});
export type TextInput = z.infer<typeof TextInput>;

// ── Events ───────────────────────────────────────────────────────────────────────────────────

export const EventInput = z
  .object({
    slug,
    status: z.enum(["draft", "published"]),
    eventStatus: z.enum(["scheduled", "cancelled", "postponed", "rescheduled", "moved_online"]),
    attendance: z.enum(["offline", "online", "mixed"]),
    startsAt: istDateTime,
    endsAt: optionalIstDateTime,
    venueName: text(160),
    venueStreet: text(200),
    venueCity: text(80),
    venueRegion: text(80),
    venuePostalCode: text(12),
    onlineUrl: z
      .union([z.literal(""), z.url().refine((u) => u.startsWith("https://"), "Use an https:// link")])
      .transform((v) => v || null),
    coverImageId: photo,
    photoIds: photos,
  })
  .superRefine((v, ctx) => {
    if (v.endsAt && v.endsAt < v.startsAt)
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    if (v.attendance !== "online" && !v.venueName)
      ctx.addIssue({ code: "custom", path: ["venueName"], message: "Enter the venue (or choose Online)" });
    if (v.attendance !== "offline" && !v.onlineUrl)
      ctx.addIssue({ code: "custom", path: ["onlineUrl"], message: "Enter the online link" });
  });
export type EventInput = z.infer<typeof EventInput>;

export async function listEvents() {
  const [rows, tr] = await Promise.all([
    db.select().from(events).orderBy(desc(events.startsAt)),
    db
      .select({
        id: eventTranslations.eventId,
        locale: eventTranslations.locale,
        title: eventTranslations.title,
        reviewedAt: eventTranslations.reviewedAt,
      })
      .from(eventTranslations),
  ]);
  return rows.map((e) => ({ ...e, translations: tr.filter((t) => t.id === e.id) }));
}

export async function getEventForEdit(id: string) {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  if (!row) return null;
  const translations = await db.select().from(eventTranslations).where(eq(eventTranslations.eventId, id));
  return { event: row, translations };
}

const eventValues = (i: EventInput) => ({
  slug: i.slug,
  status: i.status,
  eventStatus: i.eventStatus,
  attendance: i.attendance,
  startsAt: i.startsAt,
  endsAt: i.endsAt,
  venueName: i.venueName,
  venueStreet: i.venueStreet,
  venueCity: i.venueCity,
  venueRegion: i.venueRegion,
  venuePostalCode: i.venuePostalCode,
  onlineUrl: i.onlineUrl,
  coverImageId: i.coverImageId,
  photoIds: i.photoIds,
});

export async function saveEvent(id: string | null, input: EventInput, actor: Actor): Promise<string> {
  try {
    const saved = await withTx(async (tx) => {
      if (!id) {
        const [row] = await tx.insert(events).values(eventValues(input)).returning({ id: events.id });
        await recordAudit(tx, actor, {
          action: "event.create",
          entityType: "event",
          entityId: row!.id,
          after: input,
        });
        return row!.id;
      }
      const [before] = await tx.select().from(events).where(eq(events.id, id));
      if (!before) throw new ContentError("form", "That event no longer exists");
      await tx
        .update(events)
        .set({ ...eventValues(input), updatedAt: new Date() })
        .where(eq(events.id, id));
      await recordAudit(tx, actor, {
        action: "event.update",
        entityType: "event",
        entityId: id,
        before: { slug: before.slug, status: before.status, startsAt: before.startsAt },
        after: input,
      });
      return id;
    });
    if (input.status === "published") await notifyItem("events", saved);
    return saved;
  } catch (error) {
    if (isSlugClash(error, "events_slug_idx"))
      throw new ContentError("slug", "Another event already uses this address");
    throw error;
  }
}

export async function saveEventText(id: string, locale: Locale, input: TextInput, actor: Actor) {
  const body = parseBody(input.body);
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) throw new ContentError("form", "That event no longer exists");
  if (input.reviewed)
    await assertAltText(
      [...imageIds(body), ...(event.coverImageId ? [event.coverImageId] : []), ...event.photoIds],
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
    await tx
      .insert(eventTranslations)
      .values({ eventId: id, locale, ...values })
      .onConflictDoUpdate({ target: [eventTranslations.eventId, eventTranslations.locale], set: values });
    await recordAudit(tx, actor, {
      action: "event.update",
      entityType: "event",
      entityId: id,
      after: { locale, title: input.title, reviewed: input.reviewed, blocks: body.length },
    });
  });
  if (input.reviewed && event.status === "published") await notifyItem("events", id);
}

// ── News ─────────────────────────────────────────────────────────────────────────────────────

export const NewsInput = z
  .object({
    slug,
    status: z.enum(["draft", "published"]),
    publishedAt: optionalIstDateTime,
    authorName: text(120),
    coverImageId: photo,
    photoIds: photos,
  })
  .transform((v) => ({
    ...v,
    // Publishing without a date publishes now (the database requires a date when published).
    publishedAt: v.status === "published" && !v.publishedAt ? new Date() : v.publishedAt,
  }));
export type NewsInput = z.infer<typeof NewsInput>;

export async function listNews() {
  const [rows, tr] = await Promise.all([
    db.select().from(newsPosts).orderBy(desc(newsPosts.publishedAt), asc(newsPosts.slug)),
    db
      .select({
        id: newsTranslations.postId,
        locale: newsTranslations.locale,
        title: newsTranslations.headline,
        reviewedAt: newsTranslations.reviewedAt,
      })
      .from(newsTranslations),
  ]);
  return rows.map((n) => ({ ...n, translations: tr.filter((t) => t.id === n.id) }));
}

export async function getNewsForEdit(id: string) {
  const [row] = await db.select().from(newsPosts).where(eq(newsPosts.id, id));
  if (!row) return null;
  const translations = await db.select().from(newsTranslations).where(eq(newsTranslations.postId, id));
  return { post: row, translations };
}

export async function saveNews(id: string | null, input: NewsInput, actor: Actor): Promise<string> {
  try {
    const saved = await withTx(async (tx) => {
      if (!id) {
        const [row] = await tx.insert(newsPosts).values(input).returning({ id: newsPosts.id });
        await recordAudit(tx, actor, {
          action: "news.create",
          entityType: "news",
          entityId: row!.id,
          after: input,
        });
        return row!.id;
      }
      const [before] = await tx.select().from(newsPosts).where(eq(newsPosts.id, id));
      if (!before) throw new ContentError("form", "That post no longer exists");
      await tx
        .update(newsPosts)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(newsPosts.id, id));
      await recordAudit(tx, actor, {
        action: "news.update",
        entityType: "news",
        entityId: id,
        before: { slug: before.slug, status: before.status },
        after: input,
      });
      return id;
    });
    if (input.status === "published") await notifyItem("news", saved);
    return saved;
  } catch (error) {
    if (isSlugClash(error, "news_posts_slug_idx"))
      throw new ContentError("slug", "Another post already uses this address");
    throw error;
  }
}

export async function saveNewsText(id: string, locale: Locale, input: TextInput, actor: Actor) {
  const body = parseBody(input.body);
  const [post] = await db.select().from(newsPosts).where(eq(newsPosts.id, id));
  if (!post) throw new ContentError("form", "That post no longer exists");
  if (input.reviewed)
    await assertAltText(
      [...imageIds(body), ...(post.coverImageId ? [post.coverImageId] : []), ...post.photoIds],
      locale,
    );
  await withTx(async (tx) => {
    const now = new Date();
    const values = {
      headline: input.title,
      excerpt: input.summary,
      body,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    await tx
      .insert(newsTranslations)
      .values({ postId: id, locale, ...values })
      .onConflictDoUpdate({ target: [newsTranslations.postId, newsTranslations.locale], set: values });
    await recordAudit(tx, actor, {
      action: "news.update",
      entityType: "news",
      entityId: id,
      after: { locale, headline: input.title, reviewed: input.reviewed, blocks: body.length },
    });
  });
  if (input.reviewed && post.status === "published") await notifyItem("news", id);
}

// ── Shared ───────────────────────────────────────────────────────────────────────────────────

export async function deleteItemTranslation(
  kind: "events" | "news",
  id: string,
  locale: Locale,
  actor: Actor,
) {
  await withTx(async (tx) => {
    const gone =
      kind === "events"
        ? await tx
            .delete(eventTranslations)
            .where(and(eq(eventTranslations.eventId, id), eq(eventTranslations.locale, locale)))
            .returning({ title: eventTranslations.title })
        : await tx
            .delete(newsTranslations)
            .where(and(eq(newsTranslations.postId, id), eq(newsTranslations.locale, locale)))
            .returning({ title: newsTranslations.headline });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: `${kind === "events" ? "event" : "news"}.translation.delete`,
        entityType: kind === "events" ? "event" : "news",
        entityId: id,
        before: { locale, title: gone[0]!.title },
      });
  });
}

/** Deletes an event or post with all its languages (its photos stay in the library). */
export async function deleteItem(kind: "events" | "news", id: string, actor: Actor) {
  await withTx(async (tx) => {
    const gone =
      kind === "events"
        ? await tx.delete(events).where(eq(events.id, id)).returning({ slug: events.slug })
        : await tx.delete(newsPosts).where(eq(newsPosts.id, id)).returning({ slug: newsPosts.slug });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: `${kind === "events" ? "event" : "news"}.delete`,
        entityType: kind === "events" ? "event" : "news",
        entityId: id,
        before: { slug: gone[0]!.slug },
      });
  });
}

async function notifyItem(kind: "events" | "news", id: string) {
  const [row] =
    kind === "events"
      ? await db.select({ slug: events.slug }).from(events).where(eq(events.id, id))
      : await db.select({ slug: newsPosts.slug }).from(newsPosts).where(eq(newsPosts.id, id));
  const tr =
    kind === "events"
      ? await db
          .select({ locale: eventTranslations.locale, reviewedAt: eventTranslations.reviewedAt })
          .from(eventTranslations)
          .where(eq(eventTranslations.eventId, id))
      : await db
          .select({ locale: newsTranslations.locale, reviewedAt: newsTranslations.reviewedAt })
          .from(newsTranslations)
          .where(eq(newsTranslations.postId, id));
  if (!row) return;
  await notifySearchEngines(
    tr
      .filter((t) => t.reviewedAt)
      .flatMap((t) => [`/${t.locale}/${kind}/${row.slug}`, `/${t.locale}/${kind}`]),
  );
}
