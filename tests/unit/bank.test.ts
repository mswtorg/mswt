import { describe, expect, it } from "vitest";
import { BankDetailsInput, bankChanges, maskAccount, publicBankDetails, upiUri } from "@/lib/donations/bank";

const form = (over: Partial<Record<string, unknown>> = {}) => ({
  bankAccountName: "Munira Shoaib Welfare Trust",
  bankAccountNumber: "1234 5678 9012",
  bankIfsc: "sbin0001234",
  bankName: "State Bank of India",
  bankBranch: "Pune Camp",
  bankAccountType: "savings",
  upiId: "mswt@sbi",
  chequePayee: "Munira Shoaib Welfare Trust",
  donationDetailsEmail: "",
  bankDetailsPublic: true,
  ...over,
});
const errors = (input: object) =>
  BankDetailsInput.safeParse(input).error?.issues.map((i) => i.path.join(".")) ?? [];

describe("bank details input", () => {
  it("cleans the values: spaces out of the account number, IFSC upper case, empty → null", () => {
    const ok = BankDetailsInput.parse(form());
    expect(ok).toMatchObject({ bankAccountNumber: "123456789012", bankIfsc: "SBIN0001234" });
    expect(ok.donationDetailsEmail).toBeNull();
  });

  it("rejects a bad IFSC, account number, UPI ID or email", () => {
    expect(errors(form({ bankIfsc: "SBIN1234567" }))).toEqual(["bankIfsc"]);
    expect(errors(form({ bankAccountNumber: "12345" }))).toEqual(["bankAccountNumber"]);
    expect(errors(form({ bankAccountNumber: "12345678A" }))).toEqual(["bankAccountNumber"]);
    expect(errors(form({ upiId: "not a upi id" }))).toEqual(["upiId"]);
    expect(errors(form({ donationDetailsEmail: "nope" }))).toEqual(["donationDetailsEmail"]);
  });

  it("needs name, number and IFSC together", () => {
    expect(errors(form({ bankIfsc: "" }))).toEqual(["bankIfsc"]);
    expect(errors(form({ bankAccountName: "", bankAccountNumber: "", bankIfsc: "" }))).toEqual([]);
  });

  it("can't be shown on the site with nothing to show", () => {
    const empty = form({
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      upiId: "",
      chequePayee: "",
    });
    expect(errors(empty)).toEqual(["bankDetailsPublic"]);
    expect(errors({ ...empty, bankDetailsPublic: false })).toEqual([]);
  });
});

describe("bank details helpers", () => {
  it("builds a upi:// link without an amount, encoding the payee", () => {
    expect(upiUri("mswt@sbi", "Munira Shoaib & Co")).toBe(
      "upi://pay?pa=mswt%40sbi&pn=Munira%20Shoaib%20%26%20Co&cu=INR",
    );
  });

  it("masks account numbers in alerts and lists only what changed", () => {
    expect(maskAccount("123456789012")).toBe("XXXXXXXX9012");
    const before = BankDetailsInput.parse(form());
    const after = BankDetailsInput.parse(
      form({ bankAccountNumber: "999988887777", bankDetailsPublic: false }),
    );
    expect(bankChanges(before, after)).toEqual([
      { label: "Account number", before: "XXXXXXXX9012", after: "XXXXXXXX7777" },
      { label: "Shown on the site", before: "Yes", after: "No" },
    ]);
    expect(bankChanges(before, before)).toEqual([]);
  });

  it("shows nothing until switched on; falls back to the Organization email", () => {
    const s = BankDetailsInput.parse(form());
    const org = { email: "info@mswelfaretrust.org", legalName: "Munira Shoaib Welfare Trust" };
    expect(publicBankDetails({ ...s, bankDetailsPublic: false }, org)).toBeNull();
    const shown = publicBankDetails(s, org)!;
    expect(shown.account).toMatchObject({ number: "123456789012", ifsc: "SBIN0001234", type: "savings" });
    expect(shown.upi?.uri).toContain("pa=mswt%40sbi");
    expect(shown.detailsEmail).toBe("info@mswelfaretrust.org");
    expect(
      publicBankDetails({ ...s, donationDetailsEmail: "receipts@mswelfaretrust.org" }, org)!.detailsEmail,
    ).toBe("receipts@mswelfaretrust.org");
  });
});
