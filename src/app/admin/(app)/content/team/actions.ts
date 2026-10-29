"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { ContentError } from "@/lib/admin/content";
import {
  createTeamMember,
  deleteTeamMember,
  deleteTeamMemberTranslation,
  saveTeamMemberTranslation,
  TeamMemberInput,
  TeamMemberTextInput,
  updateTeamMember,
} from "@/lib/admin/team";
import { CONTENT_TAG } from "@/lib/content/source";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const settingsInput = (v: Record<string, string>) =>
  TeamMemberInput.safeParse({
    status: v.status,
    sortOrder: v.sortOrder || "0",
    showOnAbout: v.showOnAbout === "on",
    photoId: v.photoId ?? "",
  });

const contentFail = (error: unknown, values: Record<string, string>): FormState => {
  if (error instanceof ContentError)
    return { status: "error", errors: { [error.field]: error.message }, values };
  throw error;
};

export async function createTeamMemberAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = settingsInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  let id: string;
  try {
    id = await createTeamMember(parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/team/${id}?created=1`);
}

export async function updateTeamMemberAction(
  id: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = settingsInput(v);
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await updateTeamMember(id, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Settings saved." };
}

export async function saveTeamMemberTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  const v = formValues(form);
  const parsed = TeamMemberTextInput.safeParse({
    name: v.name ?? "",
    designation: v.designation ?? "",
    bio: v.bio ?? "",
    reviewed: v.reviewed === "on",
  });
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values: v };
  try {
    await saveTeamMemberTranslation(id, locale, parsed.data, actor);
  } catch (error) {
    return contentFail(error, v);
  }
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.reviewed
      ? "Saved. It shows in this language once the member is published."
      : "Saved as a draft: it shows on previews, and in production once marked reviewed.",
  };
}

export async function deleteTeamMemberTextAction(
  id: string,
  locale: Locale,
  _prev: FormState,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteTeamMemberTranslation(id, locale, actor);
  updateTag(CONTENT_TAG);
  redirect(`/admin/content/team/${id}?lang=${locale}&removed=1`);
}

export async function deleteTeamMemberAction(id: string, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  await deleteTeamMember(id, actor);
  updateTag(CONTENT_TAG);
  redirect("/admin/content/team?deleted=1");
}
