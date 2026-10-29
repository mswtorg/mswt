"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { actorFor } from "@/lib/admin/actor";
import {
  deleteMedia,
  libraryItem,
  MediaServiceError,
  MediaTextInput,
  updateMediaText,
  uploadMedia,
} from "@/lib/admin/media";
import { CONTENT_TAG } from "@/lib/content/source";
import { MediaError } from "@/lib/media/process";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";

const MEDIA_MESSAGES: Record<MediaError["code"] | MediaServiceError["code"], string> = {
  format: "Upload a JPEG, PNG or WebP photo.",
  size: "The photo is too large (4 MB at most after resizing).",
  dimensions: "The photo is too small (at least 200 pixels wide).",
  storage: "Media storage isn't set up yet (R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL).",
  in_use: "This photo is still used. Remove it from those pages first.",
  not_found: "That photo no longer exists.",
};

export async function uploadMediaAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", errors: { file: "Choose a photo to upload" }, values: v };
  if ((v.alt ?? "").trim().length < 3)
    return { status: "error", errors: { alt: "Describe the photo in a few words" }, values: v };
  let id: string;
  try {
    ({ id } = await uploadMedia(
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        altEn: v.alt!,
        captionEn: v.caption,
      },
      actor,
    ));
  } catch (error) {
    if (error instanceof MediaError || error instanceof MediaServiceError)
      return { status: "error", errors: { file: MEDIA_MESSAGES[error.code] }, values: v };
    throw error;
  }
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/media/${id}?uploaded=1`);
}

export type PastedPhoto =
  { ok: true; item: LibraryItem } | { ok: false; field: "file" | "alt"; message: string };

/**
 * A photo pasted or dropped into an admin field: added to the media library like any upload
 * (English alt text required), then handed back so the field can place it at once.
 */
export async function uploadPastedPhotoAction(form: FormData): Promise<PastedPhoto> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, field: "file", message: "Choose a photo to upload" };
  if ((v.alt ?? "").trim().length < 3)
    return { ok: false, field: "alt", message: "Describe the photo in a few words" };
  try {
    const { id } = await uploadMedia(
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        filename: file.name,
        altEn: v.alt!,
        captionEn: v.caption,
      },
      actor,
    );
    updateTag(CONTENT_TAG);
    const item = await libraryItem(id);
    if (!item) return { ok: false, field: "file", message: MEDIA_MESSAGES.not_found };
    return { ok: true, item };
  } catch (error) {
    if (error instanceof MediaError || error instanceof MediaServiceError)
      return { ok: false, field: "file", message: MEDIA_MESSAGES[error.code] };
    throw error;
  }
}

export async function updateMediaTextAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = MediaTextInput.safeParse(
    Object.fromEntries(
      (["en", "hi", "mr", "gu"] as const).map((l) => [
        l,
        { alt: v[`alt_${l}`] ?? "", caption: v[`caption_${l}`] ?? "" },
      ]),
    ),
  );
  if (!parsed.success) {
    const errors = Object.fromEntries(
      Object.entries(issuesToErrors(parsed.error.issues)).map(([k, m]) => [k.replace(".", "_"), m]),
    );
    return { status: "error", errors, values: v };
  }
  await updateMediaText(id, parsed.data, actor);
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Alt text and captions saved." };
}

export async function deleteMediaAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  try {
    await deleteMedia(id, actor);
  } catch (error) {
    if (error instanceof MediaServiceError)
      return { status: "error", errors: { form: MEDIA_MESSAGES[error.code] } };
    throw error;
  }
  updateTag(CONTENT_TAG);
  redirect("/admin/content/media?deleted=1");
}
