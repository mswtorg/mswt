import type { FieldSpec } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";
import { isoIst } from "@/lib/dates/format";

type Defaults = {
  slug?: string;
  status?: string;
  storyDate?: string;
  sortOrder?: number;
  showOnHome?: boolean;
  photoId?: string | null;
};

/** The testimonial settings form (new and edit). */
export function testimonialFields(t: Defaults, library: LibraryItem[]): FieldSpec[] {
  return [
    {
      name: "slug",
      label: "Web address",
      required: true,
      maxLength: 80,
      defaultValue: t.slug ?? "",
      hint: "Lowercase letters, numbers and hyphens, e.g. asha-school-fees. The story's page is /en/testimonials/<this>.",
    },
    {
      name: "storyDate",
      label: "Date",
      type: "date",
      required: true,
      // Today in India for a new testimonial.
      defaultValue: t.storyDate ?? isoIst(new Date()).slice(0, 10),
      hint: "Shown with the story; newer dates come first among equal Order numbers.",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: t.status ?? "draft",
      options: [
        { value: "draft", label: "Draft (not on the site)" },
        { value: "published", label: "Published" },
      ],
    },
    {
      name: "sortOrder",
      label: "Order",
      inputMode: "numeric",
      defaultValue: String(t.sortOrder ?? 0),
      hint: "Lower numbers are shown first; equal numbers show the newest date first.",
    },
    {
      name: "photoId",
      label: "Photo",
      type: "photo",
      defaultValue: t.photoId ?? "",
      photos: { library },
      span: "full",
      hint: "Optional, shown small beside the name. Only with the person's consent.",
    },
    {
      name: "showOnHome",
      label: "Show on the home page",
      type: "checkbox",
      defaultValue: t.showOnHome === false ? "" : "on",
      span: "full",
      hint: "Home shows the first 6 of these; About shows the first 6 of all; the Testimonials page shows every one.",
    },
  ];
}
