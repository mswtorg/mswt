import { variantKey } from "./process";

/** What a page needs to show one photo: sizes for srcset, the blur placeholder, its alt text. */
export type ImageView = {
  id: string;
  width: number;
  height: number;
  blur: string | null;
  /** Largest copy; null when the item has no stored file (sample content) → placeholder. */
  src: string | null;
  srcset: string | null;
  alt: string | null;
  /** Caption in the same language, if any. */
  caption: string | null;
};

type Row = {
  id: string;
  r2Key: string | null;
  variants: number[];
  width: number;
  height: number;
  blur: string | null;
};

export function imageView(
  row: Row,
  publicBase: string | null,
  alt: string | null,
  caption: string | null = null,
): ImageView {
  const files = row.r2Key && publicBase && row.variants.length ? row.variants : [];
  const url = (w: number) => `${publicBase}/${variantKey(row.r2Key!, w)}`;
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    blur: row.blur,
    src: files.length ? url(files.at(-1)!) : null,
    srcset: files.length ? files.map((w) => `${url(w)} ${w}w`).join(", ") : null,
    alt,
    caption,
  };
}
