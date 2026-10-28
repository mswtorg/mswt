import { and, eq } from "drizzle-orm";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// getTestimonials reads through unstable_cache; outside Next, read straight through.
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
const { getTestimonials } = await import("@/lib/content/testimonials");
const { hashPassword } = await import("@/lib/auth/password");
const { db } = await import("@/lib/db/client");
const { auditLog, testimonialTranslations, users } = await import("@/lib/db/schema");

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

let editor: { id: string };
const actor = () => ({ userId: editor.id });
const settings = (over: object = {}) => ({
  status: "published" as const,
  sortOrder: 0,
  showOnHome: true,
  photoId: null,
  ...over,
});
const text = (name: string, reviewed = true) => ({ quote: `Quote by ${name}`, name, role: null, reviewed });
const created: string[] = [];

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

describe("testimonials", () => {
  it("shows published ones with text in the language, in admin order", async () => {
    const second = await createTestimonial(settings({ sortOrder: 2 }), actor());
    const first = await createTestimonial(settings({ sortOrder: 1, showOnHome: false }), actor());
    const draft = await createTestimonial(settings({ status: "draft" }), actor());
    created.push(second, first, draft);
    await saveTestimonialTranslation(second, "en", text("Second"), actor());
    await saveTestimonialTranslation(first, "en", text("First"), actor());
    await saveTestimonialTranslation(first, "hi", text("पहला", false), actor());
    await saveTestimonialTranslation(draft, "en", text("Draft"), actor());

    const en = (await getTestimonials("en")).filter((t) => created.includes(t.id));
    expect(en.map((t) => t.name)).toEqual(["First", "Second"]);
    expect(en[0]).toMatchObject({ quote: "Quote by First", showOnHome: false, photoId: null });
    // No English fallback: only the one written in Hindi shows in Hindi (drafts show outside production).
    const hi = (await getTestimonials("hi")).filter((t) => created.includes(t.id));
    expect(hi.map((t) => t.name)).toEqual(["पहला"]);
    expect((await getTestimonials("gu")).filter((t) => created.includes(t.id))).toEqual([]);

    const listed = (await listTestimonials()).find((t) => t.id === first)!;
    expect(listed.translations.map((t) => t.locale).sort()).toEqual(["en", "hi"]);
  });

  it("audits every change and removes text with the testimonial", async () => {
    const id = await createTestimonial(settings({ status: "draft" }), actor());
    await saveTestimonialTranslation(id, "en", text("Asha"), actor());
    await saveTestimonialTranslation(id, "mr", text("आशा"), actor());
    await updateTestimonial(id, settings({ sortOrder: 5 }), actor());
    await deleteTestimonialTranslation(id, "mr", actor());
    await expect(
      updateTestimonial(id, settings({ photoId: crypto.randomUUID() }), actor()),
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
});
