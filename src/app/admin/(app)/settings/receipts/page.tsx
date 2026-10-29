import type { Metadata } from "next";
import Link from "next/link";
import { requireCapability } from "@/lib/admin/guard";
import { routing } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { receiptSettings } from "@/lib/db/schema";
import { defaultReceiptEmail } from "@/lib/email/templates/receipt";
import { loadReceiptTemplates } from "@/lib/receipts/templates-store";
import { REQUIRED_80G, TEMPLATE_FIELDS, type EmailTemplates } from "@/lib/receipts/template";
import { AdminForm } from "@/components/admin/AdminForm";
import { EmailTemplateBuilder, PdfTemplateBuilder } from "@/components/admin/ReceiptBuilder";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { previewReceiptTemplate, resetReceiptTemplate, saveReceiptTemplate } from "./actions";

export const metadata: Metadata = { title: "Receipts" };

const TABS = [
  { key: "80g", label: "80G receipt (PDF)" },
  { key: "acknowledgement", label: "Acknowledgement (PDF)" },
  { key: "email", label: "Receipt email" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const INTRO: Record<Tab, string> = {
  "80g":
    "The PDF for donations that qualify for 80G. It must keep the details the Income-tax rules ask for: saving is refused without them.",
  acknowledgement:
    "The PDF for donations that don't get an 80G receipt (not asked for, no PAN, cash above the limit, or a cause that isn't eligible).",
  email: "The email the receipt PDF is attached to, in each language.",
};

export default async function ReceiptSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireCapability("settings.receipts");
  const { tab: param } = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === param)?.key ?? "80g";
  const templates = await loadReceiptTemplates();
  const [row] = await db.select().from(receiptSettings).limit(1);
  const custom = tab === "80g" ? row?.pdf80g : tab === "acknowledgement" ? row?.pdfAck : row?.email;
  const emailDefaults = Object.fromEntries(
    (["80g", "acknowledgement"] as const).map((k) => [
      k,
      Object.fromEntries(routing.locales.map((l) => [l, defaultReceiptEmail(l, k)])),
    ]),
  ) as EmailTemplates;
  const formId = `receipt-${tab}`;

  return (
    <>
      <PageHeader
        title="Receipts"
        description={
          <>
            Build the receipt PDFs and the email they are sent with. The Trust’s details come from{" "}
            <Link href="/admin/settings/organization">Organization</Link>. Changes apply to new and reissued
            receipts; receipts already sent stay as they were.
          </>
        }
      />
      <nav aria-label="Templates" className="overflow-x-auto">
        <ul className="m-0 flex min-w-max list-none gap-1 border-b border-border-decorative p-0">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/admin/settings/receipts?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className="-mb-px flex min-h-11 items-center border-b-2 border-transparent px-4 text-sm font-medium text-fg-muted no-underline hover:text-fg-strong aria-[current=page]:border-action-primary-bg aria-[current=page]:text-fg-strong"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="m-0 text-sm text-fg-muted">
        {INTRO[tab]} {custom ? "This template has been edited." : "This is the built-in template."}
        {tab === "80g" ? (
          <>
            {" "}
            Required fields:{" "}
            {REQUIRED_80G.map((k) => TEMPLATE_FIELDS["80g"].find((f) => f.key === k)?.label).join(", ")}.
          </>
        ) : null}
      </p>
      <AdminForm key={tab} id={formId} action={saveReceiptTemplate} submitLabel="Save template">
        {tab === "email" ? (
          <EmailTemplateBuilder
            formId={formId}
            initial={templates.email ?? { "80g": {}, acknowledgement: {} }}
            defaults={emailDefaults}
            fields={TEMPLATE_FIELDS.email}
            preview={previewReceiptTemplate}
          />
        ) : (
          <PdfTemplateBuilder
            formId={formId}
            kind={tab}
            initial={templates.pdf[tab]}
            fields={TEMPLATE_FIELDS[tab]}
            preview={previewReceiptTemplate}
          />
        )}
      </AdminForm>
      {custom ? (
        <Card>
          <Section
            id="reset"
            title="Start again"
            description="Puts back the built-in template for this tab. The change is recorded in the audit log."
          >
            <AdminForm
              id={`${formId}-reset`}
              action={resetReceiptTemplate}
              hidden={{ part: tab }}
              confirm="Replace this template with the built-in one?"
              submitLabel="Reset to the built-in template"
              variant="secondary"
            />
          </Section>
        </Card>
      ) : null}
    </>
  );
}
