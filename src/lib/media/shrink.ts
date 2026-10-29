// Browser-side helpers for photos on their way into the media library (no server imports here).

const MAX_SIDE = 2560;
const KEEP_AS_IS = 3 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photos straight from a phone are often 5–12 MB; Vercel accepts at most 4.5 MB per request. The
 * browser scales them to 2560 px (applying the camera's rotation) before upload; the server then
 * checks the file again and makes the web copies.
 */
export async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_AS_IS) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

type Transfer = Pick<DataTransfer, "files" | "getData">;

/**
 * The photos in a paste or drop, or none when it is really text. Word, Google Docs and web pages
 * often add a picture of the copied selection next to the text: that stays a text paste. A copied
 * image ("Copy image") may come with HTML that is only an <img>, which counts as a photo.
 */
export function imagesFrom(data: Transfer | null | undefined): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []).filter((f) => PHOTO_TYPES.includes(f.type));
  if (!files.length) return [];
  const plain = data.getData("text/plain").trim();
  const html = data.getData("text/html");
  const htmlText = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|\s/g, "");
  return plain || htmlText ? [] : files;
}

/** Photo names for a paste ("image.png" from every screenshot) get the date, so the library can tell them apart. */
export function pastedName(file: File, now = new Date()): string {
  if (file.name && !/^image\.\w+$/i.test(file.name)) return file.name;
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `pasted-${stamp}.${ext}`;
}
