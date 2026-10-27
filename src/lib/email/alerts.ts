import { db } from "@/lib/db/client";
import { emailSettings } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { recordAudit } from "@/lib/audit";
import { getEmailProvider, type EmailMessage } from "@/lib/email";
import type { AlertKind, Email } from "./templates/alerts";

/** Admin → Settings → Email → admin alert recipients. */
export async function alertRecipients(): Promise<string[]> {
  const [s] = await db.select({ to: emailSettings.adminAlertRecipients }).from(emailSettings).limit(1);
  return s?.to ?? [];
}

/**
 * Sends an admin alert to every alert recipient. Never throws: the donation or message it reports
 * is already saved, so a failed alert is logged and noted in the audit log instead.
 */
export async function sendAdminAlert(
  kind: AlertKind,
  email: Email,
  opts: { entityType: string; entityId?: string | null; replyTo?: EmailMessage["replyTo"] },
): Promise<void> {
  let recipients: string[] = [];
  try {
    recipients = await alertRecipients();
    for (const to of recipients)
      await getEmailProvider().send({
        ...email,
        to: { email: to },
        replyTo: opts.replyTo,
        tag: `alert-${kind}`,
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Admin alert not sent (${kind})`, message);
    await withTx((tx) =>
      recordAudit(
        tx,
        { userId: null },
        {
          action: "email.alert_failed",
          entityType: opts.entityType,
          entityId: opts.entityId ?? null,
          after: { kind, subject: email.subject, error: message },
        },
      ),
    ).catch((e) => console.error("Audit entry for the failed alert not written", e));
  }
}
