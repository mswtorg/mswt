import { db } from "@/lib/db/client";
import { receiptSettings } from "@/lib/db/schema";
import type { ReceiptKind } from "./numbering";
import { DEFAULT_PDF, type EmailTemplates, type PdfTemplate } from "./template";

export type ReceiptTemplates = { pdf: Record<ReceiptKind, PdfTemplate>; email: EmailTemplates | null };

/** The receipt templates in use: the saved ones, else the built-in ones. Read fresh (no cache). */
export async function loadReceiptTemplates(): Promise<ReceiptTemplates> {
  const [row] = await db.select().from(receiptSettings).limit(1);
  return {
    pdf: {
      "80g": row?.pdf80g ?? DEFAULT_PDF["80g"],
      acknowledgement: row?.pdfAck ?? DEFAULT_PDF.acknowledgement,
    },
    email: row?.email ?? null,
  };
}
