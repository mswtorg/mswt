import { and, eq, sql } from "drizzle-orm";
import type { Locale } from "@/i18n/routing";
import { maskPan } from "@/lib/crypto/pii";
import { db } from "@/lib/db/client";
import {
  causeTranslations,
  causes,
  donations,
  organizationSettings,
  paymentSettings,
  receipts,
} from "@/lib/db/schema";
import { getEmailProvider } from "@/lib/email";
import { receiptEmail } from "@/lib/email/templates/receipt";
import { isProduction } from "@/lib/secrets";
import { receiptLinkQuery } from "@/lib/receipts/links";
import { missingTrustFacts, renderReceiptPdf, type ReceiptData, type TrustFacts } from "@/lib/receipts/pdf";
import { decideReceiptKind } from "@/lib/receipts/kind";
import { loadReceiptTemplates } from "@/lib/receipts/templates-store";
import { appOrigin, siteUrl } from "@/lib/seo/site";
import { getReceiptStorage } from "@/lib/storage";

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  neft: "Bank transfer (NEFT/RTGS/IMPS)",
  upi_offline: "UPI",
};
const METHOD_LABEL: Record<string, string> = {
  upi: "UPI",
  credit_card: "Credit card",
  debit_card: "Debit card",
  net_banking: "Net banking",
  wallet: "Wallet",
  app: "Wallet",
};

/** The Trust's details printed on receipts (Settings → Organization). */
export async function trustFacts(): Promise<TrustFacts> {
  const [o] = await db.select().from(organizationSettings).limit(1);
  const address = o
    ? [o.streetAddress, o.locality, o.city, o.state && o.pincode ? `${o.state} ${o.pincode}` : o.state]
        .filter(Boolean)
        .join(", ") || null
    : null;
  return {
    legalName: o?.legalName ?? "Munira Shoaib Welfare Trust",
    address,
    email: o?.email ?? null,
    website: siteUrl().host,
    trustPan: o?.trustPan ?? null,
    reg12aNumber: o?.reg12aNumber ?? null,
    reg80gNumber: o?.reg80gNumber ?? null,
    reg80gValidFrom: o?.reg80gValidFrom ?? null,
    reg80gValidTo: o?.reg80gValidTo ?? null,
    signatoryName: o?.signatoryName ?? null,
    signatoryTitle: o?.signatoryTitle ?? null,
  };
}

async function load(receiptId: string) {
  const [row] = await db
    .select({ receipt: receipts, donation: donations })
    .from(receipts)
    .innerJoin(donations, eq(donations.id, receipts.donationId))
    .where(eq(receipts.id, receiptId));
  if (!row) throw new Error(`Receipt ${receiptId} not found`);
  return row;
}

/** Everything printed on the receipt, from the frozen donation snapshot. */
export async function receiptData(receiptId: string): Promise<ReceiptData> {
  const { receipt: r, donation: d } = await load(receiptId);
  const trust = await trustFacts();
  const [cause] = d.causeId
    ? await db
        .select({ title: causeTranslations.title, is80g: causes.is80gEligible })
        .from(causes)
        .leftJoin(
          causeTranslations,
          and(eq(causeTranslations.causeId, causes.id), eq(causeTranslations.locale, "en")),
        )
        .where(eq(causes.id, d.causeId))
    : [];
  const [settings] = await db.select({ cashLimit: paymentSettings.cash80gLimitPaise }).from(paymentSettings);
  const ack =
    r.kind === "acknowledgement"
      ? decideReceiptKind({
          wants80g: d.wants80g,
          hasPan: Boolean(d.panEncSnapshot),
          causeIs80gEligible: cause?.is80g ?? true,
          mode: d.mode,
          totalPaise: d.totalPaise,
          cash80gLimitPaise: settings?.cashLimit ?? 200000,
        }).reason
      : null;
  const online = d.mode === "online";
  const method = d.providerPaymentMethod
    ? (METHOD_LABEL[d.providerPaymentMethod] ?? d.providerPaymentMethod)
    : null;
  const offlineRef = [d.instrumentRef, d.instrumentDate, d.bankName].filter(Boolean).join(", ");
  return {
    kind: r.kind,
    number: r.number,
    receivedAt: d.receivedAt ?? r.issuedAt,
    donorName: d.nameSnapshot,
    donorAddress: d.addressSnapshot ?? null,
    panMasked: d.panLast4Snapshot ? maskPan(d.panLast4Snapshot) : null,
    amountPaise: d.totalPaise,
    modeLabel: online ? `Online${method ? ` (${method})` : ""}` : (MODE_LABEL[d.mode] ?? d.mode),
    paymentReference: online
      ? d.providerPaymentId
        ? `Cashfree payment ${d.providerPaymentId} · order ${d.publicOrderId}`
        : `Order ${d.publicOrderId}`
      : offlineRef || null,
    towards: cause?.title ?? "General fund",
    ackReason: ack === "80g" ? null : ack,
    voided: Boolean(r.voidedAt),
    trust,
  };
}

export const receiptFilename = (number: string) => `${number.replaceAll("/", "-")}.pdf`;

/** Renders and stores the PDF if it is not stored yet; returns its storage key. */
export async function ensureReceiptPdf(receiptId: string): Promise<string> {
  const { receipt } = await load(receiptId);
  if (receipt.pdfR2Key) return receipt.pdfR2Key;
  const data = await receiptData(receiptId);
  const missing = missingTrustFacts(data.trust, data.kind);
  if (missing.length && isProduction())
    throw new Error(
      `Cannot issue receipt ${data.number}: missing ${missing.join(", ")} (open-questions B1/B8)`,
    );
  const pdf = await renderReceiptPdf(data, (await loadReceiptTemplates()).pdf[data.kind]);
  const key = `receipts/${receipt.fy}/${receiptFilename(receipt.number)}`;
  await getReceiptStorage().put(key, pdf, "application/pdf");
  await db.update(receipts).set({ pdfR2Key: key }).where(eq(receipts.id, receiptId));
  return key;
}

/** PDF → storage → email to the donor. Safe to call again: each part is done once. */
export async function deliverReceipt(receiptId: string): Promise<void> {
  const key = await ensureReceiptPdf(receiptId);
  const { receipt, donation } = await load(receiptId);
  if (receipt.emailedAt || receipt.voidedAt) return;
  await db
    .update(receipts)
    .set({ emailAttempts: sql`${receipts.emailAttempts} + 1` })
    .where(eq(receipts.id, receiptId));
  const pdf = await getReceiptStorage().get(key);
  const link = `${appOrigin()}/api/receipts/${donation.publicOrderId}?${receiptLinkQuery(donation.publicOrderId)}`;
  const message = await receiptEmail(
    donation.locale as Locale,
    {
      name: donation.nameSnapshot,
      amountPaise: donation.totalPaise,
      receiptNumber: receipt.number,
      is80g: receipt.kind === "80g",
      downloadUrl: link,
      trustName: (await trustFacts()).legalName,
    },
    (await loadReceiptTemplates()).email,
  );
  const { messageId } = await getEmailProvider().send({
    ...message,
    to: { email: donation.emailSnapshot, name: donation.nameSnapshot },
    attachments: [{ filename: receiptFilename(receipt.number), content: pdf }],
    tag: "receipt",
  });
  await db
    .update(receipts)
    .set({ emailedAt: new Date(), emailMessageId: messageId })
    .where(eq(receipts.id, receiptId));
}
