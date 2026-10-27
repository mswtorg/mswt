"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError } from "@/lib/admin/content";
import {
  deleteItem,
  deleteItemTranslation,
  EventInput,
  NewsInput,
  saveEvent,
  saveEventText,
  saveNews,
  saveNewsText,
  TextInput,
} from "@/lib/admin/events";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

type Kind = "events" | "news";

const fail = (error: unknown, values: Record<string, string>): FormState => {
  if (error instanceof ContentError)
    return { status: "error", errors: { [error.field]: error.message }, values };
  throw error;
};

/** Events and news settings (create when `id` is null, then open the item to write its text). */
export async function saveItemSettingsAction(
  kind: Kind,
  id: string | null,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  let savedId: string;
  try {
    if (kind === "events") {
      const parsed = EventInput.safeParse(v);
      if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
      savedId = await saveEvent(id, parsed.data, actor);
    } else {
      const parsed = NewsInput.safeParse(v);
      if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
      savedId = await saveNews(id, parsed.data, actor);
    }
  } catch (error) {
    return fail(error, v);
  }
  updateTag(CONTENT_TAG);
  if (!id) redirect(`/admin/content/${kind}/${savedId}?created=1`);
  return { status: "saved", message: "Settings saved." };
}

export async function saveItemTextAction(
  kind: Kind,
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = TextInput.safeParse({
    title: v.title ?? "",
    summary: v.summary ?? "",
    body: v.body ?? "",
    seoTitle: v.seoTitle ?? "",
    seoDescription: v.seoDescription ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    if (kind === "events") await saveEventText(id, locale, parsed.data, actor);
    else await saveNewsText(id, locale, parsed.data, actor);
  } catch (error) {
    return fail(error, v);
  }
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.reviewed
      ? "Saved. It shows in this language once published."
      : "Saved as a draft: it shows on previews, and in production once marked reviewed.",
  };
}

export async function deleteItemTextAction(
  kind: Kind,
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteItemTranslation(kind, id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/${kind}/${id}?lang=${locale}&removed=1`);
}

export async function deleteItemAction(kind: Kind, id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteItem(kind, id, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/${kind}?deleted=1`);
}
