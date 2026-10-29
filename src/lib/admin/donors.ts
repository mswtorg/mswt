import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { donations, donors } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { normalisePhone } from "@/lib/donations/schema";

// Donor records (spec §5 Donors). Merged donors stay for history and are hidden from lists.

export const DONOR_PAGE_SIZE = 50;

export async function searchDonors(q: string | undefined, page = 1) {
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const where = and(
    isNull(donors.mergedIntoId),
    like ? or(ilike(donors.fullName, like), ilike(donors.email, like), ilike(donors.phone, like)) : undefined,
  );
  const paid = sql`${donations.status} = 'paid'`;
  const rows = await db
    .select({
      id: donors.id,
      name: donors.fullName,
      email: donors.email,
      phone: donors.phone,
      city: donors.city,
      panLast4: donors.panLast4,
      createdVia: donors.createdVia,
      count: sql<number>`count(${donations.id}) filter (where ${paid})::int`,
      totalPaise: sql<number>`coalesce(sum(${donations.totalPaise}) filter (where ${paid}), 0)::bigint`,
      last: sql<Date | null>`max(${donations.receivedAt})`,
    })
    .from(donors)
    .leftJoin(donations, eq(donations.donorId, donors.id))
    .where(where)
    .groupBy(donors.id)
    .orderBy(sql`max(${donations.receivedAt}) desc nulls last`, donors.fullName)
    .limit(DONOR_PAGE_SIZE)
    .offset((page - 1) * DONOR_PAGE_SIZE);
  const [total] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(donors)
    .where(where);
  return { rows: rows.map((r) => ({ ...r, totalPaise: Number(r.totalPaise) })), total: total?.n ?? 0 };
}

export async function getDonor(id: string) {
  const [donor] = await db.select().from(donors).where(eq(donors.id, id));
  if (!donor) return null;
  const history = await db
    .select({
      id: donations.id,
      orderId: donations.publicOrderId,
      totalPaise: donations.totalPaise,
      mode: donations.mode,
      status: donations.status,
      wants80g: donations.wants80g,
      receivedAt: donations.receivedAt,
      createdAt: donations.createdAt,
    })
    .from(donations)
    .where(eq(donations.donorId, id))
    .orderBy(desc(sql`coalesce(${donations.receivedAt}, ${donations.createdAt})`));
  return { donor, history };
}

export const DonorContactInput = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  phone: z
    .string()
    .transform(
      (v, ctx) =>
        normalisePhone(v) ??
        (ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number" }), z.NEVER),
    ),
  addressLine1: z.string().trim().max(200),
  addressLine2: z.string().trim().max(200),
  city: z.string().trim().max(80),
  state: z.string().trim().max(80),
  pincode: z
    .string()
    .trim()
    .regex(/^([1-9][0-9]{5})?$/, "6-digit PIN code"),
});

/**
 * Contact details on the donor record. Receipts already issued keep their snapshot; correcting a
 * receipt is a reissue on the donation (spec §4.10).
 */
export async function updateDonorContact(id: string, input: z.input<typeof DonorContactInput>, actor: Actor) {
  const d = DonorContactInput.parse(input);
  const blank = (v: string) => v || null;
  await withTx(async (tx) => {
    const [before] = await tx.select().from(donors).where(eq(donors.id, id)).for("update");
    if (!before) throw new Error("Donor not found");
    const after = {
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      addressLine1: blank(d.addressLine1),
      addressLine2: blank(d.addressLine2),
      city: blank(d.city),
      state: blank(d.state),
      pincode: blank(d.pincode),
    };
    await tx
      .update(donors)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(donors.id, id));
    const pick = (o: typeof before) => ({
      fullName: o.fullName,
      email: o.email,
      phone: o.phone,
      city: o.city,
    });
    await recordAudit(tx, actor, {
      action: "donor.update",
      entityType: "donor",
      entityId: id,
      before: pick(before),
      after,
    });
  });
}

export class MergeError extends Error {}

/** Moves every donation of `sourceId` to `targetId` and marks the source as merged. */
export async function mergeDonors(sourceId: string, targetId: string, actor: Actor) {
  if (sourceId === targetId) throw new MergeError("A donor can't be merged into itself.");
  await withTx(async (tx) => {
    const rows = await tx
      .select()
      .from(donors)
      .where(or(eq(donors.id, sourceId), eq(donors.id, targetId)))
      .for("update");
    const source = rows.find((r) => r.id === sourceId);
    const target = rows.find((r) => r.id === targetId);
    if (!source || !target) throw new MergeError("Donor not found.");
    if (source.mergedIntoId || target.mergedIntoId)
      throw new MergeError("One of these donors was already merged.");
    if (source.panHmac && target.panHmac && source.panHmac !== target.panHmac)
      throw new MergeError("These donors have different PANs, so they are different people.");
    const moved = await tx
      .update(donations)
      .set({ donorId: targetId, updatedAt: new Date() })
      .where(eq(donations.donorId, sourceId))
      .returning({ id: donations.id });
    // The PAN moves to the target if only the source had one (unique index: clear source first).
    const pan =
      !target.panHmac && source.panHmac
        ? { panEnc: source.panEnc, panLast4: source.panLast4, panHmac: source.panHmac }
        : null;
    await tx
      .update(donors)
      .set({
        mergedIntoId: targetId,
        ...(pan ? { panEnc: null, panLast4: null, panHmac: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(donors.id, sourceId));
    if (pan)
      await tx
        .update(donors)
        .set({ ...pan, updatedAt: new Date() })
        .where(eq(donors.id, targetId));
    await recordAudit(tx, actor, {
      action: "donor.merge",
      entityType: "donor",
      entityId: targetId,
      after: { mergedFrom: sourceId, sourceName: source.fullName, donationsMoved: moved.length },
    });
  });
}
