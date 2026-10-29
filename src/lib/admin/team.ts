import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { imageIds } from "@/lib/content/markup";
import { db } from "@/lib/db/client";
import { media, teamMembers, teamMemberTranslations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { assertAltText, ContentError, notifySearchEngines, parseBody } from "./content";

export const TeamMemberInput = z.object({
  status: z.enum(["draft", "published"]),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  showOnAbout: z.boolean(),
  photoId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});
export type TeamMemberInput = z.infer<typeof TeamMemberInput>;

export const TeamMemberTextInput = z.object({
  name: z.string().trim().min(1, "Enter the name").max(120),
  designation: z.string().trim().min(1, "Enter the designation").max(120),
  /** Details in the editor's text format (parsed into blocks on save). */
  bio: z.string().max(20_000),
  reviewed: z.boolean(),
});
export type TeamMemberTextInput = z.infer<typeof TeamMemberTextInput>;

export async function listTeamMembers() {
  const [rows, tr] = await Promise.all([
    db.select().from(teamMembers).orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt)),
    db
      .select({
        memberId: teamMemberTranslations.memberId,
        locale: teamMemberTranslations.locale,
        name: teamMemberTranslations.name,
        designation: teamMemberTranslations.designation,
        reviewedAt: teamMemberTranslations.reviewedAt,
      })
      .from(teamMemberTranslations),
  ]);
  return rows.map((m) => ({ ...m, translations: tr.filter((x) => x.memberId === m.id) }));
}

export async function getTeamMemberForEdit(id: string) {
  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
  if (!row) return null;
  const translations = await db
    .select()
    .from(teamMemberTranslations)
    .where(eq(teamMemberTranslations.memberId, id));
  return { member: row, translations };
}

async function assertPhoto(id: string | null) {
  if (!id) return;
  const [m] = await db.select({ id: media.id }).from(media).where(eq(media.id, id));
  if (!m) throw new ContentError("photoId", "That photo no longer exists");
}

/** Tells search engines that /team (and About, when shown there) changed (production only). */
async function notifyTeam(id: string) {
  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
  if (!row || row.status !== "published") return;
  const tr = await db
    .select({ locale: teamMemberTranslations.locale, reviewedAt: teamMemberTranslations.reviewedAt })
    .from(teamMemberTranslations)
    .where(eq(teamMemberTranslations.memberId, id));
  await notifySearchEngines(
    tr
      .filter((t) => t.reviewedAt)
      .flatMap((t) => [`/${t.locale}/team`, ...(row.showOnAbout ? [`/${t.locale}/about`] : [])]),
  );
}

export async function createTeamMember(input: TeamMemberInput, actor: Actor): Promise<string> {
  await assertPhoto(input.photoId);
  return withTx(async (tx) => {
    const [row] = await tx.insert(teamMembers).values(input).returning({ id: teamMembers.id });
    await recordAudit(tx, actor, {
      action: "team.create",
      entityType: "team_member",
      entityId: row!.id,
      after: input,
    });
    return row!.id;
  });
}

export async function updateTeamMember(id: string, input: TeamMemberInput, actor: Actor) {
  await assertPhoto(input.photoId);
  await withTx(async (tx) => {
    const [before] = await tx.select().from(teamMembers).where(eq(teamMembers.id, id));
    if (!before) throw new ContentError("form", "That team member no longer exists");
    await tx
      .update(teamMembers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(teamMembers.id, id));
    await recordAudit(tx, actor, {
      action: "team.update",
      entityType: "team_member",
      entityId: id,
      before: {
        status: before.status,
        sortOrder: before.sortOrder,
        showOnAbout: before.showOnAbout,
        photoId: before.photoId,
      },
      after: input,
    });
  });
  await notifyTeam(id);
}

export async function saveTeamMemberTranslation(
  id: string,
  locale: Locale,
  input: TeamMemberTextInput,
  actor: Actor,
) {
  const bio = parseBody(input.bio);
  if (input.reviewed) await assertAltText(imageIds(bio), locale);
  await withTx(async (tx) => {
    const [m] = await tx.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, id));
    if (!m) throw new ContentError("form", "That team member no longer exists");
    const now = new Date();
    const values = {
      name: input.name,
      designation: input.designation,
      bio,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    const [before] = await tx
      .select({
        name: teamMemberTranslations.name,
        designation: teamMemberTranslations.designation,
        reviewedAt: teamMemberTranslations.reviewedAt,
      })
      .from(teamMemberTranslations)
      .where(and(eq(teamMemberTranslations.memberId, id), eq(teamMemberTranslations.locale, locale)));
    await tx
      .insert(teamMemberTranslations)
      .values({ memberId: id, locale, ...values })
      .onConflictDoUpdate({
        target: [teamMemberTranslations.memberId, teamMemberTranslations.locale],
        set: values,
      });
    await recordAudit(tx, actor, {
      action: "team.update",
      entityType: "team_member",
      entityId: id,
      before: before
        ? { locale, name: before.name, designation: before.designation, reviewed: Boolean(before.reviewedAt) }
        : null,
      after: { locale, name: input.name, designation: input.designation, reviewed: input.reviewed },
    });
  });
  if (input.reviewed) await notifyTeam(id);
}

export async function deleteTeamMemberTranslation(id: string, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(teamMemberTranslations)
      .where(and(eq(teamMemberTranslations.memberId, id), eq(teamMemberTranslations.locale, locale)))
      .returning({ name: teamMemberTranslations.name });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "team.translation.delete",
        entityType: "team_member",
        entityId: id,
        before: { locale, name: gone[0]!.name },
      });
  });
}

export async function deleteTeamMember(id: string, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx.delete(teamMembers).where(eq(teamMembers.id, id)).returning();
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "team.delete",
        entityType: "team_member",
        entityId: id,
        before: { status: gone[0]!.status, showOnAbout: gone[0]!.showOnAbout, photoId: gone[0]!.photoId },
      });
  });
}
