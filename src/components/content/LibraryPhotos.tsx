import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n/routing";
import type { ContentPageKey } from "@/lib/admin/content-pages";
import { getMediaViews } from "@/lib/content/media";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG } from "@/lib/content/source";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { getPhotoStrings } from "./ContentBody";
import { PhotoSlider, type SlidePhoto } from "./PhotoSlider";
import { ResponsiveImage } from "./ResponsiveImage";

/**
 * Library photos in `locale`: one photo is shown as an image, several as a slider. Photos without
 * alt text in this language are left out (they can't be marked reviewed, so this only affects
 * previews). Renders nothing when no photo is usable.
 */
export async function LibraryPhotos({
  ids,
  locale,
  priority = false,
  ratio = "wide",
  sizes,
  className,
}: {
  ids: string[];
  locale: Locale;
  priority?: boolean;
  ratio?: "wide" | "photo";
  sizes?: string;
  className?: string;
}) {
  if (!ids.length) return null;
  const [views, t] = await Promise.all([getMediaViews(ids, locale), getPhotoStrings(locale)]);
  const photos = ids.map((id) => views[id]).filter((p): p is SlidePhoto => Boolean(p?.alt && p.src));
  if (!photos.length) return null;
  if (photos.length === 1) {
    const p = photos[0]!;
    return (
      <figure className={cn("m-0 grid gap-2", className)}>
        <ResponsiveImage
          image={p}
          alt={p.alt}
          sizes={sizes}
          priority={priority}
          className={ratio === "wide" ? "aspect-video" : "aspect-[4/3]"}
        />
        {p.caption ? <figcaption className="text-sm text-fg-muted">{p.caption}</figcaption> : null}
      </figure>
    );
  }
  return (
    <PhotoSlider
      photos={photos}
      t={t}
      ratio={ratio}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}

/** A fixed page's header photos (Content → Pages); the same in every language. */
export const getPageHeroIds = unstable_cache(
  async (key: ContentPageKey): Promise<string[]> => {
    const [row] = await db
      .select({ ids: pages.heroMediaIds })
      .from(pages)
      .where(and(eq(pages.key, key)));
    return row?.ids ?? [];
  },
  ["page-hero"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

/** Header photo(s) for a fixed page, above its heading. */
export async function PageHero({
  pageKey,
  locale,
  className,
}: {
  pageKey: ContentPageKey;
  locale: Locale;
  className?: string;
}) {
  const ids = await getPageHeroIds(pageKey);
  return (
    <LibraryPhotos
      ids={ids}
      locale={locale}
      priority
      sizes="(min-width: 1280px) 1200px, 100vw"
      className={className}
    />
  );
}
