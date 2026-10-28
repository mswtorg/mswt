import { timingSafeEqual } from "node:crypto";
import { reconcile } from "@/lib/donations/reconcile";
import { cronSecret } from "@/lib/donations/cron";
import { sendDailySummary } from "@/lib/donations/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Vercel Cron (vercel.json, 03:00 IST). Vercel sends "Authorization: Bearer $CRON_SECRET".
 * Runs the daily check, then emails the admins yesterday's summary.
 */
export async function GET(request: Request) {
  const secret = cronSecret();
  // Without CRON_SECRET in production the job can't be authenticated: answer clearly, don't crash.
  if (!secret)
    return Response.json(
      { error: "Not configured: set CRON_SECRET in the Vercel environment" },
      { status: 503, headers: NO_STORE },
    );
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return Response.json({ error: "Unauthorised" }, { status: 401, headers: NO_STORE });
  const now = new Date();
  const result = await reconcile(undefined, now);
  const summary = await sendDailySummary(now, result).catch((error) => {
    console.error("Daily summary failed", error);
    return { sent: 0 };
  });
  return Response.json({ ...result, summarySent: summary.sent }, { headers: NO_STORE });
}
