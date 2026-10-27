import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { auditLog, donations, paymentEvents, receipts, users } from "@/lib/db/schema";
import { confirmOnlinePayment, markRefunded } from "@/lib/donations/confirm";
import { createOnlineDonation } from "@/lib/donations/create";
import { recordOfflineDonation } from "@/lib/donations/offline";
import { reconcile } from "@/lib/donations/reconcile";
import { retryCheckout } from "@/lib/donations/retry";
import { donateSchema } from "@/lib/donations/schema";
import { handlePaymentWebhook } from "@/lib/donations/webhook";
import { sentEmails } from "@/lib/email";
import { getPaymentSettingsFresh, type PaymentSettings } from "@/lib/payment-settings";
import { FakeProvider } from "@/lib/payments/fake";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const provider = new FakeProvider();
let settings: PaymentSettings;
beforeAll(async () => {
  settings = (await getPaymentSettingsFresh())!;
});

async function donate(over: Record<string, string> = {}) {
  const input = donateSchema(settings).parse({
    amount: "1000",
    cause: "",
    name: "Integration Donor",
    email: `int-${Math.random().toString(36).slice(2)}@example.com`,
    phone: "9876543210",
    wants80g: "",
    anonymous: "",
    coverFee: "",
    citizen: "on",
    ...over,
  });
  return createOnlineDonation(input, { settings, locale: "en", ipHash: "test", origin: "http://localhost" });
}

const deliver = (hook: { body: string; headers: Record<string, string> }) =>
  handlePaymentWebhook(provider, hook.body, new Headers(hook.headers));

const donationRow = async (orderId: string) =>
  (await db.select().from(donations).where(eq(donations.publicOrderId, orderId)))[0]!;

describe("online donations against Postgres", () => {
  it("issues gapless, unique receipt numbers under concurrent confirmations", async () => {
    const orders = await Promise.all(Array.from({ length: 20 }, () => donate()));
    for (const o of orders) FakeProvider.settle(o.publicOrderId, "paid");
    const results = await Promise.all(orders.map((o) => confirmOnlinePayment(o.publicOrderId, provider)));
    const numbers = results.map((r) => (r.outcome === "paid" ? r.receiptNumber : ""));
    expect(new Set(numbers).size).toBe(20);
    const seqs = numbers.map((n) => Number(n.split("/").at(-1))).sort((a, b) => a - b);
    expect(seqs.at(-1)! - seqs[0]! + 1).toBe(20);
    expect(numbers.every((n) => /^MSWT\/ACK\/\d{4}-\d{2}\/\d{6}$/.test(n))).toBe(true);
  });

  it("applies a webhook once; duplicates are no-ops", async () => {
    const o = await donate({
      wants80g: "on",
      pan: "ABCDE1234F",
      line1: "1 Road",
      city: "Pune",
      state: "MH",
      pincode: "411001",
    });
    const hook = FakeProvider.settle(o.publicOrderId, "paid");
    expect(await deliver(hook)).toEqual({ status: 200, body: { ok: true } });
    expect(await deliver(hook)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    const d = await donationRow(o.publicOrderId);
    expect(d.status).toBe("paid");
    const rs = await db.select().from(receipts).where(eq(receipts.donationId, d.id));
    expect(rs).toHaveLength(1);
    expect(rs[0]!.kind).toBe("80g");
    expect(rs[0]!.pdfR2Key).toBeTruthy();
    expect(rs[0]!.emailedAt).toBeTruthy();
    expect(sentEmails.some((m) => m.subject.includes(rs[0]!.number))).toBe(true);
    const events = await db.select().from(paymentEvents).where(eq(paymentEvents.donationId, d.id));
    expect(events).toHaveLength(1);
  });

  it("never marks paid when the gateway amount differs (tampering)", async () => {
    const o = await donate();
    const hook = FakeProvider.settle(o.publicOrderId, "paid");
    FakeProvider.order(o.publicOrderId)!.input.amountPaise = 100; // gateway now reports ₹1
    expect((await deliver(hook)).body).toEqual({ ok: false, error: "not_applied" });
    expect((await donationRow(o.publicOrderId)).status).toBe("pending");
    const [event] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.donationId, (await donationRow(o.publicOrderId)).id));
    expect(event!.error).toMatch(/expected INR 100000/);
  });

  it("rejects unsigned webhooks without touching the database", async () => {
    const o = await donate();
    const hook = FakeProvider.settle(o.publicOrderId, "paid");
    const res = await handlePaymentWebhook(
      provider,
      hook.body,
      new Headers({ ...hook.headers, "x-webhook-signature": "x" }),
    );
    expect(res.status).toBe(401);
    expect((await donationRow(o.publicOrderId)).status).toBe("pending");
  });

  it("recovers a failed attempt followed by a successful one", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "failed"));
    expect((await donationRow(o.publicOrderId)).status).toBe("failed");
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    expect((await donationRow(o.publicOrderId)).status).toBe("paid");
  });

  it("retry reuses the same order and session after a failed attempt", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "failed"));
    const r = await retryCheckout(o.publicOrderId, provider);
    expect(r).toMatchObject({ status: "checkout", orderId: o.publicOrderId, sessionId: o.paymentSessionId });
    expect((await donationRow(o.publicOrderId)).status).toBe("pending");
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    expect(await retryCheckout(o.publicOrderId, provider)).toEqual({ status: "paid" });
    expect(await retryCheckout("MSWT-AAAAAAAAAAAAAAAA", provider)).toEqual({ status: "expired" });
  });

  it("reconciliation confirms a payment whose webhook never came", async () => {
    const o = await donate();
    FakeProvider.settle(o.publicOrderId, "paid"); // no webhook delivered
    await db
      .update(donations)
      .set({ createdAt: sql`now() - interval '31 minutes'` })
      .where(eq(donations.publicOrderId, o.publicOrderId));
    const result = await reconcile(provider);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect((await donationRow(o.publicOrderId)).status).toBe("paid");
  });

  it("a refund voids the receipt but keeps its number", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    const d = await donationRow(o.publicOrderId);
    const [before] = await db.select().from(receipts).where(eq(receipts.donationId, d.id));
    await markRefunded(o.publicOrderId, "rf_1");
    const [after] = await db.select().from(receipts).where(eq(receipts.donationId, d.id));
    expect((await donationRow(o.publicOrderId)).status).toBe("refunded");
    expect(after!.number).toBe(before!.number);
    expect(after!.voidedAt).toBeTruthy();
  });

  it("an automatic refund of the recorded payment voids the receipt", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    const d = await donationRow(o.publicOrderId);
    expect(
      await markRefunded(o.publicOrderId, "rf_auto", { paymentId: d.providerPaymentId, auto: true }),
    ).toBe("refunded");
    const [r] = await db.select().from(receipts).where(eq(receipts.donationId, d.id));
    expect(r!.voidReason).toMatch(/^Automatically refunded by Cashfree/);
  });

  it("refunding a second (duplicate) payment keeps the donation paid and its receipt", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    const d = await donationRow(o.publicOrderId);
    expect(await markRefunded(o.publicOrderId, "rf_dup", { paymentId: "another-payment", auto: true })).toBe(
      "other_payment",
    );
    expect((await donationRow(o.publicOrderId)).status).toBe("paid");
    const [r] = await db.select().from(receipts).where(eq(receipts.donationId, d.id));
    expect(r!.voidedAt).toBeNull();
    // A refund for an order that was never paid changes nothing.
    const unpaid = await donate();
    expect(await markRefunded(unpaid.publicOrderId, "rf_x", { auto: true })).toBe("not_paid");
  });
});

describe("offline donations", () => {
  it("cash above ₹2,000 gets an acknowledgement, with an audit entry", async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `acct-${Date.now()}@example.com`,
        name: "Accountant",
        passwordHash: "x",
        role: "accountant",
      })
      .returning({ id: users.id });
    const result = await recordOfflineDonation(
      {
        name: "Cash Donor",
        email: "cash@example.com",
        phone: "9876543210",
        pan: "ABCDE1234F",
        address: null,
        amountPaise: 500000,
        causeId: null,
        mode: "cash",
        instrumentRef: null,
        instrumentDate: null,
        bankName: null,
        receivedAt: new Date(),
        wants80g: true,
        notes: null,
      },
      { userId: user!.id },
    );
    expect(result.receiptNumber).toMatch(/^MSWT\/ACK\//);
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, result.donationId));
    expect(audit[0]!.action).toBe("donation.offline.create");
    const rows = await db
      .select({ status: donations.status })
      .from(donations)
      .where(inArray(donations.id, [result.donationId]));
    expect(rows[0]!.status).toBe("paid");
  });
});
