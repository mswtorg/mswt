"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import {
  CauseInput,
  CauseTextInput,
  createCause,
  deleteCause,
  deleteCauseTranslation,
  saveCauseTranslation,
  updateCause,
} from "@/lib/admin/causes";
import { ContentError } from "@/lib/admin/content";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const causeInput = (v: Record<string, string>) =>
  CauseInput.safeParse({
    slug: v.slug ?? "",
    status: v.status,
    goal: v.goal ?? "",
    is80gEligible: v.is80gEligible === "on",
    sortOrder: v.sortOrder || "0",
    coverImageId: v.coverImageId ?? "",
    photoIds: v.photoIds ?? "",
  });

const contentFail = (error: unknown, values: Record<string, string>): FormState => {
  if (error instanceof ContentError)
    return { status: "error", errors: { [error.field]: error.message }, values };
  throw error;
};

export async function createCauseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("causes.write");
  const v = formValues(form);
  const parsed = causeInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  let id: string;
  try {
    id = await createCause(parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/causes/${id}?created=1`);
}

export async function updateCauseAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("causes.write");
  const v = formValues(form);
  const parsed = causeInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await updateCause(id, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Cause settings saved." };
}

export async function saveCauseTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("causes.write");
  const v = formValues(form);
  const parsed = CauseTextInput.safeParse({
    title: v.title ?? "",
    summary: v.summary ?? "",
    body: v.body ?? "",
    seoTitle: v.seoTitle ?? "",
    seoDescription: v.seoDescription ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await saveCauseTranslation(id, locale, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.reviewed
      ? "Saved. It shows in this language once the cause is active."
      : "Saved as a draft: it shows on previews, and in production once marked reviewed.",
  };
}

export async function deleteCauseTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("causes.write");
  await deleteCauseTranslation(id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/causes/${id}?lang=${locale}&removed=1`);
}

export async function deleteCauseAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("causes.write");
  try {
    await deleteCause(id, actor);
  } catch (error) {
    return contentFail(error, {});
  }
  updateTag(CONTENT_TAG);
  redirect("/admin/content/causes?deleted=1");
}
