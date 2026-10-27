import { and, eq, inArray, sql } from "drizzle-orm";
import { financialYear } from "@/lib/dates/fy";
import { db } from "@/lib/db/client";
import { causes, donations, paymentSettings, receipts } from "@/lib/db/schema";
import { withTx, type Tx } from "@/lib/db/tx";
import { getPaymentProvider, type PaymentProvider } from "@/lib/payments";
import { decideReceiptKind } from "@/lib/receipts/kind";
import { allocateReceiptNumber } from "@/lib/receipts/numbering";
import { deliverReceipt } from "./deliver";

export class AmountMismatchError extends Error {}
export class UnknownOrderError extends Error {}

export type ConfirmResult =
  | { outcome: "paid"; receiptNumber: string; alreadyPaid: boolean }
  | { outcome: "not_paid"; gatewayStatus: string };

type Donation = typeof donations.$inferSelect;

/**
 * Marks a donation paid and issues its receipt number, in one transaction (spec §3 step 4).
 * Used for online payments (after the gateway confirms) and offline entries alike. Idempotent:
 * a donation that is already paid returns its existing receipt.
 */
export async function markPaidAndIssueReceipt(
  tx: Tx,
  donationId: string,
  payment: { receivedAt: Date; providerPaymentId?: string | null; providerPaymentMethod?: string | null },
): Promise<{ receiptId: string; receiptNumber: string; alreadyPaid: boolean }> {
  const [d] = await tx.select().from(donations).where(eq(donations.id, donationId)).for("update");
  if (!d) throw new UnknownOrderError(`Donation ${donationId} not found`);
  if (d.status === "paid" || d.status === "refunded") {
    // The live receipt (a corrected donation also has voided ones); a refunded one keeps its last.
    const [r] = await tx
      .select()
      .from(receipts)
      .where(eq(receipts.donationId, d.id))
      .orderBy(sql`${receipts.voidedAt} is not null`, sql`${receipts.issuedAt} desc`)
      .limit(1);
    if (!r) throw new Error(`Paid donation ${d.id} has no receipt`);
    return { receiptId: r.id, receiptNumber: r.number, alreadyPaid: true };
  }

  const fy = financialYear(payment.receivedAt);
  const [settings] = await tx.select({ cashLimit: paymentSettings.cash80gLimitPaise }).from(paymentSettings);
  const [cause] = d.causeId
    ? await tx.select({ is80g: causes.is80gEligible }).from(causes).where(eq(causes.id, d.causeId))
    : [{ is80g: true }];
  const decision = decideReceiptKind({
    wants80g: d.wants80g,
    hasPan: Boolean(d.panEncSnapshot),
    causeIs80gEligible: cause?.is80g ?? true,
    mode: d.mode,
    totalPaise: d.totalPaise,
    cash80gLimitPaise: settings?.cashLimit ?? 200000,
  });

  await tx
    .update(donations)
    .set({
      status: "paid",
      receivedAt: payment.receivedAt,
      fy,
      providerPaymentId: payment.providerPaymentId ?? d.providerPaymentId,
      providerPaymentMethod: payment.providerPaymentMethod ?? d.providerPaymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(donations.id, d.id));
  if (d.causeId)
    await tx
      .update(causes)
      .set({ raisedPaise: sql`${causes.raisedPaise} + ${d.amountPaise}` })
      .where(eq(causes.id, d.causeId));
  const { seq, number } = await allocateReceiptNumber(tx, decision.kind, fy);
  const [receipt] = await tx
    .insert(receipts)
    .values({ donationId: d.id, kind: decision.kind, number, fy, seq })
    .returning({ id: receipts.id });
  return { receiptId: receipt!.id, receiptNumber: number, alreadyPaid: false };
}

async function findByOrderId(orderId: string): Promise<Donation> {
  const [d] = await db.select().from(donations).where(eq(donations.publicOrderId, orderId)).limit(1);
  if (!d) throw new UnknownOrderError(`Unknown order ${orderId}`);
  return d;
}

/**
 * Online confirmation (webhook, reconciliation): re-fetch the order from the gateway, check the
 * amount and currency, then mark paid. The browser redirect never calls this (CLAUDE.md).
 */
export async function confirmOnlinePayment(
  orderId: string,
  provider: PaymentProvider = getPaymentProvider(),
  now: Date = new Date(),
): Promise<ConfirmResult> {
  const d = await findByOrderId(orderId);
  if (d.status === "paid" || d.status === "refunded") {
    const [r] = await db
      .select({ number: receipts.number })
      .from(receipts)
      .where(eq(receipts.donationId, d.id));
    return { outcome: "paid", receiptNumber: r?.number ?? "", alreadyPaid: true };
  }
  const order = await provider.getOrder(orderId);
  if (order.status !== "paid") {
    if (order.status === "expired" || order.status === "failed") await markUnpaid(orderId, order.status);
    return { outcome: "not_paid", gatewayStatus: order.status };
  }
  if (order.currency !== "INR" || order.amountPaise !== d.totalPaise)
    throw new AmountMismatchError(
      `Order ${orderId}: gateway ${order.currency} ${order.amountPaise} ≠ expected INR ${d.totalPaise}`,
    );

  const result = await withTx((tx) =>
    markPaidAndIssueReceipt(tx, d.id, {
      receivedAt: now,
      providerPaymentId: order.payment?.id ?? null,
      providerPaymentMethod: order.payment?.method ?? null,
    }),
  );
  // After commit: PDF + email. Failures are retried by reconciliation; the payment stands.
  await deliverReceipt(result.receiptId).catch((error) =>
    console.error(`Receipt delivery failed (${orderId})`, error),
  );
  return { outcome: "paid", receiptNumber: result.receiptNumber, alreadyPaid: result.alreadyPaid };
}

/** Failed / dropped / expired at the gateway. Never downgrades a paid donation. */
export async function markUnpaid(orderId: string, status: "failed" | "expired"): Promise<void> {
  await db
    .update(donations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(donations.publicOrderId, orderId), inArray(donations.status, ["created", "pending"])));
}

export type RefundOutcome = "refunded" | "not_paid" | "other_payment";

/**
 * A refund succeeded (from the Cashfree dashboard, or an automatic one): donation refunded, cause
 * total reduced, receipt voided (number kept). Only when the refunded payment is the one recorded
 * for the donation: a donor who paid twice gets the extra payment back and keeps the receipt.
 */
export async function markRefunded(
  orderId: string,
  refundId: string,
  refund: { paymentId?: string | null; auto?: boolean } = {},
): Promise<RefundOutcome> {
  return withTx(async (tx) => {
    const [d] = await tx.select().from(donations).where(eq(donations.publicOrderId, orderId)).for("update");
    if (!d || d.status !== "paid") return "not_paid";
    if (refund.paymentId && d.providerPaymentId && refund.paymentId !== d.providerPaymentId)
      return "other_payment";
    await tx
      .update(donations)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(donations.id, d.id));
    if (d.causeId)
      await tx
        .update(causes)
        .set({ raisedPaise: sql`greatest(${causes.raisedPaise} - ${d.amountPaise}, 0)` })
        .where(eq(causes.id, d.causeId));
    await tx
      .update(receipts)
      .set({
        voidedAt: new Date(),
        voidReason: refund.auto
          ? `Automatically refunded by Cashfree (refund ${refundId})`
          : `Refunded (Cashfree refund ${refundId})`,
      })
      .where(and(eq(receipts.donationId, d.id), sql`${receipts.voidedAt} is null`));
    return "refunded";
  });
}
