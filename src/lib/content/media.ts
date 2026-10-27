import { inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { routing, type Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { media, mediaTranslations } from "@/lib/db/schema";
import { imageView, type ImageView } from "@/lib/media/view";
import { siteUrl } from "@/lib/seo/site";
import { getMediaStorage } from "@/lib/storage/media";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG } from "./source";

/** Library photos by id, with alt text in `locale` only (no fallback to another language). */
export const getMediaViews = unstable_cache(
  async (ids: string[], locale: Locale): Promise<Record<string, ImageView>> => {
    if (!ids.length || !routing.locales.includes(locale)) return {};
    const [rows, tr] = await Promise.all([
      db.select().from(media).where(inArray(media.id, ids)),
      db.select().from(mediaTranslations).where(inArray(mediaTranslations.mediaId, ids)),
    ]);
    const base = getMediaStorage()?.publicBase ?? null;
    return Object.fromEntries(
      rows.map((r) => {
        const t = tr.find((x) => x.mediaId === r.id && x.locale === locale);
        return [r.id, imageView(r, base, t?.altText ?? null, t?.caption ?? null)];
      }),
    );
  },
  ["media-views"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

/** Absolute URL of a library photo with alt text in `locale` (structured data, share images). */
export async function absoluteImageUrl(id: string | null, locale: Locale): Promise<string | undefined> {
  if (!id) return undefined;
  const v = (await getMediaViews([id], locale))[id];
  if (!v?.src || !v.alt) return undefined;
  return v.src.startsWith("/") ? new URL(v.src, siteUrl()).toString() : v.src;
}
