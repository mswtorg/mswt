import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { causeOptions } from "@/lib/admin/donations";
import { MODE_LABELS } from "@/lib/admin/format";
import { getPaymentSettingsFresh } from "@/lib/payment-settings";
import { AdminForm } from "@/components/admin/AdminForm";
import { PageHeader } from "@/components/admin/ui";
import { offlineAction } from "../actions";
import { CashWarning } from "./CashWarning";

export const metadata: Metadata = { title: "Record offline donation" };

export default async function NewOfflineDonation() {
  await requireCapability("donations.offline");
  const [causes, settings] = await Promise.all([causeOptions(), getPaymentSettingsFresh()]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const limit = (settings?.cash80gLimitPaise ?? 200000) / 100;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/donations", label: "All donations" }}
        title="Record offline donation"
        description="Cash, cheque, bank transfer or UPI received directly. A receipt is issued and emailed when you save."
      />
      <AdminForm
        id="offline"
        action={offlineAction}
        submitLabel="Save and issue receipt"
        sections={[
          {
            title: "Donation",
            description: "Amount in rupees; the date is when the Trust received it.",
            fields: [
              { name: "amount", label: "Amount (₹)", required: true, inputMode: "numeric" },
              {
                name: "mode",
                label: "Mode",
                type: "select",
                defaultValue: "cash",
                options: Object.entries(MODE_LABELS)
                  .filter(([k]) => k !== "online")
                  .map(([value, label]) => ({ value, label })),
              },
              { name: "receivedAt", label: "Received on", type: "date", required: true, defaultValue: today },
              {
                name: "causeId",
                label: "Towards",
                type: "select",
                defaultValue: "",
                options: [
                  { value: "", label: "General fund" },
                  ...causes.map((c) => ({ value: c.id, label: c.title ?? c.slug })),
                ],
              },
              { name: "instrumentRef", label: "Cheque no. / UTR", hint: "For cheque, transfer or UPI" },
              { name: "instrumentDate", label: "Cheque / transfer date", type: "date" },
              { name: "bankName", label: "Bank", span: "full" },
            ],
          },
          {
            title: "Donor",
            description: "A donor with the same PAN (or email and phone) is updated rather than duplicated.",
            fields: [
              { name: "name", label: "Full name", required: true, span: "full" },
              { name: "email", label: "Email", type: "email", required: true },
              { name: "phone", label: "Mobile", type: "tel", required: true, inputMode: "tel" },
            ],
          },
          {
            title: "80G receipt",
            description: "Needs PAN and address. Without them the donor gets an acknowledgement.",
            fields: [
              { name: "wants80g", label: "Issue an 80G receipt", type: "checkbox", span: "full" },
              { name: "pan", label: "PAN", maxLength: 10, hint: "e.g. ABCPE1234F" },
              { name: "line1", label: "Address line 1", span: "full" },
              { name: "line2", label: "Address line 2", span: "full" },
              { name: "city", label: "City" },
              { name: "state", label: "State" },
              { name: "pincode", label: "PIN code", inputMode: "numeric", maxLength: 6 },
            ],
          },
          {
            title: "Notes",
            fields: [
              {
                name: "notes",
                label: "Internal notes",
                type: "textarea",
                rows: 2,
                hint: "Not printed on the receipt",
              },
            ],
          },
        ]}
      >
        <CashWarning limitRupees={limit} />
      </AdminForm>
    </>
  );
}
