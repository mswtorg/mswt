import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { C, emailLayout, esc, p, quote } from "./layout";
import type { Email } from "./alerts";

/**
 * "We've received your message", in the sender's language, with a copy of their message (as plain
 * text: links in it are not made clickable) and the Trust's contact details.
 */
export async function contactAcknowledgement(
  locale: Locale,
  m: {
    name: string;
    subjectLabel: string;
    message: string;
    trust: { email: string; phones: string[]; website: string };
  },
): Promise<Email> {
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "ContactEmail" });
  const lines = [t("greeting", { name: m.name }), t("received", { subject: m.subjectLabel })];
  const contact = [m.trust.email, ...m.trust.phones, m.trust.website];
  const subject = `${t("team")}: ${t("subject")}`;
  const text = [
    ...lines,
    `${t("copy")}\n${m.message}`,
    t("reply", { email: m.trust.email }),
    `${t("contact")}: ${contact.join(" · ")}`,
    `${t("signoff")}\n${t("team")}`,
  ].join("\n\n");
  const html = emailLayout({
    lang: locale,
    heading: t("team"),
    footer: `${t("contact")}: ${contact.join(" · ")}`,
    body: `${lines.map(p).join("\n")}
<p style="margin:0 0 8px;color:${C.muted}">${esc(t("copy"))}</p>
${quote(m.message)}
${p(t("reply", { email: m.trust.email }))}
<p style="margin:0;color:${C.muted}">${esc(t("signoff"))}<br>${esc(t("team"))}</p>`,
  });
  return { subject, html, text };
}
