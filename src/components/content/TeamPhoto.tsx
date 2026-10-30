import type { Locale } from "@/i18n/routing";
import { getMediaViews } from "@/lib/content/media";
import { initials } from "@/lib/initials";
import { ResponsiveImage } from "./ResponsiveImage";

/** A team member's library photo (round), or their initials when none is set or it lacks alt text here. */
export async function TeamPhoto({
  mediaId,
  name,
  locale,
}: {
  mediaId: string | null;
  name: string;
  locale: Locale;
}) {
  const image = mediaId ? (await getMediaViews([mediaId], locale))[mediaId] : undefined;
  if (!image?.alt || !image.src)
    // Decorative: the name is the heading right below.
    return (
      <span
        aria-hidden="true"
        data-initials
        className="grid size-32 place-items-center rounded-full bg-bg-brand-subtle text-4xl font-semibold text-fg-brand"
      >
        {initials(name)}
      </span>
    );
  return (
    <ResponsiveImage
      image={image}
      alt={image.alt}
      sizes="128px"
      className="aspect-square w-32 rounded-full"
    />
  );
}
