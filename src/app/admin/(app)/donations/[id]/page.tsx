import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { requireCapability } from "@/lib/admin/guard";
import { inr, istDateTime, MODE_LABELS, STATUS_LABEL, STATUS_TONE } from "@/lib/admin/format";
import { panAccessUntil, revealPans } from "@/lib/admin/pan-access";
import { can } from "@/lib/admin/permissions";
import { maskPan } from "@/lib/crypto/pii";
import { db } from "@/lib/db/client";
import {
  auditLog,
  causes,
  causeTranslations,
  donations,
  donors,
  paymentEvents,
  receipts,
  users,
} from "@/lib/db/schema";
import { receiptLinkQuery } from "@/lib/receipts/links";
import { clientIp } from "@/lib/security/rate-limit";
import { AdminForm } from "@/components/admin/AdminForm";
import { PanAccessPanel } from "@/components/admin/PanAccessPanel";
import { Card, Details, PageHeader, Section } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { reissueAction, resendAction, voidAction } from "../actions";

export const metadata: Metadata = { title: "Donation" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function DonationPage({ params, searchParams }: Props) {
  const admin = await requireCapability("donations.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db
    .select({ d: donations, donor: donors, causeTitle: causeTranslations.title })
    .from(donations)
    .innerJoin(donors, eq(donors.id, donations.donorId))
    .leftJoin(causes, eq(causes.id, donations.causeId))
    .leftJoin(
      causeTranslations,
      and(eq(causeTranslations.causeId, causes.id), eq(causeTranslations.locale, "en")),
    )
    .where(eq(donations.id, id));
  if (!row) notFound();
  const { d, donor } = row;
  const [allReceipts, events, history, until] = await Promise.all([
    db.select().from(receipts).where(eq(receipts.donationId, id)).orderBy(desc(receipts.issuedAt)),
    db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.donationId, id))
      .orderBy(desc(paymentEvents.receivedAt)),
    db
      .select({ log: auditLog, actor: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(eq(auditLog.entityId, id))
      .orderBy(desc(auditLog.createdAt)),
    panAccessUntil(admin.id),
  ]);
  const live = allReceipts.find((r) => !r.voidedAt);
  const h = await headers();
  const revealed = await revealPans(
    admin.id,
    [{ entityType: "donation", entityId: id, panEnc: d.panEncSnapshot }],
    {
      userId: admin.id,
      ip: clientIp(h),
      userAgent: h.get("user-agent"),
    },
  );
  const pan = revealed.get(id) ?? (d.panLast4Snapshot ? maskPan(d.panLast4Snapshot) : null);
  const manage = can(admin.role, "receipts.manage");
  const a = d.addressSnapshot;
  const timeline = [
    ...events.map((e) => ({
      at: e.receivedAt,
      text: `Gateway: ${e.eventType}${e.error ? ` (error: ${e.error})` : ""}`,
    })),
    ...history.map((h2) => ({ at: h2.log.createdAt, text: `${h2.log.action} by ${h2.actor ?? "system"}` })),
    { at: d.createdAt, text: `Donation started (${MODE_LABELS[d.mode] ?? d.mode})` },
  ].sort((x, y) => y.at.getTime() - x.at.getTime());
  const created = (await searchParams).created;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/donations", label: "All donations" }}
        title={`${inr(d.totalPaise)} from ${d.nameSnapshot}`}
        description={`Order ${d.publicOrderId} · ${MODE_LABELS[d.mode] ?? d.mode} · ${istDateTime(d.receivedAt ?? d.createdAt)}`}
        actions={
          <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
        }
      />
      {created ? (
        <Alert tone="success" live="polite">
          <p>Offline donation recorded{live ? ` with receipt ${live.number}` : ""}.</p>
        </Alert>
      ) : null}
      {d.panEncSnapshot ? <PanAccessPanel until={until} path={`/admin/donations/${id}`} /> : null}
      <Card>
        <Section id="donor" title="Donor" description="As recorded when the donation was made.">
          <Details
            items={[
              { label: "Name", value: d.nameSnapshot },
              { label: "Email", value: d.emailSnapshot },
              { label: "Phone", value: donor.phone },
              {
                label: "80G receipt",
                value: d.wants80g ? "Asked for" : "Not asked for",
              },
              { label: "PAN", value: pan ?? (d.wants80g ? null : "Not needed") },
              {
                label: "Address",
                value: a ? [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ") : null,
              },
              { label: "Donor record", value: <Link href={`/admin/donors/${donor.id}`}>Open donor</Link> },
              { label: "Shown publicly", value: d.isAnonymous ? "No (anonymous)" : "Yes" },
              { label: "Language", value: d.locale },
            ]}
          />
        </Section>
        <Section id="payment" title="Payment">
          <Details
            items={[
              { label: "Donation", value: inr(d.amountPaise) },
              { label: "Charges covered", value: inr(d.feeCoverPaise) },
              { label: "Total", value: inr(d.totalPaise) },
              { label: "Cause", value: row.causeTitle ?? "General fund" },
              { label: "Financial year", value: d.fy },
              { label: "Received", value: istDateTime(d.receivedAt) },
              {
                label: "Gateway payment",
                value: d.providerPaymentId
                  ? `${d.providerPaymentId}${d.providerPaymentMethod ? ` (${d.providerPaymentMethod})` : ""}`
                  : null,
              },
              {
                label: "Instrument",
                value: [d.instrumentRef, d.instrumentDate, d.bankName].filter(Boolean).join(", ") || null,
              },
              { label: "Notes", value: d.notes },
            ]}
          />
        </Section>
        <Section id="receipts" title="Receipts" description="Voided receipts keep their numbers.">
          {allReceipts.length ? (
            <ul className="m-0 grid list-none gap-3 p-0 text-sm">
              {allReceipts.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-decorative p-3"
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold text-fg-strong">
                      {r.number}{" "}
                      <Badge tone={r.voidedAt ? "error" : "success"}>
                        {r.voidedAt ? "Void" : r.kind === "80g" ? "80G" : "Acknowledgement"}
                      </Badge>
                    </span>
                    <span className="text-fg-muted">
                      Issued {istDateTime(r.issuedAt)}
                      {r.emailedAt ? ` · emailed ${istDateTime(r.emailedAt)}` : " · not emailed yet"}
                      {r.voidReason ? ` · ${r.voidReason}` : ""}
                    </span>
                  </span>
                  <a
                    href={`/api/receipts/${d.publicOrderId}?${receiptLinkQuery(d.publicOrderId)}`}
                    className="text-link-default"
                  >
                    Download PDF
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-fg-muted">No receipt: the donation isn’t paid.</p>
          )}
        </Section>
        {manage && live ? (
          <>
            <Section id="resend" title="Resend" description={`Emails the same PDF to ${d.emailSnapshot}.`}>
              <AdminForm
                id="resend"
                action={resendAction.bind(null, live.id, id)}
                submitLabel="Resend receipt"
                variant="secondary"
                fields={[]}
              />
            </Section>
            <Section
              id="reissue"
              title="Correct and reissue"
              description="Voids the current receipt and issues a new number (same financial year only). Use it to fix the name or address, or to add a PAN for an 80G receipt."
            >
              <AdminForm
                id="reissue"
                action={reissueAction.bind(null, id)}
                submitLabel="Reissue receipt"
                confirm={`Void ${live.number} and issue a new receipt?`}
                fields={[
                  {
                    name: "name",
                    label: "Name on receipt",
                    required: true,
                    defaultValue: d.nameSnapshot,
                    span: "full",
                  },
                  {
                    name: "wants80g",
                    label: "80G receipt (needs PAN)",
                    type: "checkbox",
                    defaultValue: d.wants80g ? "on" : "",
                  },
                  {
                    name: "pan",
                    label: "PAN",
                    defaultValue: revealed.get(id) ?? "",
                    hint:
                      d.panLast4Snapshot && !revealed.get(id)
                        ? `Current: ${maskPan(d.panLast4Snapshot)}. Enter it again to keep it.`
                        : "e.g. ABCDE1234F",
                    maxLength: 10,
                  },
                  { name: "line1", label: "Address line 1", defaultValue: a?.line1 ?? "", span: "full" },
                  { name: "line2", label: "Address line 2", defaultValue: a?.line2 ?? "", span: "full" },
                  { name: "city", label: "City", defaultValue: a?.city ?? "" },
                  { name: "state", label: "State", defaultValue: a?.state ?? "" },
                  {
                    name: "pincode",
                    label: "PIN code",
                    defaultValue: a?.pincode ?? "",
                    inputMode: "numeric",
                    maxLength: 6,
                  },
                  {
                    name: "reason",
                    label: "Reason",
                    required: true,
                    span: "full",
                    hint: "Kept with the voided receipt",
                  },
                ]}
              />
            </Section>
            <Section
              id="void"
              title="Void"
              description="Cancels the receipt without a replacement (for example, a refund handled outside Cashfree)."
            >
              <AdminForm
                id="void"
                action={voidAction.bind(null, live.id, id)}
                submitLabel="Void receipt"
                variant="danger"
                confirm={`Void ${live.number}? This can’t be undone.`}
                fields={[{ name: "reason", label: "Reason", required: true, span: "full" }]}
              />
            </Section>
          </>
        ) : null}
        <Section id="timeline" title="Timeline">
          <ol className="m-0 grid list-none gap-2 p-0 text-sm">
            {timeline.map((t, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span className="text-fg-default">{t.text}</span>
                <span className="text-fg-muted">{istDateTime(t.at)}</span>
              </li>
            ))}
          </ol>
        </Section>
      </Card>
    </>
  );
}
