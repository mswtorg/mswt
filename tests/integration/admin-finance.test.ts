import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  listDonations,
  ReceiptError,
  reissueReceipt,
  resendReceipt,
  voidReceipt,
} from "@/lib/admin/donations";
import { mergeDonors, MergeError, searchDonors } from "@/lib/admin/donors";
import {
  ACCESS_WINDOW_MS,
  MAX_ATTEMPTS,
  panAccessUntil,
  PanAccessError,
  requestPanCode,
  verifyPanCode,
} from "@/lib/admin/pan-access";
import { buildReport } from "@/lib/admin/reports";
import { hashPassword } from "@/lib/auth/password";
import { financialYear } from "@/lib/dates/fy";
import { db } from "@/lib/db/client";
import { auditLog, donations, donors, receipts, users } from "@/lib/db/schema";
import { recordOfflineDonation } from "@/lib/donations/offline";
import { donationStatus } from "@/lib/donations/status";
import { sentEmails } from "@/lib/email";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

let accountant: { id: string; email: string };
beforeAll(async () => {
  const email = `fin-${Date.now()}@example.com`;
  const [u] = await db
    .insert(users)
    .values({
      email,
      name: "Finance Tester",
      role: "accountant",
      passwordHash: await hashPassword("finance passphrase 1"),
    })
    .returning({ id: users.id, email: users.email });
  accountant = u!;
});

const unique = () => `don-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function offline(over: Partial<Parameters<typeof recordOfflineDonation>[0]> = {}) {
  return recordOfflineDonation(
    {
      name: "Offline Donor",
      email: unique(),
      phone: "9876543210",
      pan: null,
      address: null,
      amountPaise: 300000,
      causeId: null,
      mode: "cheque",
      instrumentRef: "123456",
      instrumentDate: null,
      bankName: "SBI",
      receivedAt: new Date(),
      wants80g: false,
      notes: null,
      ...over,
    },
    { userId: accountant.id },
  );
}

const liveReceipts = (donationId: string) =>
  db
    .select()
    .from(receipts)
    .where(and(eq(receipts.donationId, donationId), isNull(receipts.voidedAt)));

describe("receipt corrections", () => {
  it("void keeps the number and records why", async () => {
    const d = await offline();
    await expect(voidReceipt(d.receiptId, "no", { userId: accountant.id })).rejects.toMatchObject({
      code: "reason",
    });
    await voidReceipt(d.receiptId, "Entered twice by mistake", { userId: accountant.id });
    const [r] = await db.select().from(receipts).where(eq(receipts.id, d.receiptId));
    expect(r!.number).toBe(d.receiptNumber);
    expect(r!.voidReason).toBe("Entered twice by mistake");
    await expect(voidReceipt(d.receiptId, "again please", { userId: accountant.id })).rejects.toMatchObject({
      code: "voided",
    });
  });

  it("reissue adds a PAN: old acknowledgement void, new 80G number, one live receipt", async () => {
    const d = await offline();
    expect(d.receiptNumber).toMatch(/^MSWT\/ACK\//);
    const out = await reissueReceipt(
      d.donationId,
      {
        name: "Offline Donor Corrected",
        wants80g: true,
        pan: "ABCPE1234F",
        address: { line1: "1 Road", city: "Pune", state: "MH", pincode: "411001" },
        reason: "Donor sent PAN later",
      },
      { userId: accountant.id },
    );
    expect(out.number).toMatch(/^MSWT\/\d{4}-\d{2}\/\d{6}$/);
    const live = await liveReceipts(d.donationId);
    expect(live).toHaveLength(1);
    expect(live[0]!.kind).toBe("80g");
    expect(live[0]!.replacesReceiptId).toBe(d.receiptId);
    const [old] = await db.select().from(receipts).where(eq(receipts.id, d.receiptId));
    expect(old!.voidReason).toMatch(/^Reissued: /);
    const [don] = await db.select().from(donations).where(eq(donations.id, d.donationId));
    expect(don!.nameSnapshot).toBe("Offline Donor Corrected");
    expect(don!.panLast4Snapshot).toBe("234F");
    // The thank-you page shows the live receipt, not the voided one.
    const status = await donationStatus(don!.publicOrderId, "hi");
    expect(status).toMatchObject({ status: "paid", receiptNumber: out.number, kind: "80g", cause: null });
  });

  it("cash above ₹2,000 stays an acknowledgement even with PAN", async () => {
    const d = await offline({ mode: "cash", amountPaise: 500000 });
    const out = await reissueReceipt(
      d.donationId,
      { name: "Cash Donor", wants80g: true, pan: "BBBBB1234B", address: null, reason: "Add PAN" },
      { userId: accountant.id },
    );
    expect(out.number).toMatch(/^MSWT\/ACK\//);
  });

  it("refuses reissue outside the donation's financial year", async () => {
    const d = await offline();
    const nextYear = new Date(Date.now() + 400 * 86_400_000);
    expect(financialYear(nextYear)).not.toBe(financialYear(new Date()));
    await expect(
      reissueReceipt(
        d.donationId,
        { name: "X", wants80g: false, pan: null, address: null, reason: "too late" },
        { userId: accountant.id },
        nextYear,
      ),
    ).rejects.toBeInstanceOf(ReceiptError);
  });

  it("the database allows only one live receipt per donation", async () => {
    const d = await offline();
    const fy = financialYear(new Date());
    await expect(
      db.insert(receipts).values({
        donationId: d.donationId,
        kind: "acknowledgement",
        number: `TEST/${Date.now()}`,
        fy,
        seq: 999999,
      }),
    ).rejects.toThrow();
  });

  it("resend emails the same receipt again and is audited", async () => {
    const d = await offline();
    const before = sentEmails.length;
    await resendReceipt(d.receiptId, { userId: accountant.id });
    expect(sentEmails.length).toBe(before + 1);
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, d.receiptId));
    expect(entries.map((e) => e.action)).toContain("receipt.resend");
  });
});

describe("donors", () => {
  it("search lists donors with paid totals, newest activity first", async () => {
    await offline({ name: "Searchable Donor" });
    const { rows, total } = await searchDonors("Searchable Donor");
    expect(total).toBeGreaterThan(0);
    expect(rows[0]!.name).toBe("Searchable Donor");
    expect(rows[0]!.totalPaise).toBe(300000);
    expect((await searchDonors(undefined)).rows.length).toBeGreaterThan(0);
  });

  it("merge moves donations and hides the source", async () => {
    const a = await offline({ name: "Dup One" });
    const b = await offline({ name: "Dup Two" });
    const [da] = await db
      .select({ donorId: donations.donorId })
      .from(donations)
      .where(eq(donations.id, a.donationId));
    const [db2] = await db
      .select({ donorId: donations.donorId })
      .from(donations)
      .where(eq(donations.id, b.donationId));
    await mergeDonors(da!.donorId, db2!.donorId, { userId: accountant.id });
    const [moved] = await db
      .select({ donorId: donations.donorId })
      .from(donations)
      .where(eq(donations.id, a.donationId));
    expect(moved!.donorId).toBe(db2!.donorId);
    const [src] = await db.select().from(donors).where(eq(donors.id, da!.donorId));
    expect(src!.mergedIntoId).toBe(db2!.donorId);
    await expect(mergeDonors(db2!.donorId, db2!.donorId, { userId: accountant.id })).rejects.toBeInstanceOf(
      MergeError,
    );
  });

  it("refuses to merge donors with different PANs", async () => {
    const a = await offline({
      pan: "CCCCC1234C",
      wants80g: true,
      address: { line1: "x", city: "y", state: "z", pincode: "411001" },
    });
    const b = await offline({
      pan: "DDDPD1234D",
      wants80g: true,
      address: { line1: "x", city: "y", state: "z", pincode: "411001" },
    });
    const ids = await db
      .select({ id: donations.id, donorId: donations.donorId })
      .from(donations)
      .where(sql`${donations.id} in (${a.donationId}, ${b.donationId})`);
    await expect(mergeDonors(ids[0]!.donorId, ids[1]!.donorId, { userId: accountant.id })).rejects.toThrow(
      /different PANs/,
    );
  });
});

describe("PAN access by email code", () => {
  const codeFromMail = () => sentEmails.at(-1)!.subject.match(/(\d{6})$/)![1]!;

  it("wrong codes count; the right one opens a 15-minute window that then closes", async () => {
    await requestPanCode(accountant.id, { userId: accountant.id });
    expect(sentEmails.at(-1)!.to.email).toBe(accountant.email);
    const code = codeFromMail();
    await expect(
      verifyPanCode(accountant.id, "000000" === code ? "111111" : "000000", { userId: accountant.id }),
    ).rejects.toBeInstanceOf(PanAccessError);
    const now = new Date();
    const until = await verifyPanCode(accountant.id, code, { userId: accountant.id }, now);
    expect(until.getTime() - now.getTime()).toBe(ACCESS_WINDOW_MS);
    expect(await panAccessUntil(accountant.id)).not.toBeNull();
    expect(await panAccessUntil(accountant.id, new Date(now.getTime() + ACCESS_WINDOW_MS + 1000))).toBeNull();
    await expect(verifyPanCode(accountant.id, code, { userId: accountant.id })).rejects.toMatchObject({
      code: "expired",
    });
  });

  it(`locks a code after ${MAX_ATTEMPTS} wrong tries`, async () => {
    await requestPanCode(accountant.id, { userId: accountant.id });
    const code = codeFromMail();
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 1; i < MAX_ATTEMPTS; i++)
      await expect(verifyPanCode(accountant.id, wrong, { userId: accountant.id })).rejects.toMatchObject({
        code: "invalid",
      });
    await expect(verifyPanCode(accountant.id, wrong, { userId: accountant.id })).rejects.toMatchObject({
      code: "attempts",
    });
    await expect(verifyPanCode(accountant.id, code, { userId: accountant.id })).rejects.toMatchObject({
      code: "attempts",
    });
  });
});

describe("reports", () => {
  it("register, 80G/acknowledgement split and summaries add up", async () => {
    const fy = financialYear(new Date());
    const register = await buildReport("register", { fy }, false);
    const g80 = await buildReport("80g", { fy }, false);
    const ack = await buildReport("acknowledgements", { fy }, false);
    // A paid donation whose receipt was voided without a replacement is in neither register.
    const withoutReceipt = register.rows.filter((r) => !r[1]).length;
    expect(g80.rows.length + ack.rows.length + withoutReceipt).toBe(register.rows.length);
    const total = (t: typeof register) => t.rows.reduce((s, r) => s + Number(r[13] ?? 0), 0);
    const causes = await buildReport("causes", { fy }, false);
    const modes = await buildReport("modes", { fy }, false);
    expect(causes.rows.at(-1)![2]).toBe(total(register));
    expect(modes.rows.at(-1)![2]).toBe(total(register));
    const list = await listDonations({ fy, status: "paid" });
    expect(list.total).toBe(register.rows.length);
    expect(list.paidSumPaise).toBe(total(register));
  });
});
