import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { donations, paymentEvents } from "@/lib/db/schema";
import type { PaymentProvider } from "@/lib/payments";
import {
  AmountMismatchError,
  confirmOnlinePayment,
  markRefunded,
  markUnpaid,
  UnknownOrderError,
} from "./confirm";

export type WebhookOutcome = { status: number; body: { ok: boolean; duplicate?: boolean; error?: string } };

/**
 * Cashfree webhook (spec §3): verify the signature on the raw body, record the event once
 * (idempotency key = provider + event id), act on it, and answer 200 only after the change is
 * committed. Errors answer 500 so Cashfree retries; a retry of an unprocessed event runs again.
 */
export async function handlePaymentWebhook(
  provider: PaymentProvider,
  rawBody: string,
  headers: Headers,
): Promise<WebhookOutcome> {
  if (!provider.verifyWebhook(rawBody, headers)) {
    // Not stored: unsigned requests must not be able to fill the database.
    console.warn("Payment webhook rejected: bad signature or stale timestamp");
    return { status: 401, body: { ok: false, error: "signature" } };
  }
  let event;
  try {
    event = provider.parseWebhook(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: "payload" } };
  }

  const [donation] = event.orderId
    ? await db
        .select({ id: donations.id })
        .from(donations)
        .where(eq(donations.publicOrderId, event.orderId))
        .limit(1)
    : [];
  const eventType = event.kind === "ignored" ? event.type : event.kind;
  const inserted = await db
    .insert(paymentEvents)
    .values({
      provider: provider.name,
      eventType,
      providerEventId: event.eventId,
      donationId: donation?.id ?? null,
      signatureValid: true,
      payload: JSON.parse(rawBody),
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  let eventRowId = inserted[0]?.id;
  if (!eventRowId) {
    const [existing] = await db
      .select({ id: paymentEvents.id, processedAt: paymentEvents.processedAt })
      .from(paymentEvents)
      .where(
        and(eq(paymentEvents.provider, provider.name), eq(paymentEvents.providerEventId, event.eventId)),
      );
    if (existing?.processedAt) return { status: 200, body: { ok: true, duplicate: true } };
    eventRowId = existing?.id;
  }

  try {
    if (event.kind === "payment_success") await confirmOnlinePayment(event.orderId, provider);
    else if (event.kind === "payment_failed") await markUnpaid(event.orderId, "failed");
    else if (event.kind === "refund_success") {
      const outcome = await markRefunded(event.orderId, event.refundId, event);
      // Kept on the event row (admin timeline) when nothing changed, e.g. a duplicate payment returned.
      if (outcome !== "refunded" && eventRowId)
        await db
          .update(paymentEvents)
          .set({ error: `Refund recorded, donation unchanged (${outcome})` })
          .where(eq(paymentEvents.id, eventRowId));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (eventRowId)
      await db.update(paymentEvents).set({ error: message }).where(eq(paymentEvents.id, eventRowId));
    // Retrying cannot fix an unknown order or a tampered amount: record it, stop the retries.
    if (error instanceof UnknownOrderError || error instanceof AmountMismatchError) {
      console.error("Payment webhook not applied", message);
      if (eventRowId)
        await db
          .update(paymentEvents)
          .set({ processedAt: new Date() })
          .where(eq(paymentEvents.id, eventRowId));
      return { status: 200, body: { ok: false, error: "not_applied" } };
    }
    console.error("Payment webhook failed", error);
    return { status: 500, body: { ok: false, error: "processing" } };
  }
  if (eventRowId)
    await db
      .update(paymentEvents)
      .set({ processedAt: new Date(), error: null })
      .where(and(eq(paymentEvents.id, eventRowId), isNull(paymentEvents.processedAt)));
  return { status: 200, body: { ok: true } };
}
