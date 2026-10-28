import type { Locale } from "@/i18n/routing";
import { getMediaViews } from "@/lib/content/media";
import { cn } from "@/lib/cn";
import { ImagePlaceholder } from "@/components/ui/ImagePlaceholder";
import { ratioClass } from "./photo-ratio";
import { ResponsiveImage } from "./ResponsiveImage";

/** A cover photo from the library, or the placeholder when none is set or it lacks alt text here. */
export async function CoverImage({
  mediaId,
  locale,
  fallback,
  ratio = "photo",
  sizes,
  priority,
  className,
}: {
  mediaId: string | null;
  locale: Locale;
  fallback: string;
  /** Detail pages pass the cover size chosen in the admin: short, wide (standard) or tall. */
  ratio?: "photo" | "wide" | "short" | "tall";
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const image = mediaId ? (await getMediaViews([mediaId], locale))[mediaId] : undefined;
  if (!image?.alt || !image.src)
    return (
      <ImagePlaceholder
        description={image?.alt ?? fallback}
        ratio={ratio === "short" ? "wide" : ratio === "tall" ? "photo" : ratio}
        className={className}
      />
    );
  return (
    <ResponsiveImage
      image={image}
      alt={image.alt}
      sizes={sizes}
      priority={priority}
      className={cn(ratioClass(ratio), className)}
    />
  );
}
