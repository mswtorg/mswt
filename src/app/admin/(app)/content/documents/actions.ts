"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError } from "@/lib/admin/content";
import {
  deleteDocument,
  deleteDocumentTitle,
  DocumentError,
  DocumentInput,
  DocumentTitleInput,
  finishPdfUpload,
  saveDocument,
  saveDocumentTitle,
  startPdfUpload,
  uploadPdfThroughServer,
} from "@/lib/admin/documents";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const UPLOAD_MESSAGES: Record<DocumentError["code"], string> = {
  storage: "Media storage isn't set up yet (R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL).",
  missing: "The upload didn't arrive. Try again.",
  not_pdf: "That file isn't a PDF.",
  too_big: "The PDF is too large (25 MB at most).",
  not_found: "That document no longer exists.",
};
export type UploadResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveDocumentAction(
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = DocumentInput.safeParse(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  let saved: string;
  try {
    saved = await saveDocument(id, parsed.data, actor);
  } catch (error) {
    if (error instanceof ContentError)
      return { status: "error", errors: { [error.field]: error.message }, values: v };
    throw error;
  }
  updateTag(CONTENT_TAG);
  if (!id) redirect(`/admin/content/documents/${saved}?created=1`);
  return { status: "saved", message: "Saved." };
}

export async function saveDocumentTitleAction(
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = DocumentTitleInput.safeParse({ title: v.title ?? "", reviewed: v.reviewed === "on" });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  await saveDocumentTitle(id, locale, parsed.data, actor);
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Saved." };
}

export async function deleteDocumentTitleAction(
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteDocumentTitle(id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/documents/${id}?lang=${locale}&removed=1`);
}

export async function deleteDocumentAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteDocument(id, actor);
  updateTag(CONTENT_TAG);
  redirect("/admin/content/documents?deleted=1");
}

/** Step 1: a direct upload URL (R2) or null (local: post the file to uploadPdfAction). */
export async function startPdfUploadAction(
  id: string,
  filename: string,
  bytes: number,
): Promise<{ ok: true; key: string; url: string | null } | { ok: false; message: string }> {
  await actorFor("cms.write");
  try {
    return { ok: true, ...(await startPdfUpload(id, String(filename), Number(bytes))) };
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: UPLOAD_MESSAGES[error.code] };
    throw error;
  }
}

/** Step 2 after a direct upload: check the file and attach it. */
export async function finishPdfUploadAction(
  id: string,
  key: string,
  filename: string,
): Promise<UploadResult> {
  const { actor } = await actorFor("cms.write");
  try {
    await finishPdfUpload(id, String(key), String(filename), actor);
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: UPLOAD_MESSAGES[error.code] };
    throw error;
  }
  updateTag(CONTENT_TAG);
  return { ok: true, message: "PDF uploaded." };
}

/** Local storage: the PDF is posted to the server. */
export async function uploadPdfAction(id: string, form: FormData): Promise<UploadResult> {
  const { actor } = await actorFor("cms.write");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a PDF." };
  try {
    await uploadPdfThroughServer(id, file.name, new Uint8Array(await file.arrayBuffer()), actor);
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: UPLOAD_MESSAGES[error.code] };
    throw error;
  }
  updateTag(CONTENT_TAG);
  return { ok: true, message: "PDF uploaded." };
}
