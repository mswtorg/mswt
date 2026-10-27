import { describe, expect, it, vi } from "vitest";
import { decryptPii, encryptPii, maskPan, piiLookupHash } from "@/lib/crypto/pii";
import {
  donateErrors,
  donateSchema,
  feeCoverPaise,
  normalisePhone,
  validateDonation,
} from "@/lib/donations/schema";
import { cronSecret } from "@/lib/donations/cron";
import { donationsEnabled } from "@/lib/flags";
import { PaymentSettingsInput } from "@/lib/payment-settings";
import { parseCashfreeWebhook } from "@/lib/payments/cashfree-events";
import { CashfreeProvider } from "@/lib/payments/cashfree";
import { FakeProvider } from "@/lib/payments/fake";
import { paiseToRupeeAmount, rupeeAmountToPaise } from "@/lib/payments/provider";
import { signWebhook, verifySignedWebhook } from "@/lib/payments/signature";
import { decideReceiptKind } from "@/lib/receipts/kind";
import { RECEIPT_LINK_TTL_MS, receiptLinkQuery, verifyReceiptLink } from "@/lib/receipts/links";
import { formatReceiptNumber } from "@/lib/receipts/numbering";
import { missingTrustFacts, renderReceiptPdf, type TrustFacts } from "@/lib/receipts/pdf";
import { amountInWords, integerInWords } from "@/lib/receipts/words";

const settings = { minAmountPaise: 10000, maxAmountPaise: 10_000_000 };
const form = {
  amount: "1000",
  cause: "",
  name: "Asha Patel",
  email: "asha@example.com",
  phone: "+91 98765 43210",
  wants80g: "",
  anonymous: "",
  coverFee: "",
  citizen: "on",
};

describe("donate form validation", () => {
  it("accepts a valid donation and converts rupees to paise", () => {
    const d = donateSchema(settings).parse(form);
    expect(d.amount).toBe(100000);
    expect(d.phone).toBe("9876543210");
    expect(d.cause).toBeNull();
    expect(d.wants80g).toBe(false);
  });
  it("enforces the minimum and maximum", () => {
    const low = donateSchema(settings).safeParse({ ...form, amount: "99" });
    expect(donateErrors(low.error!.issues)).toEqual({ amount: "amountMin" });
    const high = donateSchema(settings).safeParse({ ...form, amount: "100001" });
    expect(donateErrors(high.error!.issues)).toEqual({ amount: "amountMax" });
  });
  it("rejects amounts that are not rupees", () => {
    for (const amount of ["", "abc", "10.123", "-5", "1e3"]) {
      const r = donateSchema(settings).safeParse({ ...form, amount });
      expect(r.success, amount).toBe(false);
    }
  });
  it("requires the Indian-citizen declaration (no FCRA)", () => {
    const r = donateSchema(settings).safeParse({ ...form, citizen: "" });
    expect(donateErrors(r.error!.issues)).toEqual({ citizen: "citizen" });
  });
  it("requires PAN and address only for an 80G receipt", () => {
    const r = donateSchema(settings).safeParse({ ...form, wants80g: "on", pan: "abcde1234" });
    expect(Object.keys(donateErrors(r.error!.issues)).sort()).toEqual([
      "city",
      "line1",
      "pan",
      "pincode",
      "state",
    ]);
    const ok = donateSchema(settings).parse({
      ...form,
      wants80g: "on",
      pan: "abcde1234f",
      line1: "12 MG Road",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    });
    expect(ok.pan).toBe("ABCDE1234F");
  });
  it("reports every problem in one go, including 80G fields", () => {
    const r = validateDonation(settings, { ...form, amount: "50", name: "", wants80g: "on" });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors).toEqual({
        amount: "amountMin",
        name: "name",
        pan: "pan",
        line1: "line1",
        city: "city",
        state: "state",
        pincode: "pincode",
      });
  });
  it("accepts only cause slugs", () => {
    expect(donateSchema(settings).parse({ ...form, cause: "school-meals" }).cause).toBe("school-meals");
    expect(donateSchema(settings).safeParse({ ...form, cause: "../x" }).success).toBe(false);
  });
  it.each([
    ["9876543210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["5876543210", null],
    ["987654321", null],
    ["+1 415 555 0100", null],
  ])("normalises phone %s", (raw, expected) => expect(normalisePhone(raw)).toBe(expected));
});

describe("fee cover", () => {
  const on = { feeCoverEnabled: true, feeCoverPercentBp: 200 };
  it("is computed on the server, rounded half up", () => {
    expect(feeCoverPaise(100000, on, true)).toBe(2000);
    expect(feeCoverPaise(12345, on, true)).toBe(247); // 246.9
    expect(feeCoverPaise(25, on, true)).toBe(1); // 0.5 → 1
  });
  it("is zero unless enabled and chosen", () => {
    expect(feeCoverPaise(100000, on, false)).toBe(0);
    expect(feeCoverPaise(100000, { feeCoverEnabled: false, feeCoverPercentBp: 200 }, true)).toBe(0);
  });
});

describe("payment settings", () => {
  const valid = {
    minAmountPaise: 10000,
    maxAmountPaise: null,
    presetAmountsPaise: [50000, 100000, 250000, 500000],
    feeCoverEnabled: false,
    feeCoverPercentBp: 0,
  };
  it("accepts the provisional defaults", () =>
    expect(PaymentSettingsInput.safeParse(valid).success).toBe(true));
  it("keeps the minimum above ₹5", () => {
    expect(PaymentSettingsInput.safeParse({ ...valid, minAmountPaise: 500 }).success).toBe(false);
    expect(
      PaymentSettingsInput.safeParse({ ...valid, minAmountPaise: 501, presetAmountsPaise: [600, 700, 800] })
        .success,
    ).toBe(true);
  });
  it("needs 3–4 distinct presets within the limits", () => {
    expect(PaymentSettingsInput.safeParse({ ...valid, presetAmountsPaise: [50000, 100000] }).success).toBe(
      false,
    );
    expect(PaymentSettingsInput.safeParse({ ...valid, presetAmountsPaise: [1, 2, 3, 4, 5] }).success).toBe(
      false,
    );
    expect(
      PaymentSettingsInput.safeParse({ ...valid, presetAmountsPaise: [5000, 100000, 250000] }).success,
    ).toBe(false);
    expect(
      PaymentSettingsInput.safeParse({ ...valid, presetAmountsPaise: [50000, 50000, 250000] }).success,
    ).toBe(false);
  });
  it("needs a percentage when fee cover is on", () => {
    expect(PaymentSettingsInput.safeParse({ ...valid, feeCoverEnabled: true }).success).toBe(false);
  });
});

describe("receipt rules", () => {
  const base = {
    wants80g: true,
    hasPan: true,
    causeIs80gEligible: true,
    mode: "online" as const,
    totalPaise: 500000,
    cash80gLimitPaise: 200000,
  };
  it("issues 80G with PAN for an eligible cause", () => expect(decideReceiptKind(base).kind).toBe("80g"));
  it.each([
    ["no_pan", { hasPan: false }],
    ["not_requested", { wants80g: false }],
    ["cause", { causeIs80gEligible: false }],
    ["cash_limit", { mode: "cash" as const }],
  ])("gives an acknowledgement for %s", (reason, patch) =>
    expect(decideReceiptKind({ ...base, ...patch })).toEqual({ kind: "acknowledgement", reason }),
  );
  it("allows cash up to exactly ₹2,000 (80G(5D))", () =>
    expect(decideReceiptKind({ ...base, mode: "cash", totalPaise: 200000 }).kind).toBe("80g"));
  it("formats gapless numbers per series", () => {
    expect(formatReceiptNumber("80g", "2026-27", 123)).toBe("MSWT/2026-27/000123");
    expect(formatReceiptNumber("acknowledgement", "2026-27", 1)).toBe("MSWT/ACK/2026-27/000001");
    expect(() => formatReceiptNumber("80g", "2026", 1)).toThrow();
    expect(() => formatReceiptNumber("80g", "2026-27", 0)).toThrow();
  });
});

describe("amount in words (Indian system)", () => {
  it.each([
    [0, "Zero"],
    [15, "Fifteen"],
    [99, "Ninety-Nine"],
    [101, "One Hundred One"],
    [2000, "Two Thousand"],
    [100000, "One Lakh"],
    [125050, "One Lakh Twenty-Five Thousand Fifty"],
    [10000000, "One Crore"],
    [123456789, "Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine"],
  ])("%i → %s", (n, words) => expect(integerInWords(n)).toBe(words));
  it("spells rupees and paise", () => {
    expect(amountInWords(10000000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(125050)).toBe("Rupees One Thousand Two Hundred Fifty and Fifty Paise Only");
  });
});

describe("gateway amounts", () => {
  it("converts without floating-point errors", () => {
    expect(rupeeAmountToPaise(1000)).toBe(100000);
    expect(rupeeAmountToPaise("1250.5")).toBe(125050);
    expect(rupeeAmountToPaise(0.29)).toBe(29);
    expect(paiseToRupeeAmount(125050)).toBe(1250.5);
    expect(paiseToRupeeAmount(29)).toBe(0.29);
    expect(() => rupeeAmountToPaise("10.123")).toThrow();
  });
});

describe("webhook signatures (SEC-08)", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" });
  const now = new Date("2026-10-22T10:00:00Z");
  const headers = (ts: number, sig?: string) =>
    new Headers({
      "x-webhook-timestamp": String(ts),
      "x-webhook-signature": sig ?? signWebhook(String(ts), body, secret),
    });
  it("accepts a fresh, correctly signed body", () =>
    expect(verifySignedWebhook(body, headers(now.getTime()), secret, now)).toBe(true));
  it("rejects a tampered body or wrong secret", () => {
    expect(verifySignedWebhook(body + " ", headers(now.getTime()), secret, now)).toBe(false);
    expect(verifySignedWebhook(body, headers(now.getTime()), "other", now)).toBe(false);
  });
  it("rejects stale or future timestamps and missing headers", () => {
    expect(verifySignedWebhook(body, headers(now.getTime() - 6 * 60_000), secret, now)).toBe(false);
    expect(verifySignedWebhook(body, headers(now.getTime() + 6 * 60_000), secret, now)).toBe(false);
    expect(verifySignedWebhook(body, new Headers(), secret, now)).toBe(false);
  });
});

describe("Cashfree events", () => {
  const ev = (type: string, data: object) => JSON.stringify({ type, data });
  it("maps payment success with a stable event id", () => {
    const e = parseCashfreeWebhook(
      ev("PAYMENT_SUCCESS_WEBHOOK", {
        order: { order_id: "MSWT-abc" },
        payment: { cf_payment_id: 123, payment_status: "SUCCESS" },
      }),
    );
    expect(e).toEqual({
      kind: "payment_success",
      orderId: "MSWT-abc",
      paymentId: "123",
      eventId: "PAYMENT_SUCCESS_WEBHOOK:123",
    });
  });
  it("maps failures, drops and refunds; ignores the rest", () => {
    expect(parseCashfreeWebhook(ev("PAYMENT_USER_DROPPED_WEBHOOK", { order: { order_id: "o" } })).kind).toBe(
      "payment_failed",
    );
    expect(
      parseCashfreeWebhook(
        ev("REFUND_STATUS_WEBHOOK", { refund: { cf_refund_id: 9, order_id: "o", refund_status: "SUCCESS" } }),
      ),
    ).toMatchObject({ kind: "refund_success", refundId: "9", auto: false, paymentId: null });
    expect(
      parseCashfreeWebhook(
        ev("AUTO_REFUND_STATUS_WEBHOOK", {
          auto_refund: { cf_refund_id: 11, cf_payment_id: 77, order_id: "o", refund_status: "SUCCESS" },
        }),
      ),
    ).toMatchObject({
      kind: "refund_success",
      orderId: "o",
      refundId: "11",
      paymentId: "77",
      auto: true,
      eventId: "AUTO_REFUND_STATUS_WEBHOOK:11",
    });
    // Not yet successful (e.g. PENDING): nothing to apply.
    expect(
      parseCashfreeWebhook(
        ev("AUTO_REFUND_STATUS_WEBHOOK", {
          auto_refund: { cf_refund_id: 12, order_id: "o", refund_status: "PENDING" },
        }),
      ).kind,
    ).toBe("ignored");
    expect(parseCashfreeWebhook(ev("SETTLEMENT_WEBHOOK", {})).kind).toBe("ignored");
  });
});

describe("Cashfree adapter", () => {
  it("creates an INR order with domestic methods only and returns the session", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        order_id: "MSWT-x",
        cf_order_id: 555,
        order_status: "ACTIVE",
        order_amount: 1250.5,
        order_currency: "INR",
        payment_session_id: "session_1",
      }),
    );
    const cf = new CashfreeProvider("app", "secret", "sandbox", fetchMock as unknown as typeof fetch);
    const created = await cf.createOrder({
      orderId: "MSWT-x",
      amountPaise: 125050,
      customer: { id: "d1", name: "Asha", email: "a@example.com", phone: "9876543210" },
      returnUrl: "https://example.org/en/donate/thank-you?order=MSWT-x",
      notifyUrl: "https://example.org/api/webhooks/cashfree",
    });
    expect(created).toEqual({ providerOrderId: "555", paymentSessionId: "session_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.cashfree.com/pg/orders");
    const sent = JSON.parse(String(init.body));
    expect(sent.order_amount).toBe(1250.5);
    expect(sent.order_currency).toBe("INR");
    expect(sent.order_meta.payment_methods).not.toMatch(/paypal/);
    expect((init.headers as Record<string, string>)["x-api-version"]).toBe("2025-01-01");
  });
  it("reads a paid order with its successful payment", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/payments")
        ? Response.json([
            { cf_payment_id: 1, payment_status: "FAILED", payment_group: "upi" },
            { cf_payment_id: 2, payment_status: "SUCCESS", payment_group: "upi" },
          ])
        : Response.json({
            order_id: "o",
            cf_order_id: "9",
            order_status: "PAID",
            order_amount: "1000.00",
            order_currency: "INR",
          }),
    );
    const cf = new CashfreeProvider("app", "secret", "production", fetchMock as unknown as typeof fetch);
    expect(await cf.getOrder("o")).toEqual({
      orderId: "o",
      status: "paid",
      amountPaise: 100000,
      currency: "INR",
      payment: { id: "2", method: "upi" },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.cashfree.com/pg/orders/o");
  });
  it("surfaces gateway errors", async () => {
    const fetchMock = vi.fn(async () => Response.json({ message: "bad" }, { status: 400 }));
    const cf = new CashfreeProvider("app", "secret", "sandbox", fetchMock as unknown as typeof fetch);
    await expect(cf.getOrder("o")).rejects.toThrow(/\(400\): bad/);
  });
});

describe("fake gateway", () => {
  it("sends webhooks the Cashfree parser and verifier accept", async () => {
    const fake = new FakeProvider();
    await fake.createOrder({
      orderId: "MSWT-fakefakefakefake",
      amountPaise: 5000,
      customer: { id: "d", name: "A", email: "a@example.com", phone: "9876543210" },
      returnUrl: "http://localhost/en/donate/thank-you?order=MSWT-fakefakefakefake",
      notifyUrl: "http://localhost/api/webhooks/cashfree",
    });
    const hook = FakeProvider.settle("MSWT-fakefakefakefake", "paid");
    expect(fake.verifyWebhook(hook.body, new Headers(hook.headers))).toBe(true);
    expect(fake.parseWebhook(hook.body).kind).toBe("payment_success");
    expect((await fake.getOrder("MSWT-fakefakefakefake")).status).toBe("paid");
  });
});

describe("PII and links (SEC-11)", () => {
  it("encrypts PAN with a fresh IV and decrypts it", () => {
    const a = encryptPii("ABCDE1234F");
    expect(a).not.toContain("ABCDE1234F");
    expect(encryptPii("ABCDE1234F")).not.toBe(a);
    expect(decryptPii(a)).toBe("ABCDE1234F");
    expect(piiLookupHash("ABCDE1234F")).toBe(piiLookupHash("ABCDE1234F"));
    expect(maskPan("234F")).toBe("XXXXXX234F");
  });
  it("detects tampered ciphertext", () => {
    const a = encryptPii("ABCDE1234F");
    const raw = Buffer.from(a.slice(3), "base64");
    raw[raw.length - 1]! ^= 1;
    expect(() => decryptPii(`v1:${raw.toString("base64")}`)).toThrow();
  });
  it("signs receipt links that expire", () => {
    const now = Date.now();
    const q = new URLSearchParams(receiptLinkQuery("MSWT-abc", now));
    expect(verifyReceiptLink("MSWT-abc", q.get("e"), q.get("t"), now)).toBe(true);
    expect(verifyReceiptLink("MSWT-other", q.get("e"), q.get("t"), now)).toBe(false);
    expect(verifyReceiptLink("MSWT-abc", q.get("e"), q.get("t"), now + RECEIPT_LINK_TTL_MS + 1)).toBe(false);
    expect(verifyReceiptLink("MSWT-abc", String(now + 10 ** 12), q.get("t"), now)).toBe(false);
  });
});

describe("donations switch", () => {
  it("is on outside production and off in production until go-live", () => {
    expect(donationsEnabled("preview", undefined)).toBe(true);
    expect(donationsEnabled(undefined, undefined)).toBe(true);
    expect(donationsEnabled("production", undefined)).toBe(false);
    expect(donationsEnabled("production", "true")).toBe(true);
  });
});

describe("receipt PDF", () => {
  const trust: TrustFacts = {
    legalName: "Munira Shoaib Welfare Trust",
    address: null,
    email: null,
    website: "mswelfaretrust.org",
    trustPan: null,
    reg12aNumber: null,
    reg80gNumber: null,
    reg80gValidFrom: null,
    reg80gValidTo: null,
    signatoryName: null,
    signatoryTitle: null,
  };
  it("lists the Trust facts still missing (open-questions B1/B8)", () => {
    expect(missingTrustFacts(trust, "80g")).toEqual([
      "Trust address",
      "Trust PAN",
      "signatory name",
      "80G registration number",
      "80G validity",
    ]);
    expect(missingTrustFacts(trust, "acknowledgement")).toHaveLength(3);
  });
  it("renders a PDF with Devanagari and Gujarati names", async () => {
    const pdf = await renderReceiptPdf({
      kind: "80g",
      number: "MSWT/2026-27/000001",
      receivedAt: new Date("2026-10-22T10:00:00Z"),
      donorName: "श्री क्षितिज / શ્રી ક્ષિતિજ",
      donorAddress: { line1: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
      panMasked: "XXXXXX234F",
      amountPaise: 100000,
      modeLabel: "Online (UPI)",
      paymentReference: "Cashfree payment 1",
      towards: "General fund",
      ackReason: null,
      trust,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});

describe("cron secret", () => {
  it("uses CRON_SECRET when set", () =>
    expect(cronSecret("s3cret-value-123456", true)).toBe("s3cret-value-123456"));
  it("is not configured in production without it (route answers 503, not 500)", () =>
    expect(cronSecret(undefined, true)).toBeNull());
  it("falls back to the development value elsewhere", () =>
    expect(cronSecret(undefined, false)).toBe("development-cron-secret"));
});
