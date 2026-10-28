// Shared by server (LibraryPhotos) and client (PhotoSlider) components, so it must not live in a
// "use client" file: the server can't call a function exported from one.

/** Header/cover photo heights chosen in the admin (Header photo size, Cover photo size). */
export const COVER_SIZES = ["short", "standard", "tall"] as const;
export type CoverSize = (typeof COVER_SIZES)[number];
export const COVER_SIZE_OPTIONS = [
  { value: "short", label: "Short banner" },
  { value: "standard", label: "Standard" },
  { value: "tall", label: "Tall" },
];

export type PhotoRatio = "wide" | "photo" | "short" | "tall" | "banner" | "banner-short" | "banner-tall";

/** The full-width Home banner shapes (edge to edge, square corners). */
export const isBanner = (ratio: PhotoRatio) => ratio.startsWith("banner");

/**
 * Photo shape: wide 16:9, photo 4:3, short 3:1, tall 4:3 (a header that shows more of the photo).
 * Home banners: standard is 16:9 on phones, 5:2 from lg (at most 560px high); short 2:1 → 4:1;
 * tall 4:3 → 2:1 (at most 640px high).
 */
export const ratioClass = (ratio: PhotoRatio) =>
  ({
    wide: "aspect-video",
    photo: "aspect-[4/3]",
    short: "aspect-[3/1]",
    tall: "aspect-[4/3]",
    banner: "rounded-none aspect-video lg:aspect-[5/2] lg:max-h-[35rem]",
    "banner-short": "rounded-none aspect-[2/1] lg:aspect-[4/1]",
    "banner-tall": "rounded-none aspect-[4/3] lg:aspect-[2/1] lg:max-h-[40rem]",
  })[ratio];

/** A header/cover size → its shape (`banner` for Home's edge-to-edge header). */
export function coverRatio(size: CoverSize, banner = false): PhotoRatio {
  if (banner) return size === "standard" ? "banner" : size === "short" ? "banner-short" : "banner-tall";
  return size === "standard" ? "wide" : size;
}
