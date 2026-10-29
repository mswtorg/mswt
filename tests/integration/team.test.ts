import { and, eq, inArray } from "drizzle-orm";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The public query reads through unstable_cache; outside Next, read straight through.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

const {
  createTeamMember,
  deleteTeamMember,
  deleteTeamMemberTranslation,
  listTeamMembers,
  saveTeamMemberTranslation,
  updateTeamMember,
} = await import("@/lib/admin/team");
const { getTeam } = await import("@/lib/content/team");
const { hashPassword } = await import("@/lib/auth/password");
const { db } = await import("@/lib/db/client");
const { auditLog, teamMemberTranslations, users } = await import("@/lib/db/schema");

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const run = `team${Date.now()}`;
let editor: { id: string };
const actor = () => ({ userId: editor.id });
const settings = (over: object = {}) => ({
  status: "published" as const,
  sortOrder: 0,
  showOnAbout: false,
  photoId: null,
  ...over,
});
const text = (name: string, reviewed = true) => ({
  name,
  designation: "Trustee",
  bio: `${name} has served the Trust since 2015.`,
  reviewed,
});
const created: string[] = [];
const mine = <T extends { id: string }>(list: T[]) => list.filter((m) => created.includes(m.id));

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `${run}@example.com`,
      name: "Team Tester",
      role: "content_editor",
      passwordHash: await hashPassword("team tester passphrase"),
    })
    .returning({ id: users.id });
  editor = u!;
});
afterAll(async () => {
  for (const id of created) await deleteTeamMember(id, actor());
});

describe("team members", () => {
  it("lists published members in the language, in the admin's order; no English fallback", async () => {
    const second = await createTeamMember(settings({ sortOrder: 2 }), actor());
    const first = await createTeamMember(settings({ sortOrder: 1, showOnAbout: true }), actor());
    const draft = await createTeamMember(settings({ status: "draft" }), actor());
    created.push(second, first, draft);
    await saveTeamMemberTranslation(second, "en", text(`${run} Second`), actor());
    await saveTeamMemberTranslation(first, "en", text(`${run} First`), actor());
    await saveTeamMemberTranslation(first, "hi", text(`${run} पहला`), actor());
    await saveTeamMemberTranslation(draft, "en", text(`${run} Draft`), actor());

    const en = mine(await getTeam("en"));
    expect(en.map((m) => m.name)).toEqual([`${run} First`, `${run} Second`]);
    expect(en[0]).toMatchObject({ designation: "Trustee", showOnAbout: true, photoId: null });
    expect(en[0]!.bio[0]).toMatchObject({ type: "paragraph" });
    // Only the member written in Hindi shows in Hindi.
    expect(mine(await getTeam("hi")).map((m) => m.name)).toEqual([`${run} पहला`]);

    // Unpublish: gone from the site, still in the admin list.
    await updateTeamMember(second, settings({ status: "draft", sortOrder: 2 }), actor());
    expect(mine(await getTeam("en")).map((m) => m.name)).toEqual([`${run} First`]);
    const admin = (await listTeamMembers()).filter((m) => created.includes(m.id));
    expect(admin).toHaveLength(3);
    expect(
      admin
        .find((m) => m.id === first)!
        .translations.map((t) => t.locale)
        .sort(),
    ).toEqual(["en", "hi"]);

    await deleteTeamMemberTranslation(first, "hi", actor());
    expect(mine(await getTeam("hi"))).toEqual([]);
  });

  it("records every change in the audit log; deleting removes the text in every language", async () => {
    const id = await createTeamMember(settings(), actor());
    await saveTeamMemberTranslation(id, "en", text(`${run} Audited`), actor());
    await updateTeamMember(id, settings({ showOnAbout: true }), actor());
    await deleteTeamMember(id, actor());
    const actions = (
      await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "team_member"), eq(auditLog.entityId, id)))
        .orderBy(auditLog.createdAt)
    ).map((r) => r.action);
    expect(actions).toEqual(["team.create", "team.update", "team.update", "team.delete"]);
    const left = await db
      .select()
      .from(teamMemberTranslations)
      .where(inArray(teamMemberTranslations.memberId, [id]));
    expect(left).toEqual([]);
  });
});
