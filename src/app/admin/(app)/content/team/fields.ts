import type { FieldSpec } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";

type Defaults = { status?: string; sortOrder?: number; showOnAbout?: boolean; photoId?: string | null };

/** The team member settings form (new and edit). */
export function teamMemberFields(m: Defaults, library: LibraryItem[]): FieldSpec[] {
  return [
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: m.status ?? "draft",
      options: [
        { value: "draft", label: "Draft (not on the site)" },
        { value: "published", label: "Published" },
      ],
    },
    {
      name: "sortOrder",
      label: "Order",
      inputMode: "numeric",
      defaultValue: String(m.sortOrder ?? 0),
      hint: "Lower numbers are shown first.",
    },
    {
      name: "photoId",
      label: "Photo",
      type: "photo",
      defaultValue: m.photoId ?? "",
      photos: { library },
      span: "full",
      hint: "Shown round. Without one, the person's initials are shown.",
    },
    {
      name: "showOnAbout",
      label: "Show on the About page",
      type: "checkbox",
      defaultValue: m.showOnAbout ? "on" : "",
      span: "full",
      hint: "Everyone published is on the Team page; only ticked members are also on About.",
    },
  ];
}
