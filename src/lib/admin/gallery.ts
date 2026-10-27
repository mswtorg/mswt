import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { galleryAlbums, galleryAlbumTranslations, galleryItems } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { assertAltText, ContentError, notifySearchEngines } from "./content";
import { parsePhotoIds } from "./photo-ids";

// Gallery albums (Step 8c-2): settings, ordered photos from the media library, text per language.

export const AlbumInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, e.g. annual-day-2026")
    .max(80),
  status: z.enum(["draft", "published"]),
  albumDate: z
    .union([z.literal(""), z.iso.date()])
    .default("")
    .transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  coverImageId: z
    .union([z.literal(""), z.uuid()])
    .default("")
    .transform((v) => v || null),
  photoIds: z
    .string()
    .default("")
    .transform((v) => parsePhotoIds(v, 200)),
});
export type AlbumInput = z.infer<typeof AlbumInput>;

export const AlbumTextInput = z.object({
  title: z.string().trim().min(1, "Enter the title").max(160),
  description: z
    .string()
    .trim()
    .max(600)
    .transform((v) => v || null),
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
export type AlbumTextInput = z.infer<typeof AlbumTextInput>;

export async function listAlbums() {
  const [rows, tr, items] = await Promise.all([
    db.select().from(galleryAlbums).orderBy(asc(galleryAlbums.sortOrder), asc(galleryAlbums.slug)),
    db
      .select({
        id: galleryAlbumTranslations.albumId,
        locale: galleryAlbumTranslations.locale,
        title: galleryAlbumTranslations.title,
        reviewedAt: galleryAlbumTranslations.reviewedAt,
      })
      .from(galleryAlbumTranslations),
    db.select({ albumId: galleryItems.albumId }).from(galleryItems),
  ]);
  return rows.map((a) => ({
    ...a,
    translations: tr.filter((t) => t.id === a.id),
    photoCount: items.filter((i) => i.albumId === a.id).length,
  }));
}

export async function getAlbumForEdit(id: string) {
  const [album] = await db.select().from(galleryAlbums).where(eq(galleryAlbums.id, id));
  if (!album) return null;
  const [translations, items] = await Promise.all([
    db.select().from(galleryAlbumTranslations).where(eq(galleryAlbumTranslations.albumId, id)),
    db.select().from(galleryItems).where(eq(galleryItems.albumId, id)).orderBy(asc(galleryItems.sortOrder)),
  ]);
  return { album, translations, photoIds: items.map((i) => i.mediaId) };
}

const isSlugClash = (e: unknown) =>
  /gallery_albums_slug_idx/.test(
    String((e as { message?: string }).message) + String((e as { cause?: unknown }).cause),
  );

/** Creates (id null) or updates an album; its photos are replaced in the given order. */
export async function saveAlbum(id: string | null, input: AlbumInput, actor: Actor): Promise<string> {
  const { photoIds, ...settings } = input;
  try {
    const saved = await withTx(async (tx) => {
      const [before] = id ? await tx.select().from(galleryAlbums).where(eq(galleryAlbums.id, id)) : [];
      if (id && !before) throw new ContentError("form", "That album no longer exists");
      const publishedAt =
        settings.status === "published" ? (before?.publishedAt ?? new Date()) : (before?.publishedAt ?? null);
      const albumId = id
        ? (
            await tx
              .update(galleryAlbums)
              .set({ ...settings, publishedAt, updatedAt: new Date() })
              .where(eq(galleryAlbums.id, id))
              .returning({ id: galleryAlbums.id })
          )[0]!.id
        : (
            await tx
              .insert(galleryAlbums)
              .values({ ...settings, publishedAt })
              .returning({ id: galleryAlbums.id })
          )[0]!.id;
      await tx.delete(galleryItems).where(eq(galleryItems.albumId, albumId));
      if (photoIds.length)
        await tx
          .insert(galleryItems)
          .values(photoIds.map((mediaId, i) => ({ albumId, mediaId, sortOrder: i + 1 })));
      await recordAudit(tx, actor, {
        action: id ? "gallery.update" : "gallery.create",
        entityType: "gallery_album",
        entityId: albumId,
        before: before ? { slug: before.slug, status: before.status } : null,
        after: { ...settings, photos: photoIds.length },
      });
      return albumId;
    });
    if (input.status === "published") await notifyAlbum(saved);
    return saved;
  } catch (error) {
    if (isSlugClash(error)) throw new ContentError("slug", "Another album already uses this address");
    throw error;
  }
}

export async function saveAlbumText(id: string, locale: Locale, input: AlbumTextInput, actor: Actor) {
  const data = await getAlbumForEdit(id);
  if (!data) throw new ContentError("form", "That album no longer exists");
  // Every photo shown in this language needs alt text in it.
  if (input.reviewed)
    await assertAltText(
      [...(data.album.coverImageId ? [data.album.coverImageId] : []), ...data.photoIds],
      locale,
    );
  await withTx(async (tx) => {
    const now = new Date();
    const values = {
      title: input.title,
      description: input.description,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    await tx
      .insert(galleryAlbumTranslations)
      .values({ albumId: id, locale, ...values })
      .onConflictDoUpdate({
        target: [galleryAlbumTranslations.albumId, galleryAlbumTranslations.locale],
        set: values,
      });
    await recordAudit(tx, actor, {
      action: "gallery.update",
      entityType: "gallery_album",
      entityId: id,
      after: { locale, title: input.title, reviewed: input.reviewed },
    });
  });
  if (input.reviewed && data.album.status === "published") await notifyAlbum(id);
}

export async function deleteAlbumText(id: string, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(galleryAlbumTranslations)
      .where(and(eq(galleryAlbumTranslations.albumId, id), eq(galleryAlbumTranslations.locale, locale)))
      .returning({ title: galleryAlbumTranslations.title });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "gallery.translation.delete",
        entityType: "gallery_album",
        entityId: id,
        before: { locale, title: gone[0]!.title },
      });
  });
}

/** Deletes an album and its text; the photos stay in the media library. */
export async function deleteAlbum(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(galleryAlbums)
      .where(eq(galleryAlbums.id, id))
      .returning({ slug: galleryAlbums.slug });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "gallery.delete",
        entityType: "gallery_album",
        entityId: id,
        before: { slug: gone[0]!.slug },
      });
  });
}

async function notifyAlbum(id: string) {
  const [album] = await db
    .select({ slug: galleryAlbums.slug })
    .from(galleryAlbums)
    .where(eq(galleryAlbums.id, id));
  const tr = await db
    .select({ locale: galleryAlbumTranslations.locale, reviewedAt: galleryAlbumTranslations.reviewedAt })
    .from(galleryAlbumTranslations)
    .where(eq(galleryAlbumTranslations.albumId, id));
  if (!album) return;
  await notifySearchEngines(
    tr
      .filter((t) => t.reviewedAt)
      .flatMap((t) => [`/${t.locale}/gallery/${album.slug}`, `/${t.locale}/gallery`]),
  );
}
