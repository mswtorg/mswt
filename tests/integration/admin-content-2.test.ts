import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { ContentError } from "@/lib/admin/content";
import {
  deleteDocument,
  DocumentInput,
  finishPdfUpload,
  saveDocument,
  startPdfUpload,
  uploadPdfThroughServer,
} from "@/lib/admin/documents";
import { EventInput, NewsInput, saveEvent, saveEventText, saveNews } from "@/lib/admin/events";
import { AlbumInput, getAlbumForEdit, saveAlbum } from "@/lib/admin/gallery";
import { deleteMedia, mediaUsage, uploadMedia } from "@/lib/admin/media";
import { menuRows, resolveMenu, saveMenu } from "@/lib/admin/menus";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { auditLog, newsPosts, reports, users } from "@/lib/db/schema";
import { getMediaStorage } from "@/lib/storage/media";

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
      email: `content2-${unique()}@example.com`,
      name: "Content Tester 2",
      role: "content_editor",
      passwordHash: await hashPassword("content passphrase 2"),
    })
    .returning({ id: users.id });
  editor = u!;
});

async function photo() {
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#48a" } })
    .jpeg()
    .toBuffer();
  return (
    await uploadMedia({ bytes: new Uint8Array(bytes), filename: "photo.jpg", altEn: "A test photo" }, actor())
  ).id;
}

const eventInput = (over: Record<string, string> = {}) =>
  EventInput.parse({
    slug: `e2-${unique()}`,
    status: "published",
    eventStatus: "scheduled",
    attendance: "offline",
    startsAt: "2026-12-05T10:00",
    endsAt: "",
    venueName: "Community hall",
    venueStreet: "",
    venueCity: "Pune",
    venueRegion: "",
    venuePostalCode: "",
    onlineUrl: "",
    coverImageId: "",
    photoIds: "",
    ...over,
  });

describe("events and news", () => {
  it("reads IST times and checks venue/online details", () => {
    expect(eventInput().startsAt.toISOString()).toBe("2026-12-05T04:30:00.000Z");
    expect(() => eventInput({ attendance: "online" })).toThrow(/online link/);
    expect(() => eventInput({ endsAt: "2026-12-04T10:00" })).toThrow(/after the start/);
  });

  it("an event with a cover and slider: review needs alt text in that language", async () => {
    const [cover, a, b] = [await photo(), await photo(), await photo()];
    const input = eventInput({ coverImageId: cover, photoIds: `${a},${b}` });
    const id = await saveEvent(null, input, actor());
    const text = {
      title: "शिविर",
      summary: "सारांश",
      body: "पाठ",
      seoTitle: null,
      seoDescription: null,
      reviewed: true,
    };
    await expect(saveEventText(id, "hi", text, actor())).rejects.toBeInstanceOf(ContentError);
    await saveEventText(id, "hi", { ...text, reviewed: false }, actor());
    expect((await mediaUsage(a)).map((u) => u.label)).toContain(`Event: ${input.slug}`);
    await expect(deleteMedia(b, actor())).rejects.toMatchObject({ code: "in_use" });
  });

  it("publishing news without a date publishes it now; slugs are unique", async () => {
    const slug = `n2-${unique()}`;
    const input = NewsInput.parse({
      slug,
      status: "published",
      publishedAt: "",
      authorName: "",
      coverImageId: "",
      photoIds: "",
    });
    const id = await saveNews(null, input, actor());
    const [row] = await db.select().from(newsPosts).where(eq(newsPosts.id, id));
    expect(row!.publishedAt).not.toBeNull();
    await expect(saveNews(null, input, actor())).rejects.toMatchObject({ field: "slug" });
  });
});

describe("gallery", () => {
  it("keeps the photo order and marks photos as used", async () => {
    const [a, b, c] = [await photo(), await photo(), await photo()];
    const id = await saveAlbum(
      null,
      AlbumInput.parse({ slug: `g2-${unique()}`, status: "published", photoIds: `${c},${a},${b}` }),
      actor(),
    );
    const album = await getAlbumForEdit(id);
    expect(album!.photoIds).toEqual([c, a, b]);
    expect(album!.album.publishedAt).not.toBeNull();
    expect((await mediaUsage(a)).some((u) => u.label.startsWith("Gallery: g2-"))).toBe(true);
  });
});

describe("documents", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

  it("accepts a PDF, refuses other files, and replaces the old file", async () => {
    const id = await saveDocument(
      null,
      DocumentInput.parse({ fy: "2025-26", kind: "annual_report", status: "draft" }),
      actor(),
    );
    await uploadPdfThroughServer(id, "Annual Report 2025-26.pdf", pdf, actor());
    const [first] = await db.select().from(reports).where(eq(reports.id, id));
    expect(first!.pdfR2Key).toMatch(new RegExp(`^documents/${id}/annual-report-2025-26-[0-9a-f]{8}\\.pdf$`));
    expect(first!.pdfBytes).toBe(pdf.byteLength);

    // A direct upload that isn't a PDF is deleted again.
    const { key, url: direct } = await startPdfUpload(id, "fake.pdf", 10);
    expect(direct).toBeNull(); // local storage: files go through the server
    await getMediaStorage()!.put(key, new TextEncoder().encode("<html>"), "application/pdf");
    await expect(finishPdfUpload(id, key, "fake.pdf", actor())).rejects.toMatchObject({ code: "not_pdf" });
    expect(await getMediaStorage()!.inspect(key, 5)).toBeNull();

    await uploadPdfThroughServer(id, "Annual Report v2.pdf", pdf, actor());
    const [second] = await db.select().from(reports).where(eq(reports.id, id));
    expect(second!.pdfR2Key).not.toBe(first!.pdfR2Key);
    expect(await getMediaStorage()!.inspect(first!.pdfR2Key!, 5)).toBeNull();
    await expect(finishPdfUpload(id, "documents/other/x.pdf", "x.pdf", actor())).rejects.toMatchObject({
      code: "missing",
    });
    await deleteDocument(id, actor());
    const log = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(["document.create", "document.upload", "document.delete"]),
    );
  });
});

describe("menus", () => {
  it("falls back to the built-in menu, hides links that aren't live, keeps order", async () => {
    await saveMenu("footer_legal", [], actor());
    const label = (k: string) => `label:${k}`;
    // Built-in: legal pages aren't live yet, so nothing shows.
    expect(await resolveMenu("footer_legal", "en", ["privacy", "terms"], label)).toEqual([]);
    await saveMenu(
      "footer_legal",
      [
        { kind: "page", target: "contact", hidden: false, labels: { hi: "संपर्क" } },
        { kind: "page", target: "privacy", hidden: false, labels: {} }, // not live: never shown
        { kind: "url", target: "https://example.org/annual", hidden: false, labels: { en: "Annual report" } },
        { kind: "page", target: "about", hidden: true, labels: {} },
      ],
      actor(),
    );
    expect((await menuRows("footer_legal")).map((r) => r.sort)).toEqual([1, 2, 3, 4]);
    // resolveMenu reads through the content cache; read the rows it would use directly here.
    const rows = await menuRows("footer_legal");
    expect(rows.filter((r) => !r.hidden).map((r) => r.target)).toEqual([
      "contact",
      "privacy",
      "https://example.org/annual",
    ]);
    await saveMenu("footer_legal", [], actor());
    expect(await menuRows("footer_legal")).toEqual([]);
  });
});
