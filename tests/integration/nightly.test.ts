import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Payments from "@/lib/payments";
import { db } from "@/lib/db/client";
import { donations, emailSettings, reconciliationRuns, receipts, users } from "@/lib/db/schema";
import { createOnlineDonation } from "@/lib/donations/create";
import { runNightlyJob } from "@/lib/donations/nightly";
import { recordOfflineDonation } from "@/lib/donations/offline";
import { reconcile } from "@/lib/donations/reconcile";
import { donateSchema } from "@/lib/donations/schema";
import { sentEmails } from "@/lib/email";
import { getPaymentSettingsFresh } from "@/lib/payment-settings";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

// Production before Cashfree keys are added: asking for the gateway throws, as it does there.
const gateway = vi.hoisted(() => ({ missing: false }));
vi.mock("@/lib/payments", async (original) => {
  const actual = await original<typeof Payments>();
  return {
    ...actual,
    getPaymentProvider: () => {
      if (gateway.missing) throw new Error("The fake payment provider is not allowed in production");
      return actual.getPaymentProvider();
    },
  };
});

const ADMIN = "nightly-admin@example.com";
let previousRecipients: string[] = [];
beforeAll(async () => {
  const [s] = await db.select().from(emailSettings).limit(1);
  previousRecipients = s?.adminAlertRecipients ?? [];
  if (s) await db.update(emailSettings).set({ adminAlertRecipients: [ADMIN] });
  else await db.insert(emailSettings).values({ adminAlertRecipients: [ADMIN] });
});
afterAll(async () => {
  gateway.missing = false;
  await db.update(emailSettings).set({ adminAlertRecipients: previousRecipients });
});

const alertsAbout = (needle: string) =>
  sentEmails.filter((m) => m.to.email === ADMIN && m.subject.includes(needle));

describe("nightly job without a payment gateway", () => {
  it("still retries receipts and records the run, noting the missing gateway", async () => {
    const settings = (await getPaymentSettingsFresh())!;
    const online = await createOnlineDonation(
      donateSchema(settings).parse({
        amount: "1000",
        cause: "",
        name: "Nightly Donor",
        email: "nightly@example.com",
        phone: "9876543210",
        wants80g: "",
        anonymous: "",
        coverFee: "",
        citizen: "on",
      }),
      { settings, locale: "en", ipHash: "test", origin: "http://localhost" },
    );
    await db
      .update(donations)
      .set({ createdAt: sql`now() - interval '31 minutes'` })
      .where(eq(donations.publicOrderId, online.publicOrderId));
    const [user] = await db
      .insert(users)
      .values({
        email: `nightly-${Date.now()}@example.com`,
        name: "Accountant",
        passwordHash: "x",
        role: "accountant",
      })
      .returning({ id: users.id });
    const offline = await recordOfflineDonation(
      {
        name: "Cheque Donor",
        email: "cheque@example.com",
        phone: "9876543210",
        pan: null,
        address: null,
        amountPaise: 100000,
        causeId: null,
        mode: "cheque",
        instrumentRef: "123456",
        instrumentDate: new Date().toISOString().slice(0, 10),
        bankName: "SBI",
        receivedAt: new Date(),
        wants80g: false,
        notes: null,
      },
      { userId: user!.id },
    );
    // As if the receipt email had failed when the donation was recorded.
    await db.update(receipts).set({ emailedAt: null }).where(eq(receipts.donationId, offline.donationId));

    gateway.missing = true;
    const result = await reconcile(undefined, new Date());
    gateway.missing = false;

    expect(result.errors).toContainEqual({
      orderId: "-",
      error: "Payment gateway not configured: The fake payment provider is not allowed in production",
    });
    const [pending] = await db
      .select()
      .from(donations)
      .where(eq(donations.publicOrderId, online.publicOrderId));
    expect(pending!.status).not.toBe("paid");
    const [receipt] = await db.select().from(receipts).where(eq(receipts.donationId, offline.donationId));
    expect(receipt!.emailedAt).toBeTruthy();
    const [run] = await db
      .select()
      .from(reconciliationRuns)
      .orderBy(desc(reconciliationRuns.startedAt))
      .limit(1);
    expect(run!.finishedAt).toBeTruthy();
  });

  it("emails a 'Job failed' alert when a step throws", async () => {
    const job = await runNightlyJob(new Date(), {
      check: () => Promise.reject(new Error("Database unreachable")),
    });
    expect(job).toEqual({ ok: false, error: "Database unreachable" });
    const [mail] = alertsAbout("[MSWT] [Job failed] Nightly check: Database unreachable");
    expect(mail!.text).toContain("Stopped during: Daily check (payments and receipts)");
  });

  it("sends the summary after the check, every day", async () => {
    const before = alertsAbout("[MSWT] [Daily summary]").length;
    const job = await runNightlyJob(new Date("2001-07-08T03:00:00+05:30"), {
      check: async () => ({ checked: 0, updated: 0, errors: [] }),
    });
    expect(job).toMatchObject({ ok: true, summarySent: 1 });
    expect(alertsAbout("[MSWT] [Daily summary] 7 July 2001").length).toBe(before + 1);
  });
});
