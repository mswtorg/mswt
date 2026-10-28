// Shared by server (LibraryPhotos) and client (PhotoSlider) components, so it must not live in a
// "use client" file: the server can't call a function exported from one.

export type PhotoRatio = "wide" | "photo" | "banner";

/** Photo shape: 16:9, 4:3, or the full-width Home banner (16:9 on phones, 5:2 from lg, at most 560px high). */
export const ratioClass = (ratio: PhotoRatio) =>
  ratio === "banner"
    ? "rounded-none aspect-video lg:aspect-[5/2] lg:max-h-[35rem]"
    : ratio === "wide"
      ? "aspect-video"
      : "aspect-[4/3]";
