import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The public queries read through unstable_cache; outside Next, read straight through.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

const {
  createTestimonial,
  deleteTestimonial,
  deleteTestimonialTranslation,
  listTestimonials,
  saveTestimonialTranslation,
  updateTestimonial,
} = await import("@/lib/admin/testimonials");
const { getTestimonial, getTestimonials } = await import("@/lib/content/testimonials");
const { hashPassword } = await import("@/lib/auth/password");
const { db } = await import("@/lib/db/client");
const { auditLog, testimonialTranslations, users } = await import("@/lib/db/schema");

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const run = `t${Date.now()}`;
let editor: { id: string };
const actor = () => ({ userId: editor.id });
const settings = (slug: string, over: object = {}) => ({
  slug: `${run}-${slug}`,
  status: "published" as const,
  storyDate: "2026-01-10",
  sortOrder: 0,
  showOnHome: true,
  photoId: null,
  ...over,
});
const text = (title: string, reviewed = true) => ({
  title,
  body: `## How it began\n\nThe story of ${title}.\n\n- one\n- two`,
  summary: null,
  name: `${title} name`,
  role: null,
  reviewed,
});
const created: string[] = [];
const mine = <T extends { id: string }>(list: T[]) => list.filter((t) => created.includes(t.id));

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `testimonials-${Date.now()}@example.com`,
      name: "Testimonial Tester",
      role: "content_editor",
      passwordHash: await hashPassword("testimonial tester passphrase"),
    })
    .returning({ id: users.id });
  editor = u!;
});
afterAll(async () => {
  for (const id of created) await deleteTestimonial(id, actor());
});

describe("testimonial stories", () => {
  it("lists published stories in the language: Order, then newest date", async () => {
    const older = await createTestimonial(
      settings("older", { sortOrder: 1, storyDate: "2025-06-01" }),
      actor(),
    );
    const newer = await createTestimonial(
      settings("newer", { sortOrder: 1, storyDate: "2026-02-01" }),
      actor(),
    );
    const pinned = await createTestimonial(settings("pinned", { storyDate: "2024-01-01" }), actor());
    const draft = await createTestimonial(settings("draft", { status: "draft" }), actor());
    created.push(older, newer, pinned, draft);
    for (const [id, title] of [
      [older, "Older"],
      [newer, "Newer"],
      [pinned, "Pinned"],
      [draft, "Draft"],
    ] as const)
      await saveTestimonialTranslation(id, "en", text(title), actor());
    await saveTestimonialTranslation(newer, "hi", text("नया", false), actor());

    const en = mine(await getTestimonials("en"));
    expect(en.map((t) => t.title)).toEqual(["Pinned", "Newer", "Older"]);
    // No summary written: the card uses the story's first paragraph.
    expect(en[1]).toMatchObject({ storyDate: "2026-02-01", summary: "The story of Newer." });
    // No English fallback: only the story written in Hindi shows in Hindi (drafts show outside production).
    expect(mine(await getTestimonials("hi")).map((t) => t.title)).toEqual(["नया"]);
    expect(mine(await getTestimonials("gu"))).toEqual([]);

    const story = await getTestimonial("en", `${run}-newer`);
    expect(story?.body.map((b) => b.type)).toEqual(["heading", "paragraph", "list"]);
    expect(story?.locales).toEqual(["en", "hi"]);
    expect(await getTestimonial("gu", `${run}-newer`)).toBeNull();
    expect(await getTestimonial("en", `${run}-draft`)).toBeNull();

    const listed = (await listTestimonials()).find((t) => t.id === newer)!;
    expect(listed.translations.map((t) => t.locale).sort()).toEqual(["en", "hi"]);
  });

  it("rejects a web address another story uses", async () => {
    await expect(createTestimonial(settings("older"), actor())).rejects.toMatchObject({ field: "slug" });
    const id = await createTestimonial(settings("other"), actor());
    created.push(id);
    await expect(updateTestimonial(id, settings("newer"), actor())).rejects.toMatchObject({ field: "slug" });
  });

  it("audits every change and removes text with the testimonial", async () => {
    const id = await createTestimonial(settings("audit", { status: "draft" }), actor());
    await saveTestimonialTranslation(id, "en", text("Asha"), actor());
    await saveTestimonialTranslation(id, "mr", text("आशा"), actor());
    await updateTestimonial(id, settings("audit", { sortOrder: 5 }), actor());
    await deleteTestimonialTranslation(id, "mr", actor());
    await expect(
      updateTestimonial(id, settings("audit", { photoId: crypto.randomUUID() }), actor()),
    ).rejects.toMatchObject({ field: "photoId" });
    await deleteTestimonial(id, actor());

    const actions = (
      await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "testimonial"), eq(auditLog.entityId, id)))
    ).map((a) => a.action);
    expect(actions.sort()).toEqual([
      "testimonial.create",
      "testimonial.delete",
      "testimonial.translation.delete",
      "testimonial.update",
      "testimonial.update",
      "testimonial.update",
    ]);
    const left = await db
      .select()
      .from(testimonialTranslations)
      .where(eq(testimonialTranslations.testimonialId, id));
    expect(left).toEqual([]);
  });

  it("migration 0012 turns a saved quote into a story with an address and a date", async () => {
    // Replays the backfill on a copy of the PR #38 shape, inside a transaction that is rolled back.
    const backfill = readFileSync("drizzle/0012_testimonial_stories.sql", "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("UPDATE"));
    expect(backfill).toHaveLength(2);
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`create temp table "testimonials" (id uuid primary key default gen_random_uuid(),
          created_at timestamptz not null, slug text, story_date date) on commit drop`);
        await tx.execute(sql`create temp table "testimonial_translations" (quote text, name text not null,
          title text, summary text, body jsonb) on commit drop`);
        await tx.execute(sql`insert into "testimonials" (id, created_at)
          values ('0a1b2c3d-0000-4000-8000-000000000000', '2026-03-13T20:00:00Z')`);
        await tx.execute(
          sql`insert into "testimonial_translations" (quote, name) values ('Thank you!', 'Asha')`,
        );
        for (const stmt of backfill) await tx.execute(sql.raw(stmt));
        const [t] = (await tx.execute(sql`select slug, story_date::text from "testimonials"`)) as unknown as {
          slug: string;
          story_date: string;
        }[];
        const [tr] = (await tx.execute(
          sql`select title, summary, body from "testimonial_translations"`,
        )) as unknown as { title: string; summary: string; body: unknown }[];
        // 20:00 UTC on 13 March is 14 March in India.
        expect(t).toEqual({ slug: "testimonial-0a1b2c3d", story_date: "2026-03-14" });
        expect(tr).toEqual({
          title: "Asha",
          summary: "Thank you!",
          body: [{ type: "paragraph", text: "Thank you!" }],
        });
        tx.rollback();
      })
      .catch((e: unknown) => {
        if (!/rollback/i.test(String((e as Error).message))) throw e;
      });
  });
});
