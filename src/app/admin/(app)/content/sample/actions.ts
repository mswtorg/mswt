"use server";

import { updateTag } from "next/cache";
import { actorFor } from "@/lib/admin/actor";
import { loadSampleContent, removeSampleContent } from "@/lib/admin/sample";
import { CONTENT_TAG } from "@/lib/content/source";
import type { FormState } from "@/components/admin/form-state";

const n = (count: number | undefined, one: string, many: string) =>
  `${count ?? 0} ${count === 1 ? one : many}`;
const summary = (c: Record<string, number>) =>
  [
    n(c.causes, "cause", "causes"),
    n(c.events, "event", "events"),
    n(c.news, "news post", "news posts"),
    n(c.albums, "album", "albums"),
    n(c.documents, "document", "documents"),
    n(c.photos, "photo", "photos"),
  ].join(", ");

export async function loadSampleAction(_prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("content.sample");
  try {
    const counts = await loadSampleContent(actor);
    updateTag(CONTENT_TAG);
    return {
      status: "saved",
      message: `Sample content loaded: ${summary(counts)} (existing items were kept).`,
    };
  } catch (error) {
    console.error("Sample content", error);
    return {
      status: "error",
      errors: {
        form:
          error instanceof Error && /storage/.test(error.message)
            ? "Media storage isn't set up (R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL)."
            : `Loading stopped: ${error instanceof Error ? error.message : "unknown error"}. Run it again to continue.`,
      },
    };
  }
}

export async function removeSampleAction(_prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("content.sample");
  const counts = await removeSampleContent(actor);
  updateTag(CONTENT_TAG);
  return { status: "saved", message: `Removed: ${summary(counts)}. Approved items were kept.` };
}
