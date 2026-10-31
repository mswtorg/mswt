import { formatRupees, type Paise } from "@/lib/money";
import { emailLayout, esc, link, p, quote, table } from "./layout";

// Admin alerts (Step 9). English only, like the admin. Every subject starts with a fixed
// "[MSWT] [Type]" prefix so the Trust's mailbox can filter and label them.

export const ALERT_PREFIX = {
  donation: "[MSWT] [Donation]",
  contact: "[MSWT] [Contact]",
  paymentProblem: "[MSWT] [Payment problem]",
  paymentFailed: "[MSWT] [Payment failed]",
  dailySummary: "[MSWT] [Daily summary]",
  bankDetails: "[MSWT] [Bank details]",
  jobFailed: "[MSWT] [Job failed]",
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

export type BankDetailsAlert = {
  by: string;
  changes: { label: string; before: string; after: string }[];
  adminUrl: string;
};

/** Sent whenever the bank, UPI or cheque details shown to donors change: a swapped account is fraud. */
export function bankDetailsAlert(x: BankDetailsAlert): Email {
  return alert(
    "bankDetails",
    `Changed by ${subjectPart(x.by, 40)}`,
    x.changes.map((c) => [c.label, `${c.before} → ${c.after}`]),
    {
      lead: `${x.by} changed the bank details donors see on the Donate page. If this wasn't agreed, change them back and reset that admin's password now.`,
      adminUrl: x.adminUrl,
    },
  );
}

export type JobFailedAlert = {
  job: string;
  /** What it was doing when it stopped, e.g. "Daily check". */
  stage: string;
  error: string;
  /** When it started, already formatted in IST. */
  at: string;
  adminUrl: string;
};

/** The nightly job stopped before finishing: nobody would notice otherwise. */
export function jobFailedAlert(x: JobFailedAlert): Email {
  return alert(
    "jobFailed",
    `${x.job}: ${subjectPart(x.error, 60)}`,
    [
      ["Job", x.job],
      ["Started", x.at],
      ["Stopped during", x.stage],
      ["Error", x.error],
    ],
    {
      lead: `The ${x.job.toLowerCase()} stopped before finishing, so payments may not have been checked and receipts may not have been sent. If this happens again tomorrow, tell the developer.`,
      adminUrl: x.adminUrl,
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

export type PaymentFailed = {
  amountPaise: Paise;
  towards: string;
  /** Cashfree's or the bank's reason; null when none was given. */
  reason: string | null;
  /** The donor closed the payment page instead of paying. */
  dropped: boolean;
  donorName: string;
  donorEmail: string;
  orderId: string;
  attemptedAt: string;
  adminUrl: string;
};

/** A plain-language reason for the subject and body. */
export function failureReason(x: Pick<PaymentFailed, "reason" | "dropped">): string {
  if (x.dropped) return "Donor closed the payment page";
  return x.reason?.trim() || "Declined (no reason given)";
}

export function paymentFailedAlert(x: PaymentFailed): Email {
  const amount = formatRupees(x.amountPaise, "en");
  const reason = failureReason(x);
  return alert(
    "paymentFailed",
    `${amount} – ${subjectPart(reason, 50)} – ${x.orderId}`,
    [
      ["Amount", amount],
      ["Towards", x.towards],
      ["Reason", reason],
      ["Donor", x.donorName],
      ["Email", x.donorEmail],
      ["Attempted", x.attemptedAt],
      ["Order", x.orderId],
    ],
    {
      lead: "A donor's payment didn't go through. Nothing was charged and no receipt was issued. The donor can try again from the same page; you may want to contact them.",
      adminUrl: x.adminUrl,
    },
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
  /** Failed payment attempts that day (each is also emailed as it happens). */
  failed: { reference: string; amountPaise: Paise; reason: string }[];
  /** Orders given up on that day (the donor never finished paying). */
  abandoned: number;
  problems: { reference: string; error: string }[];
  adminUrl: string;
};

/** Nothing happened and nothing is wrong: no email that day. */
export function summaryIsEmpty(s: DailySummary): boolean {
  return (
    !s.count &&
    !s.refunds &&
    !s.fixedByCheck &&
    !s.receiptsNotEmailed &&
    !s.newMessages &&
    !s.failed.length &&
    !s.abandoned &&
    !s.problems.length
  );
}

/** A bulleted list section (problems, failed payments), or nothing when empty. */
function listSection(title: string, items: string[]): { html: string; text: string } {
  if (!items.length) return { html: "", text: "" };
  return {
    html: `<p style="margin:0 0 8px;font-weight:600">${esc(title)}</p><ul style="margin:0 0 20px;padding-left:20px">${items
      .map((x) => `<li>${esc(x)}</li>`)
      .join("")}</ul>`,
    text: [title, ...items.map((x) => `- ${x}`)].join("\n"),
  };
}

const MAX_LISTED = 10;
const ALL_CLEAR = "All clear: nothing to report for this day.";

export function dailySummaryEmail(s: DailySummary): Email {
  const total = formatRupees(s.totalPaise, "en");
  const rows: [string, string][] = [
    ["Donations", `${s.count} (${total})`],
    ...s.byMode.map(({ mode, count, totalPaise }): [string, string] => [
      `  ${mode}`,
      `${count} (${formatRupees(totalPaise, "en")})`,
    ]),
    ["Failed payments", String(s.failed.length)],
    ["Abandoned (never paid)", String(s.abandoned)],
    ["Refunds", String(s.refunds)],
    ["Payments confirmed by the daily check", String(s.fixedByCheck)],
    ["Receipts not emailed yet", String(s.receiptsNotEmailed)],
    ["New contact messages", String(s.newMessages)],
  ];
  const failedItems = s.failed
    .slice(0, MAX_LISTED)
    .map((f) => `${f.reference}: ${formatRupees(f.amountPaise, "en")} – ${f.reason}`);
  if (s.failed.length > MAX_LISTED) failedItems.push(`and ${s.failed.length - MAX_LISTED} more in the admin`);
  const sections = [
    listSection(`Failed payments (${s.failed.length})`, failedItems),
    listSection(
      `Problems (${s.problems.length})`,
      s.problems.map((x) => `${x.reference}: ${x.error}`),
    ),
  ];
  const empty = summaryIsEmpty(s);
  const html = [
    empty ? `<p style="margin:0 0 16px">${ALL_CLEAR}</p>` : "",
    ...sections.map((x) => x.html),
  ].join("");
  const text = [empty ? ALL_CLEAR : "", ...sections.map((x) => x.text)].filter(Boolean).join("\n\n");
  const n = s.count === 1 ? "1 donation" : `${s.count} donations`;
  const extras = [
    s.failed.length ? `${s.failed.length} failed` : "",
    s.problems.length ? `${s.problems.length} problem${s.problems.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  if (empty) extras.push("all clear");
  return alert("dailySummary", `${s.day} – ${n}, ${total}${extras.map((x) => ` – ${x}`).join("")}`, rows, {
    html,
    text,
    adminUrl: s.adminUrl,
  });
}
