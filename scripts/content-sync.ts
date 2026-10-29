// Writes data/content/content.json (real content, e.g. the legal pages) to the database, then asks
// the site to refresh its content cache. Since Step 8c content is edited in Admin → Content: this
// script OVERWRITES admin edits of the same pages/causes, so use it only for a first load or tests.
// Usage: npm run content:sync              (validate + write to DATABASE_URL)
//        npm run content:sync -- --check   (validate only; runs in CI)
// Translations marked "reviewed": true are published in production; others stay preview-only.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ContentFileSchema } from "../src/lib/content/format";
import * as t from "../src/lib/db/schema";

config({ path: [".env.local", ".env"], quiet: true });

const content = ContentFileSchema.parse(JSON.parse(readFileSync("data/content/content.json", "utf8")));
const counts = Object.entries(content).map(
  ([k, v]) => `${k}: ${Array.isArray(v) ? v.length : Object.keys(v).length}`,
);
if (process.argv.includes("--check")) {
  console.log(`data/content/content.json is valid (${counts.join(", ")}).`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}

const now = new Date();
const reviewedAt = (r: { reviewed: boolean }) => (r.reviewed ? now : null);
const entries = <T>(o: Partial<Record<"en" | "hi" | "mr" | "gu", T>>) =>
  Object.entries(o) as ["en" | "hi" | "mr" | "gu", T][];

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql);
try {
  await db.transaction(async (tx) => {
    for (const c of content.causes) {
      const [row] = await tx
        .insert(t.causes)
        .values({
          slug: c.slug,
          status: c.status,
          goalPaise: c.goalPaise,
          raisedPaise: c.raisedPaise,
          sortOrder: c.sortOrder,
          is80gEligible: c.is80gEligible,
        })
        .onConflictDoUpdate({
          target: t.causes.slug,
          set: {
            status: c.status,
            goalPaise: c.goalPaise,
            sortOrder: c.sortOrder,
            is80gEligible: c.is80gEligible,
            updatedAt: now,
          },
        })
        .returning({ id: t.causes.id });
      for (const [locale, tr] of entries(c.translations)) {
        const v = {
          causeId: row!.id,
          locale,
          title: tr.title,
          summary: tr.summary,
          body: tr.body,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.causeTranslations)
          .values(v)
          .onConflictDoUpdate({ target: [t.causeTranslations.causeId, t.causeTranslations.locale], set: v });
      }
    }

    for (const e of content.events) {
      const base = {
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
      };
      const [row] = await tx
        .insert(t.events)
        .values(base)
        .onConflictDoUpdate({ target: t.events.slug, set: { ...base, updatedAt: now } })
        .returning({ id: t.events.id });
      for (const [locale, tr] of entries(e.translations)) {
        const v = {
          eventId: row!.id,
          locale,
          title: tr.title,
          summary: tr.summary,
          body: tr.body,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.eventTranslations)
          .values(v)
          .onConflictDoUpdate({ target: [t.eventTranslations.eventId, t.eventTranslations.locale], set: v });
      }
    }

    for (const n of content.news) {
      const base = {
        slug: n.slug,
        status: n.status,
        publishedAt: new Date(n.publishedAt),
        authorName: n.authorName,
      };
      const [row] = await tx
        .insert(t.newsPosts)
        .values(base)
        .onConflictDoUpdate({ target: t.newsPosts.slug, set: { ...base, updatedAt: now } })
        .returning({ id: t.newsPosts.id });
      for (const [locale, tr] of entries(n.translations)) {
        const v = {
          postId: row!.id,
          locale,
          headline: tr.headline,
          excerpt: tr.excerpt,
          body: tr.body,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.newsTranslations)
          .values(v)
          .onConflictDoUpdate({ target: [t.newsTranslations.postId, t.newsTranslations.locale], set: v });
      }
    }

    for (const a of content.albums) {
      const base = {
        slug: a.slug,
        status: a.status,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      };
      const [row] = await tx
        .insert(t.galleryAlbums)
        .values(base)
        .onConflictDoUpdate({ target: t.galleryAlbums.slug, set: { ...base, updatedAt: now } })
        .returning({ id: t.galleryAlbums.id });
      for (const [locale, tr] of entries(a.translations)) {
        const v = {
          albumId: row!.id,
          locale,
          title: tr.title,
          description: tr.description,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.galleryAlbumTranslations)
          .values(v)
          .onConflictDoUpdate({
            target: [t.galleryAlbumTranslations.albumId, t.galleryAlbumTranslations.locale],
            set: v,
          });
      }
      // Replace the album's items (placeholder images until R2 uploads exist).
      const old = await tx
        .select({ mediaId: t.galleryItems.mediaId })
        .from(t.galleryItems)
        .where(eq(t.galleryItems.albumId, row!.id));
      await tx.delete(t.galleryItems).where(eq(t.galleryItems.albumId, row!.id));
      if (old.length)
        await tx.delete(t.media).where(
          inArray(
            t.media.id,
            old.map((o) => o.mediaId),
          ),
        );
      for (const [i, item] of a.items.entries()) {
        const [m] = await tx
          .insert(t.media)
          .values({
            filename: `${a.slug}-${i + 1}`,
            mime: "image/jpeg",
            width: item.width,
            height: item.height,
          })
          .returning({ id: t.media.id });
        for (const [locale, alt] of entries(item.alt)) {
          await tx
            .insert(t.mediaTranslations)
            .values({ mediaId: m!.id, locale, altText: alt, caption: item.caption?.[locale] });
        }
        await tx.insert(t.galleryItems).values({ albumId: row!.id, mediaId: m!.id, sortOrder: i });
      }
    }

    for (const r of content.reports) {
      const existing = await tx
        .select({ id: t.reports.id })
        .from(t.reports)
        .where(and(r.fy ? eq(t.reports.fy, r.fy) : isNull(t.reports.fy), eq(t.reports.kind, r.kind)));
      const id =
        existing[0]?.id ??
        (
          await tx
            .insert(t.reports)
            .values({ fy: r.fy, kind: r.kind, status: r.status, publishedAt: now })
            .returning({ id: t.reports.id })
        )[0]!.id;
      await tx.update(t.reports).set({ status: r.status }).where(eq(t.reports.id, id));
      for (const [locale, tr] of entries(r.translations)) {
        const v = {
          reportId: id,
          locale,
          title: tr.title,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.reportTranslations)
          .values(v)
          .onConflictDoUpdate({
            target: [t.reportTranslations.reportId, t.reportTranslations.locale],
            set: v,
          });
      }
    }

    for (const [key, translations] of Object.entries(content.pages) as [
      keyof typeof content.pages,
      NonNullable<(typeof content.pages)[keyof typeof content.pages]>,
    ][]) {
      await tx
        .insert(t.pages)
        .values({ key })
        .onConflictDoUpdate({ target: t.pages.key, set: { updatedAt: now } });
      for (const [locale, tr] of entries(translations)) {
        const v = {
          pageKey: key,
          locale,
          title: tr.title,
          h1: tr.h1,
          intro: tr.intro,
          sections: tr.sections,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          reviewedAt: reviewedAt(tr),
          updatedAt: now,
        };
        await tx
          .insert(t.pageTranslations)
          .values(v)
          .onConflictDoUpdate({ target: [t.pageTranslations.pageKey, t.pageTranslations.locale], set: v });
      }
    }
  });
  console.log(`Content written to ${new URL(url).host} (${counts.join(", ")}).`);
} finally {
  await sql.end();
}

// Refresh the live site's content cache (needs REVALIDATE_URL + REVALIDATE_SECRET), else remind.
const target = process.env.REVALIDATE_URL;
const secret = process.env.REVALIDATE_SECRET;
if (target && secret) {
  const res = await fetch(target, {
    method: "POST",
    headers: { "x-revalidate-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({ tags: ["content"] }),
  });
  console.log(`Revalidate ${target}: HTTP ${res.status}`);
} else {
  console.log("Set REVALIDATE_URL and REVALIDATE_SECRET to refresh the live site, or redeploy.");
}
