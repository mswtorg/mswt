import type { Metadata } from "next";
import { requireCapability } from "@/lib/admin/guard";
import { getPaymentSettingsFresh } from "@/lib/payment-settings";
import { savePayments } from "../actions";
import { SettingsPage } from "../SettingsPage";

export const metadata: Metadata = { title: "Payments" };
const rupees = (p: number) => String(p / 100);

export default async function PaymentSettingsPage() {
  await requireCapability("settings.payment");
  const s = await getPaymentSettingsFresh();
  return (
    <SettingsPage
      title="Payments"
      intro="What the donate form offers."
      id="pay"
      action={savePayments}
      sections={[
        {
          title: "Donation amounts",
          description: "In rupees. The minimum must be above ₹5; show 3 or 4 suggested amounts.",
          fields: [
            {
              name: "min",
              label: "Minimum donation (₹)",
              required: true,
              inputMode: "numeric",
              defaultValue: s ? rupees(s.minAmountPaise) : "100",
            },
            {
              name: "max",
              label: "Maximum online donation (₹)",
              inputMode: "numeric",
              hint: "Empty = no maximum",
              defaultValue: s?.maxAmountPaise ? rupees(s.maxAmountPaise) : "",
            },
            {
              name: "presets",
              label: "Suggested amounts (₹)",
              required: true,
              span: "full",
              hint: "Comma-separated, e.g. 500, 1000, 2500, 5000",
              defaultValue: (s?.presetAmountsPaise ?? []).map(rupees).join(", "),
            },
            {
              name: "panAbove",
              label: "PAN required above (₹)",
              required: true,
              inputMode: "numeric",
              hint: "Every online donation above this amount is an 80G donation: the 80G box is ticked and locked, and PAN and postal address are required.",
              defaultValue: rupees(s?.panRequiredAbovePaise ?? 100000),
            },
          ],
        },
        {
          title: "Payment charges",
          description: "Let donors add the gateway fee to their donation.",
          fields: [
            {
              name: "feeCoverEnabled",
              label: "Offer to cover payment charges",
              type: "checkbox",
              span: "full",
              defaultValue: s?.feeCoverEnabled ? "on" : "",
            },
            {
              name: "feePercent",
              label: "Charges to add (%)",
              inputMode: "numeric",
              hint: "e.g. 2 or 1.75 (0–10)",
              defaultValue: s ? String(s.feeCoverPercentBp / 100) : "0",
            },
          ],
        },
        {
          title: "Home page",
          description:
            "A small donate box beside the Home heading: suggested amounts, a cause and a Donate button that opens the donate form filled in. It only appears while online donations are switched on.",
          fields: [
            {
              name: "homeDonateBox",
              label: "Show the quick donate box on Home",
              type: "checkbox",
              span: "full",
              defaultValue: s?.homeDonateBox === false ? "" : "on",
            },
          ],
        },
      ]}
    />
  );
}
