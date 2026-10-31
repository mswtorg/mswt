"use server";

import { actorFor } from "@/lib/admin/actor";
import { recordAudit } from "@/lib/audit";
import { withTx } from "@/lib/db/tx";
import { sendDailySummary } from "@/lib/donations/summary";
import type { FormState } from "@/components/admin/form-state";

/**
 * Admin → Settings → Email → "Send yesterday's summary now": the daily summary email without
 * waiting for the 03:00 run (and on stage, where Vercel never runs the schedule). It only reads
 * figures; the nightly payment check is not run.
 */
export async function sendSummaryNowAction(_prev: FormState): Promise<FormState> {
  const { actor } = await actorFor("settings.email");
  const { sent, error } = await sendDailySummary(new Date(), { updated: 0, errors: [] });
  await withTx((tx) =>
    recordAudit(tx, actor, {
      action: "email.summary_sent",
      entityType: "email_settings",
      after: { sent, error },
    }),
  );
  if (error) return { status: "error", errors: { form: `The summary wasn't sent: ${error}` } };
  if (!sent)
    return {
      status: "error",
      errors: { form: "Add at least one recipient under Admin alerts and save first." },
    };
  return { status: "saved", message: `Summary sent to ${sent} ${sent === 1 ? "recipient" : "recipients"}.` };
}
