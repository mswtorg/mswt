import { and, count, eq, gte, inArray, isNotNull, isNull, lt, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { donations, messages, paymentEvents, receipts } from "@/lib/db/schema";
import { formatDate } from "@/lib/dates/format";
import { istParts } from "@/lib/dates/fy";
import { sendAdminAlert } from "@/lib/email/alerts";
import { dailySummaryEmail, summaryIsEmpty, type DailySummary } from "@/lib/email/templates/alerts";
import { appOrigin } from "@/lib/seo/site";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MODE_LABEL: Record<string, string> = {
  online: "Online",
  cash: "Cash",
  cheque: "Cheque",
  neft: "Bank transfer",
  upi_offline: "UPI (offline)",
};

/** The India-time calendar day before `now`, as [start, end). The cron runs at 03:00 IST. */
export function previousIstDay(now: Date): { start: Date; end: Date } {
  const { year, month, day } = istParts(now);
  const end = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
  return { start: new Date(end.getTime() - 24 * 3600 * 1000), end };
}

/** Yesterday's figures (IST) plus what the daily check just found. */
export async function buildDailySummary(
  now: Date,
  check: { updated: number; errors: { orderId: string; error: string }[] },
): Promise<DailySummary> {
  const { start, end } = previousIstDay(now);
  const inDay = (col: typeof donations.receivedAt | typeof messages.createdAt | typeof receipts.voidedAt) =>
    and(gte(col, start), lt(col, end));
  const [byMode, [refunds], [unsent], [newMessages], eventErrors] = await Promise.all([
    db
      .select({ mode: donations.mode, count: count(), total: sum(donations.totalPaise).mapWith(Number) })
      .from(donations)
      .where(and(inArray(donations.status, ["paid", "refunded"]), inDay(donations.receivedAt)))
      .groupBy(donations.mode)
      .orderBy(donations.mode),
    db
      .select({ n: count() })
      .from(receipts)
      .innerJoin(donations, eq(donations.id, receipts.donationId))
      .where(and(eq(donations.status, "refunded"), inDay(receipts.voidedAt))),
    db
      .select({ n: count() })
      .from(receipts)
      .where(and(isNull(receipts.voidedAt), isNull(receipts.emailedAt), lt(receipts.issuedAt, now))),
    db.select({ n: count() }).from(messages).where(inDay(messages.createdAt)),
    db
      .select({
        orderId: donations.publicOrderId,
        eventId: paymentEvents.providerEventId,
        error: paymentEvents.error,
      })
      .from(paymentEvents)
      .leftJoin(donations, eq(donations.id, paymentEvents.donationId))
      .where(
        and(
          isNotNull(paymentEvents.error),
          gte(paymentEvents.receivedAt, start),
          lt(paymentEvents.receivedAt, now),
          sql`${paymentEvents.error} not like 'Refund recorded, donation unchanged%'`,
        ),
      )
      .limit(50),
  ]);
  return {
    day: formatDate("en", start),
    count: byMode.reduce((n, m) => n + m.count, 0),
    totalPaise: byMode.reduce((n, m) => n + (m.total ?? 0), 0),
    byMode: byMode.map((m) => ({
      mode: MODE_LABEL[m.mode] ?? m.mode,
      count: m.count,
      totalPaise: m.total ?? 0,
    })),
    refunds: refunds?.n ?? 0,
    fixedByCheck: check.updated,
    receiptsNotEmailed: unsent?.n ?? 0,
    newMessages: newMessages?.n ?? 0,
    problems: [
      ...check.errors.map((e) => ({ reference: e.orderId, error: e.error })),
      ...eventErrors.map((e) => ({ reference: e.orderId ?? e.eventId, error: e.error ?? "" })),
    ],
    adminUrl: `${appOrigin()}/admin/donations`,
  };
}

/** "[MSWT] [Daily summary] …", only when something happened or something is wrong. */
export async function sendDailySummary(
  now: Date,
  check: { updated: number; errors: { orderId: string; error: string }[] },
): Promise<boolean> {
  const summary = await buildDailySummary(now, check);
  if (summaryIsEmpty(summary)) return false;
  await sendAdminAlert("dailySummary", dailySummaryEmail(summary), { entityType: "reconciliation" });
  return true;
}
