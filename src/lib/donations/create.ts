import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Locale } from "@/i18n/routing";
import { encryptPii, piiLookupHash } from "@/lib/crypto/pii";
import { causes, donations, donors, type PostalAddress } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { withTx, type Tx } from "@/lib/db/tx";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentSettings } from "@/lib/payment-settings";
import { feeCoverPaise, type DonateInput } from "./schema";

/** Random, URL-safe order id (what Cashfree and the donor see), e.g. MSWT-Xr3k9QpZ0aLm2fVb. */
export function newPublicOrderId(): string {
  return `MSWT-${randomBytes(12).toString("base64url")}`;
}

export type DonorDetails = {
  fullName: string;
  email: string;
  phone: string;
  pan: string | null;
  address: PostalAddress | null;
  createdVia: "online" | "offline";
};

/** Finds the donor by PAN, else by email + phone (spec §2), and refreshes their details. */
export async function upsertDonor(
  tx: Tx,
  d: DonorDetails,
): Promise<{ id: string; panEnc: string | null; panLast4: string | null }> {
  const panHmac = d.pan ? piiLookupHash(d.pan) : null;
  const panFields = d.pan ? { panEnc: encryptPii(d.pan), panLast4: d.pan.slice(-4), panHmac } : {};
  const addressFields = d.address
    ? {
        addressLine1: d.address.line1,
        addressLine2: d.address.line2 ?? null,
        city: d.address.city ?? null,
        state: d.address.state ?? null,
        pincode: d.address.pincode,
      }
    : {};
  const [existing] = panHmac
    ? await tx.select({ id: donors.id }).from(donors).where(eq(donors.panHmac, panHmac)).limit(1)
    : await tx
        .select({ id: donors.id })
        .from(donors)
        .where(and(sql`lower(${donors.email}) = lower(${d.email})`, eq(donors.phone, d.phone)))
        .limit(1);
  const now = new Date();
  const values = {
    fullName: d.fullName,
    email: d.email,
    phone: d.phone,
    ...panFields,
    ...addressFields,
    updatedAt: now,
  };
  if (existing) {
    const [row] = await tx
      .update(donors)
      .set(values)
      .where(eq(donors.id, existing.id))
      .returning({ id: donors.id, panEnc: donors.panEnc, panLast4: donors.panLast4 });
    return row!;
  }
  const [row] = await tx
    .insert(donors)
    .values({ ...values, isIndianCitizenDeclared: true, declaredAt: now, createdVia: d.createdVia })
    .returning({ id: donors.id, panEnc: donors.panEnc, panLast4: donors.panLast4 });
  return row!;
}

export class DonationClosedError extends Error {}

export type CreatedDonation = {
  publicOrderId: string;
  paymentSessionId: string;
  provider: "cashfree" | "fake";
  mode: "sandbox" | "production";
};

/**
 * Online donation: store it (status created), open the gateway order, then mark it pending.
 * Amounts and fees come only from the validated input and server settings (SEC-06).
 */
export async function createOnlineDonation(
  input: DonateInput,
  ctx: { settings: PaymentSettings; locale: Locale; ipHash: string; origin: string },
): Promise<CreatedDonation> {
  const provider = getPaymentProvider();
  const fee = feeCoverPaise(input.amount, ctx.settings, input.coverFee);
  const publicOrderId = newPublicOrderId();
  // City and state are optional; line 1 and the PIN code make an address (80G needs one).
  const address =
    input.wants80g && input.line1 && input.pincode
      ? {
          line1: input.line1,
          ...(input.line2 ? { line2: input.line2 } : {}),
          ...(input.city ? { city: input.city } : {}),
          ...(input.state ? { state: input.state } : {}),
          pincode: input.pincode,
        }
      : null;

  const donation = await withTx(async (tx) => {
    let causeId: string | null = null;
    if (input.cause) {
      const [cause] = await tx
        .select({ id: causes.id, status: causes.status })
        .from(causes)
        .where(eq(causes.slug, input.cause))
        .limit(1);
      if (cause?.status !== "active") throw new DonationClosedError("Cause is not accepting donations");
      causeId = cause.id;
    }
    // Kept whenever given: required above Settings → Payments → "PAN required above", 80G or not.
    // The receipt is still 80G only when asked for (decideReceiptKind).
    const pan = input.pan || null;
    const donor = await upsertDonor(tx, {
      fullName: input.name,
      email: input.email,
      phone: input.phone,
      pan,
      address,
      createdVia: "online",
    });
    const [row] = await tx
      .insert(donations)
      .values({
        publicOrderId,
        donorId: donor.id,
        causeId,
        amountPaise: input.amount,
        feeCoverPaise: fee,
        totalPaise: input.amount + fee,
        mode: "online",
        status: "created",
        provider: provider.name,
        isAnonymous: input.anonymous,
        wants80g: input.wants80g,
        nameSnapshot: input.name,
        emailSnapshot: input.email,
        panEncSnapshot: pan ? donor.panEnc : null,
        panLast4Snapshot: pan ? donor.panLast4 : null,
        addressSnapshot: address,
        locale: ctx.locale,
        ipHash: ctx.ipHash,
      })
      .returning({ id: donations.id, donorId: donations.donorId, totalPaise: donations.totalPaise });
    return row!;
  });

  const order = await provider.createOrder({
    orderId: publicOrderId,
    amountPaise: donation.totalPaise,
    customer: { id: donation.donorId, name: input.name, email: input.email, phone: input.phone },
    returnUrl: `${ctx.origin}/${ctx.locale}/donate/thank-you?order=${publicOrderId}`,
    notifyUrl: `${ctx.origin}/api/webhooks/cashfree`,
    note: "Donation to MS Welfare Trust",
  });
  await db
    .update(donations)
    .set({
      status: "pending",
      providerOrderId: order.providerOrderId,
      paymentSessionId: order.paymentSessionId,
      updatedAt: new Date(),
    })
    .where(and(eq(donations.id, donation.id), eq(donations.status, "created")));
  return {
    publicOrderId,
    paymentSessionId: order.paymentSessionId,
    provider: provider.name,
    mode: provider.mode,
  };
}
