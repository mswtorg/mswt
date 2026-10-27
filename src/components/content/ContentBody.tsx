import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { Blocks } from "@/lib/content/blocks";
import { getMediaViews } from "@/lib/content/media";
import { imageIds } from "@/lib/content/markup";
import { isProduction } from "@/lib/content/source";
import { RichText } from "@/components/ui/RichText";
import type { PhotoStrings } from "./PhotoSlider";

/** Content blocks with their library photos loaded for this language. */
export async function ContentBody({ blocks, locale }: { blocks: Blocks; locale: Locale }) {
  const [media, photoStrings] = await Promise.all([
    getMediaViews(imageIds(blocks), locale),
    getPhotoStrings(locale),
  ]);
  return <RichText blocks={blocks} media={media} markMissing={!isProduction()} photoStrings={photoStrings} />;
}

/** Slider and viewer labels in `locale` ("Photos" messages). */
export async function getPhotoStrings(locale: Locale): Promise<PhotoStrings> {
  const t = await getTranslations({ locale, namespace: "Photos" });
  return {
    label: t("label"),
    previous: t("previous"),
    next: t("next"),
    slide: t.raw("slide") as string,
    open: t("open"),
    close: t("close"),
  };
}
