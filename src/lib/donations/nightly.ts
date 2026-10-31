import { istDateTime } from "@/lib/admin/format";
import { sendAdminAlert } from "@/lib/email/alerts";
import { jobFailedAlert } from "@/lib/email/templates/alerts";
import { appOrigin } from "@/lib/seo/site";
import { reconcile } from "./reconcile";
import { sendDailySummary } from "./summary";

type Check = Awaited<ReturnType<typeof reconcile>>;

/**
 * The 03:00 IST job (/api/cron/reconcile): the daily check, then yesterday's summary to the admins.
 * If either step throws, the admins get "[MSWT] [Job failed]" instead, so a broken job is noticed.
 * `check` and `summary` are replaceable for tests.
 */
export async function runNightlyJob(
  now: Date = new Date(),
  steps: {
    check?: (now: Date) => Promise<Check>;
    summary?: (now: Date, check: Check) => Promise<{ sent: number; error?: string }>;
  } = {},
): Promise<{ ok: true; result: Check; summarySent: number } | { ok: false; error: string }> {
  const { check = (at) => reconcile(undefined, at), summary = sendDailySummary } = steps;
  let stage = "Daily check (payments and receipts)";
  try {
    const result = await check(now);
    stage = "Daily summary email";
    const sent = await summary(now, result);
    return { ok: true, result, summarySent: sent.sent };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Nightly job failed during ${stage}`, e);
    await sendAdminAlert(
      "jobFailed",
      jobFailedAlert({
        job: "Nightly check",
        stage,
        error,
        at: istDateTime(now),
        adminUrl: `${appOrigin()}/admin`,
      }),
      { entityType: "reconciliation" },
    );
    return { ok: false, error };
  }
}
