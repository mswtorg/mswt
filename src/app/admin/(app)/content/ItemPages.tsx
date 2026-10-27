import Link from "next/link";
import { routing, type Locale } from "@/i18n/routing";
import { istDateTime } from "@/lib/admin/format";
import { istInputValue } from "@/lib/admin/events";
import { LANGUAGES } from "@/lib/admin/languages";
import type { ImageView } from "@/lib/media/view";
import { AdminForm } from "@/components/admin/AdminForm";
import type { FieldSpec, FormSectionSpec } from "@/components/admin/form-state";
import { LanguageTabs, translationState } from "@/components/admin/LanguageTabs";
import type { LibraryItem } from "@/components/admin/PhotoPicker";
import { Card, DataTable, PageHeader, Section, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import type { Blocks } from "@/lib/content/blocks";
import {
  deleteItemAction,
  deleteItemTextAction,
  saveItemSettingsAction,
  saveItemTextAction,
} from "./items-actions";
import { textSections } from "./item-forms";

export type Kind = "events" | "news";

const NOUN = { events: { one: "event", title: "Events" }, news: { one: "post", title: "News" } } as const;

type Tr = { id: string; locale: string; title: string; reviewedAt: Date | null };
type ListRow = { id: string; slug: string; status: string; when: Date | null; translations: Tr[] };

export function ItemList({ kind, rows, deleted }: { kind: Kind; rows: ListRow[]; deleted: boolean }) {
  const n = NOUN[kind];
  return (
    <>
      <PageHeader
        title={n.title}
        description={
          kind === "events"
            ? "Upcoming and past events. An event appears in a language once that language's text is reviewed."
            : "News and updates, newest first. A post appears in a language once that language's text is reviewed."
        }
        actions={<ButtonLink href={`/admin/content/${kind}/new`}>New {n.one}</ButtonLink>}
      />
      {deleted ? (
        <Alert tone="success" live="polite">
          <p>Deleted.</p>
        </Alert>
      ) : null}
      <DataTable caption={n.title}>
        <thead>
          <tr>
            <Th>{kind === "events" ? "Event" : "Post"}</Th>
            <Th>Status</Th>
            <Th>Languages</Th>
            <Th>{kind === "events" ? "Starts" : "Published"}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-fg-muted">
                Nothing yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <Tr key={r.id}>
                <Td header>
                  <Link
                    href={`/admin/content/${kind}/${r.id}`}
                    className="text-link-default underline underline-offset-4"
                  >
                    {r.translations.find((t) => t.locale === "en")?.title ?? r.slug}
                  </Link>
                  <span className="block text-xs font-normal text-fg-muted">/{r.slug}</span>
                </Td>
                <Td>
                  <Badge tone={r.status === "published" ? "success" : "neutral"}>
                    {r.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {routing.locales.map((l) => {
                      const t = r.translations.find((x) => x.locale === l);
                      return t ? (
                        <Badge key={l} tone={t.reviewedAt ? "success" : "warning"}>
                          {l.toUpperCase()}
                          <span className="sr-only">{t.reviewedAt ? " reviewed" : " draft"}</span>
                        </Badge>
                      ) : null;
                    })}
                  </span>
                </Td>
                <Td>{r.when ? istDateTime(r.when) : "–"}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </>
  );
}

type EventRow = {
  slug: string;
  status: string;
  eventStatus: string;
  attendance: string;
  startsAt: Date;
  endsAt: Date | null;
  venueName: string | null;
  venueStreet: string | null;
  venueCity: string | null;
  venueRegion: string | null;
  venuePostalCode: string | null;
  onlineUrl: string | null;
  coverImageId: string | null;
  photoIds: string[];
};
type NewsRow = {
  slug: string;
  status: string;
  publishedAt: Date | null;
  authorName: string | null;
  coverImageId: string | null;
  photoIds: string[];
};

const STATUS = [
  { value: "draft", label: "Draft (not on the site)" },
  { value: "published", label: "Published" },
];

export function settingsSections(
  kind: Kind,
  row: Partial<EventRow & NewsRow> | null,
  library: LibraryItem[],
): FormSectionSpec[] {
  const common = (hint: string): FieldSpec[] => [
    {
      name: "slug",
      label: "Web address",
      required: true,
      maxLength: 80,
      defaultValue: row?.slug ?? "",
      hint,
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: row?.status ?? "draft",
      options: STATUS,
    },
  ];
  const photos: FormSectionSpec = {
    title: "Photos",
    description: "The cover shows on cards and at the top; the slider shows below the text.",
    fields: [
      {
        name: "coverImageId",
        label: "Cover photo",
        type: "photo",
        defaultValue: row?.coverImageId ?? "",
        photos: { library },
        span: "full",
      },
      {
        name: "photoIds",
        label: "Photo slider",
        type: "photos",
        defaultValue: (row?.photoIds ?? []).join(","),
        photos: { library },
      },
    ],
  };
  if (kind === "news")
    return [
      {
        title: "Settings",
        fields: [
          ...common("Part of the link: /en/news/… e.g. annual-day-2026"),
          {
            name: "publishedAt",
            label: "Publish date (IST)",
            type: "datetime-local",
            defaultValue: istInputValue(row?.publishedAt),
            hint: "Empty: now, when you publish.",
          },
          {
            name: "authorName",
            label: "Author (optional)",
            maxLength: 120,
            defaultValue: row?.authorName ?? "",
          },
        ],
      },
      photos,
    ];
  return [
    {
      title: "Settings",
      fields: [
        ...common("Part of the link: /en/events/… e.g. health-camp-nov-2026"),
        {
          name: "eventStatus",
          label: "Event status",
          type: "select",
          defaultValue: row?.eventStatus ?? "scheduled",
          options: [
            { value: "scheduled", label: "Scheduled" },
            { value: "rescheduled", label: "Rescheduled" },
            { value: "postponed", label: "Postponed" },
            { value: "moved_online", label: "Moved online" },
            { value: "cancelled", label: "Cancelled" },
          ],
        },
        {
          name: "attendance",
          label: "Where",
          type: "select",
          defaultValue: row?.attendance ?? "offline",
          options: [
            { value: "offline", label: "In person" },
            { value: "online", label: "Online" },
            { value: "mixed", label: "In person and online" },
          ],
        },
        {
          name: "startsAt",
          label: "Starts (IST)",
          type: "datetime-local",
          required: true,
          defaultValue: istInputValue(row?.startsAt),
        },
        {
          name: "endsAt",
          label: "Ends (IST)",
          type: "datetime-local",
          defaultValue: istInputValue(row?.endsAt),
        },
      ],
    },
    {
      title: "Venue",
      description: "For in-person events. Online events need the link instead.",
      fields: [
        {
          name: "venueName",
          label: "Venue name",
          maxLength: 160,
          defaultValue: row?.venueName ?? "",
          span: "full",
        },
        {
          name: "venueStreet",
          label: "Street address",
          maxLength: 200,
          defaultValue: row?.venueStreet ?? "",
          span: "full",
        },
        { name: "venueCity", label: "City", maxLength: 80, defaultValue: row?.venueCity ?? "" },
        { name: "venueRegion", label: "State", maxLength: 80, defaultValue: row?.venueRegion ?? "" },
        {
          name: "venuePostalCode",
          label: "PIN code",
          maxLength: 12,
          inputMode: "numeric",
          defaultValue: row?.venuePostalCode ?? "",
        },
        {
          name: "onlineUrl",
          label: "Online link",
          type: "url",
          defaultValue: row?.onlineUrl ?? "",
          hint: "https://…",
          span: "full",
        },
      ],
    },
    photos,
  ];
}

type TextRow = {
  locale: string;
  title: string;
  summary: string;
  body: Blocks;
  seoTitle: string | null;
  seoDescription: string | null;
  reviewedAt: Date | null;
};

export function ItemEditor({
  kind,
  id,
  slug,
  status,
  title,
  description,
  locale,
  sections,
  translations,
  editor,
  flags,
}: {
  kind: Kind;
  id: string;
  slug: string;
  status: string;
  title: string;
  description: string;
  locale: Locale;
  sections: FormSectionSpec[];
  translations: TextRow[];
  editor: { media: Record<string, ImageView>; library: LibraryItem[] };
  flags: { created?: boolean; removed?: boolean };
}) {
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  return (
    <>
      <PageHeader
        back={{ href: `/admin/content/${kind}`, label: NOUN[kind].title }}
        title={title}
        description={description}
        actions={
          status === "published" ? (
            <ButtonLink variant="secondary" href={`/${locale}/${kind}/${slug}`}>
              View
            </ButtonLink>
          ) : null
        }
      />
      {flags.created ? (
        <Alert tone="success" live="polite">
          <p>Created. Now write its text in each language.</p>
        </Alert>
      ) : null}
      <AdminForm
        id="item"
        action={saveItemSettingsAction.bind(null, kind, id)}
        submitLabel="Save settings"
        sections={sections}
      />
      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Text in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/${kind}/${id}?lang=${l}`}
          current={locale}
          states={
            Object.fromEntries(
              routing.locales.map((l) => [l, translationState(translations.find((t) => t.locale === l))]),
            ) as Record<Locale, ReturnType<typeof translationState>>
          }
        />
        {flags.removed ? (
          <Alert tone="success" live="polite">
            <p>The {lang.name} text was removed.</p>
          </Alert>
        ) : null}
        <AdminForm
          key={locale}
          id="item-text"
          action={saveItemTextAction.bind(null, kind, id, locale)}
          submitLabel="Save text"
          sticky
          sections={textSections(
            row,
            locale,
            editor,
            kind === "events"
              ? { title: "Title", summary: "Summary", body: "Details" }
              : { title: "Headline", summary: "Excerpt", body: "Story" },
          )}
        />
      </section>
      {row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`It then doesn't appear in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteItemTextAction.bind(null, kind, id, locale)}
              submitLabel={`Remove ${lang.name} text`}
              variant="danger"
              confirm={`Remove the ${lang.name} text?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      <Card>
        <Section
          id="delete"
          title="Delete"
          description="Removes it and its text in every language. Its photos stay in the library."
        >
          <AdminForm
            id="delete-item"
            action={deleteItemAction.bind(null, kind, id)}
            submitLabel={`Delete ${NOUN[kind].one}`}
            variant="danger"
            confirm={`Delete this ${NOUN[kind].one} in every language? This can't be undone.`}
            fields={[]}
          />
        </Section>
      </Card>
    </>
  );
}

export function NewItem({ kind, library }: { kind: Kind; library: LibraryItem[] }) {
  return (
    <>
      <PageHeader
        back={{ href: `/admin/content/${kind}`, label: NOUN[kind].title }}
        title={`New ${NOUN[kind].one}`}
        description="Start with the settings; you write the text in each language next."
      />
      <AdminForm
        id="item"
        action={saveItemSettingsAction.bind(null, kind, null)}
        submitLabel={`Create ${NOUN[kind].one}`}
        sections={settingsSections(kind, null, library)}
      />
    </>
  );
}
