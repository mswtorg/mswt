import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { causeTranslations, donations, receipts } from "@/lib/db/schema";
import { formatDate } from "@/lib/dates/format";
import { sendAdminAlert } from "@/lib/email/alerts";
import {
  donationAlert,
  paymentFailedAlert,
  paymentProblemAlert,
  type PaymentProblem,
} from "@/lib/email/templates/alerts";
import { appOrigin } from "@/lib/seo/site";
import { deliverReceipt, receiptData } from "./deliver";

const adminUrl = (path: string) => `${appOrigin()}${path}`;

/** "[MSWT] [Donation] …" once per donation: called only when the receipt was just issued. */
export async function alertNewDonation(receiptId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ id: donations.id, email: donations.emailSnapshot, orderId: donations.publicOrderId })
      .from(receipts)
      .innerJoin(donations, eq(donations.id, receipts.donationId))
      .where(eq(receipts.id, receiptId));
    if (!row) return;
    const r = await receiptData(receiptId);
    await sendAdminAlert(
      "donation",
      donationAlert({
        amountPaise: r.amountPaise,
        towards: r.towards,
        receiptNumber: r.number,
        receiptKind: r.kind,
        mode: r.modeLabel,
        donorName: r.donorName,
        donorEmail: row.email,
        panMasked: r.panMasked,
        orderId: row.orderId,
        receivedAt: formatDate("en", r.receivedAt, true),
        adminUrl: adminUrl(`/admin/donations/${row.id}`),
      }),
      { entityType: "donation", entityId: row.id },
    );
  } catch (error) {
    console.error(`Donation alert not sent (receipt ${receiptId})`, error);
  }
}

const WHAT_TO_DO: Record<PaymentProblem["problem"], string> = {
  "Amount mismatch":
    "Cashfree reported a payment whose amount or currency doesn't match the donation, so it was not marked paid and no receipt was issued. Check the order in the Cashfree dashboard before doing anything else.",
  "Unknown order":
    "Cashfree sent a payment for an order this site doesn't know. Check the order in the Cashfree dashboard; it may belong to another site using the same account.",
  "Receipt not emailed":
    "The donation is paid and the receipt number is issued, but the receipt couldn't be emailed. The daily check retries it; you can also resend it from the donation page.",
};

/** "[MSWT] [Payment problem] …". Never throws. */
export async function alertPaymentProblem(
  problem: PaymentProblem["problem"],
  reference: string,
  details: string,
  donationId?: string | null,
): Promise<void> {
  await sendAdminAlert(
    "paymentProblem",
    paymentProblemAlert({
      problem,
      reference,
      details,
      whatToDo: WHAT_TO_DO[problem],
      adminUrl: adminUrl(donationId ? `/admin/donations/${donationId}` : "/admin/donations"),
    }),
    { entityType: donationId ? "donation" : "payment_event", entityId: donationId ?? reference },
  );
}

/**
 * Right after a receipt is issued: PDF + donor email, then the admin alerts. A failed delivery is
 * reported once here; the daily check keeps retrying it and lists it in the summary.
 */
export async function deliverAndAlert(receiptId: string): Promise<void> {
  try {
    await deliverReceipt(receiptId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Receipt delivery failed (receipt ${receiptId})`, error);
    const [r] = await db
      .select({ number: receipts.number, donationId: receipts.donationId })
      .from(receipts)
      .where(eq(receipts.id, receiptId));
    await alertPaymentProblem("Receipt not emailed", r?.number ?? receiptId, message, r?.donationId);
  }
  await alertNewDonation(receiptId);
}

/**
 * "[MSWT] [Payment failed] …" for each failed attempt Cashfree reports (owner decision: every
 * failure). Not sent when the donation is already paid (a later attempt went through). Never throws.
 */
export async function alertPaymentFailed(
  orderId: string,
  failure: { reason: string | null; dropped: boolean },
  at: Date = new Date(),
): Promise<void> {
  try {
    const [d] = await db
      .select({
        id: donations.id,
        status: donations.status,
        totalPaise: donations.totalPaise,
        name: donations.nameSnapshot,
        email: donations.emailSnapshot,
        cause: causeTranslations.title,
      })
      .from(donations)
      .leftJoin(
        causeTranslations,
        and(eq(causeTranslations.causeId, donations.causeId), eq(causeTranslations.locale, "en")),
      )
      .where(eq(donations.publicOrderId, orderId))
      .limit(1);
    if (!d || d.status === "paid" || d.status === "refunded") return;
    await sendAdminAlert(
      "paymentFailed",
      paymentFailedAlert({
        amountPaise: d.totalPaise,
        towards: d.cause ?? "General fund",
        reason: failure.reason,
        dropped: failure.dropped,
        donorName: d.name,
        donorEmail: d.email,
        orderId,
        attemptedAt: formatDate("en", at, true),
        adminUrl: adminUrl(`/admin/donations/${d.id}`),
      }),
      { entityType: "donation", entityId: d.id },
    );
  } catch (error) {
    console.error(`Payment-failed alert not sent (${orderId})`, error);
  }
}
