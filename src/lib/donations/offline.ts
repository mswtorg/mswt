import { z } from "zod";
import { recordAudit, type Actor } from "@/lib/audit";
import { donations } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { PAN_RE, normalisePhone } from "./schema";
import { markPaidAndIssueReceipt } from "./confirm";
import { newPublicOrderId, upsertDonor } from "./create";
import { deliverAndAlert } from "./alerts";

// Offline donation entry (cash, cheque, NEFT, UPI to the Trust's account) by an Accountant or
// Super Admin. The admin form arrives in Step 8; it calls this service, which issues the receipt
// through the same numbering as online payments and writes an audit entry.
export const OfflineDonationInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  phone: z.string().transform((v, ctx) => normalisePhone(v) ?? (ctx.addIssue({ code: "custom" }), z.NEVER)),
  pan: z.string().trim().toUpperCase().regex(PAN_RE).nullable(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().regex(/^[1-9][0-9]{5}$/),
    })
    .nullable(),
  amountPaise: z.number().int().positive(),
  causeId: z.uuid().nullable(),
  mode: z.enum(["cash", "cheque", "neft", "upi_offline"]),
  instrumentRef: z.string().trim().max(60).nullable(),
  instrumentDate: z.iso.date().nullable(),
  bankName: z.string().trim().max(120).nullable(),
  receivedAt: z.coerce.date(),
  wants80g: z.boolean(),
  notes: z.string().max(1000).nullable(),
});
export type OfflineDonationInput = z.input<typeof OfflineDonationInput>;

export async function recordOfflineDonation(input: OfflineDonationInput, actor: Actor & { userId: string }) {
  const d = OfflineDonationInput.parse(input);
  const result = await withTx(async (tx) => {
    const donor = await upsertDonor(tx, {
      fullName: d.name,
      email: d.email,
      phone: d.phone,
      pan: d.pan,
      address: d.address,
      createdVia: "offline",
    });
    const [row] = await tx
      .insert(donations)
      .values({
        publicOrderId: newPublicOrderId(),
        donorId: donor.id,
        causeId: d.causeId,
        amountPaise: d.amountPaise,
        totalPaise: d.amountPaise,
        mode: d.mode,
        status: "created",
        instrumentRef: d.instrumentRef,
        instrumentDate: d.instrumentDate,
        bankName: d.bankName,
        wants80g: d.wants80g,
        nameSnapshot: d.name,
        emailSnapshot: d.email,
        panEncSnapshot: d.pan ? donor.panEnc : null,
        panLast4Snapshot: d.pan ? donor.panLast4 : null,
        addressSnapshot: d.address,
        enteredByUserId: actor.userId,
        notes: d.notes,
      })
      .returning({ id: donations.id, publicOrderId: donations.publicOrderId });
    const issued = await markPaidAndIssueReceipt(tx, row!.id, { receivedAt: d.receivedAt });
    await recordAudit(tx, actor, {
      action: "donation.offline.create",
      entityType: "donation",
      entityId: row!.id,
      after: { mode: d.mode, amountPaise: d.amountPaise, receipt: issued.receiptNumber },
    });
    return { donationId: row!.id, publicOrderId: row!.publicOrderId, ...issued };
  });
  await deliverAndAlert(result.receiptId);
  return result;
}
