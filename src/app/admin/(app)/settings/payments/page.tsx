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
        {
          title: "Bank transfer, UPI and cheque",
          description:
            "Shown on the Donate page (and linked from Contact) for donors who pay directly, even while online donations are off. Every change is emailed to the admin alert recipients. Check each digit: donors send money to exactly what is here.",
          fields: [
            {
              name: "bankDetailsPublic",
              label: "Show these details on the site",
              type: "checkbox",
              span: "full",
              defaultValue: s?.bankDetailsPublic ? "on" : "",
            },
            {
              name: "bankAccountName",
              label: "Account name",
              hint: "Exactly as the bank has it, e.g. Munira Shoaib Welfare Trust",
              defaultValue: s?.bankAccountName ?? "",
            },
            {
              name: "bankAccountNumber",
              label: "Account number",
              inputMode: "numeric",
              autoComplete: "off",
              defaultValue: s?.bankAccountNumber ?? "",
            },
            {
              name: "bankIfsc",
              label: "IFSC",
              hint: "11 characters, e.g. SBIN0001234",
              autoComplete: "off",
              maxLength: 11,
              defaultValue: s?.bankIfsc ?? "",
            },
            {
              name: "bankAccountType",
              label: "Account type",
              type: "select",
              options: [
                { value: "", label: "Don't show" },
                { value: "savings", label: "Savings" },
                { value: "current", label: "Current" },
              ],
              defaultValue: s?.bankAccountType ?? "",
            },
            { name: "bankName", label: "Bank", defaultValue: s?.bankName ?? "" },
            { name: "bankBranch", label: "Branch", defaultValue: s?.bankBranch ?? "" },
            {
              name: "upiId",
              label: "UPI ID",
              hint: "e.g. mswelfaretrust@sbi. The site makes the QR code from it.",
              autoComplete: "off",
              defaultValue: s?.upiId ?? "",
            },
            {
              name: "chequePayee",
              label: "Cheque / DD in favour of",
              hint: "Cheques are posted to the address in Settings → Organization.",
              defaultValue: s?.chequePayee ?? "",
            },
            {
              name: "donationDetailsEmail",
              label: "Donors email their details to",
              type: "email",
              span: "full",
              hint: "Where donors send their name, PAN, address and transaction number to get a receipt. Empty: the Organization email.",
              defaultValue: s?.donationDetailsEmail ?? "",
            },
          ],
        },
      ]}
    />
  );
}
