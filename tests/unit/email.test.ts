import { describe, expect, it } from "vitest";
import {
  ALERT_PREFIX,
  contactAlert,
  dailySummaryEmail,
  donationAlert,
  paymentProblemAlert,
  subjectPart,
  summaryIsEmpty,
  type DailySummary,
} from "@/lib/email/templates/alerts";
import { contactAcknowledgement } from "@/lib/email/templates/contact";
import { receiptEmail } from "@/lib/email/templates/receipt";

const donation = {
  amountPaise: 100000,
  towards: "School support",
  receiptNumber: "MSWT/2026-27/000012",
  receiptKind: "80g" as const,
  mode: "Online (UPI)",
  donorName: "Asha <b>Rao</b>",
  donorEmail: "asha@example.com",
  panMasked: "XXXXXX234F",
  orderId: "MSWT-abc",
  receivedAt: "26 October 2026 at 4:10 pm",
  adminUrl: "https://mswelfaretrust.org/admin/donations/1",
};
const contact = {
  name: "Asha\r\nBcc: x@evil.test",
  email: "asha@example.com",
  phone: null,
  subjectLabel: "Volunteering",
  message: "Hello <script>alert(1)</script> see https://example.com",
  locale: "hi",
  adminUrl: "https://mswelfaretrust.org/admin/content/messages/1",
};
const emptySummary: DailySummary = {
  day: "26 October 2026",
  count: 0,
  totalPaise: 0,
  byMode: [],
  refunds: 0,
  fixedByCheck: 0,
  receiptsNotEmailed: 0,
  newMessages: 0,
  problems: [],
  adminUrl: "https://mswelfaretrust.org/admin/donations",
};

describe("admin alert subjects", () => {
  it("start with their fixed filter prefix", () => {
    expect(donationAlert(donation).subject).toBe(
      "[MSWT] [Donation] ₹1,000 – School support – MSWT/2026-27/000012",
    );
    expect(contactAlert(contact).subject.startsWith(`${ALERT_PREFIX.contact} Volunteering – from Asha`)).toBe(
      true,
    );
    expect(
      paymentProblemAlert({
        problem: "Amount mismatch",
        reference: "MSWT-abc",
        details: "x",
        whatToDo: "y",
        adminUrl: "u",
      }).subject,
    ).toBe("[MSWT] [Payment problem] Amount mismatch – MSWT-abc");
    expect(
      dailySummaryEmail({
        ...emptySummary,
        count: 4,
        totalPaise: 750000,
        byMode: [{ mode: "Online", count: 4, totalPaise: 750000 }],
      }).subject,
    ).toBe("[MSWT] [Daily summary] 26 October 2026 – 4 donations, ₹7,500");
  });

  it("keep visitor text on one line", () => {
    const s = contactAlert(contact).subject;
    expect(s).not.toMatch(/[\r\n]/);
    expect(subjectPart("a".repeat(100), 10)).toHaveLength(10);
  });
});

describe("email bodies", () => {
  it("escape HTML and never show a full PAN", () => {
    const d = donationAlert(donation);
    expect(d.html).toContain("Asha &lt;b&gt;Rao&lt;/b&gt;");
    expect(d.html).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
    expect(d.text).toContain("XXXXXX234F");
    const c = contactAlert(contact);
    expect(c.html).not.toContain("<script>");
    expect(c.html).not.toContain('href="https://example.com"');
  });

  it("send the daily summary only when there is something to report", () => {
    expect(summaryIsEmpty(emptySummary)).toBe(true);
    expect(summaryIsEmpty({ ...emptySummary, newMessages: 1 })).toBe(false);
    expect(summaryIsEmpty({ ...emptySummary, problems: [{ reference: "MSWT-x", error: "boom" }] })).toBe(
      false,
    );
    const s = dailySummaryEmail({ ...emptySummary, problems: [{ reference: "MSWT-x", error: "<boom>" }] });
    expect(s.subject).toContain("1 problem");
    expect(s.html).toContain("&lt;boom&gt;");
  });

  it("start donor-facing subjects with the Trust's name", async () => {
    const r = await receiptEmail("en", {
      name: "Asha",
      amountPaise: 100000,
      receiptNumber: "MSWT/2026-27/000012",
      is80g: true,
      downloadUrl: "https://x/r",
    });
    expect(r.subject).toBe("MS Welfare Trust: Your 80G donation receipt MSWT/2026-27/000012");
  });

  it.each(["en", "hi", "mr", "gu"] as const)("acknowledge a contact message in %s", async (locale) => {
    const messages = (await import(`@/messages/${locale}.json`)).default;
    const e = await contactAcknowledgement(locale, {
      name: "Asha",
      subjectLabel: messages.Contact.subjects.volunteer,
      message: "Hello <b>there</b> https://example.com",
      trust: { email: "info@mswelfaretrust.org", phones: ["+91 98765 43210"], website: "mswelfaretrust.org" },
    });
    expect(e.subject).toBe(`${messages.ContactEmail.team}: ${messages.ContactEmail.subject}`);
    expect(e.html).toContain(`lang="${locale}"`);
    expect(e.html).toContain(messages.Contact.subjects.volunteer);
    expect(e.html).toContain("Hello &lt;b&gt;there&lt;/b&gt;");
    expect(e.html).not.toContain('href="https://example.com"');
    expect(e.text).toContain("info@mswelfaretrust.org");
  });
});
