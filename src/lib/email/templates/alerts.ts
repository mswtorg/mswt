import { formatRupees, type Paise } from "@/lib/money";
import { emailLayout, esc, link, p, quote, table } from "./layout";

// Admin alerts (Step 9). English only, like the admin. Every subject starts with a fixed
// "[MSWT] [Type]" prefix so the Trust's mailbox can filter and label them.

export const ALERT_PREFIX = {
  donation: "[MSWT] [Donation]",
  contact: "[MSWT] [Contact]",
  paymentProblem: "[MSWT] [Payment problem]",
  dailySummary: "[MSWT] [Daily summary]",
} as const;

export type AlertKind = keyof typeof ALERT_PREFIX;
export type Email = { subject: string; html: string; text: string };

const HEADING = "MS Welfare Trust admin";
const FOOTER = "Admin alert from mswelfaretrust.org. Change who receives these in Admin → Settings → Email.";

/** Visitor-typed text in a subject line: one line, no control characters, not too long. */
export function subjectPart(s: string, max = 60): string {
  const clean = s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function alert(
  kind: AlertKind,
  title: string,
  rows: [string, string][],
  extra: { html?: string; text?: string; adminUrl: string; lead?: string },
): Email {
  const subject = `${ALERT_PREFIX[kind]} ${title}`;
  const lead = extra.lead ? p(extra.lead) : "";
  const html = emailLayout({
    lang: "en",
    heading: HEADING,
    footer: FOOTER,
    body: `${lead}${table(rows)}${extra.html ?? ""}<p style="margin:0">${link(extra.adminUrl, "Open in the admin")}</p>`,
  });
  const text = [
    ...(extra.lead ? [extra.lead, ""] : []),
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(extra.text ? ["", extra.text] : []),
    "",
    `Open in the admin: ${extra.adminUrl}`,
    "",
    "--",
    FOOTER,
  ].join("\n");
  return { subject, html, text };
}

export type DonationAlert = {
  amountPaise: Paise;
  towards: string;
  receiptNumber: string;
  receiptKind: "80g" | "acknowledgement";
  mode: string;
  donorName: string;
  donorEmail: string;
  /** Masked (XXXXXX1234) or null; the full PAN never goes into an email. */
  panMasked: string | null;
  orderId: string;
  receivedAt: string;
  adminUrl: string;
};

export function donationAlert(d: DonationAlert): Email {
  const amount = formatRupees(d.amountPaise, "en");
  return alert(
    "donation",
    `${amount} – ${subjectPart(d.towards, 40)} – ${d.receiptNumber}`,
    [
      ["Amount", amount],
      ["Towards", d.towards],
      ["Receipt", `${d.receiptNumber} (${d.receiptKind === "80g" ? "80G receipt" : "acknowledgement"})`],
      ["Paid by", d.mode],
      ["Received", d.receivedAt],
      ["Donor", d.donorName],
      ["Email", d.donorEmail],
      ...(d.panMasked ? ([["PAN", d.panMasked]] as [string, string][]) : []),
      ["Order", d.orderId],
    ],
    { adminUrl: d.adminUrl },
  );
}

export type ContactAlert = {
  name: string;
  email: string;
  phone: string | null;
  subjectLabel: string;
  message: string;
  locale: string;
  adminUrl: string;
};

export function contactAlert(m: ContactAlert): Email {
  return alert(
    "contact",
    `${m.subjectLabel} – from ${subjectPart(m.name, 40)}`,
    [
      ["From", m.name],
      ["Email", m.email],
      ...(m.phone ? ([["Phone", m.phone]] as [string, string][]) : []),
      ["Subject", m.subjectLabel],
      ["Language", m.locale],
    ],
    {
      lead: `Reply to this email to answer ${m.name} (${m.email}). They have been told we received their message.`,
      html: quote(m.message),
      text: m.message,
      adminUrl: m.adminUrl,
    },
  );
}

export type PaymentProblem = {
  problem: "Amount mismatch" | "Unknown order" | "Receipt not emailed";
  /** Order id or receipt number. */
  reference: string;
  details: string;
  whatToDo: string;
  adminUrl: string;
};

export function paymentProblemAlert(x: PaymentProblem): Email {
  return alert(
    "paymentProblem",
    `${x.problem} – ${subjectPart(x.reference, 40)}`,
    [
      ["Problem", x.problem],
      ["Reference", x.reference],
      ["Details", x.details],
    ],
    { lead: x.whatToDo, adminUrl: x.adminUrl },
  );
}

export type DailySummary = {
  /** Day covered, e.g. "26 Oct 2026" (Asia/Kolkata). */
  day: string;
  count: number;
  totalPaise: Paise;
  byMode: { mode: string; count: number; totalPaise: Paise }[];
  refunds: number;
  fixedByCheck: number;
  receiptsNotEmailed: number;
  newMessages: number;
  problems: { reference: string; error: string }[];
  adminUrl: string;
};

/** Nothing happened and nothing is wrong: no email that day. */
export function summaryIsEmpty(s: DailySummary): boolean {
  return (
    !s.count && !s.refunds && !s.fixedByCheck && !s.receiptsNotEmailed && !s.newMessages && !s.problems.length
  );
}

export function dailySummaryEmail(s: DailySummary): Email {
  const total = formatRupees(s.totalPaise, "en");
  const rows: [string, string][] = [
    ["Donations", `${s.count} (${total})`],
    ...s.byMode.map(({ mode, count, totalPaise }): [string, string] => [
      `  ${mode}`,
      `${count} (${formatRupees(totalPaise, "en")})`,
    ]),
    ["Refunds", String(s.refunds)],
    ["Payments confirmed by the daily check", String(s.fixedByCheck)],
    ["Receipts not emailed yet", String(s.receiptsNotEmailed)],
    ["New contact messages", String(s.newMessages)],
  ];
  const problems = s.problems.length
    ? {
        html: `<p style="margin:0 0 8px;font-weight:600">Problems (${s.problems.length})</p><ul style="margin:0 0 20px;padding-left:20px">${s.problems
          .map((x) => `<li>${esc(x.reference)}: ${esc(x.error)}</li>`)
          .join("")}</ul>`,
        text: [
          `Problems (${s.problems.length}):`,
          ...s.problems.map((x) => `- ${x.reference}: ${x.error}`),
        ].join("\n"),
      }
    : {};
  const n = s.count === 1 ? "1 donation" : `${s.count} donations`;
  return alert(
    "dailySummary",
    `${s.day} – ${n}, ${total}${s.problems.length ? ` – ${s.problems.length} problem${s.problems.length === 1 ? "" : "s"}` : ""}`,
    rows,
    {
      ...problems,
      adminUrl: s.adminUrl,
    },
  );
}
