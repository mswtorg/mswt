import { serverEnv } from "@/env/server";
import { isProduction } from "@/lib/secrets";

/**
 * The bearer token Vercel Cron must send to /api/cron/reconcile; null when the job is not
 * configured (no CRON_SECRET in production). Outside production a fixed development value is used.
 */
export function cronSecret(
  value: string | undefined = serverEnv.CRON_SECRET,
  production: boolean = isProduction(),
): string | null {
  if (value) return value;
  return production ? null : "development-cron-secret";
}

const LATE_AFTER_MS = 26 * 60 * 60 * 1000;

/**
 * The 03:00 job should run every day: true when the last run is over 26 hours old, or started over
 * an hour ago and never finished (the Dashboard then warns). No run at all is a new site, not late.
 */
export function nightlyJobLate(
  run: { startedAt: Date; finishedAt: Date | null } | undefined,
  now: Date,
): boolean {
  if (!run) return false;
  const age = now.getTime() - run.startedAt.getTime();
  return age > LATE_AFTER_MS || (!run.finishedAt && age > 60 * 60 * 1000);
}
