import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { CauseInput, createCause, deleteCause, saveCauseTranslation, updateCause } from "@/lib/admin/causes";
import { ContentError, deletePageTranslation, savePageTranslation } from "@/lib/admin/content";
import { deleteMedia, MediaServiceError, mediaUsage, updateMediaText, uploadMedia } from "@/lib/admin/media";
import { deleteMessage, markRead, updateMessage } from "@/lib/admin/messages";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import {
  auditLog,
  causes,
  causeTranslations,
  media,
  messages,
  pages,
  pageTranslations,
  users,
} from "@/lib/db/schema";
import { MediaError } from "@/lib/media/process";
import { visibleSections } from "@/lib/content/home";
import { causesFrom } from "@/lib/content/queries";
import { databaseContent } from "@/lib/content/source";
import { LOCAL_MEDIA_DIR } from "@/lib/storage/media";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

let editor: { id: string };
const actor = () => ({ userId: editor.id });
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `content-${unique()}@example.com`,
      name: "Content Tester",
      role: "content_editor",
      passwordHash: await hashPassword("content passphrase 1"),
    })
    .returning({ id: users.id });
  editor = u!;
});

/** A 1000×600 JPEG with EXIF (camera rotation 90° and a copyright tag) like a phone photo. */
const phonePhoto = () =>
  sharp({ create: { width: 1000, height: 600, channels: 3, background: "#3a7" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "Private camera owner", Make: "PhoneCo" } })
    .withMetadata({ orientation: 6 })
    .toBuffer();

async function upload(alt = "Volunteers at a health camp") {
  return uploadMedia(
    { bytes: new Uint8Array(await phonePhoto()), filename: "Camp Photo.JPG", altEn: alt },
    actor(),
  );
}

describe("media library", () => {
  it("rotates, strips metadata, makes WebP copies without upscaling", async () => {
    const { id } = await upload();
    const [row] = await db.select().from(media).where(eq(media.id, id));
    // Orientation 6 = portrait: 600 wide after rotation, so only one copy (no upscaling).
    expect([row!.width, row!.height]).toEqual([600, 1000]);
    expect(row!.variants).toEqual([600]);
    expect(row!.filename).toBe("camp-photo.webp");
    const file = await readFile(join(process.cwd(), LOCAL_MEDIA_DIR, `${row!.r2Key}-600.webp`));
    const meta = await sharp(file).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(row!.blur).toMatch(/^data:image\/webp;base64,/);
  });

  it("refuses files that aren't photos, and alt text that says nothing", async () => {
    await expect(
      uploadMedia(
        { bytes: new TextEncoder().encode("%PDF-1.7"), filename: "x.jpg", altEn: "A photo here" },
        actor(),
      ),
    ).rejects.toBeInstanceOf(MediaError);
    await expect(upload("x")).rejects.toThrow();
  });

  it("a used photo can't be deleted; an unused one can", async () => {
    const { id } = await upload();
    const slug = `media-use-${unique()}`;
    const causeId = await createCause(
      CauseInput.parse({
        slug,
        status: "draft",
        goal: "",
        is80gEligible: true,
        sortOrder: "0",
        coverImageId: id,
      }),
      actor(),
    );
    expect((await mediaUsage(id)).map((u) => u.label)).toEqual([`Cause: ${slug}`]);
    await expect(deleteMedia(id, actor())).rejects.toMatchObject({ code: "in_use" });
    await deleteCause(causeId, actor());
    await deleteMedia(id, actor());
    expect(await db.select().from(media).where(eq(media.id, id))).toEqual([]);
    await expect(deleteMedia(id, actor())).rejects.toBeInstanceOf(MediaServiceError);
  });
});

describe("pages", () => {
  const base = { title: "About", h1: "About us", intro: null, seoTitle: null, seoDescription: null };

  it("saves a language, reviews it, and removes it again (audited)", async () => {
    await savePageTranslation(
      "terms",
      "mr",
      { ...base, body: "## नियम\n\nमजकूर", reviewed: false },
      null,
      actor(),
    );
    let [row] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "terms"), eq(pageTranslations.locale, "mr")));
    expect(row!.reviewedAt).toBeNull();
    expect(row!.sections).toEqual([
      { type: "heading", level: 2, text: "नियम" },
      { type: "paragraph", text: "मजकूर" },
    ]);
    await savePageTranslation("terms", "mr", { ...base, body: "मजकूर", reviewed: true }, null, actor());
    [row] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "terms"), eq(pageTranslations.locale, "mr")));
    expect(row!.reviewedBy).toBe(editor.id);
    await deletePageTranslation("terms", "mr", actor());
    const log = await db.select().from(auditLog).where(eq(auditLog.actorUserId, editor.id));
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(["content.page.update", "content.page.translation.delete"]),
    );
  });

  it("refuses bad text and reviewing a photo without alt text in that language", async () => {
    await expect(
      savePageTranslation(
        "about",
        "gu",
        { ...base, body: "[x](javascript:1)", reviewed: false },
        null,
        actor(),
      ),
    ).rejects.toMatchObject({ field: "body" });
    const { id } = await upload();
    const body = `![](media:${id})`;
    await expect(
      savePageTranslation("about", "gu", { ...base, body, reviewed: true }, null, actor()),
    ).rejects.toBeInstanceOf(ContentError);
    await updateMediaText(
      id,
      {
        en: { alt: "Volunteers at a health camp", caption: "" },
        hi: { alt: "", caption: "" },
        mr: { alt: "", caption: "" },
        gu: { alt: "આરોગ્ય શિબિરમાં સ્વયંસેવકો", caption: "" },
      },
      actor(),
    );
    await savePageTranslation("about", "gu", { ...base, body, reviewed: true }, null, actor());
    await deletePageTranslation("about", "gu", actor());
  });

  it("home needs its three points", async () => {
    const point = { title: "80G", text: "Tax benefit" };
    await expect(
      savePageTranslation("home", "en", { ...base, body: "", reviewed: false }, { points: [point] }, actor()),
    ).rejects.toMatchObject({ field: "point1Title" });
    await savePageTranslation(
      "home",
      "hi",
      { ...base, body: "", reviewed: false },
      { eyebrow: "12A और 80G", points: [point, point, point] },
      actor(),
    );
    const [row] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "home"), eq(pageTranslations.locale, "hi")));
    expect(row!.extras).toEqual({
      eyebrow: "12A और 80G",
      points: [point, point, point],
      impact: [],
      sections: {},
    });
    await deletePageTranslation("home", "hi", actor());
  });

  it("home keeps its section order (one for every language) and audits it", async () => {
    const point = { title: "80G", text: "Tax benefit" };
    const extras = { points: [point, point, point] };
    const order = ["news", "impact", "why", "story", "causes", "events", "testimonials", "band"] as const;
    await savePageTranslation(
      "home",
      "gu",
      { ...base, body: "", reviewed: false },
      extras,
      actor(),
      undefined,
      { order: [...order], hidden: ["events"] },
    );
    const [page] = await db.select().from(pages).where(eq(pages.key, "home"));
    expect(page!.sectionOrder).toEqual(order);
    expect(page!.hiddenSections).toEqual(["events"]);
    expect(visibleSections(page!.sectionOrder, page!.hiddenSections)).toEqual(
      order.filter((k) => k !== "events"),
    );
    // Saving another language without an order leaves it as it is.
    await savePageTranslation("home", "mr", { ...base, body: "", reviewed: false }, extras, actor());
    const [after] = await db.select().from(pages).where(eq(pages.key, "home"));
    expect(after!.sectionOrder).toEqual(order);
    expect(after!.hiddenSections).toEqual(["events"]);
    const [entry] = await db
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(eq(auditLog.action, "content.page.update"))
      .orderBy(desc(auditLog.createdAt))
      .offset(1)
      .limit(1);
    expect(entry!.after).toMatchObject({
      key: "home",
      locale: "gu",
      sectionOrder: order,
      hiddenSections: ["events"],
    });
    await db.update(pages).set({ sectionOrder: [], hiddenSections: [] }).where(eq(pages.key, "home"));
    await deletePageTranslation("home", "gu", actor());
    await deletePageTranslation("home", "mr", actor());
  });

  it("home keeps its impact numbers and its body as Our story", async () => {
    const point = { title: "80G", text: "Tax benefit" };
    await expect(
      savePageTranslation(
        "home",
        "mr",
        { ...base, body: "", reviewed: false },
        { points: [point, point, point], impact: [{ value: "500+", label: "" }] },
        actor(),
      ),
    ).rejects.toMatchObject({ field: "impact1Value" });
    await savePageTranslation(
      "home",
      "mr",
      { ...base, body: "Started in 2015 with one flood-relief camp.", reviewed: false },
      { points: [point, point, point], impact: [{ value: "500+", label: "families helped" }] },
      actor(),
    );
    const [row] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.pageKey, "home"), eq(pageTranslations.locale, "mr")));
    expect(row!.extras).toMatchObject({ impact: [{ value: "500+", label: "families helped" }] });
    expect(row!.sections).toEqual([
      { type: "paragraph", text: "Started in 2015 with one flood-relief camp." },
    ]);
    await deletePageTranslation("home", "mr", actor());
  });
});

describe("causes", () => {
  const input = (slug: string, over: Record<string, string> = {}) =>
    CauseInput.parse({
      slug,
      status: "draft",
      goal: "50,000",
      is80gEligible: true,
      sortOrder: "3",
      coverImageId: "",
      ...over,
    });

  it("creates with the goal in paise, rejects duplicate addresses", async () => {
    const slug = `cause-${unique()}`;
    const id = await createCause(input(slug), actor());
    const [row] = await db.select().from(causes).where(eq(causes.id, id));
    expect(row!.goalPaise).toBe(5_000_000);
    await expect(createCause(input(slug), actor())).rejects.toMatchObject({ field: "slug" });
    await deleteCause(id, actor());
  });

  it("text per language; active causes can't be deleted", async () => {
    const slug = `cause-${unique()}`;
    const id = await createCause(input(slug), actor());
    await saveCauseTranslation(
      id,
      "hi",
      {
        title: "शिविर",
        summary: "सारांश",
        tag: "शिक्षा",
        body: "पाठ",
        seoTitle: null,
        seoDescription: null,
        reviewed: true,
      },
      actor(),
    );
    const [tr] = await db.select().from(causeTranslations).where(eq(causeTranslations.causeId, id));
    expect(tr!.reviewedAt).not.toBeNull();
    expect(tr!.tag).toBe("शिक्षा");
    // The card icon is one setting for every language; the label is per language.
    await updateCause(id, input(slug, { icon: "education", status: "active" }), actor());
    const [withIcon] = await db.select().from(causes).where(eq(causes.id, id));
    expect(withIcon!.icon).toBe("education");
    const content = { ...(await databaseContent()), sampleParts: [] };
    expect(causesFrom(content, "hi").find((c) => c.slug === slug)).toMatchObject({
      icon: "education",
      tag: "शिक्षा",
    });
    await updateCause(id, input(slug, { status: "active" }), actor());
    await expect(deleteCause(id, actor())).rejects.toBeInstanceOf(ContentError);
  });
});

describe("messages", () => {
  async function message(createdAt = new Date()) {
    const [m] = await db
      .insert(messages)
      .values({
        name: "Asha",
        email: "asha@example.com",
        subject: "Volunteering",
        body: "Hello",
        locale: "en",
        ipHash: "x",
        createdAt,
      })
      .returning({ id: messages.id });
    return m!.id;
  }

  it("opening marks new as read; status and assignment are audited", async () => {
    const id = await message();
    await markRead(id, actor());
    let [m] = await db.select().from(messages).where(eq(messages.id, id));
    expect(m!.status).toBe("read");
    await updateMessage(id, { status: "replied", assignedTo: editor.id }, actor());
    [m] = await db.select().from(messages).where(eq(messages.id, id));
    expect([m!.status, m!.assignedTo]).toEqual(["replied", editor.id]);
    const log = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(log.filter((l) => l.action === "message.update")).toHaveLength(2);
  });

  it("can't be assigned to an Accountant", async () => {
    const id = await message();
    const [acc] = await db
      .insert(users)
      .values({ email: `acc-${unique()}@example.com`, name: "Acc", role: "accountant", passwordHash: "x" })
      .returning({ id: users.id });
    await expect(updateMessage(id, { status: "read", assignedTo: acc!.id }, actor())).rejects.toThrow(
      /can't be assigned/,
    );
  });

  it("messages are kept until an admin deletes one (audited, without the text)", async () => {
    const old = await message(new Date(Date.now() - 800 * 86_400_000));
    await deleteMessage(old, actor());
    expect(await db.select().from(messages).where(eq(messages.id, old))).toEqual([]);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, old));
    expect(entry!.action).toBe("message.delete");
    expect(JSON.stringify(entry!.before)).not.toContain("Can I help");
  });
});
