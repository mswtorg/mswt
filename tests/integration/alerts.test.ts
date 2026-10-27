import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { notifyContactMessage } from "@/lib/contact/notify";
import { db } from "@/lib/db/client";
import { auditLog, donations, emailSettings, messages, receipts } from "@/lib/db/schema";
import { confirmOnlinePayment } from "@/lib/donations/confirm";
import { createOnlineDonation } from "@/lib/donations/create";
import { donateSchema } from "@/lib/donations/schema";
import { buildDailySummary, previousIstDay } from "@/lib/donations/summary";
import { handlePaymentWebhook } from "@/lib/donations/webhook";
import { sentEmails } from "@/lib/email";
import { getPaymentSettingsFresh, type PaymentSettings } from "@/lib/payment-settings";
import { FakeProvider } from "@/lib/payments/fake";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const ADMIN = "alerts-admin@example.com";
const provider = new FakeProvider();
let settings: PaymentSettings;
let previousRecipients: string[] = [];

beforeAll(async () => {
  settings = (await getPaymentSettingsFresh())!;
  const [s] = await db.select().from(emailSettings).limit(1);
  previousRecipients = s?.adminAlertRecipients ?? [];
  if (s) await db.update(emailSettings).set({ adminAlertRecipients: [ADMIN] });
  else await db.insert(emailSettings).values({ adminAlertRecipients: [ADMIN] });
});
afterAll(async () => {
  await db.update(emailSettings).set({ adminAlertRecipients: previousRecipients });
});

async function donate() {
  const input = donateSchema(settings).parse({
    amount: "1500",
    cause: "",
    name: "Alert Donor",
    email: `alert-${Math.random().toString(36).slice(2)}@example.com`,
    phone: "9876543210",
    wants80g: "",
    anonymous: "",
    coverFee: "",
    citizen: "on",
  });
  return createOnlineDonation(input, { settings, locale: "en", ipHash: "test", origin: "http://localhost" });
}

const deliver = (hook: { body: string; headers: Record<string, string> }) =>
  handlePaymentWebhook(provider, hook.body, new Headers(hook.headers));
const alertsAbout = (needle: string) =>
  sentEmails.filter((m) => m.to.email === ADMIN && m.subject.includes(needle));

describe("admin alerts", () => {
  it("sends one donation alert per donation, not one per webhook retry", async () => {
    const o = await donate();
    const hook = FakeProvider.settle(o.publicOrderId, "paid");
    await deliver(hook);
    await deliver(hook);
    await confirmOnlinePayment(o.publicOrderId, provider); // the daily check finds it paid
    const [d] = await db.select().from(donations).where(eq(donations.publicOrderId, o.publicOrderId));
    const [r] = await db.select().from(receipts).where(eq(receipts.donationId, d!.id));
    const sent = alertsAbout(r!.number).filter((m) => m.subject.startsWith("[MSWT] [Donation] ₹1,500 – "));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(o.publicOrderId);
  });

  it("reports an amount mismatch as a payment problem", async () => {
    const o = await donate();
    await db
      .update(donations)
      .set({
        totalPaise: sql`${donations.totalPaise} + 100`,
        amountPaise: sql`${donations.amountPaise} + 100`,
      })
      .where(eq(donations.publicOrderId, o.publicOrderId));
    const res = await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    expect(res.body.error).toBe("not_applied");
    expect(alertsAbout(`[MSWT] [Payment problem] Amount mismatch – ${o.publicOrderId}`)).toHaveLength(1);
  });

  it("reports a payment for an unknown order", async () => {
    const o = await donate();
    const hook = FakeProvider.settle(o.publicOrderId, "paid");
    await db.delete(donations).where(eq(donations.publicOrderId, o.publicOrderId));
    await deliver(hook);
    expect(alertsAbout(`[MSWT] [Payment problem] Unknown order – ${o.publicOrderId}`)).toHaveLength(1);
  });

  it("emails the admins and the sender (in their language) about a contact message", async () => {
    const [m] = await db
      .insert(messages)
      .values({
        name: "आशा",
        email: "asha-contact@example.com",
        subject: "volunteer",
        body: "मैं स्वयंसेवा करना चाहती हूँ।",
        locale: "hi",
        ipHash: "test",
      })
      .returning({ id: messages.id });
    await notifyContactMessage(m!.id);
    const alert = alertsAbout("[MSWT] [Contact] Volunteering – from आशा");
    expect(alert).toHaveLength(1);
    expect(alert[0]!.replyTo?.email).toBe("asha-contact@example.com");
    const ack = sentEmails.filter((e) => e.to.email === "asha-contact@example.com");
    expect(ack).toHaveLength(1);
    expect(ack[0]!.subject).toBe("एमएस वेलफेयर ट्रस्ट: हमें आपका संदेश मिल गया है");
    expect(ack[0]!.text).toContain("मैं स्वयंसेवा करना चाहती हूँ।");
    await db.delete(messages).where(eq(messages.id, m!.id));
  });

  it("a failing email provider never undoes the payment", async () => {
    const o = await donate();
    const push = vi.spyOn(sentEmails, "push").mockImplementation(() => {
      throw new Error("mail server down");
    });
    try {
      const res = await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
      expect(res.status).toBe(200);
    } finally {
      push.mockRestore();
    }
    const [d] = await db.select().from(donations).where(eq(donations.publicOrderId, o.publicOrderId));
    expect(d!.status).toBe("paid");
    const failed = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "email.alert_failed"), eq(auditLog.entityId, d!.id)));
    expect(failed.length).toBeGreaterThanOrEqual(1);
  });
});

describe("daily summary", () => {
  it("covers the previous India-time day", () => {
    const { start, end } = previousIstDay(new Date("2026-10-27T03:00:00+05:30"));
    expect(start.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-26T18:30:00.000Z");
  });

  it("totals match the donations received that day", async () => {
    const o = await donate();
    await deliver(FakeProvider.settle(o.publicOrderId, "paid"));
    // Moved into a quiet day far from the other tests' donations.
    const day = new Date("2001-02-03T10:00:00+05:30");
    await db.update(donations).set({ receivedAt: day }).where(eq(donations.publicOrderId, o.publicOrderId));
    const s = await buildDailySummary(new Date("2001-02-04T03:00:00+05:30"), {
      updated: 0,
      errors: [{ orderId: "MSWT-x", error: "gateway timeout" }],
    });
    expect(s.day).toBe("3 February 2001");
    expect(s.count).toBe(1);
    expect(s.totalPaise).toBe(150000);
    expect(s.byMode).toEqual([{ mode: "Online", count: 1, totalPaise: 150000 }]);
    expect(s.problems).toContainEqual({ reference: "MSWT-x", error: "gateway timeout" });
  });
});
