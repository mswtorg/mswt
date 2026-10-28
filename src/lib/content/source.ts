import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import { ContentFileSchema, type ContentFile } from "./format";

/** Cache tag for all public content; the sync script and the admin revalidate it after writes. */
export const CONTENT_TAG = "content";
/**
 * Saves refresh content at once (updateTag). This is only a safety net: if a page render that
 * started before a save writes older data back into the cache, it heals within 5 minutes.
 */
export const CONTENT_SAFETY_REVALIDATE = 300;

export function isProduction(vercelEnv: string | undefined = process.env.VERCEL_ENV): boolean {
  return vercelEnv === "production";
}

async function readContentFile(path: string): Promise<ContentFile> {
  try {
    return ContentFileSchema.parse(JSON.parse(await readFile(join(process.cwd(), path), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ContentFileSchema.parse({});
    throw error;
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Everything in the database, in the same shape as the content files. */
export async function databaseContent(): Promise<ContentFile> {
  const [
    causes,
    causeTr,
    events,
    eventTr,
    news,
    newsTr,
    albums,
    albumTr,
    items,
    mediaTr,
    media,
    reports,
    reportTr,
    pageTr,
  ] = await Promise.all([
    db.select().from(t.causes),
    db.select().from(t.causeTranslations),
    db.select().from(t.events),
    db.select().from(t.eventTranslations),
    db.select().from(t.newsPosts),
    db.select().from(t.newsTranslations),
    db.select().from(t.galleryAlbums),
    db.select().from(t.galleryAlbumTranslations),
    db.select().from(t.galleryItems),
    db.select().from(t.mediaTranslations),
    db.select().from(t.media),
    db.select().from(t.reports),
    db.select().from(t.reportTranslations),
    db.select().from(t.pageTranslations),
  ]);
  const by = <R extends { locale: string }, K extends keyof R>(rows: R[], key: K, id: R[K]) =>
    Object.fromEntries(rows.filter((r) => r[key] === id).map((r) => [r.locale, r]));
  const rev = (r: { reviewedAt: Date | null; seoTitle: string | null; seoDescription: string | null }) => ({
    reviewed: r.reviewedAt !== null,
    seoTitle: r.seoTitle ?? undefined,
    seoDescription: r.seoDescription ?? undefined,
  });
  const map = <R, O>(o: Record<string, R>, f: (r: R) => O) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

  return ContentFileSchema.parse({
    causes: causes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        slug: c.slug,
        isSample: c.isSample,
        status: c.status,
        goalPaise: c.goalPaise,
        raisedPaise: c.raisedPaise,
        sortOrder: c.sortOrder,
        is80gEligible: c.is80gEligible,
        icon: c.icon,
        coverImageId: c.coverImageId,
        coverSize: c.coverSize as "short" | "standard" | "tall",
        photoIds: c.photoIds,
        translations: map(by(causeTr, "causeId", c.id), (r) => ({
          title: r.title,
          summary: r.summary,
          tag: r.tag,
          body: r.body,
          ...rev(r),
        })),
      })),
    events: events.map((e) => ({
      slug: e.slug,
      isSample: e.isSample,
      status: e.status,
      eventStatus: e.eventStatus,
      attendance: e.attendance,
      startsAt: e.startsAt.toISOString(),
      endsAt: iso(e.endsAt),
      venue: e.venueName
        ? {
            name: e.venueName,
            street: e.venueStreet ?? undefined,
            city: e.venueCity ?? undefined,
            region: e.venueRegion ?? undefined,
            postalCode: e.venuePostalCode ?? undefined,
          }
        : null,
      onlineUrl: e.onlineUrl,
      coverImageId: e.coverImageId,
      coverSize: e.coverSize as "short" | "standard" | "tall",
      photoIds: e.photoIds,
      translations: map(by(eventTr, "eventId", e.id), (r) => ({
        title: r.title,
        summary: r.summary,
        body: r.body,
        ...rev(r),
      })),
    })),
    news: news
      .filter((n) => n.publishedAt)
      .map((n) => ({
        slug: n.slug,
        isSample: n.isSample,
        status: n.status,
        publishedAt: n.publishedAt!.toISOString(),
        authorName: n.authorName,
        coverImageId: n.coverImageId,
        coverSize: n.coverSize as "short" | "standard" | "tall",
        photoIds: n.photoIds,
        translations: map(by(newsTr, "postId", n.id), (r) => ({
          headline: r.headline,
          excerpt: r.excerpt,
          body: r.body,
          ...rev(r),
        })),
      })),
    albums: albums
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({
        slug: a.slug,
        isSample: a.isSample,
        status: a.status,
        publishedAt: iso(a.publishedAt),
        albumDate: a.albumDate,
        coverImageId: a.coverImageId,
        translations: map(by(albumTr, "albumId", a.id), (r) => ({
          title: r.title,
          description: r.description ?? undefined,
          ...rev(r),
        })),
        items: items
          .filter((i) => i.albumId === a.id)
          .sort((x, y) => x.sortOrder - y.sortOrder)
          .map((i) => {
            const m = media.find((x) => x.id === i.mediaId);
            const tr = mediaTr.filter((x) => x.mediaId === i.mediaId);
            return {
              mediaId: i.mediaId,
              width: m?.width ?? 4,
              height: m?.height ?? 3,
              alt: Object.fromEntries(tr.map((x) => [x.locale, x.altText])),
              caption: Object.fromEntries(tr.filter((x) => x.caption).map((x) => [x.locale, x.caption])),
            };
          }),
      })),
    reports: reports.map((r) => ({
      fy: r.fy,
      isSample: r.isSample,
      kind: r.kind,
      status: r.status,
      pdfKey: r.pdfR2Key,
      pdfBytes: r.pdfBytes,
      translations: map(by(reportTr, "reportId", r.id), (x) => ({ title: x.title, ...rev(x) })),
    })),
    pages: pageTr.reduce<Record<string, Record<string, unknown>>>((acc, r) => {
      if (r.pageKey === "home") return acc;
      (acc[r.pageKey] ??= {})[r.locale] = {
        title: r.title,
        h1: r.h1,
        intro: r.intro ?? undefined,
        sections: r.sections,
        ...rev(r),
      };
      return acc;
    }, {}),
  });
}

/** Fill each empty part of `primary` from `fallback` (pages are merged per page key). */
export function mergeContent(
  primary: ContentFile,
  fallback: ContentFile,
): ContentFile & { sampleParts: string[] } {
  const sampleParts: string[] = [];
  const pick = <K extends "causes" | "events" | "news" | "albums" | "reports">(k: K) => {
    if (primary[k].length > 0) return primary[k];
    if (fallback[k].length > 0) sampleParts.push(k);
    return fallback[k];
  };
  const pages = { ...primary.pages };
  for (const [key, value] of Object.entries(fallback.pages)) {
    if (!pages[key as keyof typeof pages]) {
      pages[key as keyof typeof pages] = value;
      sampleParts.push(`page:${key}`);
    }
  }
  return {
    causes: pick("causes"),
    events: pick("events"),
    news: pick("news"),
    albums: pick("albums"),
    reports: pick("reports"),
    pages,
    sampleParts,
  };
}

export type SiteContent = ContentFile & { sampleParts: string[] };

/**
 * All public content. Stage and production read only the database (everything is edited in the
 * admin; "Load sample content" adds examples). Local and CI builds fall back to data/content (legal
 * drafts) and then data/sample for anything the database doesn't have, so tests run on any database.
 */
export const getSiteContent = unstable_cache(
  async (): Promise<SiteContent> => {
    const fromDb = await databaseContent();
    // Deployed sites (stage and production) show admin content only; local and CI builds fall back
    // to the draft and sample files for anything the database doesn't have.
    if (process.env.VERCEL_ENV) return { ...fromDb, sampleParts: [] };
    const drafts = await readContentFile("data/content/content.json");
    const sample = await readContentFile("data/sample/content.json");
    // sampleParts lists only what came from data/sample (drafts carry their own "pending review" banner).
    return mergeContent(mergeContent(fromDb, drafts), sample);
  },
  ["site-content"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);
