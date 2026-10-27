import type { FormSectionSpec } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";

type Album = {
  slug: string;
  status: string;
  albumDate: string | null;
  sortOrder: number;
  coverImageId: string | null;
};

/** Album settings and photos (new and edit). */
export function albumSections(
  a: Album | null,
  photoIds: string[],
  library: LibraryItem[],
): FormSectionSpec[] {
  return [
    {
      title: "Settings",
      fields: [
        {
          name: "slug",
          label: "Web address",
          required: true,
          maxLength: 80,
          defaultValue: a?.slug ?? "",
          hint: "Part of the link: /en/gallery/… e.g. annual-day-2026",
        },
        {
          name: "status",
          label: "Status",
          type: "select",
          defaultValue: a?.status ?? "draft",
          options: [
            { value: "draft", label: "Draft (not on the site)" },
            { value: "published", label: "Published" },
          ],
        },
        { name: "albumDate", label: "Date (optional)", type: "date", defaultValue: a?.albumDate ?? "" },
        {
          name: "sortOrder",
          label: "Order",
          inputMode: "numeric",
          defaultValue: String(a?.sortOrder ?? 0),
          hint: "Lower numbers are listed first.",
        },
      ],
    },
    {
      title: "Photos",
      description:
        "Choose photos in the order they should appear. Captions come from each photo's captions in the media library.",
      fields: [
        {
          name: "coverImageId",
          label: "Cover photo",
          type: "photo",
          defaultValue: a?.coverImageId ?? "",
          photos: { library },
          hint: "Empty: the first photo is used.",
          span: "full",
        },
        {
          name: "photoIds",
          label: "Album photos",
          type: "photos",
          defaultValue: photoIds.join(","),
          photos: { library, max: 200 },
        },
      ],
    },
  ];
}
