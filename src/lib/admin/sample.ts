import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { ContentFileSchema } from "@/lib/content/format";
import { db } from "@/lib/db/client";
import {
  causes,
  causeTranslations,
  donations,
  events,
  eventTranslations,
  galleryAlbums,
  galleryAlbumTranslations,
  galleryItems,
  media,
  newsPosts,
  newsTranslations,
  pages,
  reports,
  reportTranslations,
} from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import sample from "../../../data/sample/content.json";
import { deleteMedia, MediaServiceError, updateMediaText, uploadMedia } from "./media";

// "Load sample content" (Content → Sample content): the sample causes, events, news, album and
// documents from data/sample, with sample photos, as editable admin content. Everything is created
// unreviewed and flagged is_sample, so production never shows it until someone reviews it, and
// "Remove sample content" can take it out again.

export const SAMPLE_PHOTO_COUNT = 20;

/** Free sample photos (Lorem Picsum, from Unsplash): fixed seeds, so the same photos each time. */
export const samplePhotoUrl = (n: number) => `https://picsum.photos/seed/mswt-sample-${n}/1600/1067.jpg`;

export type PhotoFetcher = (n: number) => Promise<Uint8Array>;
const fetchFromWeb: PhotoFetcher = async (n) => {
  const res = await fetch(samplePhotoUrl(n), { redirect: "follow" });
  if (!res.ok) throw new Error(`Sample photo ${n} could not be downloaded (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
};

const ALT: Record<Locale, (n: number) => string> = {
  en: (n) => `Sample photo ${n} (placeholder until the Trust's own photos)`,
  hi: (n) => `नमूना फ़ोटो ${n} (ट्रस्ट की अपनी तस्वीरें आने तक)`,
  mr: (n) => `नमुना फोटो ${n} (ट्रस्टचे स्वतःचे फोटो येईपर्यंत)`,
  gu: (n) => `નમૂના ફોટો ${n} (ટ્રસ્ટના પોતાના ફોટા આવે ત્યાં સુધી)`,
};

/** The sample photo pool: reuses earlier sample photos, downloads only what's missing. */
async function photoPool(actor: Actor, fetchPhoto: PhotoFetcher): Promise<string[]> {
  const have = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.isSample, true))
    .orderBy(media.createdAt);
  const ids = have.map((h) => h.id);
  for (let n = ids.length + 1; n <= SAMPLE_PHOTO_COUNT; n++) {
    const { id } = await uploadMedia(
      { bytes: await fetchPhoto(n), filename: `sample-photo-${n}.jpg`, altEn: ALT.en(n) },
      actor,
    );
    await updateMediaText(
      id,
      {
        en: { alt: ALT.en(n), caption: "" },
        hi: { alt: ALT.hi(n), caption: "" },
        mr: { alt: ALT.mr(n), caption: "" },
        gu: { alt: ALT.gu(n), caption: "" },
      },
      actor,
    );
    await db.update(media).set({ isSample: true }).where(eq(media.id, id));
    ids.push(id);
  }
  return ids;
}

type Counts = {
  photos: number;
  causes: number;
  events: number;
  news: number;
  albums: number;
  documents: number;
};

/**
 * Imports the sample content. Items whose web address already exists are skipped, so running it
 * twice changes nothing. Page header photos are set only outside production and only where a page
 * has none (header photos don't wait for review).
 */
export async function loadSampleContent(
  actor: Actor,
  fetchPhoto: PhotoFetcher = fetchFromWeb,
): Promise<Counts> {
  const file = ContentFileSchema.parse(sample);
  const pool = await photoPool(actor, fetchPhoto);
  const at = (i: number) => pool[i % pool.length]!;
  const counts: Counts = { photos: pool.length, causes: 0, events: 0, news: 0, albums: 0, documents: 0 };
  // Imported text is never "reviewed": production keeps it hidden until a person approves it.
  const unreviewed = { reviewedAt: null, reviewedBy: null };

  await withTx(async (tx) => {
    const exists = async (
      table: typeof causes | typeof events | typeof newsPosts | typeof galleryAlbums,
      slug: string,
    ) => (await tx.select({ id: table.id }).from(table).where(eq(table.slug, slug))).length > 0;

    for (const [i, c] of file.causes.entries()) {
      if (await exists(causes, c.slug)) continue;
      const [row] = await tx
        .insert(causes)
        .values({
          slug: c.slug,
          status: c.status,
          goalPaise: c.goalPaise,
          sortOrder: c.sortOrder,
          is80gEligible: c.is80gEligible,
          coverImageId: at(i * 4),
          photoIds: [at(i * 4 + 1), at(i * 4 + 2), at(i * 4 + 3)],
          isSample: true,
        })
        .returning({ id: causes.id });
      for (const [locale, tr] of Object.entries(c.translations))
        await tx.insert(causeTranslations).values({
          causeId: row!.id,
          locale: locale as Locale,
          title: tr!.title,
          summary: tr!.summary,
          body: tr!.body,
          ...unreviewed,
        });
      counts.causes++;
    }

    for (const [i, e] of file.events.entries()) {
      if (await exists(events, e.slug)) continue;
      const [row] = await tx
        .insert(events)
        .values({
          slug: e.slug,
          status: e.status,
          eventStatus: e.eventStatus,
          attendance: e.attendance,
          startsAt: new Date(e.startsAt),
          endsAt: e.endsAt ? new Date(e.endsAt) : null,
          venueName: e.venue?.name ?? null,
          venueStreet: e.venue?.street ?? null,
          venueCity: e.venue?.city ?? null,
          venueRegion: e.venue?.region ?? null,
          venuePostalCode: e.venue?.postalCode ?? null,
          onlineUrl: e.onlineUrl,
          coverImageId: at(12 + i * 3),
          photoIds: [at(13 + i * 3), at(14 + i * 3)],
          isSample: true,
        })
        .returning({ id: events.id });
      for (const [locale, tr] of Object.entries(e.translations))
        await tx.insert(eventTranslations).values({
          eventId: row!.id,
          locale: locale as Locale,
          title: tr!.title,
          summary: tr!.summary,
          body: tr!.body,
          ...unreviewed,
        });
      counts.events++;
    }

    for (const [i, n] of file.news.entries()) {
      if (await exists(newsPosts, n.slug)) continue;
      const [row] = await tx
        .insert(newsPosts)
        .values({
          slug: n.slug,
          status: n.status,
          publishedAt: new Date(n.publishedAt),
          authorName: n.authorName,
          coverImageId: at(i + 5),
          isSample: true,
        })
        .returning({ id: newsPosts.id });
      for (const [locale, tr] of Object.entries(n.translations))
        await tx.insert(newsTranslations).values({
          postId: row!.id,
          locale: locale as Locale,
          headline: tr!.headline,
          excerpt: tr!.excerpt,
          body: tr!.body,
          ...unreviewed,
        });
      counts.news++;
    }

    for (const a of file.albums) {
      if (await exists(galleryAlbums, a.slug)) continue;
      const photos = Array.from({ length: 8 }, (_, k) => at(k * 2));
      const [row] = await tx
        .insert(galleryAlbums)
        .values({
          slug: a.slug,
          status: a.status,
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
          coverImageId: photos[0],
          isSample: true,
        })
        .returning({ id: galleryAlbums.id });
      await tx
        .insert(galleryItems)
        .values(photos.map((mediaId, k) => ({ albumId: row!.id, mediaId, sortOrder: k + 1 })));
      for (const [locale, tr] of Object.entries(a.translations))
        await tx.insert(galleryAlbumTranslations).values({
          albumId: row!.id,
          locale: locale as Locale,
          title: tr!.title,
          description: tr!.description ?? null,
          ...unreviewed,
        });
      counts.albums++;
    }

    for (const r of file.reports) {
      const [dup] = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            r.fy ? eq(reports.fy, r.fy) : isNull(reports.fy),
            eq(reports.kind, r.kind),
            eq(reports.isSample, true),
          ),
        );
      if (dup) continue;
      const [row] = await tx
        .insert(reports)
        .values({ fy: r.fy, kind: r.kind, status: r.status, publishedAt: new Date(), isSample: true })
        .returning({ id: reports.id });
      for (const [locale, tr] of Object.entries(r.translations))
        await tx.insert(reportTranslations).values({
          reportId: row!.id,
          locale: locale as Locale,
          title: tr!.title,
          ...unreviewed,
        });
      counts.documents++;
    }

    // Header photos show without review, so production gets none from the sample.
    if (process.env.VERCEL_ENV !== "production") {
      const heroes: [(typeof pages.$inferSelect)["key"], string[]][] = [
        ["home", [at(0), at(4), at(8)]],
        ["about", [at(1)]],
        ["causes", [at(2)]],
        ["events", [at(3)]],
        ["news", [at(6)]],
        ["gallery", [at(7)]],
        ["transparency", [at(9)]],
        ["contact", [at(10)]],
      ];
      for (const [key, ids] of heroes) {
        await tx.insert(pages).values({ key }).onConflictDoNothing();
        await tx
          .update(pages)
          .set({ heroMediaIds: ids })
          .where(and(eq(pages.key, key), sql`cardinality(${pages.heroMediaIds}) = 0`));
      }
    }

    await recordAudit(tx, actor, { action: "content.sample.load", entityType: "content", after: counts });
  });
  return counts;
}

/** What "Load sample content" created and is still there. */
export async function sampleCounts() {
  const n = async (
    table:
      typeof causes | typeof events | typeof newsPosts | typeof galleryAlbums | typeof reports | typeof media,
  ) => (await db.select({ n: count() }).from(table).where(eq(table.isSample, true)))[0]?.n ?? 0;
  return {
    photos: await n(media),
    causes: await n(causes),
    events: await n(events),
    news: await n(newsPosts),
    albums: await n(galleryAlbums),
    documents: await n(reports),
  };
}

/**
 * Removes sample content: items nobody has approved (no reviewed language) and causes without
 * donations; then sample photos that are no longer used anywhere. Approved items are kept.
 */
export async function removeSampleContent(actor: Actor): Promise<Counts> {
  const counts: Counts = { photos: 0, causes: 0, events: 0, news: 0, albums: 0, documents: 0 };
  const reviewedIds = async (
    table:
      | typeof causeTranslations
      | typeof eventTranslations
      | typeof newsTranslations
      | typeof galleryAlbumTranslations
      | typeof reportTranslations,
    col: string,
  ) =>
    (
      await db
        .select({ id: sql<string>`${sql.identifier(col)}` })
        .from(table)
        .where(isNotNull(table.reviewedAt))
    ).map((r) => r.id);

  await withTx(async (tx) => {
    const keepCauses = new Set([
      ...(await reviewedIds(causeTranslations, "cause_id")),
      ...(
        await tx.selectDistinct({ id: donations.causeId }).from(donations).where(isNotNull(donations.causeId))
      ).map((d) => d.id!),
    ]);
    const keepEvents = new Set(await reviewedIds(eventTranslations, "event_id"));
    const keepNews = new Set(await reviewedIds(newsTranslations, "post_id"));
    const keepAlbums = new Set(await reviewedIds(galleryAlbumTranslations, "album_id"));
    const keepReports = new Set(await reviewedIds(reportTranslations, "report_id"));

    const drop = async (
      table: typeof causes | typeof events | typeof newsPosts | typeof galleryAlbums | typeof reports,
      keep: Set<string>,
    ) => {
      const rows = await tx.select({ id: table.id }).from(table).where(eq(table.isSample, true));
      const ids = rows.map((r) => r.id).filter((id) => !keep.has(id));
      if (ids.length) await tx.delete(table).where(inArray(table.id, ids));
      return ids.length;
    };
    counts.causes = await drop(causes, keepCauses);
    counts.events = await drop(events, keepEvents);
    counts.news = await drop(newsPosts, keepNews);
    counts.albums = await drop(galleryAlbums, keepAlbums);
    counts.documents = await drop(reports, keepReports);

    // Sample photos out of page headers.
    const samplePhotos = (await tx.select({ id: media.id }).from(media).where(eq(media.isSample, true))).map(
      (m) => m.id,
    );
    if (samplePhotos.length)
      await tx.execute(
        sql`update pages set hero_media_ids = array(select x from unnest(hero_media_ids) with ordinality as h(x, i) where x <> all(${`{${samplePhotos.join(",")}}`}::uuid[]) order by i)`,
      );
    await recordAudit(tx, actor, { action: "content.sample.remove", entityType: "content", after: counts });
  });

  // Photos still used by something someone kept stay in the library.
  const photos = await db.select({ id: media.id }).from(media).where(eq(media.isSample, true));
  for (const p of photos) {
    try {
      await deleteMedia(p.id, actor);
      counts.photos++;
    } catch (error) {
      if (!(error instanceof MediaServiceError)) throw error;
    }
  }
  return counts;
}
