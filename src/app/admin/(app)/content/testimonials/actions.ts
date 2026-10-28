"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError } from "@/lib/admin/content";
import {
  createTestimonial,
  deleteTestimonial,
  deleteTestimonialTranslation,
  saveTestimonialTranslation,
  TestimonialInput,
  TestimonialTextInput,
  updateTestimonial,
} from "@/lib/admin/testimonials";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const settingsInput = (v: Record<string, string>) =>
  TestimonialInput.safeParse({
    status: v.status,
    sortOrder: v.sortOrder || "0",
    showOnHome: v.showOnHome === "on",
    photoId: v.photoId ?? "",
  });

const contentFail = (error: unknown, values: Record<string, string>): FormState => {
  if (error instanceof ContentError)
    return { status: "error", errors: { [error.field]: error.message }, values };
  throw error;
};

export async function createTestimonialAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = settingsInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  let id: string;
  try {
    id = await createTestimonial(parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/testimonials/${id}?created=1`);
}

export async function updateTestimonialAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = settingsInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await updateTestimonial(id, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Settings saved." };
}

export async function saveTestimonialTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = TestimonialTextInput.safeParse({
    quote: v.quote ?? "",
    name: v.name ?? "",
    role: v.role ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await saveTestimonialTranslation(id, locale, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.reviewed
      ? "Saved. It shows in this language once the testimonial is published."
      : "Saved as a draft: it shows on previews, and in production once marked reviewed.",
  };
}

export async function deleteTestimonialTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteTestimonialTranslation(id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/testimonials/${id}?lang=${locale}&removed=1`);
}

export async function deleteTestimonialAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteTestimonial(id, actor);
  updateTag(CONTENT_TAG);
  redirect("/admin/content/testimonials?deleted=1");
}
