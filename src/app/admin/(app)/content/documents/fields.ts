import type { FormSectionSpec } from "@/components/admin/form-state";

export const KIND_LABEL = {
  annual_report: "Annual report",
  audited_accounts: "Audited accounts",
  other: "Other document",
} as const;

export function documentSections(d: { fy: string; kind: string; status: string } | null): FormSectionSpec[] {
  return [
    {
      title: "Settings",
      description: "Documents are listed on the Transparency page by financial year.",
      fields: [
        {
          name: "fy",
          label: "Financial year",
          required: true,
          maxLength: 7,
          defaultValue: d?.fy ?? "",
          hint: "e.g. 2025-26",
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
