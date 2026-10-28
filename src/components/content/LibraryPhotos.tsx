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
import {
  coverRatio,
  COVER_SIZES,
  isBanner,
  ratioClass,
  type CoverSize,
  type PhotoRatio,
} from "./photo-ratio";
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
  ratio?: PhotoRatio;
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
          className={ratioClass(ratio)}
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
      overlayDots={isBanner(ratio)}
      className={className}
    />
  );
}

/** A fixed page's header photos and their size (Content → Pages); the same in every language. */
export const getPageHero = unstable_cache(
  async (key: ContentPageKey): Promise<{ ids: string[]; size: CoverSize }> => {
    const [row] = await db
      .select({ ids: pages.heroMediaIds, size: pages.heroSize })
      .from(pages)
      .where(and(eq(pages.key, key)));
    const size = (COVER_SIZES as readonly string[]).includes(row?.size ?? "")
      ? (row!.size as CoverSize)
      : "standard";
    return { ids: row?.ids ?? [], size };
  },
  ["page-hero"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

/**
 * Header photo(s) for a fixed page, above its heading. `full` (Home only) is an edge-to-edge
 * banner: place it outside the page container.
 */
export async function PageHero({
  pageKey,
  locale,
  variant = "contained",
  className,
}: {
  pageKey: ContentPageKey;
  locale: Locale;
  variant?: "contained" | "full";
  className?: string;
}) {
  const { ids, size } = await getPageHero(pageKey);
  const full = variant === "full";
  return (
    <LibraryPhotos
      ids={ids}
      locale={locale}
      priority
      ratio={coverRatio(size, full)}
      sizes={full ? "100vw" : "(min-width: 1280px) 1200px, 100vw"}
      className={className}
    />
  );
}
