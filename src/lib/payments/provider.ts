import type { Paise } from "@/lib/money";

// Every payment gateway sits behind this interface (CLAUDE.md: Cashfree behind an adapter).
// Amounts cross the boundary as integer paise; adapters convert to the gateway's format.

export type CreateOrderInput = {
  orderId: string;
  amountPaise: Paise;
  customer: { id: string; name: string; email: string; phone: string };
  returnUrl: string;
  notifyUrl: string;
  note?: string;
};

export type CreatedOrder = { providerOrderId: string; paymentSessionId: string };

export type OrderStatus = "active" | "paid" | "expired" | "failed";

export type FetchedOrder = {
  orderId: string;
  status: OrderStatus;
  amountPaise: Paise;
  currency: string;
  /** The successful payment, when status is "paid". */
  payment?: { id: string; method: string | null };
};

export type WebhookEvent =
  | { kind: "payment_success"; orderId: string; paymentId: string; eventId: string }
  | { kind: "payment_failed"; orderId: string; paymentId: string | null; eventId: string }
  | {
      kind: "refund_success";
      orderId: string;
      refundId: string;
      /** The payment that was refunded (Cashfree sends it); null if the gateway didn't say. */
      paymentId: string | null;
      /** Refunded by the gateway itself (e.g. a duplicate or late payment), not from the dashboard. */
      auto: boolean;
      eventId: string;
    }
  | { kind: "ignored"; eventId: string; type: string; orderId: string | null };

export interface PaymentProvider {
  readonly name: "cashfree" | "fake";
  /** "sandbox" | "production": decides which browser SDK mode the checkout uses. */
  readonly mode: "sandbox" | "production";
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getOrder(orderId: string): Promise<FetchedOrder>;
  /** Verifies the signature over the exact raw body. Never parse before verifying. */
  verifyWebhook(rawBody: string, headers: Headers, now?: Date): boolean;
  parseWebhook(rawBody: string): WebhookEvent;
}

/** Converts a gateway rupee amount (number or string with 2 decimals) to paise without floats. */
export function rupeeAmountToPaise(amount: number | string): Paise {
  const [whole, frac = ""] = String(amount).split(".");
  if (!/^\d+$/.test(whole ?? "") || !/^\d{0,2}$/.test(frac)) throw new Error(`Bad amount ${amount}`);
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function paiseToRupeeAmount(paise: Paise): number {
  // Two decimals at most, so this is exact enough for the gateway's JSON number.
  return Number(`${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, "0")}`);
}
