import { describe, expect, it } from "vitest";
import { filterConditions, parseFilters } from "@/lib/admin/donations";
import { toCsv, toXlsx, type Table } from "@/lib/admin/exports";
import { donationTable } from "@/lib/admin/reports";
import { encryptPii } from "@/lib/crypto/pii";
import { decryptPiiForDisplay } from "@/lib/crypto/pii";

const table: Table = {
  columns: [{ header: "Donor" }, { header: "Total (₹)", kind: "amount" }, { header: "Count", kind: "count" }],
  rows: [
    ["Asha, Patel", 125050, 2],
    ['Say "hi"', 100, 1],
    ['=HYPERLINK("x")', 0, 0],
    ["श्री क्षितिज / શ્રી", 99999, 3],
    ["line\nbreak", null, null],
  ],
};

describe("CSV export", () => {
  const csv = toCsv(table);
  it("starts with a BOM and uses CRLF rows", () => {
    expect(csv.startsWith("﻿Donor,Total (₹),Count\r\n")).toBe(true);
  });
  it("quotes commas, quotes and line breaks", () => {
    expect(csv).toContain('"Asha, Patel",1250.50,2');
    expect(csv).toContain('"Say ""hi""",1.00,1');
    expect(csv).toContain('"line\nbreak",,');
  });
  it("defuses spreadsheet formulas and keeps Indian scripts", () => {
    expect(csv).toContain(`"'=HYPERLINK(""x"")",0.00,0`);
    expect(csv).toContain("श्री क्षितिज / શ્રી,999.99,3");
  });
});

describe("Excel export", () => {
  it("produces an .xlsx (zip) file", async () => {
    const buf = await toXlsx(table);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe("donation filters", () => {
  it("keeps valid values and drops invalid ones", () => {
    expect(
      parseFilters({
        fy: "2026-27",
        status: "paid",
        mode: "bitcoin",
        from: "2026-04-01",
        to: "nope",
        min: "100",
        q: " asha ",
        page: "2",
      }),
    ).toEqual({ fy: "2026-27", status: "paid", from: "2026-04-01", min: 100, q: "asha", page: 2 });
  });
  it("builds one condition per filter", () => {
    expect(filterConditions({})).toHaveLength(0);
    expect(
      filterConditions({ fy: "2026-27", cause: "general", kind: "80g", min: 1, max: 2, q: "x" }),
    ).toHaveLength(6);
  });
});

describe("register PAN column", () => {
  const row = {
    receivedAt: new Date("2026-10-22T10:00:00Z"),
    createdAt: new Date("2026-10-22T10:00:00Z"),
    receiptNumber: "MSWT/2026-27/000001",
    receiptKind: "80g",
    name: "Asha",
    email: "a@example.com",
    phone: "9876543210",
    panEnc: encryptPii("ABCPE1234F"),
    panLast4: "234F",
    address: { line1: "1 Road", city: "Pune", state: "MH", pincode: "411001" },
    mode: "online",
    paymentId: "pay_1",
    instrumentRef: null,
    causeTitle: null,
    amountPaise: 100000,
    feeCoverPaise: 0,
    totalPaise: 100000,
    status: "paid",
    publicOrderId: "MSWT-x",
  } as unknown as Parameters<typeof donationTable>[0][number];
  it("is masked unless the PAN window is open", () => {
    expect(donationTable([row], false).rows[0]![6]).toBe("XXXXXX234F");
    expect(donationTable([row], true).rows[0]![6]).toBe("ABCPE1234F");
  });
  it("shows a placeholder for values encrypted with another key", () => {
    expect(decryptPiiForDisplay("v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
      "[can't be decrypted]",
    );
  });
});
