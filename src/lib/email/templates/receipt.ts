import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { formatRupees, type Paise } from "@/lib/money";
import { C, emailLayout, esc, link, p } from "./layout";

/** Receipt email in the donor's language (the PDF itself is English; see src/lib/receipts/pdf.ts). */
export async function receiptEmail(
  locale: Locale,
  d: { name: string; amountPaise: Paise; receiptNumber: string; is80g: boolean; downloadUrl: string },
): Promise<{ subject: string; html: string; text: string }> {
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "ReceiptEmail" });
  const amount = formatRupees(d.amountPaise, locale);
  const v = { name: d.name, amount, number: d.receiptNumber };
  const subject = `${t("team")}: ${t(d.is80g ? "subject80g" : "subjectAck", v)}`;
  const lines = [t("greeting", v), t("thanks", v), t(d.is80g ? "attached80g" : "attachedAck", v), t("link")];
  const text = [...lines, d.downloadUrl, "", t("signoff"), t("team")].join("\n\n");
  const html = emailLayout({
    lang: locale,
    heading: t("team"),
    body: `${lines.map(p).join("\n")}
<p style="margin:0 0 24px">${link(d.downloadUrl, `${d.receiptNumber} (PDF)`)}</p>
<p style="margin:0;color:${C.muted}">${esc(t("signoff"))}<br>${esc(t("team"))}</p>`,
  });
  return { subject, html, text };
}
