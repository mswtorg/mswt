import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { recordAudit, type Actor } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { paymentSettings } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/tx";
import { PaymentSettingsInput } from "./payment-settings-input";
import { BANK_FIELDS, bankChanges, type BankDetails } from "./donations/bank";

export { MIN_AMOUNT_FLOOR_PAISE, PaymentSettingsInput } from "./payment-settings-input";

export type PaymentSettings = typeof paymentSettings.$inferSelect;
export const PAYMENT_SETTINGS_TAG = "settings:payment";

const read = async (): Promise<PaymentSettings | null> =>
  (await db.select().from(paymentSettings).limit(1))[0] ?? null;

export const getPaymentSettings = unstable_cache(read, ["settings-payment"], {
  tags: [PAYMENT_SETTINGS_TAG],
});

/** Uncached read for server actions that must use the current limits. */
export const getPaymentSettingsFresh = read;

/** The only write path for payment settings (admin, settings-sync): validated and audited. */
export async function updatePaymentSettings(
  tx: Tx,
  input: PaymentSettingsInput,
  actor: Actor,
): Promise<void> {
  const data = PaymentSettingsInput.parse(input);
  const [before] = await tx.select().from(paymentSettings).where(eq(paymentSettings.id, 1)).for("update");
  const row = {
    ...data,
    presetAmountsPaise: [...data.presetAmountsPaise].sort((a, b) => a - b),
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };
  await tx.update(paymentSettings).set(row).where(eq(paymentSettings.id, 1));
  await recordAudit(tx, actor, {
    action: "settings.payment.update",
    entityType: "payment_settings",
    entityId: "1",
    // Bank details have their own entry (settings.bank.update).
    before:
      before &&
      Object.fromEntries(
        Object.entries(before).filter(([k]) => !(BANK_FIELDS as readonly string[]).includes(k)),
      ),
    after: row,
  });
}

/**
 * Saves the bank transfer, UPI and cheque details (audited). Returns what changed, for the alert
 * the caller sends after the transaction commits.
 */
/** `data` is BankDetailsInput's parsed output. */
export async function updateBankDetails(tx: Tx, data: BankDetails, actor: Actor) {
  const [row] = await tx.select().from(paymentSettings).where(eq(paymentSettings.id, 1)).for("update");
  const before = row ? Object.fromEntries(BANK_FIELDS.map((k) => [k, row[k]])) : undefined;
  const changes = bankChanges(before, data);
  if (!changes.length) return changes;
  await tx
    .update(paymentSettings)
    .set({ ...data, updatedBy: actor.userId, updatedAt: new Date() })
    .where(eq(paymentSettings.id, 1));
  // The same labels and masked values as the alert.
  await recordAudit(tx, actor, {
    action: "settings.bank.update",
    entityType: "payment_settings",
    entityId: "1",
    before: Object.fromEntries(changes.map((c) => [c.label, c.before])),
    after: Object.fromEntries(changes.map((c) => [c.label, c.after])),
  });
  return changes;
}
