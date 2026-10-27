"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError } from "@/lib/admin/content";
import {
  AlbumInput,
  AlbumTextInput,
  deleteAlbum,
  deleteAlbumText,
  saveAlbum,
  saveAlbumText,
} from "@/lib/admin/gallery";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const fail = (error: unknown, values: Record<string, string>): FormState => {
  if (error instanceof ContentError)
    return { status: "error", errors: { [error.field]: error.message }, values };
  throw error;
};

export async function saveAlbumAction(
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = AlbumInput.safeParse(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  let saved: string;
  try {
    saved = await saveAlbum(id, parsed.data, actor);
  } catch (error) {
    return fail(error, v);
  }
  updateTag(CONTENT_TAG);
  if (!id) redirect(`/admin/content/gallery/${saved}?created=1`);
  return { status: "saved", message: "Album saved." };
}

export async function saveAlbumTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = AlbumTextInput.safeParse({
    title: v.title ?? "",
    description: v.description ?? "",
    seoTitle: v.seoTitle ?? "",
    seoDescription: v.seoDescription ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await saveAlbumText(id, locale, parsed.data, actor);
  } catch (error) {
    return fail(error, v);
  }
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Saved." };
}

export async function deleteAlbumTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteAlbumText(id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/gallery/${id}?lang=${locale}&removed=1`);
}

export async function deleteAlbumAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteAlbum(id, actor);
  updateTag(CONTENT_TAG);
  redirect("/admin/content/gallery?deleted=1");
}
