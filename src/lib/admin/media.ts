import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { routing, type Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import {
  causes,
  causeTranslations,
  events,
  eventTranslations,
  galleryAlbums,
  galleryItems,
  media,
  mediaTranslations,
  newsPosts,
  newsTranslations,
  organizationSettings,
  pages,
  pageTranslations,
} from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { mediaSlug, processImage, variantKey } from "@/lib/media/process";
import { imageView, type ImageView } from "@/lib/media/view";
import { getMediaStorage } from "@/lib/storage/media";
import type { LibraryItem } from "@/components/admin/BlocksEditor";

export class MediaServiceError extends Error {
  constructor(readonly code: "storage" | "in_use" | "not_found") {
    super(code);
  }
}

const AltText = z.string().trim().min(3, "Describe the photo in a few words").max(250);

/** Resize, strip metadata, store the WebP copies, then record the item with its English alt text. */
export async function uploadMedia(
  input: { bytes: Uint8Array; filename: string; altEn: string; captionEn?: string | null },
  actor: Actor,
) {
  const storage = getMediaStorage();
  if (!storage) throw new MediaServiceError("storage");
  const altEn = AltText.parse(input.altEn);
  const image = await processImage(input.bytes);
  const id = randomUUID();
  const slug = mediaSlug(input.filename);
  const prefix = `media/${id}/${slug}`;
  for (const f of image.files) await storage.put(variantKey(prefix, f.width), f.body, "image/webp");
  try {
    await withTx(async (tx) => {
      await tx.insert(media).values({
        id,
        r2Key: prefix,
        filename: `${slug}.webp`,
        mime: "image/webp",
        width: image.width,
        height: image.height,
        bytes: image.files.at(-1)!.body.byteLength,
        variants: image.variants,
        blur: image.blur,
        uploadedBy: actor.userId,
      });
      await tx
        .insert(mediaTranslations)
        .values({ mediaId: id, locale: "en", altText: altEn, caption: input.captionEn?.trim() || null });
      await recordAudit(tx, actor, {
        action: "media.upload",
        entityType: "media",
        entityId: id,
        after: {
          filename: `${slug}.webp`,
          width: image.width,
          height: image.height,
          variants: image.variants,
        },
      });
    });
  } catch (error) {
    await Promise.allSettled(image.files.map((f) => storage.remove(variantKey(prefix, f.width))));
    throw error;
  }
  return { id };
}

const OtherAlt = z.union([z.literal(""), AltText]);
const Caption = z.string().trim().max(300);
export const MediaTextInput = z.object({
  en: z.object({ alt: AltText, caption: Caption }),
  hi: z.object({ alt: OtherAlt, caption: Caption }),
  mr: z.object({ alt: OtherAlt, caption: Caption }),
  gu: z.object({ alt: OtherAlt, caption: Caption }),
});
export type MediaTextInput = z.infer<typeof MediaTextInput>;

/** Alt text and captions per language. An empty alt removes that language. */
export async function updateMediaText(id: string, input: MediaTextInput, actor: Actor) {
  await withTx(async (tx) => {
    const before = await tx.select().from(mediaTranslations).where(eq(mediaTranslations.mediaId, id));
    for (const l of routing.locales) {
      const { alt, caption } = input[l];
      if (!alt) {
        await tx
          .delete(mediaTranslations)
          .where(and(eq(mediaTranslations.mediaId, id), eq(mediaTranslations.locale, l)));
        continue;
      }
      await tx
        .insert(mediaTranslations)
        .values({ mediaId: id, locale: l, altText: alt, caption: caption || null })
        .onConflictDoUpdate({
          target: [mediaTranslations.mediaId, mediaTranslations.locale],
          set: { altText: alt, caption: caption || null },
        });
    }
    await recordAudit(tx, actor, {
      action: "media.update",
      entityType: "media",
      entityId: id,
      before: before.map((b) => ({ locale: b.locale, alt: b.altText, caption: b.caption })),
      after: input,
    });
  });
}

/** Text blocks (any language) that show the photo, alone or in a slider. */
const usesImage = (col: unknown, id: string) =>
  sql`(${col} @> ${JSON.stringify([{ type: "image", mediaId: id }])}::jsonb or ${col} @> ${JSON.stringify([{ type: "slider", mediaIds: [id] }])}::jsonb)`;
const inList = (col: unknown, id: string) => sql`${id}::uuid = any(${col})`;

/** Where a photo is used: covers, sliders, page headers, albums, trustees and text in any language. */
export async function mediaUsage(id: string): Promise<{ label: string; href: string }[]> {
  const [causeRows, pageRows, eventRows, newsRows, albums, trustees] = await Promise.all([
    db
      .selectDistinct({ id: causes.id, slug: causes.slug })
      .from(causes)
      .leftJoin(causeTranslations, eq(causeTranslations.causeId, causes.id))
      .where(
        or(eq(causes.coverImageId, id), inList(causes.photoIds, id), usesImage(causeTranslations.body, id)),
      ),
    db
      .selectDistinct({ key: pages.key })
      .from(pages)
      .leftJoin(pageTranslations, eq(pageTranslations.pageKey, pages.key))
      .where(or(inList(pages.heroMediaIds, id), usesImage(pageTranslations.sections, id))),
    db
      .selectDistinct({ id: events.id, slug: events.slug })
      .from(events)
      .leftJoin(eventTranslations, eq(eventTranslations.eventId, events.id))
      .where(
        or(eq(events.coverImageId, id), inList(events.photoIds, id), usesImage(eventTranslations.body, id)),
      ),
    db
      .selectDistinct({ id: newsPosts.id, slug: newsPosts.slug })
      .from(newsPosts)
      .leftJoin(newsTranslations, eq(newsTranslations.postId, newsPosts.id))
      .where(
        or(
          eq(newsPosts.coverImageId, id),
          inList(newsPosts.photoIds, id),
          usesImage(newsTranslations.body, id),
        ),
      ),
    db
      .selectDistinct({ id: galleryAlbums.id, slug: galleryAlbums.slug })
      .from(galleryAlbums)
      .leftJoin(galleryItems, eq(galleryItems.albumId, galleryAlbums.id))
      .where(or(eq(galleryAlbums.coverImageId, id), eq(galleryItems.mediaId, id))),
    db
      .select({ id: organizationSettings.id })
      .from(organizationSettings)
      .where(sql`${organizationSettings.trustees} @> ${JSON.stringify([{ photoMediaId: id }])}::jsonb`),
  ]);
  return [
    ...pageRows.map((p) => ({ label: `Page: ${p.key}`, href: `/admin/content/pages/${p.key}` })),
    ...causeRows.map((c) => ({ label: `Cause: ${c.slug}`, href: `/admin/content/causes/${c.id}` })),
    ...eventRows.map((e) => ({ label: `Event: ${e.slug}`, href: `/admin/content/events/${e.id}` })),
    ...newsRows.map((n) => ({ label: `News: ${n.slug}`, href: `/admin/content/news/${n.id}` })),
    ...albums.map((a) => ({ label: `Gallery: ${a.slug}`, href: `/admin/content/gallery/${a.id}` })),
    ...(trustees.length ? [{ label: "Trustees", href: "/admin/settings/organization" }] : []),
  ];
}

/** Deletes an unused photo and its files. Used photos must be replaced first. */
export async function deleteMedia(id: string, actor: Actor) {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row) throw new MediaServiceError("not_found");
  if ((await mediaUsage(id)).length) throw new MediaServiceError("in_use");
  await withTx(async (tx) => {
    await tx.delete(media).where(eq(media.id, id));
    await recordAudit(tx, actor, {
      action: "media.delete",
      entityType: "media",
      entityId: id,
      before: { filename: row.filename },
    });
  });
  const storage = getMediaStorage();
  if (storage && row.r2Key)
    await Promise.allSettled(row.variants.map((w) => storage.remove(variantKey(row.r2Key!, w))));
}

export type MediaListItem = {
  id: string;
  filename: string;
  width: number;
  height: number;
  bytes: number | null;
  createdAt: Date;
  image: ImageView;
  languages: Locale[];
};

export async function listMedia(): Promise<MediaListItem[]> {
  const rows = await db.select().from(media).orderBy(desc(media.createdAt)).limit(500);
  const tr = rows.length
    ? await db
        .select()
        .from(mediaTranslations)
        .where(
          inArray(
            mediaTranslations.mediaId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const base = getMediaStorage()?.publicBase ?? null;
  return rows.map((r) => {
    const mine = tr.filter((t) => t.mediaId === r.id);
    return {
      id: r.id,
      filename: r.filename,
      width: r.width,
      height: r.height,
      bytes: r.bytes,
      createdAt: r.createdAt,
      image: imageView(r, base, mine.find((t) => t.locale === "en")?.altText ?? null),
      languages: routing.locales.filter((l) => mine.some((t) => t.locale === l)),
    };
  });
}

export async function getMediaItem(id: string) {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row) return null;
  const tr = await db.select().from(mediaTranslations).where(eq(mediaTranslations.mediaId, id));
  const base = getMediaStorage()?.publicBase ?? null;
  return {
    row,
    image: imageView(row, base, tr.find((t) => t.locale === "en")?.altText ?? null),
    text: Object.fromEntries(
      tr.map((t) => [t.locale, { alt: t.altText, caption: t.caption ?? "" }]),
    ) as Partial<Record<Locale, { alt: string; caption: string }>>,
  };
}

/**
 * The library for an editor in one language: picker items and preview images, with alt text in
 * that language only (so the preview shows what the public page will).
 */
export async function editorMedia(locale: Locale): Promise<{
  media: Record<string, ImageView>;
  library: LibraryItem[];
}> {
  const rows = await db.select().from(media).orderBy(desc(media.createdAt)).limit(300);
  const tr = rows.length
    ? await db
        .select()
        .from(mediaTranslations)
        .where(
          inArray(
            mediaTranslations.mediaId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const base = getMediaStorage()?.publicBase ?? null;
  const views = rows.map((r) => {
    const t = tr.find((x) => x.mediaId === r.id && x.locale === locale);
    return imageView(r, base, t?.altText ?? null, t?.caption ?? null);
  });
  return {
    media: Object.fromEntries(views.map((v) => [v.id, v])),
    library: rows.map((r, i) => ({
      id: r.id,
      label: r.filename,
      thumb: views[i]!.srcset ? views[i]!.srcset!.split(" ")[0]! : null,
      alt: views[i]!.alt,
    })),
  };
}

/** Image blocks and covers in `locale` that have no alt text in that language (review is refused). */
export async function missingAlt(ids: string[], locale: Locale): Promise<string[]> {
  if (!ids.length) return [];
  const have = await db
    .select({ id: mediaTranslations.mediaId })
    .from(mediaTranslations)
    .where(and(inArray(mediaTranslations.mediaId, ids), eq(mediaTranslations.locale, locale)));
  return ids.filter((id) => !have.some((h) => h.id === id));
}
