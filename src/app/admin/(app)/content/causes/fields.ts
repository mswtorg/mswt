import { CAUSE_STATUSES } from "@/lib/admin/causes";
import type { FieldSpec } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";

type CauseDefaults = {
  slug?: string;
  status?: string;
  goalPaise?: number | null;
  is80gEligible?: boolean;
  sortOrder?: number;
  coverImageId?: string | null;
  photoIds?: string[];
};

const STATUS_LABELS: Record<(typeof CAUSE_STATUSES)[number], string> = {
  draft: "Draft (not on the site)",
  active: "Active (taking donations)",
  closed: "Closed (shown, no new donations)",
};

/** The cause settings form (new and edit). */
export function causeFields(c: CauseDefaults, library: LibraryItem[], published: boolean): FieldSpec[] {
  return [
    {
      name: "slug",
      label: "Web address",
      required: true,
      maxLength: 80,
      defaultValue: c.slug ?? "",
      hint: published
        ? "Part of the link: /en/causes/… Changing it breaks links people already shared."
        : "Part of the link: /en/causes/… e.g. school-kits",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: c.status ?? "draft",
      options: CAUSE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    },
    {
      name: "goal",
      label: "Goal (₹)",
      inputMode: "numeric",
      defaultValue: c.goalPaise ? String(c.goalPaise / 100) : "",
      hint: "Optional. The amount raised comes from donations.",
    },
    {
      name: "sortOrder",
      label: "Order",
      inputMode: "numeric",
      defaultValue: String(c.sortOrder ?? 0),
      hint: "Lower numbers are listed first.",
    },
    {
      name: "coverImageId",
      label: "Cover photo",
      type: "photo",
      defaultValue: c.coverImageId ?? "",
      photos: { library },
      span: "full",
      hint: "Shown on the causes list and at the top of the cause page.",
    },
    {
      name: "photoIds",
      label: "Photo slider",
      type: "photos",
      defaultValue: (c.photoIds ?? []).join(","),
      photos: { library, max: 20 },
      hint: "Optional. Shown as a slider below the story.",
    },
    {
      name: "is80gEligible",
      label: "Donations qualify for 80G receipts",
      type: "checkbox",
      defaultValue: c.is80gEligible === false ? "" : "on",
      span: "full",
    },
  ];
}
