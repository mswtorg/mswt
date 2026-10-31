import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { CalendarDays, Clock, HandCoins, TrendingUp } from "lucide-react";
import { requireCapability } from "@/lib/admin/guard";
import { adminNavItems } from "@/lib/admin/nav";
import { can } from "@/lib/admin/permissions";
import { inr, istDateTime, MODE_LABELS } from "@/lib/admin/format";
import { nightlyJobLate } from "@/lib/donations/cron";
import { financialYear, financialYearRange } from "@/lib/dates/fy";
import { db } from "@/lib/db/client";
import { causes, causeTranslations, donations, messages, reconciliationRuns } from "@/lib/db/schema";
import { Card, DataTable, PageHeader, StatCard, Td, Th, Tr } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Dashboard" };

const istToday = () =>
  new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}T00:00:00+05:30`,
  );

async function financeFigures() {
  const fy = financialYear(new Date());
  const { start } = financialYearRange(fy);
  const paid = eq(donations.status, "paid");
  const sum = sql<string>`coalesce(sum(${donations.totalPaise}), 0)`;
  const [[today], [year], [pending], byCause, byMode, [lastRun]] = await Promise.all([
    db
      .select({ n: count(), sum })
      .from(donations)
      .where(and(paid, gte(donations.receivedAt, istToday()))),
    db
      .select({ n: count(), sum })
      .from(donations)
      .where(and(paid, eq(donations.fy, fy))),
    db.select({ n: count() }).from(donations).where(eq(donations.status, "pending")),
    db
      .select({ title: causeTranslations.title, n: count(), sum })
      .from(donations)
      .leftJoin(causes, eq(causes.id, donations.causeId))
      .leftJoin(
        causeTranslations,
        and(eq(causeTranslations.causeId, causes.id), eq(causeTranslations.locale, "en")),
      )
      .where(and(paid, eq(donations.fy, fy)))
      .groupBy(causeTranslations.title)
      .orderBy(desc(sum)),
    db
      .select({ mode: donations.mode, n: count(), sum })
      .from(donations)
      .where(and(paid, eq(donations.fy, fy)))
      .groupBy(donations.mode),
    db.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.startedAt)).limit(1),
  ]);
  return {
    fy,
    start,
    today,
    year,
    pending,
    byCause,
    byMode,
    lastRun,
    jobLate: nightlyJobLate(lastRun, new Date()),
  };
}

export default async function Dashboard() {
  const admin = await requireCapability("dashboard.content");
  const finance = can(admin.role, "dashboard.financial");
  const [figures, recentMessages] = await Promise.all([
    finance ? financeFigures() : null,
    db.select().from(messages).orderBy(desc(messages.createdAt)).limit(5),
  ]);
  return (
    <>
      <PageHeader
        title={`Welcome, ${admin.name.split(" ")[0]}`}
        description={
          figures
            ? `Financial year ${figures.fy} (1 April – 31 March), times in IST.`
            : "Your admin overview."
        }
        actions={
          can(admin.role, "donations.offline") ? (
            <ButtonLink href="/admin/donations/new">Record offline donation</ButtonLink>
          ) : null
        }
      />
      {figures ? (
        <>
          {figures.jobLate && figures.lastRun ? (
            <Alert tone="warning">
              <p>
                <strong>
                  The nightly check hasn&apos;t finished since {istDateTime(figures.lastRun.startedAt)}.
                </strong>{" "}
                Pending payments aren&apos;t being checked and unsent receipts aren&apos;t being retried. Look
                for a &ldquo;[MSWT] [Job failed]&rdquo; email, and tell the developer.
              </p>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Today"
              value={inr(figures.today?.sum)}
              hint={`${figures.today?.n ?? 0} donations`}
              icon={<CalendarDays className="size-4" />}
            />
            <StatCard
              label={`FY ${figures.fy}`}
              value={inr(figures.year?.sum)}
              hint={`${figures.year?.n ?? 0} donations`}
              icon={<TrendingUp className="size-4" />}
            />
            <StatCard
              label="Waiting for payment"
              value={figures.pending?.n ?? 0}
              hint={<Link href="/admin/donations?status=pending">See pending</Link>}
              icon={<Clock className="size-4" />}
            />
            <StatCard
              label="Last reconciliation"
              value={figures.lastRun ? istDateTime(figures.lastRun.startedAt) : "Not run yet"}
              hint={
                figures.lastRun
                  ? `${figures.lastRun.checked} checked · ${figures.lastRun.updated} updated · ${figures.lastRun.errors.length} errors`
                  : "Runs daily at 03:00 IST"
              }
              icon={<HandCoins className="size-4" />}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <DataTable caption={`Donations by cause, FY ${figures.fy}`}>
              <thead>
                <tr>
                  <Th>Cause</Th>
                  <Th align="right">Donations</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {figures.byCause.length ? (
                  figures.byCause.map((c) => (
                    <Tr key={c.title ?? "general"}>
                      <Td header>{c.title ?? "General fund"}</Td>
                      <Td align="right">{c.n}</Td>
                      <Td align="right">{inr(c.sum)}</Td>
                    </Tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-fg-muted">
                      No donations this year yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
            <DataTable caption={`Donations by mode, FY ${figures.fy}`}>
              <thead>
                <tr>
                  <Th>Mode</Th>
                  <Th align="right">Donations</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {figures.byMode.length ? (
                  figures.byMode.map((m) => (
                    <Tr key={m.mode}>
                      <Td header>{MODE_LABELS[m.mode] ?? m.mode}</Td>
                      <Td align="right">{m.n}</Td>
                      <Td align="right">{inr(m.sum)}</Td>
                    </Tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-fg-muted">
                      No donations this year yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </div>
        </>
      ) : null}
      <Card className="grid gap-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-fg-strong">Latest messages</h2>
          <Link href="/admin/content/messages" className="text-sm text-link-default">
            All messages
          </Link>
        </div>
        {recentMessages.length ? (
          <ul className="m-0 grid list-none gap-3 p-0 text-sm">
            {recentMessages.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border-decorative pb-3 last:border-0 last:pb-0"
              >
                <span>
                  <Link href={`/admin/content/messages/${m.id}`} className="font-semibold text-link-default">
                    {m.name}
                  </Link>{" "}
                  · {m.subject}
                </span>
                <span className="text-fg-muted">{istDateTime(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-fg-muted">No messages yet.</p>
        )}
      </Card>
      {!finance ? (
        <Card className="grid gap-2 p-5">
          <h2 className="text-base font-semibold text-fg-strong">Your sections</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {adminNavItems(admin.role)
              .filter((i) => i.key !== "home")
              .map((i) => (
                <li key={i.key}>
                  <ButtonLink variant="secondary" href={i.href}>
                    {i.label}
                  </ButtonLink>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
