import { z } from "zod";
import type { WebhookEvent } from "./provider";

const Refund = z
  .object({
    cf_refund_id: z.union([z.string(), z.number()]),
    cf_payment_id: z.union([z.string(), z.number()]),
    order_id: z.string(),
    refund_status: z.string(),
  })
  .partial();

// Cashfree PG webhook payloads (API version 2025-01-01). Shared by the real adapter and the fake,
// which sends the same shape so the webhook route is tested for real.
const Payload = z.object({
  type: z.string(),
  event_time: z.string().optional(),
  data: z
    .object({
      order: z.object({ order_id: z.string() }).partial().optional(),
      payment: z
        .object({ cf_payment_id: z.union([z.string(), z.number()]), payment_status: z.string() })
        .partial()
        .optional(),
      refund: Refund.optional(),
      // AUTO_REFUND_STATUS_WEBHOOK: Cashfree returned a payment on its own (paid twice, or paid
      // after the order expired).
      auto_refund: Refund.optional(),
    })
    .loose(),
});

export function parseCashfreeWebhook(rawBody: string): WebhookEvent {
  const p = Payload.parse(JSON.parse(rawBody));
  const refund = p.data.refund ?? p.data.auto_refund;
  const orderId = p.data.order?.order_id ?? refund?.order_id ?? null;
  const paymentId = p.data.payment?.cf_payment_id != null ? String(p.data.payment.cf_payment_id) : null;
  const refundId = refund?.cf_refund_id != null ? String(refund.cf_refund_id) : null;
  // One delivery per (event type, payment/refund): retries of the same event share this id.
  const subject = refundId ?? paymentId;
  const eventId = `${p.type}:${subject ?? orderId ?? "unknown"}`;

  if (p.type === "PAYMENT_SUCCESS_WEBHOOK" && orderId && paymentId)
    return { kind: "payment_success", orderId, paymentId, eventId };
  if ((p.type === "PAYMENT_FAILED_WEBHOOK" || p.type === "PAYMENT_USER_DROPPED_WEBHOOK") && orderId)
    return { kind: "payment_failed", orderId, paymentId, eventId };
  const auto = p.type === "AUTO_REFUND_STATUS_WEBHOOK";
  if (
    (p.type === "REFUND_STATUS_WEBHOOK" || auto) &&
    orderId &&
    refundId &&
    refund?.refund_status === "SUCCESS"
  )
    return {
      kind: "refund_success",
      orderId,
      refundId,
      paymentId: refund.cf_payment_id != null ? String(refund.cf_payment_id) : paymentId,
      auto,
      eventId,
    };
  return { kind: "ignored", eventId, type: p.type, orderId };
}
