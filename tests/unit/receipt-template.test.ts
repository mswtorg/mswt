import { describe, expect, it } from "vitest";
import { defaultReceiptEmail, receiptEmail } from "@/lib/email/templates/receipt";
import { renderReceiptPdf, resolveReceipt, type ReceiptData } from "@/lib/receipts/pdf";
import {
  DEFAULT_PDF,
  EmailTemplatesSchema,
  fill,
  pdfTemplateSchema,
  type PdfTemplate,
} from "@/lib/receipts/template";

const data: ReceiptData = {
  kind: "80g",
  number: "MSWT/2026-27/000001",
  receivedAt: new Date("2026-10-22T10:00:00Z"),
  donorName: "Asha Patel",
  donorAddress: null,
  panMasked: "XXXXXX234F",
  amountPaise: 100000,
  modeLabel: "Online (UPI)",
  paymentReference: null,
  towards: "General fund",
  ackReason: null,
  trust: {
    legalName: "Munira Shoaib Welfare Trust",
    address: "Mumbai",
    email: null,
    website: "mswelfaretrust.org",
    trustPan: "AAATM1234F",
    reg12aNumber: null,
    reg80gNumber: "AAATM1234FF20241",
    reg80gValidFrom: "2024-04-01",
    reg80gValidTo: "2029-03-31",
    signatoryName: "S. Ahmed",
    signatoryTitle: null,
  },
};
const texts = (t: PdfTemplate, d = data) =>
  resolveReceipt(t, d).map((b) =>
    b.type === "row"
      ? `${b.label}: ${b.value}`
      : b.type === "header"
        ? `${b.title} | ${b.text}`
        : "text" in b
          ? b.text
          : b.type,
  );

describe("receipt templates", () => {
  it("the built-in templates are valid and print what the receipts always printed", () => {
    expect(pdfTemplateSchema("80g").safeParse(DEFAULT_PDF["80g"]).success).toBe(true);
    expect(pdfTemplateSchema("acknowledgement").safeParse(DEFAULT_PDF.acknowledgement).success).toBe(true);
    const out = texts(DEFAULT_PDF["80g"]);
    expect(out[0]).toBe("DONATION RECEIPT | No. MSWT/2026-27/000001\nDate: 22 October 2026");
    expect(out).toContain("Received with thanks from: Asha Patel");
    expect(out).toContain("Donor PAN: XXXXXX234F");
    expect(out).toContain("Amount: ₹1,000");
    expect(out).toContain("Authorised Signatory");
    expect(out.some((t) => t.startsWith("This donation is eligible for deduction under Section 80G"))).toBe(
      true,
    );
    // Rows left empty are hidden; missing Trust facts are flagged; no dangling "·".
    expect(out.some((t) => t.startsWith("Address:") || t.startsWith("Payment reference:"))).toBe(false);
    expect(out.join("\n")).toContain("12A: [to be confirmed: 12A registration]");
    expect(out).toContain("This is a computer-generated receipt. mswelfaretrust.org");
  });

  it("the acknowledgement prints the note for its reason, as edited", () => {
    const ack = { ...data, kind: "acknowledgement" as const, ackReason: "no_pan" as const, panMasked: null };
    expect(texts(DEFAULT_PDF.acknowledgement, ack).join("\n")).toContain("because no PAN was provided");
    const edited = { ...DEFAULT_PDF.acknowledgement, notes: { no_pan: "Send us your PAN, {donor.name}." } };
    expect(texts(edited, ack)).toContain("Send us your PAN, {donor.name}.");
    expect(texts(edited, ack)).not.toContain("Donor PAN: ");
  });

  it("the admin can remove anything from the acknowledgement", () => {
    const t: PdfTemplate = {
      blocks: [{ type: "text", text: "Thank you!", style: "title", align: "center" }],
    };
    expect(pdfTemplateSchema("acknowledgement").safeParse(t).success).toBe(true);
    expect(texts(t)).toEqual(["Thank you!"]);
  });

  it("an 80G template must keep the required details", () => {
    const t: PdfTemplate = {
      blocks: DEFAULT_PDF["80g"].blocks.filter((b) => !(b.type === "row" && b.value === "{donor.pan}")),
    };
    const r = pdfTemplateSchema("80g").safeParse(t);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(
      "An 80G receipt must show: Donor PAN (masked). Without them the donor can't claim the deduction.",
    );
  });

  it("unknown fields can't be saved", () => {
    const t: PdfTemplate = { blocks: [{ type: "footer", text: "{donor.phone} {trust.name}" }] };
    const r = pdfTemplateSchema("acknowledgement").safeParse(t);
    expect(r.error?.issues[0]?.message).toMatch(/^Unknown field: \{donor\.phone\}/);
    expect(
      pdfTemplateSchema("80g").safeParse({ blocks: [{ type: "text", text: "{ack.note}" }] }).success,
    ).toBe(false);
  });

  it("fill drops separators left by empty fields", () => {
    expect(fill("a · {x} · b", { x: "" })).toBe("a · b");
    expect(fill("{x}  ·  {y}", { x: "site", y: "" })).toBe("site");
  });

  it("keeps each block's number when empty rows before it are hidden", () => {
    const resolved = resolveReceipt(DEFAULT_PDF["80g"], data);
    const amount = resolved.find((b) => b.type === "row" && b.label === "Amount");
    // Address (block 6) is hidden for this donor; Amount stays block 9 (index 8), as in the builder.
    expect(resolved.some((b) => b.type === "row" && b.label === "Address")).toBe(false);
    expect(amount?.n).toBe(
      DEFAULT_PDF["80g"].blocks.findIndex((b) => b.type === "row" && b.label === "Amount"),
    );
  });

  it("numbers blocks only on a sample preview", async () => {
    const numbered = await renderReceiptPdf({ ...data, sample: true, numbers: true });
    const plain = await renderReceiptPdf({ ...data, numbers: true });
    const unnumbered = await renderReceiptPdf(data);
    expect(numbered.subarray(0, 5).toString()).toBe("%PDF-");
    expect(numbered.length).toBeGreaterThan(plain.length);
    // Without `sample`, the numbers option changes nothing (only the creation date differs).
    expect(Math.abs(plain.length - unnumbered.length)).toBeLessThan(40);
  });

  it("renders a PDF from an edited template", async () => {
    const pdf = await renderReceiptPdf(
      { ...data, sample: true },
      { blocks: [{ type: "text", text: "Hello {donor.name}", style: "normal", align: "left" }] },
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("receipt email template", () => {
  const d = {
    name: "Asha",
    amountPaise: 100000,
    receiptNumber: "MSWT/2026-27/000012",
    is80g: true,
    downloadUrl: "https://x/r?a=1&b=2",
  };
  it("the built-in text is unchanged", async () => {
    const r = await receiptEmail("en", d);
    expect(r.subject).toBe("MS Welfare Trust: Your 80G donation receipt MSWT/2026-27/000012");
    expect(r.text).toContain("Dear Asha,");
    expect(r.text).toContain("https://x/r?a=1&b=2");
    expect(r.html).toContain('href="https://x/r?a=1&amp;b=2"');
  });

  it("uses the edited text for that language, and the built-in text for the others", async () => {
    const templates = {
      "80g": { en: { subject: "Receipt {receipt.number}", body: "Hi {donor.name} <b>\n\nGet it: {link}" } },
      acknowledgement: {},
    };
    expect(EmailTemplatesSchema.safeParse(templates).success).toBe(true);
    const en = await receiptEmail("en", d, templates);
    expect(en.subject).toBe("Receipt MSWT/2026-27/000012");
    expect(en.html).toContain("Hi Asha &lt;b&gt;");
    expect(en.html).toContain(">MSWT/2026-27/000012 (PDF)</a>");
    expect(en.text).toBe("Hi Asha <b>\n\nGet it: https://x/r?a=1&b=2");
    const hi = await receiptEmail("hi", d, templates);
    expect(hi.subject).toBe(
      defaultReceiptEmail("hi", "80g").subject.replace("{receipt.number}", d.receiptNumber),
    );
  });

  it("rejects unknown fields and an empty subject", () => {
    const r = EmailTemplatesSchema.safeParse({
      "80g": { en: { subject: "", body: "{donor.pan}" } },
      acknowledgement: {},
    });
    expect(r.error?.issues.map((i) => i.message)).toEqual(["Enter a subject", "Unknown field: {donor.pan}"]);
  });
});
