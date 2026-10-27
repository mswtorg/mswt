import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { reports, reportTranslations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { mediaSlug } from "@/lib/media/process";
import { getMediaStorage } from "@/lib/storage/media";
import { ContentError, notifySearchEngines } from "./content";

// Transparency documents (Step 8c-2): annual reports and audited accounts as public PDFs.

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = "%PDF-";

export class DocumentError extends Error {
  constructor(readonly code: "storage" | "missing" | "not_pdf" | "too_big" | "not_found") {
    super(code);
  }
}

export const DocumentInput = z.object({
  fy: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Use the financial year format 2025-26"),
  kind: z.enum(["annual_report", "audited_accounts", "other"]),
  status: z.enum(["draft", "published"]),
});
export type DocumentInput = z.infer<typeof DocumentInput>;

export const DocumentTitleInput = z.object({
  title: z.string().trim().min(1, "Enter the title").max(160),
  reviewed: z.boolean(),
});

export async function listDocuments() {
  const [rows, tr] = await Promise.all([
    db.select().from(reports).orderBy(desc(reports.fy), reports.kind),
    db
      .select({
        id: reportTranslations.reportId,
        locale: reportTranslations.locale,
        title: reportTranslations.title,
        reviewedAt: reportTranslations.reviewedAt,
      })
      .from(reportTranslations),
  ]);
  return rows.map((r) => ({ ...r, translations: tr.filter((t) => t.id === r.id) }));
}

export async function getDocumentForEdit(id: string) {
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  if (!row) return null;
  const translations = await db.select().from(reportTranslations).where(eq(reportTranslations.reportId, id));
  return { doc: row, translations };
}

export async function saveDocument(id: string | null, input: DocumentInput, actor: Actor): Promise<string> {
  const saved = await withTx(async (tx) => {
    const [before] = id ? await tx.select().from(reports).where(eq(reports.id, id)) : [];
    if (id && !before) throw new ContentError("form", "That document no longer exists");
    const publishedAt =
      input.status === "published" ? (before?.publishedAt ?? new Date()) : (before?.publishedAt ?? null);
    const docId = id
      ? (
          await tx
            .update(reports)
            .set({ ...input, publishedAt })
            .where(eq(reports.id, id))
            .returning({ id: reports.id })
        )[0]!.id
      : (
          await tx
            .insert(reports)
            .values({ ...input, publishedAt })
            .returning({ id: reports.id })
        )[0]!.id;
    await recordAudit(tx, actor, {
      action: id ? "document.update" : "document.create",
      entityType: "report",
      entityId: docId,
      before: before ? { fy: before.fy, kind: before.kind, status: before.status } : null,
      after: input,
    });
    return docId;
  });
  if (input.status === "published") await notifyTransparency(saved);
  return saved;
}

export async function saveDocumentTitle(
  id: string,
  locale: Locale,
  input: z.infer<typeof DocumentTitleInput>,
  actor: Actor,
) {
  await withTx(async (tx) => {
    const now = new Date();
    const values = {
      title: input.title,
      reviewedAt: input.reviewed ? now : null,
      reviewedBy: input.reviewed ? actor.userId : null,
      updatedAt: now,
    };
    await tx
      .insert(reportTranslations)
      .values({ reportId: id, locale, ...values })
      .onConflictDoUpdate({ target: [reportTranslations.reportId, reportTranslations.locale], set: values });
    await recordAudit(tx, actor, {
      action: "document.update",
      entityType: "report",
      entityId: id,
      after: { locale, title: input.title, reviewed: input.reviewed },
    });
  });
  if (input.reviewed) await notifyTransparency(id);
}

export async function deleteDocumentTitle(id: string, locale: Locale, actor: Actor) {
  await withTx(async (tx) => {
    const gone = await tx
      .delete(reportTranslations)
      .where(and(eq(reportTranslations.reportId, id), eq(reportTranslations.locale, locale)))
      .returning({ title: reportTranslations.title });
    if (gone.length)
      await recordAudit(tx, actor, {
        action: "document.translation.delete",
        entityType: "report",
        entityId: id,
        before: { locale, title: gone[0]!.title },
      });
  });
}

/** Deletes the document, its titles and its PDF. */
export async function deleteDocument(id: string, actor: Actor) {
  const gone = await withTx(async (tx) => {
    const rows = await tx.delete(reports).where(eq(reports.id, id)).returning();
    if (rows.length)
      await recordAudit(tx, actor, {
        action: "document.delete",
        entityType: "report",
        entityId: id,
        before: { fy: rows[0]!.fy, kind: rows[0]!.kind, file: rows[0]!.pdfFilename },
      });
    return rows[0];
  });
  if (gone?.pdfR2Key)
    await getMediaStorage()
      ?.remove(gone.pdfR2Key)
      .catch(() => undefined);
}

/** A new, unguessable key per upload: replacing a PDF never serves a cached old copy. */
export function newPdfKey(id: string, filename: string) {
  return `documents/${id}/${mediaSlug(filename)}-${randomBytes(4).toString("hex")}.pdf`;
}

/**
 * Step 1 of an upload: where the browser should send the PDF. With R2, a 5-minute signed PUT
 * URL; locally null (the file is posted to the server instead).
 */
export async function startPdfUpload(id: string, filename: string, bytes: number) {
  const storage = getMediaStorage();
  if (!storage) throw new DocumentError("storage");
  if (bytes > MAX_PDF_BYTES) throw new DocumentError("too_big");
  const [doc] = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, id));
  if (!doc) throw new DocumentError("not_found");
  const key = newPdfKey(id, filename);
  return { key, url: await storage.presignPut(key) };
}

/**
 * Step 2: check what arrived (really a PDF, not too big) and attach it to the document. The old
 * PDF is removed. Anything else that arrived under the key is deleted again.
 */
export async function finishPdfUpload(id: string, key: string, filename: string, actor: Actor) {
  const storage = getMediaStorage();
  if (!storage) throw new DocumentError("storage");
  if (!key.startsWith(`documents/${id}/`) || !/^[a-z0-9/-]+\.pdf$/.test(key))
    throw new DocumentError("missing");
  const file = await storage.inspect(key, PDF_MAGIC.length);
  if (!file) throw new DocumentError("missing");
  if (new TextDecoder().decode(file.start) !== PDF_MAGIC || file.bytes > MAX_PDF_BYTES) {
    await storage.remove(key);
    throw new DocumentError(file.bytes > MAX_PDF_BYTES ? "too_big" : "not_pdf");
  }
  const before = await withTx(async (tx) => {
    const [row] = await tx.select().from(reports).where(eq(reports.id, id));
    if (!row) throw new DocumentError("not_found");
    await tx
      .update(reports)
      .set({ pdfR2Key: key, pdfBytes: file.bytes, pdfFilename: filename.slice(0, 200) })
      .where(eq(reports.id, id));
    await recordAudit(tx, actor, {
      action: "document.upload",
      entityType: "report",
      entityId: id,
      before: { file: row.pdfFilename },
      after: { file: filename, bytes: file.bytes },
    });
    return row;
  });
  if (before.pdfR2Key && before.pdfR2Key !== key)
    await storage.remove(before.pdfR2Key).catch(() => undefined);
}

/** Local storage only: the PDF comes through the server (R2 uploads go straight to the bucket). */
export async function uploadPdfThroughServer(id: string, filename: string, body: Uint8Array, actor: Actor) {
  const storage = getMediaStorage();
  if (!storage) throw new DocumentError("storage");
  if (body.byteLength > MAX_PDF_BYTES) throw new DocumentError("too_big");
  const key = newPdfKey(id, filename);
  await storage.put(key, body, "application/pdf");
  await finishPdfUpload(id, key, filename, actor);
}

async function notifyTransparency(id: string) {
  const tr = await db
    .select({ locale: reportTranslations.locale, reviewedAt: reportTranslations.reviewedAt })
    .from(reportTranslations)
    .where(eq(reportTranslations.reportId, id));
  await notifySearchEngines(tr.filter((t) => t.reviewedAt).map((t) => `/${t.locale}/transparency`));
}
