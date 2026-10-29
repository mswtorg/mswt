import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/admin/guard";
import { getDonor } from "@/lib/admin/donors";
import { inr, istDateTime, MODE_LABELS, STATUS_LABEL, STATUS_TONE } from "@/lib/admin/format";
import { panAccessUntil, revealPans } from "@/lib/admin/pan-access";
import { can } from "@/lib/admin/permissions";
import { maskPan } from "@/lib/crypto/pii";
import { clientIp } from "@/lib/security/rate-limit";
import { AdminForm } from "@/components/admin/AdminForm";
import { PanAccessPanel } from "@/components/admin/PanAccessPanel";
import { Card, DataTable, Details, PageHeader, Section, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { mergeDonorAction, updateDonorAction } from "../actions";

export const metadata: Metadata = { title: "Donor" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function DonorPage({ params, searchParams }: Props) {
  const admin = await requireCapability("donations.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const found = await getDonor(id);
  if (!found) notFound();
  const { donor, history } = found;
  const h = await headers();
  const [until, revealed] = await Promise.all([
    panAccessUntil(admin.id),
    revealPans(admin.id, [{ entityType: "donor", entityId: id, panEnc: donor.panEnc }], {
      userId: admin.id,
      ip: clientIp(h),
      userAgent: h.get("user-agent"),
    }),
  ]);
  const paid = history.filter((d) => d.status === "paid");
  const merged = (await searchParams).merged;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/donors", label: "All donors" }}
        title={donor.fullName}
        description={`${donor.email} · ${donor.phone} · ${paid.length} paid donations · ${inr(paid.reduce((t, d) => t + d.totalPaise, 0))}`}
        actions={donor.mergedIntoId ? <Badge tone="info">Merged</Badge> : null}
      />
      {merged ? (
        <Alert tone="success" live="polite">
          <p>Donor merged. All donations are now on this record.</p>
        </Alert>
      ) : null}
      {donor.mergedIntoId ? (
        <Alert tone="info">
          <p>
            This record was merged into{" "}
            <Link href={`/admin/donors/${donor.mergedIntoId}`}>another donor</Link>.
          </p>
        </Alert>
      ) : null}
      {donor.panEnc ? <PanAccessPanel until={until} path={`/admin/donors/${id}`} /> : null}
      <DataTable caption="Donations by this donor">
        <thead>
          <tr>
            <Th>Date (IST)</Th>
            <Th>Order</Th>
            <Th>Mode</Th>
            <Th>Status</Th>
            <Th>80G</Th>
            <Th align="right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {history.map((d) => (
            <Tr key={d.id}>
              <Td>{istDateTime(d.receivedAt ?? d.createdAt)}</Td>
              <Td header>
                <Link
                  href={`/admin/donations/${d.id}`}
                  className="text-link-default underline underline-offset-4"
                >
                  {d.orderId}
                </Link>
              </Td>
              <Td>{MODE_LABELS[d.mode] ?? d.mode}</Td>
              <Td>
                <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
              </Td>
              <Td>{d.wants80g ? "Asked for" : "No"}</Td>
              <Td align="right">{inr(d.totalPaise)}</Td>
            </Tr>
          ))}
        </tbody>
      </DataTable>
      <Card>
        <Section id="record" title="Record" description="PAN is changed only by reissuing a receipt.">
          <Details
            items={[
              {
                label: "PAN",
                value: revealed.get(id) ?? (donor.panLast4 ? maskPan(donor.panLast4) : "Not given"),
              },
              {
                label: "Address",
                value:
                  [donor.addressLine1, donor.addressLine2, donor.city, donor.state, donor.pincode]
                    .filter(Boolean)
                    .join(", ") || null,
              },
              { label: "Added", value: `${istDateTime(donor.createdAt)} (${donor.createdVia})` },
              { label: "Indian citizen declared", value: istDateTime(donor.declaredAt) },
              { label: "Marketing consent", value: donor.consentMarketing ? "Yes" : "No" },
            ]}
          />
        </Section>
        {can(admin.role, "receipts.manage") && !donor.mergedIntoId ? (
          <Section
            id="contact"
            title="Contact details"
            description="Used for future emails. Receipts already issued keep the old details."
          >
            <AdminForm
              id="contact"
              action={updateDonorAction.bind(null, id)}
              submitLabel="Save details"
              fields={[
                {
                  name: "fullName",
                  label: "Full name",
                  required: true,
                  defaultValue: donor.fullName,
                  span: "full",
                },
                { name: "email", label: "Email", type: "email", required: true, defaultValue: donor.email },
                { name: "phone", label: "Mobile", type: "tel", required: true, defaultValue: donor.phone },
                {
                  name: "addressLine1",
                  label: "Address line 1",
                  defaultValue: donor.addressLine1 ?? "",
                  span: "full",
                },
                {
                  name: "addressLine2",
                  label: "Address line 2",
                  defaultValue: donor.addressLine2 ?? "",
                  span: "full",
                },
                { name: "city", label: "City", defaultValue: donor.city ?? "" },
                { name: "state", label: "State", defaultValue: donor.state ?? "" },
                {
                  name: "pincode",
                  label: "PIN code",
                  defaultValue: donor.pincode ?? "",
                  inputMode: "numeric",
                  maxLength: 6,
                },
              ]}
            />
          </Section>
        ) : null}
        {can(admin.role, "donors.merge") && !donor.mergedIntoId ? (
          <Section
            id="merge"
            title="Merge duplicate"
            description="Moves all donations from this record to another donor and hides this one. Donors with different PANs can't be merged."
          >
            <AdminForm
              id="merge"
              action={mergeDonorAction.bind(null, id)}
              submitLabel="Merge into that donor"
              variant="danger"
              confirm={`Move all of ${donor.fullName}'s donations to the other donor and hide this record?`}
              fields={[
                {
                  name: "target",
                  label: "Other donor",
                  required: true,
                  span: "full",
                  hint: "Paste the address of their donor page (or their ID)",
                },
              ]}
            />
          </Section>
        ) : null}
      </Card>
    </>
  );
}
