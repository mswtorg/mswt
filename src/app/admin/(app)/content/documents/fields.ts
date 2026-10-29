import type { FormSectionSpec } from "@/components/admin/form-state";
import type { DocumentKind } from "@/lib/content/document-kinds";

export const KIND_LABEL: Record<DocumentKind, string> = {
  annual_report: "Annual report",
  audited_accounts: "Audited accounts",
  other: "Other document",
  cert_12a: "Certificate: 12A registration",
  cert_80g: "Certificate: 80G registration",
  cert_registration: "Certificate: Trust registration",
  cert_pan: "Certificate: PAN",
  cert_other: "Certificate: other",
};

export function documentSections(
  d: { fy: string | null; kind: string; status: string } | null,
): FormSectionSpec[] {
  return [
    {
      title: "Settings",
      description:
        "Reports are listed on the Transparency page by financial year; certificates in their own section, with no year.",
      fields: [
        {
          name: "fy",
          label: "Financial year",
          maxLength: 7,
          defaultValue: d?.fy ?? "",
          hint: "e.g. 2025-26. Leave empty for certificates.",
        },
        {
          name: "kind",
          label: "Type",
          type: "select",
          defaultValue: d?.kind ?? "annual_report",
          options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: d?.status ?? "draft",
          options: [
            { value: "draft", label: "Draft (not on the site)" },
            { value: "published", label: "Published" },
          ],
        },
      ],
    },
  ];
}
