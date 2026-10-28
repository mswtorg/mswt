"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError, deletePageTranslation, PageInput, savePageTranslation } from "@/lib/admin/content";
import type { ContentPageKey } from "@/lib/admin/content-pages";
import { HOME_SECTION_FIELDS, HiddenSectionsInput, SectionOrderInput } from "@/lib/content/home";
import { parsePhotoIds } from "@/lib/admin/photo-ids";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

export async function savePageAction(
  key: ContentPageKey,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = PageInput.safeParse({
    title: v.title ?? "",
    h1: v.h1 ?? "",
    intro: v.intro ?? "",
    body: v.body ?? "",
    seoTitle: v.seoTitle ?? "",
    seoDescription: v.seoDescription ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  const extras =
    key === "home"
      ? {
          eyebrow: v.eyebrow ?? "",
          points: [1, 2, 3].map((n) => ({
            title: v[`point${n}Title`] ?? "",
            text: v[`point${n}Text`] ?? "",
          })),
          impact: [1, 2, 3, 4]
            .map((n) => ({ value: v[`impact${n}Value`] ?? "", label: v[`impact${n}Label`] ?? "" }))
            .filter((x) => x.value.trim() || x.label.trim()),
          sections: Object.fromEntries(HOME_SECTION_FIELDS.map(([k]) => [k, v[`section_${k}`] ?? ""])),
        }
      : null;
  // Home: the section order (the same in every language).
  const order =
    key === "home" && v.sectionOrder !== undefined
      ? SectionOrderInput.safeParse(v.sectionOrder.split(",").filter(Boolean))
      : null;
  const off =
    key === "home" && v.sectionOrder !== undefined
      ? HiddenSectionsInput.safeParse((v.hiddenSections ?? "").split(",").filter(Boolean))
      : null;
  const layoutError = (order && !order.success ? order : off && !off.success ? off : null)?.error;
  if (layoutError)
    return { status: "error", errors: { sectionOrder: layoutError.issues[0]!.message }, values: v };
  try {
    await savePageTranslation(
      key,
      locale,
      parsed.data,
      extras,
      actor,
      parsePhotoIds(v.heroMediaIds, 8),
      order?.success && off?.success ? { order: order.data, hidden: off.data } : undefined,
    );
  } catch (error) {
    if (error instanceof ContentError)
      return { status: "error", errors: { [error.field]: error.message }, values: v };
    throw error;
  }
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.reviewed
      ? "Saved and published in this language."
      : "Saved as a draft: it shows on previews, and in production once marked reviewed.",
  };
}

export async function deletePageTranslationAction(
  key: ContentPageKey,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deletePageTranslation(key, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/pages/${key}?lang=${locale}&removed=1`);
}
