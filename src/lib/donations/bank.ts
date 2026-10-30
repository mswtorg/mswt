import { z } from "zod";

// Bank transfer, UPI and cheque details (Admin → Settings → Payments), shown on /donate#bank-transfer.
// Kept free of database imports so unit tests and the admin form share it.

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export const BankDetailsInput = z
  .object({
    bankAccountName: optional(120),
    // Spaces are allowed while typing (e.g. as printed on a cheque book) and removed.
    bankAccountNumber: z
      .string()
      .transform((v) => v.replace(/\s+/g, "") || null)
      .refine((v) => v === null || /^\d{9,18}$/.test(v), "Enter 9 to 18 digits"),
    bankIfsc: z
      .string()
      .transform((v) => v.trim().toUpperCase() || null)
      .refine((v) => v === null || IFSC_RE.test(v), "Enter an 11-character IFSC, e.g. SBIN0001234"),
    bankName: optional(120),
    bankBranch: optional(120),
    bankAccountType: z.enum(["", "savings", "current"]).transform((v) => (v === "" ? null : v)),
    upiId: z
      .string()
      .transform((v) => v.trim() || null)
      .refine((v) => v === null || UPI_RE.test(v), "Enter a UPI ID such as trust@sbi"),
    chequePayee: optional(160),
    donationDetailsEmail: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter an email address"),
    bankDetailsPublic: z.boolean(),
  })
  .superRefine((s, ctx) => {
    const account = [s.bankAccountName, s.bankAccountNumber, s.bankIfsc];
    // A half-filled account would send money nowhere: all three or none.
    if (account.some(Boolean) && !account.every(Boolean))
      for (const [path, v] of [
        ["bankAccountName", s.bankAccountName],
        ["bankAccountNumber", s.bankAccountNumber],
        ["bankIfsc", s.bankIfsc],
      ] as const)
        if (!v)
          ctx.addIssue({ code: "custom", path: [path], message: "Needed with the other account details" });
    if (s.bankDetailsPublic && !s.bankAccountNumber && !s.upiId && !s.chequePayee)
      ctx.addIssue({
        code: "custom",
        path: ["bankDetailsPublic"],
        message: "Enter the account, a UPI ID or the cheque payee first",
      });
  });
export type BankDetailsInput = z.infer<typeof BankDetailsInput>;
export type BankDetails = BankDetailsInput;

export const BANK_FIELDS = [
  "bankAccountName",
  "bankAccountNumber",
  "bankIfsc",
  "bankName",
  "bankBranch",
  "bankAccountType",
  "upiId",
  "chequePayee",
  "donationDetailsEmail",
  "bankDetailsPublic",
] as const satisfies readonly (keyof BankDetailsInput)[];

export const BANK_FIELD_LABELS: Record<(typeof BANK_FIELDS)[number], string> = {
  bankAccountName: "Account name",
  bankAccountNumber: "Account number",
  bankIfsc: "IFSC",
  bankName: "Bank",
  bankBranch: "Branch",
  bankAccountType: "Account type",
  upiId: "UPI ID",
  chequePayee: "Cheque in favour of",
  donationDetailsEmail: "Donors email their details to",
  bankDetailsPublic: "Shown on the site",
};

/** Account numbers in alerts: only the last 4 digits. */
export function maskAccount(n: string): string {
  return n.length <= 4 ? n : `${"X".repeat(n.length - 4)}${n.slice(-4)}`;
}

/** The fields that changed, as label/before/after (account number masked), for the admin alert. */
export function bankChanges(
  before: Partial<BankDetails> | undefined,
  after: BankDetails,
): { label: string; before: string; after: string }[] {
  const show = (k: (typeof BANK_FIELDS)[number], v: unknown) =>
    v === null || v === undefined || v === ""
      ? "(empty)"
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : k === "bankAccountNumber"
          ? maskAccount(String(v))
          : String(v);
  return BANK_FIELDS.filter((k) => (before?.[k] ?? null) !== (after[k] ?? null)).map((k) => ({
    label: BANK_FIELD_LABELS[k],
    before: show(k, before?.[k]),
    after: show(k, after[k]),
  }));
}

/** upi://pay link (no amount: the donor types it in their app). */
export function upiUri(upiId: string, payee: string): string {
  const q = new URLSearchParams({ pa: upiId, pn: payee, cu: "INR" });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

export type PublicBankDetails = {
  account: {
    name: string;
    number: string;
    ifsc: string;
    bank: string | null;
    branch: string | null;
    type: "savings" | "current" | null;
  } | null;
  upi: { id: string; uri: string } | null;
  chequePayee: string | null;
  detailsEmail: string | null;
};

/** What the site may show, or null when the Super Admin hasn't switched the details on. */
export function publicBankDetails(
  s: Partial<BankDetails> | null | undefined,
  org: { email: string | null; legalName: string } | null | undefined,
): PublicBankDetails | null {
  if (!s?.bankDetailsPublic) return null;
  const account =
    s.bankAccountName && s.bankAccountNumber && s.bankIfsc
      ? {
          name: s.bankAccountName,
          number: s.bankAccountNumber,
          ifsc: s.bankIfsc,
          bank: s.bankName ?? null,
          branch: s.bankBranch ?? null,
          type: s.bankAccountType ?? null,
        }
      : null;
  const payee = s.bankAccountName ?? org?.legalName ?? "MS Welfare Trust";
  const upi = s.upiId ? { id: s.upiId, uri: upiUri(s.upiId, payee) } : null;
  const chequePayee = s.chequePayee ?? null;
  if (!account && !upi && !chequePayee) return null;
  return { account, upi, chequePayee, detailsEmail: s.donationDetailsEmail ?? org?.email ?? null };
}
