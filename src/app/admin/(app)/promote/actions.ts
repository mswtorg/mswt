"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { actorFor } from "@/lib/admin/actor";
import { notifySearchEngines } from "@/lib/admin/content";
import { promote, type Choice } from "@/lib/promote/apply";
import type { FormState } from "@/components/admin/form-state";

// "type:id|hash" per ticked box; the server compares again and checks the hash before moving.
const Pick = z
  .string()
  .regex(/^[a-z]+:[A-Za-z0-9_-]+\|[0-9a-f]{16}$/)
  .transform((v): Choice => {
    const [ref, hash] = v.split("|") as [string, string];
    return { ref, hash };
  });
const Picks = z.array(Pick).max(500);

const list = (items: string[]) => items.map((t) => `“${t}”`).join(", ");

export async function moveFromStage(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("promote.manage");
  const move = Picks.safeParse(form.getAll("move"));
  const remove = Picks.safeParse(form.getAll("remove"));
  if (!move.success || !remove.success)
    return { status: "error", errors: { form: "The list was out of date. Compare again." } };
  if (!move.data.length && !remove.data.length)
    return { status: "error", errors: { form: "Tick at least one item to move or remove." } };
  const result = await promote({ move: move.data, remove: remove.data }, actor);
  if (!result.ok) return { status: "error", errors: { form: result.message } };
  for (const tag of result.tags) updateTag(tag);
  await notifySearchEngines(result.paths);
  const parts = [
    result.moved.length ? `Moved to production: ${list(result.moved)}.` : "",
    result.removed.length ? `Removed from production: ${list(result.removed)}.` : "",
    result.refused.length
      ? `Not moved: ${result.refused.map((r) => `“${r.title}” (${r.reason})`).join("; ")}.`
      : "",
  ].filter(Boolean);
  const done = result.moved.length + result.removed.length > 0;
  return done
    ? { status: "saved", message: `${parts.join(" ")} The list below has been compared again.` }
    : { status: "error", errors: { form: parts.join(" ") } };
}
