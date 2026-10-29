import { z } from "zod";
import type { ReceiptKind } from "./numbering";

// Receipt templates (Admin → Settings → Receipts): the receipt PDFs and the receipt email are built
// from blocks the admin edits. Text holds {fields} filled from the donation, the donor and the
// Trust's settings. No database or pdfkit imports: the admin builder uses this file in the browser.

export type AckReason = "no_pan" | "not_requested" | "cause" | "cash_limit";
export const ACK_REASONS: { key: AckReason; label: string }[] = [
  { key: "not_requested", label: "80G receipt not asked for" },
  { key: "no_pan", label: "No PAN given" },
  { key: "cash_limit", label: "Cash above the 80G limit" },
  { key: "cause", label: "Cause not eligible for 80G" },
];

export type FieldDef = { key: string; label: string; group: string };

const PDF_FIELDS: FieldDef[] = [
  { key: "receipt.number", label: "Receipt number", group: "Receipt" },
  { key: "receipt.date", label: "Date of receipt", group: "Receipt" },
  { key: "donor.name", label: "Donor name", group: "Donor" },
  { key: "donor.address", label: "Donor address", group: "Donor" },
  { key: "donor.pan", label: "Donor PAN (masked)", group: "Donor" },
  { key: "amount", label: "Amount", group: "Donation" },
  { key: "amount.words", label: "Amount in words", group: "Donation" },
  { key: "payment.mode", label: "Mode of payment", group: "Donation" },
  { key: "payment.reference", label: "Payment reference", group: "Donation" },
  { key: "donation.towards", label: "Towards (cause)", group: "Donation" },
  { key: "trust.name", label: "Trust legal name", group: "Trust" },
  { key: "trust.address", label: "Trust address", group: "Trust" },
  { key: "trust.pan", label: "Trust PAN", group: "Trust" },
  { key: "trust.12a", label: "12A registration number", group: "Trust" },
  { key: "trust.80g", label: "80G registration number", group: "Trust" },
  { key: "trust.80g.from", label: "80G valid from", group: "Trust" },
  { key: "trust.80g.to", label: "80G valid to", group: "Trust" },
  { key: "trust.signatory", label: "Signatory name", group: "Trust" },
  { key: "trust.signatory.title", label: "Signatory title", group: "Trust" },
  { key: "trust.website", label: "Website", group: "Trust" },
  { key: "trust.email", label: "Trust email", group: "Trust" },
];
const ACK_NOTE: FieldDef = { key: "ack.note", label: "Reason note (below)", group: "Acknowledgement" };

/** The fields each template may use. */
export const TEMPLATE_FIELDS: Record<ReceiptKind | "email", FieldDef[]> = {
  "80g": PDF_FIELDS,
  acknowledgement: [...PDF_FIELDS, ACK_NOTE],
  email: [
    { key: "donor.name", label: "Donor name", group: "Donor" },
    { key: "amount", label: "Amount", group: "Donation" },
    { key: "receipt.number", label: "Receipt number", group: "Receipt" },
    { key: "link", label: "Download link", group: "Receipt" },
    { key: "trust.name", label: "Trust legal name", group: "Trust" },
  ],
};

/**
 * What an 80G receipt must show for the donor's deduction (Section 80G(5) and Rule 18AB): saving an
 * 80G template without one of these is refused. Edit this list to relax or tighten the check.
 */
export const REQUIRED_80G = [
  "receipt.number",
  "receipt.date",
  "donor.name",
  "donor.pan",
  "amount",
  "payment.mode",
  "trust.name",
  "trust.address",
  "trust.pan",
  "trust.80g",
  "trust.80g.from",
  "trust.80g.to",
] as const;

export type Align = "left" | "center" | "right";
export type TextStyle = "title" | "heading" | "strong" | "normal" | "small";
export type PdfBlock =
  /** Logo on the left (optional), a title and small lines on the right. */
  | { type: "header"; logo: boolean; title: string; text: string }
  | { type: "text"; text: string; style: TextStyle; align: Align }
  /** Label and value side by side, with a thin line under; hidden when its fields are all empty. */
  | { type: "row"; label: string; value: string; hideIfEmpty: boolean }
  | { type: "rule"; style: "brand" | "thin" }
  | { type: "space"; size: "small" | "medium" | "large" }
  /** Small centred text at the bottom of the page. */
  | { type: "footer"; text: string };
export type PdfTemplate = { blocks: PdfBlock[]; notes?: Partial<Record<AckReason, string>> };

export type EmailTemplate = { subject: string; body: string };
/** Receipt email per receipt kind and language; a language left out uses the built-in text. */
export type EmailTemplates = Record<ReceiptKind, Partial<Record<"en" | "hi" | "mr" | "gu", EmailTemplate>>>;

export const BLOCK_LABEL: Record<PdfBlock["type"], string> = {
  header: "Top of the receipt",
  text: "Paragraph",
  row: "Detail line",
  rule: "Divider line",
  space: "Gap",
  footer: "Page footer",
};

/** What each block looks like on the receipt, for the builder. */
export const BLOCK_HINT: Record<PdfBlock["type"], string> = {
  header: "The logo, the big title, and small lines beside it (receipt number, date).",
  text: "Any text: a heading, a sentence, the Trust’s name.",
  row: "A label on the left and its value on the right, with a thin line under it. Example: Amount  ₹2,500.",
  rule: "A line across the page.",
  space: "Empty space between blocks.",
  footer: "Small centred text at the very bottom of the page.",
};

const trustBlocks = (regs: string): PdfBlock[] => [
  { type: "text", text: "{trust.name}", style: "heading", align: "left" },
  { type: "text", text: `{trust.address}\n${regs}`, style: "small", align: "left" },
  { type: "rule", style: "brand" },
];
const row = (label: string, value: string, hideIfEmpty = false): PdfBlock => ({
  type: "row",
  label,
  value,
  hideIfEmpty,
});
const detailRows: PdfBlock[] = [
  row("Received with thanks from", "{donor.name}"),
  row("Address", "{donor.address}", true),
  row("Donor PAN", "{donor.pan}", true),
  row("Amount", "{amount}"),
  row("Amount in words", "{amount.words}"),
  row("Mode of payment", "{payment.mode}"),
  row("Payment reference", "{payment.reference}", true),
  row("Towards", "{donation.towards}"),
  row("Date of receipt", "{receipt.date}"),
];
const closing: PdfBlock[] = [
  {
    type: "text",
    text: "We confirm that no goods or services were provided in return for this donation.",
    style: "normal",
    align: "left",
  },
  { type: "space", size: "large" },
  { type: "text", text: "For {trust.name}", style: "strong", align: "right" },
  { type: "space", size: "medium" },
  { type: "text", text: "{trust.signatory}", style: "normal", align: "right" },
  { type: "text", text: "{trust.signatory.title}", style: "small", align: "right" },
  { type: "footer", text: "This is a computer-generated receipt. {trust.website}  ·  {trust.email}" },
];
const REGS =
  "PAN: {trust.pan}   ·   12A: {trust.12a}   ·   80G: {trust.80g} (valid {trust.80g.from} to {trust.80g.to})";

/** The built-in templates: the receipts as they were before they could be edited. */
export const DEFAULT_PDF: Record<ReceiptKind, PdfTemplate> = {
  "80g": {
    blocks: [
      {
        type: "header",
        logo: true,
        title: "DONATION RECEIPT",
        text: "No. {receipt.number}\nDate: {receipt.date}",
      },
      ...trustBlocks(REGS),
      ...detailRows,
      { type: "space", size: "small" },
      {
        type: "text",
        text: "This donation is eligible for deduction under Section 80G of the Income-tax Act, 1961, subject to the conditions specified therein. The Trust reports donations in Form 10BD; the certificate in Form 10BE is issued after that filing.",
        style: "normal",
        align: "left",
      },
      ...closing,
    ],
  },
  acknowledgement: {
    blocks: [
      {
        type: "header",
        logo: true,
        title: "ACKNOWLEDGEMENT",
        text: "No. {receipt.number}\nDate: {receipt.date}",
      },
      ...trustBlocks(REGS),
      ...detailRows,
      { type: "space", size: "small" },
      { type: "text", text: "{ack.note}", style: "normal", align: "left" },
      ...closing,
    ],
    notes: {
      not_requested:
        "This is an acknowledgement of your donation. It is not a receipt for deduction under Section 80G.",
      no_pan:
        "This is an acknowledgement, not a receipt for deduction under Section 80G, because no PAN was provided. Contact the Trust in the same financial year to have an 80G receipt issued.",
      cash_limit:
        "This is an acknowledgement, not a receipt for deduction under Section 80G: donations in cash above ₹2,000 are not eligible for the deduction (Section 80G(5D) of the Income-tax Act, 1961).",
      cause:
        "This is an acknowledgement. Donations towards this purpose are not eligible for deduction under Section 80G.",
    },
  },
};

const FIELD_RE = /\{([a-z0-9.]+)\}/gi;

/** The {fields} a piece of text uses. */
export const fieldsIn = (text: string): string[] => [...text.matchAll(FIELD_RE)].map((m) => m[1]!);

/** Fills {fields}; separators ("·") left dangling by empty fields are dropped. */
export function fill(text: string, values: Record<string, string>): string {
  return text
    .replace(FIELD_RE, (whole, key: string) => (key in values ? values[key]! : whole))
    .split("\n")
    .map((line) =>
      line
        .replace(/(\s*·\s*)+$/, "")
        .replace(/^(\s*·\s*)+/, "")
        .replace(/·(\s*·)+/g, "·"),
    )
    .join("\n");
}

/** Every piece of text in a template (for field checks). */
export function templateTexts(t: PdfTemplate): string[] {
  return t.blocks.flatMap((b) =>
    b.type === "header"
      ? [b.title, b.text]
      : b.type === "row"
        ? [b.label, b.value]
        : b.type === "text" || b.type === "footer"
          ? [b.text]
          : [],
  );
}

// ── Validation ───────────────────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().max(max, `At most ${max} characters`);
const align = z.enum(["left", "center", "right"]);
const PdfBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("header"), logo: z.boolean(), title: text(120), text: text(500) }),
  z.object({
    type: z.literal("text"),
    text: text(2000),
    style: z.enum(["title", "heading", "strong", "normal", "small"]),
    align,
  }),
  z.object({ type: z.literal("row"), label: text(80), value: text(500), hideIfEmpty: z.boolean() }),
  z.object({ type: z.literal("rule"), style: z.enum(["brand", "thin"]) }),
  z.object({ type: z.literal("space"), size: z.enum(["small", "medium", "large"]) }),
  z.object({ type: z.literal("footer"), text: text(300) }),
]);

const unknownFields = (texts: string[], allowed: FieldDef[]) => {
  const keys = new Set(allowed.map((f) => f.key));
  return [...new Set(texts.flatMap(fieldsIn).filter((k) => !keys.has(k)))];
};
const labelOf = (key: string) => PDF_FIELDS.find((f) => f.key === key)?.label ?? key;

/** What the 80G template is missing from REQUIRED_80G (labels). */
export function missingRequired(t: PdfTemplate): string[] {
  const used = new Set(templateTexts(t).flatMap(fieldsIn));
  return REQUIRED_80G.filter((k) => !used.has(k)).map(labelOf);
}

export function pdfTemplateSchema(kind: ReceiptKind) {
  return z
    .object({
      blocks: z.array(PdfBlockSchema).min(1, "Add at least one block").max(60, "At most 60 blocks"),
      notes: z
        .partialRecord(z.enum(["no_pan", "not_requested", "cause", "cash_limit"]), text(1000))
        .optional(),
    })
    .superRefine((t, ctx) => {
      const unknown = unknownFields(
        [...templateTexts(t), ...Object.values(t.notes ?? {})],
        TEMPLATE_FIELDS[kind],
      );
      if (unknown.length)
        ctx.addIssue({
          code: "custom",
          path: ["blocks"],
          message: `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.map((k) => `{${k}}`).join(", ")}. Use Insert field to add one.`,
        });
      const missing = kind === "80g" ? missingRequired(t) : [];
      if (missing.length)
        ctx.addIssue({
          code: "custom",
          path: ["blocks"],
          message: `An 80G receipt must show: ${missing.join(", ")}. Without them the donor can't claim the deduction.`,
        });
    });
}

const EmailTemplateSchema = z.object({ subject: text(200), body: text(5000) });
export const EmailTemplatesSchema = z
  .object({
    "80g": z.partialRecord(z.enum(["en", "hi", "mr", "gu"]), EmailTemplateSchema),
    acknowledgement: z.partialRecord(z.enum(["en", "hi", "mr", "gu"]), EmailTemplateSchema),
  })
  .superRefine((t, ctx) => {
    for (const kind of ["80g", "acknowledgement"] as const)
      for (const [locale, e] of Object.entries(t[kind])) {
        if (!e) continue;
        const where = [kind, locale];
        if (!e.subject.trim())
          ctx.addIssue({ code: "custom", path: [...where, "subject"], message: "Enter a subject" });
        if (!e.body.trim())
          ctx.addIssue({ code: "custom", path: [...where, "body"], message: "Enter the email text" });
        const unknown = unknownFields([e.subject, e.body], TEMPLATE_FIELDS.email);
        if (unknown.length)
          ctx.addIssue({
            code: "custom",
            path: [...where, "body"],
            message: `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.map((k) => `{${k}}`).join(", ")}`,
          });
      }
  });
