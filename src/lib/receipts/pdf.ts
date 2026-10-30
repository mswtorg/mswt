import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import tokens from "../../../tokens/design-tokens.json";
import type { PostalAddress } from "@/lib/db/schema";
import { formatRupees, type Paise } from "@/lib/money";
import type { ReceiptKind } from "./numbering";
import {
  DEFAULT_PDF,
  fieldsIn,
  fill,
  type AckReason,
  type PdfBlock,
  type PdfTemplate,
  type TextStyle,
} from "./template";
import { amountInWords } from "./words";

// Receipt PDF (spec §4.3), drawn from its template (./template.ts, edited in Admin → Settings →
// Receipts). English only (owner decision 2026-10-22). Donor names and addresses may
// be in Devanagari or Gujarati: Poppins covers Latin + Devanagari, Noto Sans Gujarati the rest.
// TTF, not WOFF2: pdfkit's font subsetter breaks with two WOFF2 fonts in one document.

const asset = (file: string) => join(process.cwd(), "src/assets/receipt", file);
const FONTS = {
  regular: asset("Poppins_400Regular.ttf"),
  bold: asset("Poppins_600SemiBold.ttf"),
  gujarati: asset("NotoSansGujarati_400Regular.ttf"),
  gujaratiBold: asset("NotoSansGujarati_600SemiBold.ttf"),
};
const COLOR = {
  text: tokens.color.neutral["900"].$value,
  muted: tokens.color.neutral["700"].$value,
  rule: tokens.color.brand.green.$value,
  line: tokens.color.neutral["200"].$value,
  void: tokens.color.error["700"].$value,
  tag: tokens.color.white.$value,
};

export type TrustFacts = {
  legalName: string;
  address: string | null;
  email: string | null;
  website: string;
  trustPan: string | null;
  reg12aNumber: string | null;
  reg80gNumber: string | null;
  reg80gValidFrom: string | null;
  reg80gValidTo: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
};

export type ReceiptData = {
  kind: ReceiptKind;
  number: string;
  receivedAt: Date;
  donorName: string;
  donorAddress: PostalAddress | null;
  panMasked: string | null;
  amountPaise: Paise;
  modeLabel: string;
  paymentReference: string | null;
  towards: string;
  ackReason: AckReason | null;
  voided?: boolean;
  /** Admin preview: watermarked "SAMPLE". */
  sample?: boolean;
  /** Admin preview only (with `sample`): each block's number in the left margin, as in the builder. */
  numbers?: boolean;
  trust: TrustFacts;
};

/** Trust facts a receipt cannot be issued without (open-questions B1, B8). */
export function missingTrustFacts(t: TrustFacts, kind: ReceiptKind): string[] {
  const missing: string[] = [];
  if (!t.address) missing.push("Trust address");
  if (!t.trustPan) missing.push("Trust PAN");
  if (!t.signatoryName) missing.push("signatory name");
  if (kind === "80g") {
    if (!t.reg80gNumber) missing.push("80G registration number");
    if (!t.reg80gValidFrom || !t.reg80gValidTo) missing.push("80G validity");
  }
  return missing;
}

const TBC = (what: string) => `[to be confirmed: ${what}]`;

function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

const GUJARATI = /[઀-૿]+/g;

/** Splits text into runs so Gujarati uses Noto Sans Gujarati and everything else Poppins. */
function runs(text: string): { gujarati: boolean; text: string }[] {
  const out: { gujarati: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(GUJARATI)) {
    if (m.index > last) out.push({ gujarati: false, text: text.slice(last, m.index) });
    out.push({ gujarati: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ gujarati: false, text: text.slice(last) });
  return out;
}

type Doc = PDFKit.PDFDocument;

/** Text in Poppins with Gujarati runs in Noto Sans Gujarati; starts at (x, y) when given. */
function mixed(
  doc: Doc,
  text: string,
  bold: boolean,
  opts: PDFKit.Mixins.TextOptions,
  size: number,
  x?: number,
  y?: number,
) {
  doc.fontSize(size);
  const parts = runs(text);
  parts.forEach((part, i) => {
    doc.font(part.gujarati ? (bold ? "gujaratiBold" : "gujarati") : bold ? "bold" : "regular");
    const o = { ...opts, continued: i < parts.length - 1 };
    if (i === 0 && x !== undefined && y !== undefined) doc.text(part.text, x, y, o);
    else doc.text(part.text, o);
  });
}

/** Draws the horizontal logo from its SVG (nested <g transform> + <path d>, as in brand/logo); returns its height. */
function drawLogo(doc: Doc, x: number, y: number, width: number): number {
  const svg = readFileSync(join(process.cwd(), "public/brand/mswt-logo-horizontal.svg"), "utf8");
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const vbWidth = Number(viewBox?.[1] ?? 1560);
  const vbHeight = Number(viewBox?.[2] ?? 489);
  doc
    .save()
    .translate(x, y)
    .scale(width / vbWidth);
  const fills: string[] = [];
  for (const tag of svg.matchAll(/<(\/?)(g|path)\b([^>]*?)(\/?)>/g)) {
    const [, closing, name, attrs = ""] = tag;
    if (name === "g" && closing) {
      doc.restore();
      fills.pop();
      continue;
    }
    if (name === "g") {
      doc.save();
      fills.push(/fill="([^"]+)"/.exec(attrs)?.[1] ?? fills.at(-1) ?? COLOR.text);
      const transform = /transform="([^"]+)"/.exec(attrs)?.[1] ?? "";
      for (const [, fn, args] of transform.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
        const [a = 0, b] = (args ?? "").split(/[\s,]+/).map(Number);
        if (fn === "translate") doc.translate(a, b ?? 0);
        else doc.scale(a, b ?? a);
      }
      continue;
    }
    const d = /\bd="([^"]+)"/.exec(attrs)?.[1];
    if (d) doc.path(d).fill(fills.at(-1) ?? COLOR.text);
  }
  doc.restore();
  return (vbHeight * width) / vbWidth;
}

/** The value of every template field for one receipt (missing Trust facts print as "to be confirmed"). */
export function receiptValues(r: ReceiptData, template: PdfTemplate): Record<string, string> {
  const t = r.trust;
  const a = r.donorAddress;
  const reason = r.ackReason ?? "not_requested";
  return {
    "receipt.number": r.number,
    "receipt.date": istDate(r.receivedAt),
    "donor.name": r.donorName,
    "donor.address": a
      ? [a.line1, a.line2, a.city, [a.state, a.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : "",
    "donor.pan": r.panMasked ?? "",
    amount: formatRupees(r.amountPaise, "en"),
    "amount.words": amountInWords(r.amountPaise),
    "payment.mode": r.modeLabel,
    "payment.reference": r.paymentReference ?? "",
    "donation.towards": r.towards,
    "trust.name": t.legalName,
    "trust.address": t.address ?? TBC("Trust address"),
    "trust.pan": t.trustPan ?? TBC("Trust PAN"),
    "trust.12a": t.reg12aNumber ?? TBC("12A registration"),
    "trust.80g": t.reg80gNumber ?? TBC("80G registration"),
    "trust.80g.from": t.reg80gValidFrom ?? TBC("80G validity"),
    "trust.80g.to": t.reg80gValidTo ?? TBC("80G validity"),
    "trust.signatory": t.signatoryName ?? TBC("signatory"),
    "trust.signatory.title": t.signatoryTitle ?? "Authorised Signatory",
    "trust.website": t.website,
    "trust.email": t.email ?? "",
    "ack.note": template.notes?.[reason] ?? DEFAULT_PDF.acknowledgement.notes?.[reason] ?? "",
  };
}

export type ResolvedBlock = (
  | Extract<PdfBlock, { type: "header" | "text" | "rule" | "space" | "footer" }>
  | { type: "row"; label: string; value: string }
) & {
  /** The block's position in the template (0-based), kept when blocks before it are dropped. */
  n: number;
};

/** The template with every field filled in; rows and text left empty by their fields are dropped. */
export function resolveReceipt(template: PdfTemplate, r: ReceiptData): ResolvedBlock[] {
  const values = receiptValues(r, template);
  const empty = (text: string) => {
    const keys = fieldsIn(text);
    return keys.length > 0 && keys.every((k) => !values[k]?.trim());
  };
  return template.blocks.flatMap((b, n): ResolvedBlock[] => {
    switch (b.type) {
      case "header":
        return [{ ...b, n, title: fill(b.title, values), text: fill(b.text, values) }];
      case "row":
        return b.hideIfEmpty && (empty(b.value) || !fill(b.value, values).trim())
          ? []
          : [{ type: "row", n, label: fill(b.label, values), value: fill(b.value, values) }];
      case "text":
      case "footer": {
        const text = fill(b.text, values);
        return text.trim() ? [{ ...b, n, text }] : [];
      }
      default:
        return [{ ...b, n }];
    }
  });
}

const STYLE: Record<TextStyle, { bold: boolean; size: number; muted: boolean }> = {
  title: { bold: true, size: 15, muted: false },
  heading: { bold: true, size: 11, muted: false },
  strong: { bold: true, size: 9.5, muted: false },
  normal: { bold: false, size: 9, muted: false },
  small: { bold: false, size: 8.5, muted: true },
};
const SPACE = { small: 0.6, medium: 1.8, large: 2.5 } as const;
const LOGO_WIDTH = 190;

/** Renders the receipt to a PDF buffer from its template (the built-in one unless given). */
export async function renderReceiptPdf(
  r: ReceiptData,
  template: PdfTemplate = DEFAULT_PDF[r.kind],
): Promise<Buffer> {
  // `font` avoids pdfkit loading its built-in Helvetica metrics (not shipped to serverless bundles).
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    font: FONTS.regular,
    info: {
      Title: `${r.kind === "80g" ? "Donation receipt" : "Acknowledgement"} ${r.number}`,
      Author: r.trust.legalName,
      Subject: "Donation receipt",
    },
  });
  for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const footers: { text: string; n: number }[] = [];
  const labelWidth = 150;
  // Admin preview: "3" in a small tag in the left margin, level with where block 3 starts.
  // Blocks that start close together (a gap, then text) get stacked tags instead of overlapping ones.
  let tagBottom = 0;
  const tag = (n: number, at: number) => {
    if (!r.sample || !r.numbers) return;
    const y = Math.max(at, tagBottom + 1);
    tagBottom = y + 12;
    const { x: keepX, y: keepY } = doc;
    const label = String(n + 1);
    doc.save();
    doc.roundedRect(left - 34, y, 22, 12, 3).fill(COLOR.muted);
    doc.font("bold").fontSize(7).fillColor(COLOR.tag);
    doc.text(label, left - 34, y + 2.2, { width: 22, align: "center", lineBreak: false });
    doc.restore();
    doc.x = keepX;
    doc.y = keepY;
  };

  for (const b of resolveReceipt(template, r)) {
    if (b.type !== "footer") tag(b.n, doc.y);
    switch (b.type) {
      case "header": {
        // Logo left; title and small lines right.
        const top = doc.y;
        const logoHeight = b.logo ? drawLogo(doc, left, top, LOGO_WIDTH) : 0;
        doc.fillColor(COLOR.text);
        mixed(doc, b.title, true, { width, align: "right" }, 15, left, top + 4);
        doc.fontSize(9.5).fillColor(COLOR.muted);
        if (b.text.trim()) mixed(doc, b.text, false, { width, align: "right" }, 9.5);
        doc.x = left;
        doc.y = Math.max(top + logoHeight, doc.y) + 10;
        break;
      }
      case "text": {
        const s = STYLE[b.style];
        doc.fillColor(s.muted ? COLOR.muted : COLOR.text);
        mixed(doc, b.text, s.bold, { width, align: b.align }, s.size, left, doc.y);
        doc.moveDown(0.4);
        break;
      }
      case "row": {
        const y = doc.y;
        doc
          .font("regular")
          .fontSize(9.5)
          .fillColor(COLOR.muted)
          .text(b.label, left, y, { width: labelWidth });
        const labelBottom = doc.y;
        doc.fillColor(COLOR.text);
        mixed(doc, b.value, true, { width: width - labelWidth }, 9.5, left + labelWidth, y);
        doc.x = left;
        doc.y = Math.max(doc.y, labelBottom);
        doc.moveDown(0.25);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + width, doc.y)
          .lineWidth(0.5)
          .strokeColor(COLOR.line)
          .stroke();
        doc.moveDown(0.45);
        break;
      }
      case "rule":
        if (b.style === "brand") {
          doc.moveDown(0.3);
          doc.rect(left, doc.y, width, 2).fill(COLOR.rule);
          doc.moveDown(1);
        } else {
          doc
            .moveTo(left, doc.y)
            .lineTo(left + width, doc.y)
            .lineWidth(0.5)
            .strokeColor(COLOR.line)
            .stroke();
          doc.moveDown(0.6);
        }
        break;
      case "space":
        doc.fontSize(9.5).moveDown(SPACE[b.size]);
        break;
      case "footer":
        footers.push({ text: b.text, n: b.n });
        break;
    }
  }

  // Footers sit at the bottom of the last page, the last one lowest.
  doc.fontSize(7.5).fillColor(COLOR.muted);
  footers.reverse().forEach(({ text, n }, i) => {
    tagBottom = 0; // footers are drawn bottom-up, 12pt apart: no stacking
    const y = doc.page.height - doc.page.margins.bottom - 24 - i * 12;
    doc.fontSize(7.5).fillColor(COLOR.muted);
    mixed(doc, text, false, { width, align: "center", lineBreak: false }, 7.5, left, y);
    tag(n, y - 1);
  });

  const mark = r.voided ? "VOID" : r.sample ? "SAMPLE" : null;
  if (mark) {
    doc.save().rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font("bold").fontSize(110).fillColor(COLOR.void).opacity(0.18);
    doc.text(mark, 0, doc.page.height / 2 - 70, {
      width: doc.page.width,
      align: "center",
      lineBreak: false,
    });
    doc.restore();
  }

  doc.end();
  return done;
}
