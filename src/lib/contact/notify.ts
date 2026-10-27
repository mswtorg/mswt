import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { emailSettings, messages, organizationSettings } from "@/lib/db/schema";
import { getEmailProvider } from "@/lib/email";
import { sendAdminAlert } from "@/lib/email/alerts";
import { contactAlert } from "@/lib/email/templates/alerts";
import { contactAcknowledgement } from "@/lib/email/templates/contact";
import { appOrigin, siteUrl } from "@/lib/seo/site";
import en from "@/messages/en.json";
import type { ContactInput } from "./schema";

// Same fallback as the error page text (Error.body) until the Trust's email is set in the admin.
const FALLBACK_EMAIL = "info@mswelfaretrust.org";

/**
 * After a contact message is saved: "[MSWT] [Contact] …" to the admins (replies go to the sender)
 * and "we've received your message" to the sender, in their language. Never throws: the message
 * is already saved and shown in Admin → Content → Messages.
 */
export async function notifyContactMessage(messageId: string): Promise<void> {
  try {
    const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!m) return;
    const [[org], [mail]] = await Promise.all([
      db
        .select({ email: organizationSettings.email, phones: organizationSettings.phones })
        .from(organizationSettings)
        .limit(1),
      db.select({ replyTo: emailSettings.replyTo }).from(emailSettings).limit(1),
    ]);
    const subject = m.subject as ContactInput["subject"];
    const locale = m.locale as Locale;
    await sendAdminAlert(
      "contact",
      contactAlert({
        name: m.name,
        email: m.email,
        phone: m.phone,
        subjectLabel: en.Contact.subjects[subject] ?? m.subject,
        message: m.body,
        locale,
        adminUrl: `${appOrigin()}/admin/content/messages/${m.id}`,
      }),
      { entityType: "message", entityId: m.id, replyTo: { email: m.email, name: m.name } },
    );
    const local = (await import(`../../messages/${locale}.json`)).default as typeof en;
    const trustEmail = org?.email || FALLBACK_EMAIL;
    const ack = await contactAcknowledgement(locale, {
      name: m.name,
      subjectLabel: local.Contact.subjects[subject] ?? m.subject,
      message: m.body,
      trust: { email: trustEmail, phones: org?.phones ?? [], website: siteUrl().host },
    });
    await getEmailProvider().send({
      ...ack,
      to: { email: m.email, name: m.name },
      replyTo: { email: mail?.replyTo || trustEmail },
      tag: "contact-ack",
    });
  } catch (error) {
    console.error(`Contact notification failed (message ${messageId})`, error);
  }
}
