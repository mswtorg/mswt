import type { Locale } from "@/i18n/routing";
import { formatRupees, type Paise } from "@/lib/money";
import type { ReceiptKind } from "@/lib/receipts/numbering";
import { fill, type EmailTemplate, type EmailTemplates } from "@/lib/receipts/template";
import en from "@/messages/en.json";
import gu from "@/messages/gu.json";
import hi from "@/messages/hi.json";
import mr from "@/messages/mr.json";
import { C, emailLayout, esc, link } from "./layout";

const MESSAGES = { en, hi, mr, gu } as const;
const placeholders = (s: string) =>
  s.replaceAll("{name}", "{donor.name}").replaceAll("{number}", "{receipt.number}");

/** The built-in receipt email in one language (src/messages ReceiptEmail), as an editable template. */
export function defaultReceiptEmail(locale: Locale, kind: ReceiptKind): EmailTemplate {
  const m = MESSAGES[locale].ReceiptEmail;
  const is80g = kind === "80g";
  return {
    subject: placeholders(`${m.team}: ${is80g ? m.subject80g : m.subjectAck}`),
    body: placeholders(
      [
        m.greeting,
        m.thanks,
        is80g ? m.attached80g : m.attachedAck,
        `${m.link}\n{link}`,
        `${m.signoff}\n${m.team}`,
      ].join("\n\n"),
    ),
  };
}

/**
 * Receipt email in the donor's language (the PDF itself is English; see src/lib/receipts/pdf.ts),
 * from the template edited in Admin → Settings → Receipts, or the built-in text for that language.
 * Paragraphs are separated by a blank line; {link} becomes the download link.
 */
export async function receiptEmail(
  locale: Locale,
  d: {
    name: string;
    amountPaise: Paise;
    receiptNumber: string;
    is80g: boolean;
    downloadUrl: string;
    trustName?: string;
  },
  templates?: EmailTemplates | null,
): Promise<{ subject: string; html: string; text: string }> {
  const kind: ReceiptKind = d.is80g ? "80g" : "acknowledgement";
  const t = templates?.[kind]?.[locale] ?? defaultReceiptEmail(locale, kind);
  const values = {
    "donor.name": d.name,
    amount: formatRupees(d.amountPaise, locale),
    "receipt.number": d.receiptNumber,
    "trust.name": d.trustName ?? "Munira Shoaib Welfare Trust",
  };
  const LINK = "\u0000link\u0000";
  const paragraphs = fill(t.body.replaceAll("{link}", LINK), values)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const anchor = link(d.downloadUrl, `${d.receiptNumber} (PDF)`);
  const html = emailLayout({
    lang: locale,
    heading: MESSAGES[locale].ReceiptEmail.team,
    body: paragraphs
      .map((p, i) => {
        const inner = p
          .split(LINK)
          .map((part) => esc(part).replaceAll("\n", "<br>"))
          .join(anchor);
        const last = i === paragraphs.length - 1 && paragraphs.length > 1;
        return `<p style="margin:0 0 ${last ? 0 : 16}px${last ? `;color:${C.muted}` : ""}">${inner}</p>`;
      })
      .join("\n"),
  });
  return {
    subject: fill(t.subject, values).replaceAll("\n", " ").trim(),
    html,
    text: paragraphs.map((p) => p.replaceAll(LINK, d.downloadUrl)).join("\n\n"),
  };
}
