import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { auditLog, paymentSettings } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { BANK_FIELDS, BankDetailsInput } from "@/lib/donations/bank";
import { updateBankDetails } from "@/lib/payment-settings";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const actor = { userId: null };
let previous: Record<string, unknown> = {};

beforeAll(async () => {
  const [row] = await db.select().from(paymentSettings).limit(1);
  previous = Object.fromEntries(BANK_FIELDS.map((k) => [k, row![k]]));
});
afterAll(async () => {
  await db.update(paymentSettings).set(previous).where(eq(paymentSettings.id, 1));
});

describe("bank details", () => {
  it("saves, audits with the account number masked, and reports only real changes", async () => {
    const input = BankDetailsInput.parse({
      bankAccountName: "Munira Shoaib Welfare Trust",
      bankAccountNumber: "123456789012",
      bankIfsc: "SBIN0001234",
      bankName: "State Bank of India",
      bankBranch: "",
      bankAccountType: "current",
      upiId: "mswt@sbi",
      chequePayee: "",
      donationDetailsEmail: "",
      bankDetailsPublic: true,
    });
    const changes = await withTx((tx) => updateBankDetails(tx, input, actor));
    expect(changes.map((c) => c.label)).toContain("Account number");

    const [row] = await db.select().from(paymentSettings).limit(1);
    expect(row).toMatchObject({
      bankAccountNumber: "123456789012",
      bankIfsc: "SBIN0001234",
      bankDetailsPublic: true,
    });
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "settings.bank.update"), eq(auditLog.entityType, "payment_settings")))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    expect(JSON.stringify(entry!.after)).toContain("XXXXXXXX9012");
    expect(JSON.stringify(entry!.after)).not.toContain("123456789012");

    // Saving the same values again changes nothing and writes no entry.
    expect(await withTx((tx) => updateBankDetails(tx, input, actor))).toEqual([]);
  });
});
