import type { Locale } from "@/i18n/routing";
import { blocksToMarkup } from "@/lib/content/markup";
import type { Blocks } from "@/lib/content/blocks";
import type { ImageView } from "@/lib/media/view";
import type { FormSectionSpec } from "@/components/admin/form-state";
import type { LibraryItem } from "@/components/admin/PhotoPicker";

type TextRow = {
  title: string;
  summary: string;
  body: Blocks;
  seoTitle: string | null;
  seoDescription: string | null;
  reviewedAt: Date | null;
};

/** The per-language text form shared by events and news (title, summary, text, SEO, review). */
export function textSections(
  row: TextRow | undefined,
  locale: Locale,
  editor: { media: Record<string, ImageView>; library: LibraryItem[] },
  labels: { title: string; summary: string; body: string },
): FormSectionSpec[] {
  return [
    {
      title: "Title and summary",
      description: "Shown on the list pages and cards.",
      fields: [
        {
          name: "title",
          label: labels.title,
          required: true,
          lang: locale,
          maxLength: 160,
          defaultValue: row?.title ?? "",
        },
        {
          name: "summary",
          label: labels.summary,
          type: "textarea",
          rows: 2,
          required: true,
          lang: locale,
          maxLength: 400,
          defaultValue: row?.summary ?? "",
        },
      ],
    },
    {
      title: labels.body,
      description: "Photos and sliders can go anywhere in the text.",
      fields: [
        {
          name: "body",
          label: "Text",
          type: "blocks",
          lang: locale,
          defaultValue: blocksToMarkup(row?.body ?? []),
          editor,
        },
      ],
    },
    {
      title: "Search engines",
      description: "Leave empty to use the title and summary.",
      fields: [
        {
          name: "seoTitle",
          label: "SEO title",
          lang: locale,
          maxLength: 70,
          defaultValue: row?.seoTitle ?? "",
        },
        {
          name: "seoDescription",
          label: "SEO description",
          type: "textarea",
          rows: 2,
          lang: locale,
          maxLength: 160,
          defaultValue: row?.seoDescription ?? "",
        },
      ],
    },
    {
      title: "Review",
      description: "Production shows this language only after a person has checked the text.",
      fields: [
        {
          name: "reviewed",
          label: "Reviewed by a person: publish in this language",
          type: "checkbox",
          defaultValue: row?.reviewedAt ? "on" : "",
        },
      ],
    },
  ];
}
