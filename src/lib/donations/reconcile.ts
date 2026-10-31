import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { donations, reconciliationRuns, receipts } from "@/lib/db/schema";
import { getPaymentProvider, type PaymentProvider } from "@/lib/payments";
import { confirmOnlinePayment, markUnpaid } from "./confirm";
import { deliverReceipt } from "./deliver";

const PENDING_AFTER_MS = 30 * 60 * 1000;
const MAX_EMAIL_ATTEMPTS = 5;
// Unpaid orders older than this are given up on (Cashfree orders expire well before).
const EXPIRE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Daily safety net (spec §3): asks the gateway about donations still pending after 30 minutes,
 * applies the same idempotent confirmation as the webhook, and retries receipt PDFs/emails.
 * The gateway is only needed when there are pending online donations: without Cashfree keys
 * (online donations not live yet) receipts are still retried and the run is still recorded.
 */
export async function reconcile(
  provider?: PaymentProvider,
  now: Date = new Date(),
): Promise<{ checked: number; updated: number; errors: { orderId: string; error: string }[] }> {
  const [run] = await db.insert(reconciliationRuns).values({}).returning({ id: reconciliationRuns.id });
  const errors: { orderId: string; error: string }[] = [];
  let checked = 0;
  let updated = 0;

  const stale = await db
    .select({ orderId: donations.publicOrderId, createdAt: donations.createdAt })
    .from(donations)
    .where(
      and(
        eq(donations.mode, "online"),
        inArray(donations.status, ["created", "pending"]),
        lt(donations.createdAt, new Date(now.getTime() - PENDING_AFTER_MS)),
      ),
    )
    .limit(500);
  let gateway = provider;
  if (stale.length && !gateway) {
    try {
      gateway = getPaymentProvider();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ orderId: "-", error: `Payment gateway not configured: ${message}` });
    }
  }
  if (gateway)
    for (const d of stale) {
      checked++;
      try {
        const result = await confirmOnlinePayment(d.orderId, gateway, now);
        if (result.outcome === "paid" && !result.alreadyPaid) updated++;
        else if (result.outcome === "not_paid" && result.gatewayStatus !== "active") updated++;
        else if (now.getTime() - d.createdAt.getTime() > EXPIRE_AFTER_MS) {
          await markUnpaid(d.orderId, "expired");
          updated++;
        }
      } catch (error) {
        // An order the gateway never created (e.g. createOrder failed) is not an error after expiry.
        if (now.getTime() - d.createdAt.getTime() > EXPIRE_AFTER_MS) await markUnpaid(d.orderId, "expired");
        else
          errors.push({ orderId: d.orderId, error: error instanceof Error ? error.message : String(error) });
      }
    }

  const undelivered = await db
    .select({ id: receipts.id, orderId: donations.publicOrderId })
    .from(receipts)
    .innerJoin(donations, eq(donations.id, receipts.donationId))
    .where(
      and(
        isNull(receipts.voidedAt),
        or(isNull(receipts.pdfR2Key), isNull(receipts.emailedAt)),
        lt(receipts.emailAttempts, MAX_EMAIL_ATTEMPTS),
      ),
    )
    .limit(200);
  for (const r of undelivered) {
    try {
      await deliverReceipt(r.id);
    } catch (error) {
      errors.push({ orderId: r.orderId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await db
    .update(reconciliationRuns)
    .set({ finishedAt: new Date(), checked, updated, errors })
    .where(eq(reconciliationRuns.id, run!.id));
  return { checked, updated, errors };
}
