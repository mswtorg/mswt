"use server";

import { updateTag } from "next/cache";
import { actorFor } from "@/lib/admin/actor";
import { MENU_LOCATIONS, MenuInput, saveMenu, type MenuLocation } from "@/lib/admin/menus";
import { CONTENT_TAG } from "@/lib/content/source";
import type { FormState } from "@/components/admin/form-state";

export async function saveMenuAction(
  location: MenuLocation,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  if (!MENU_LOCATIONS.includes(location)) return { status: "error", errors: { form: "Unknown menu" } };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    return { status: "error", errors: { form: "The menu could not be read. Reload and try again." } };
  }
  const parsed = MenuInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const row = typeof issue.path[0] === "number" ? `Link ${issue.path[0] + 1}: ` : "";
    return { status: "error", errors: { form: `${row}${issue.message}` } };
  }
  await saveMenu(location, parsed.data, actor);
  updateTag(CONTENT_TAG);
  return {
    status: "saved",
    message: parsed.data.length ? "Menu saved." : "Menu cleared: the built-in menu is shown again.",
  };
}

export async function resetMenuAction(location: MenuLocation, _prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("cms.write");
  if (!MENU_LOCATIONS.includes(location)) return { status: "error", errors: { form: "Unknown menu" } };
  await saveMenu(location, [], actor);
  updateTag(CONTENT_TAG);
  return { status: "saved", message: "Back to the built-in menu." };
}
