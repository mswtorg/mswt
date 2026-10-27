import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureDefaults } from "@/lib/admin/defaults";
import { loadSampleContent, removeSampleContent, sampleCounts } from "@/lib/admin/sample";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { causes, causeTranslations, media, menuItems, pageTranslations, users } from "@/lib/db/schema";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const pg = drizzle(sql, { schema });
afterAll(() => sql.end());

let admin: { id: string };
beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `sample-${Date.now()}@example.com`,
      name: "Sample Admin",
      role: "super_admin",
      passwordHash: await hashPassword("sample passphrase 1"),
    })
    .returning({ id: users.id });
  admin = u!;
});

describe("ensure defaults", () => {
  it("fills missing page texts and menus, never overwrites an edit", async () => {
    await ensureDefaults(pg);
    await db
      .update(pageTranslations)
      .set({ h1: "Edited by an admin" })
      .where(and(eq(pageTranslations.pageKey, "causes"), eq(pageTranslations.locale, "hi")));
    await db
      .delete(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "gallery"), eq(pageTranslations.locale, "gu")));
    const added = await ensureDefaults(pg);
    expect(added.pages).toBe(1); // only the deleted Gujarati gallery text
    const [hi] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "causes"), eq(pageTranslations.locale, "hi")));
    expect(hi!.h1).toBe("Edited by an admin");
    const [gu] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "gallery"), eq(pageTranslations.locale, "gu")));
    expect(gu!.reviewedAt).not.toBeNull();
    expect(
      (await db.select().from(menuItems).where(eq(menuItems.location, "header"))).length,
    ).toBeGreaterThan(0);
    // Legal drafts stay unreviewed.
    const [privacy] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "privacy"), eq(pageTranslations.locale, "en")));
    expect(privacy?.reviewedAt ?? null).toBeNull();
  });
});

describe("sample content", () => {
  // A stand-in for the web: small generated JPEGs, no internet needed.
  const fakePhoto = async (n: number) =>
    new Uint8Array(
      await sharp({
        create: {
          width: 800,
          height: 533,
          channels: 3,
          background: `#${(n * 123456).toString(16).slice(0, 6).padEnd(6, "0")}`,
        },
      })
        .jpeg()
        .toBuffer(),
    );

  it("loads unreviewed sample items with photos, and loading twice adds nothing", async () => {
    const first = await loadSampleContent({ userId: admin.id }, fakePhoto);
    expect(first.photos).toBe(20);
    const [cause] = await db.select().from(causes).where(eq(causes.slug, "school-support"));
    if (cause?.isSample) {
      expect(cause.coverImageId).not.toBeNull();
      expect(cause.photoIds).toHaveLength(3);
      const tr = await db.select().from(causeTranslations).where(eq(causeTranslations.causeId, cause.id));
      expect(tr.length).toBe(4);
      expect(tr.every((t) => t.reviewedAt === null)).toBe(true);
    }
    const photos = await db.select().from(media).where(eq(media.isSample, true));
    expect(photos.length).toBe(20);
    const second = await loadSampleContent({ userId: admin.id }, fakePhoto);
    expect([second.causes, second.events, second.news, second.albums, second.documents]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect((await db.select().from(media).where(eq(media.isSample, true))).length).toBe(20);
  });

  it("removes unapproved sample items and their photos, keeps approved ones", async () => {
    const [cause] = await db
      .select()
      .from(causes)
      .where(and(eq(causes.slug, "medical-help"), eq(causes.isSample, true)));
    if (cause)
      await db
        .update(causeTranslations)
        .set({ reviewedAt: new Date() })
        .where(and(eq(causeTranslations.causeId, cause.id), eq(causeTranslations.locale, "en")));
    await removeSampleContent({ userId: admin.id });
    const left = await sampleCounts();
    expect(left.events + left.news + left.albums + left.documents).toBe(0);
    if (cause) {
      expect(left.causes).toBe(1); // the approved one stays…
      expect(left.photos).toBe(4); // …with its cover and slider photos
    }
  });
});
