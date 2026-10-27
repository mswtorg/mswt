import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { db } from "@/lib/db/client";
import { organizationSettings } from "@/lib/db/schema";
import type { FieldSpec, FormSectionSpec } from "@/components/admin/form-state";
import { saveOrganization } from "../actions";
import { LOCALE_FIELDS, SettingsPage } from "../SettingsPage";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  await requireCapability("settings.organization");
  const [[o], { library }] = await Promise.all([
    db.select().from(organizationSettings).where(eq(organizationSettings.id, 1)),
    editorMedia("en"),
  ]);
  const v = (x: string | null | undefined) => x ?? "";
  const localised = (field: "description" | "contactHours", label: string, textarea = false): FieldSpec[] =>
    LOCALE_FIELDS.map((l) => ({
      name: `${field}.${l.code}`,
      label: `${label} (${l.name})`,
      lang: l.lang,
      defaultValue: v(o?.[field][l.code]),
      ...(textarea ? { type: "textarea" as const, rows: 3 } : {}),
    }));
  const sections: FormSectionSpec[] = [
    {
      title: "Identity",
      description: "Names used in the footer, search results and on receipts.",
      fields: [
        { name: "legalName", label: "Legal name", required: true, defaultValue: o?.legalName },
        { name: "displayName", label: "Short name", required: true, defaultValue: o?.displayName },
        { name: "foundingDate", label: "Founded", type: "date", defaultValue: v(o?.foundingDate) },
        ...LOCALE_FIELDS.map((l) => ({
          name: `alternateNames.${l.code}`,
          label: `Other names (${l.name})`,
          hint: "Comma-separated",
          lang: l.lang,
          defaultValue: (o?.alternateNames[l.code] ?? []).join(", "),
        })),
      ],
    },
    {
      title: "Short description",
      description:
        "One or two sentences per language for search engines and link previews. Page text is edited under Content → Pages.",
      fields: localised("description", "Description", true),
    },
    {
      title: "Registrations",
      description: "Printed on receipts. Leave empty until confirmed.",
      fields: [
        { name: "trustPan", label: "Trust PAN", defaultValue: v(o?.trustPan), hint: "e.g. AAATM1234B" },
        {
          name: "trustRegistrationNo",
          label: "Trust registration no.",
          defaultValue: v(o?.trustRegistrationNo),
        },
        {
          name: "registrationAuthority",
          label: "Registered with",
          defaultValue: v(o?.registrationAuthority),
          span: "full",
        },
        { name: "reg12aNumber", label: "12A registration no.", defaultValue: v(o?.reg12aNumber) },
        { name: "reg12aDate", label: "12A date", type: "date", defaultValue: v(o?.reg12aDate) },
        {
          name: "reg80gNumber",
          label: "80G registration no.",
          defaultValue: v(o?.reg80gNumber),
          span: "full",
        },
        {
          name: "reg80gValidFrom",
          label: "80G valid from",
          type: "date",
          defaultValue: v(o?.reg80gValidFrom),
        },
        { name: "reg80gValidTo", label: "80G valid to", type: "date", defaultValue: v(o?.reg80gValidTo) },
      ],
    },
    {
      title: "Address & contact",
      description: "Shown on the Contact page and in search-engine data.",
      fields: [
        { name: "streetAddress", label: "Street address", defaultValue: v(o?.streetAddress), span: "full" },
        { name: "locality", label: "Area / locality", defaultValue: v(o?.locality) },
        { name: "city", label: "City", defaultValue: v(o?.city) },
        { name: "district", label: "District", defaultValue: v(o?.district) },
        { name: "state", label: "State", defaultValue: v(o?.state) },
        {
          name: "pincode",
          label: "PIN code",
          defaultValue: v(o?.pincode),
          inputMode: "numeric",
          maxLength: 6,
        },
        { name: "email", label: "Public email", type: "email", defaultValue: v(o?.email) },
        {
          name: "phones",
          label: "Phone numbers",
          type: "textarea",
          rows: 2,
          hint: "One per line",
          defaultValue: (o?.phones ?? []).join("\n"),
        },
        ...localised("contactHours", "Office hours"),
      ],
    },
    {
      title: "People",
      description: "Trustees on the About page; the signatory on receipts.",
      fields: [
        {
          name: "trustees",
          label: "Trustees",
          type: "textarea",
          rows: 4,
          hint: "One per line, as: Name | Role",
          defaultValue: (o?.trustees ?? []).map((t) => `${t.name} | ${t.role}`).join("\n"),
        },
        { name: "signatoryName", label: "Receipt signatory", defaultValue: v(o?.signatoryName) },
        {
          name: "signatoryTitle",
          label: "Signatory's title",
          defaultValue: v(o?.signatoryTitle),
          hint: "e.g. Managing Trustee",
        },
      ],
    },
    ...((o?.trustees ?? []).length
      ? [
          {
            title: "Trustee photos",
            description: "Shown on the About page. Save new trustees above first, then choose their photos.",
            fields: (o?.trustees ?? []).map((t, i): FieldSpec => ({
              name: `trusteePhoto.${i}`,
              label: `${t.name} (${t.role})`,
              type: "photo",
              defaultValue: t.photoMediaId ?? "",
              photos: { library },
              span: "full",
            })),
          },
        ]
      : []),
    {
      title: "Reach",
      description: "Where the Trust works and its official profiles.",
      fields: [
        {
          name: "areaServed",
          label: "Areas served",
          type: "textarea",
          rows: 2,
          hint: "One per line",
          defaultValue: (o?.areaServed ?? []).join("\n"),
        },
        {
          name: "sameAs",
          label: "Official profiles",
          type: "textarea",
          rows: 2,
          hint: "Full URLs, one per line",
          defaultValue: (o?.sameAs ?? []).join("\n"),
        },
      ],
    },
  ];
  return (
    <SettingsPage
      title="Organization"
      intro="Public facts about the Trust: footer, About and Contact pages, search-engine data and receipts."
      id="org"
      action={saveOrganization}
      sections={sections}
    />
  );
}
