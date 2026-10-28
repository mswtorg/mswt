import { parseCashfreeWebhook } from "./cashfree-events";
import type { CreateOrderInput, FetchedOrder, PaymentProvider } from "./provider";
import { signWebhook, verifySignedWebhook } from "./signature";

// In-process stand-in for Cashfree, used by unit tests and by e2e runs (PAYMENT_PROVIDER=fake,
// single `next start` process). Never available in production (src/lib/payments/index.ts).
export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret-for-tests-only";

type FakeOrder = { input: CreateOrderInput; status: FetchedOrder["status"]; paymentId: string | null };
const store: Map<string, FakeOrder> = ((
  globalThis as { __fakeOrders?: Map<string, FakeOrder> }
).__fakeOrders ??= new Map());

export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly mode = "sandbox" as const;

  async createOrder(input: CreateOrderInput) {
    store.set(input.orderId, { input, status: "active", paymentId: null });
    return { providerOrderId: `fake_${input.orderId}`, paymentSessionId: `fake_session_${input.orderId}` };
  }

  async getOrder(orderId: string): Promise<FetchedOrder> {
    const o = store.get(orderId);
    if (!o) throw new Error(`Fake order ${orderId} not found`);
    return {
      orderId,
      status: o.status,
      amountPaise: o.input.amountPaise,
      currency: "INR",
      ...(o.paymentId ? { payment: { id: o.paymentId, method: "upi" } } : {}),
    };
  }

  verifyWebhook(rawBody: string, headers: Headers, now?: Date) {
    return verifySignedWebhook(rawBody, headers, FAKE_WEBHOOK_SECRET, now);
  }

  parseWebhook(rawBody: string) {
    return parseCashfreeWebhook(rawBody);
  }

  // ── Test controls ─────────────────────────────────────────────────────────────────────────
  static order(orderId: string): FakeOrder | undefined {
    return store.get(orderId);
  }

  /** Marks the order paid/failed at the "gateway" and returns the signed webhook to deliver. */
  static settle(orderId: string, outcome: "paid" | "failed", now = new Date()) {
    const o = store.get(orderId);
    if (!o) throw new Error(`Fake order ${orderId} not found`);
    // Like Cashfree: a failed attempt leaves the order open for another try until it expires.
    o.status = outcome === "paid" ? "paid" : "active";
    o.paymentId = outcome === "paid" ? `fakepay_${orderId}` : null;
    const body = JSON.stringify({
      type: outcome === "paid" ? "PAYMENT_SUCCESS_WEBHOOK" : "PAYMENT_FAILED_WEBHOOK",
      event_time: now.toISOString(),
      data: {
        order: { order_id: orderId, order_amount: o.input.amountPaise / 100, order_currency: "INR" },
        payment: {
          cf_payment_id: o.paymentId ?? `fakefail_${orderId}_${now.getTime()}`,
          payment_status: outcome === "paid" ? "SUCCESS" : "FAILED",
          ...(outcome === "paid" ? {} : { payment_message: "Transaction declined by bank" }),
        },
        ...(outcome === "paid"
          ? {}
          : {
              error_details: {
                error_description: "Card declined by the bank",
                error_reason: "bank_declined",
              },
            }),
      },
    });
    const timestamp = String(now.getTime());
    return {
      body,
      headers: {
        "content-type": "application/json",
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signWebhook(timestamp, body, FAKE_WEBHOOK_SECRET),
      },
      returnUrl: o.input.returnUrl,
    };
  }
}
