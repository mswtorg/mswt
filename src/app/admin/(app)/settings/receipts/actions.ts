"use server";

import { routing, type Locale } from "@/i18n/routing";
import { actorFor } from "@/lib/admin/actor";
import { requireCapability } from "@/lib/admin/guard";
import { updateReceiptTemplate } from "@/lib/admin/settings/service";
import { trustFacts } from "@/lib/donations/deliver";
import { withTx } from "@/lib/db/tx";
import { receiptEmail } from "@/lib/email/templates/receipt";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import { EmailTemplatesSchema, pdfTemplateSchema, type AckReason } from "@/lib/receipts/template";
import type { ReceiptKind } from "@/lib/receipts/numbering";
import { formValues, issuesToErrors, type FormState } from "@/components/admin/form-state";

const PARTS = ["80g", "acknowledgement", "email"] as const;
type Part = (typeof PARTS)[number];
const part = (v: FormDataEntryValue | null): Part => {
  const p = PARTS.find((x) => x === v);
  if (!p) throw new Error("Unknown template");
  return p;
};
const parseJson = (v: FormDataEntryValue | null): unknown => {
  try {
    return JSON.parse(String(v ?? ""));
  } catch {
    return null;
  }
};
const schemaFor = (p: Part) => (p === "email" ? EmailTemplatesSchema : pdfTemplateSchema(p));

/** Settings → Receipts → Save: one template, validated (80G must keep its required details), audited. */
export async function saveReceiptTemplate(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("settings.receipts");
  const p = part(form.get("part"));
  const values = formValues(form);
  const parsed = schemaFor(p).safeParse(parseJson(form.get("template")));
  if (!parsed.success) return { status: "error", errors: issuesToErrors(parsed.error.issues), values };
  await withTx((tx) => updateReceiptTemplate(tx, p, parsed.data, actor));
  return {
    status: "saved",
    message: "Saved. New receipts and reissued ones use this template; receipts already sent don't change.",
    values,
  };
}

/** Settings → Receipts → Reset: back to the built-in template (audited). */
export async function resetReceiptTemplate(_prev: FormState, form: FormData): Promise<FormState> {
  const { actor } = await actorFor("settings.receipts");
  await withTx((tx) => updateReceiptTemplate(tx, part(form.get("part")), null, actor));
  return { status: "saved", message: "The built-in template is back. Reload the page to see it." };
}

export type PreviewResult =
  { ok: true; pdf?: string; email?: { subject: string; html: string } } | { ok: false; error: string };

const SAMPLE = {
  number: "MSWT/2026-27/000123",
  receivedAt: new Date("2026-10-22T10:00:00+05:30"),
  donorName: "Asha Patel",
  donorAddress: { line1: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
  panMasked: "XXXXXX234F",
  amountPaise: 250000,
  modeLabel: "Online (UPI)",
  paymentReference: "Cashfree payment 5123456789 · order MSWT-sample",
  towards: "General fund",
};

/** A sample PDF (watermarked "SAMPLE") or email from the unsaved template, with the Trust's real details. */
export async function previewReceiptTemplate(
  p: Part,
  json: string,
  opts: { reason?: AckReason; locale?: Locale; emailKind?: ReceiptKind } = {},
): Promise<PreviewResult> {
  await requireCapability("settings.receipts");
  const kind = part(p);
  const trust = await trustFacts();
  if (kind === "email") {
    const locale = routing.locales.find((l) => l === opts.locale) ?? "en";
    const parsed = EmailTemplatesSchema.safeParse(parseJson(json));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template" };
    const message = await receiptEmail(
      locale,
      {
        name: SAMPLE.donorName,
        amountPaise: SAMPLE.amountPaise,
        receiptNumber: SAMPLE.number,
        is80g: opts.emailKind !== "acknowledgement",
        downloadUrl: "https://mswelfaretrust.org/api/receipts/sample",
        trustName: trust.legalName,
      },
      parsed.data,
    );
    return { ok: true, email: { subject: message.subject, html: message.html } };
  }
  // Structure only: a preview may show an 80G template that can't be saved yet.
  const parsed = pdfTemplateSchema("acknowledgement").safeParse(parseJson(json));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template" };
  const pdf = await renderReceiptPdf(
    {
      ...SAMPLE,
      kind,
      panMasked: kind === "80g" || opts.reason !== "no_pan" ? SAMPLE.panMasked : null,
      ackReason: kind === "80g" ? null : (opts.reason ?? "not_requested"),
      sample: true,
      trust,
    },
    parsed.data,
  );
  return { ok: true, pdf: pdf.toString("base64") };
}
