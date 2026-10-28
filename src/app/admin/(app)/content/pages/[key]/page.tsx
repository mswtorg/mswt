import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { pageHeroIds, pageTranslationsFor } from "@/lib/admin/content";
import { contentPage, type ContentPageKey } from "@/lib/admin/content-pages";
import { pageDraft } from "@/lib/admin/drafts";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { editorMedia } from "@/lib/admin/media";
import { HOME_SECTION_FIELDS, HomeExtras } from "@/lib/content/home";
import { blocksToMarkup } from "@/lib/content/markup";
import { AdminForm } from "@/components/admin/AdminForm";
import type { FormSectionSpec } from "@/components/admin/form-state";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { deletePageTranslationAction, savePageAction } from "../actions";

type Props = {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: contentPage((await params).key)?.label ?? "Page" };
}

const SEO_DESC =
  "Shown in search results and when the page is shared. Leave empty to use the page title and introduction.";

export default async function EditPagePage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const page = contentPage((await params).key);
  if (!page) notFound();
  const key = page.key as ContentPageKey;
  const q = await searchParams;
  const locale = pickLocale(q.lang);
  const [rows, editor, heroIds, { library: englishLibrary }] = await Promise.all([
    pageTranslationsFor(key),
    editorMedia(locale),
    pageHeroIds(key),
    editorMedia("en"),
  ]);
  const row = rows.find((r) => r.locale === locale);
  const draft = row ? null : pageDraft(key, locale);
  // Home: the built-in text (src/messages) is the starting point in each language.
  const t = key === "home" && !row ? await getTranslations({ locale, namespace: "Home" }) : null;
  const tm = key === "home" && !row ? await getTranslations({ locale, namespace: "Meta" }) : null;
  const extras = key === "home" ? HomeExtras.safeParse(row?.extras ?? {}) : null;
  const point = (n: 1 | 2 | 3, part: "title" | "text") =>
    extras?.success
      ? extras.data.points[n - 1]![part]
      : t
        ? t(part === "title" ? (`trust${n}t` as const) : (`trust${n}` as const))
        : "";

  const lang = LANGUAGES[locale];
  const heading: FormSectionSpec = {
    title: "Heading",
    description: "The browser tab title and the page's main heading.",
    fields: [
      {
        name: "title",
        label: "Page title",
        required: true,
        lang: locale,
        maxLength: 120,
        defaultValue: row?.title ?? draft?.title ?? tm?.("homeTitle") ?? "",
      },
      {
        name: "h1",
        label: key === "home" ? "Headline" : "Heading",
        required: true,
        lang: locale,
        maxLength: 160,
        defaultValue: row?.h1 ?? draft?.h1 ?? t?.("h1") ?? "",
      },
      ...(key === "home"
        ? [
            {
              name: "eyebrow",
              label: "Line above the headline",
              lang: locale,
              maxLength: 120,
              defaultValue: extras?.success ? extras.data.eyebrow : (t?.("eyebrow") ?? ""),
            },
          ]
        : []),
      {
        name: "intro",
        label: "Introduction",
        type: "textarea",
        rows: 3,
        lang: locale,
        maxLength: 600,
        defaultValue: row?.intro ?? draft?.intro ?? t?.("intro") ?? "",
      },
    ],
  };
  // Home: headings further down the page (prefilled with the built-in text in this language).
  const tHome = key === "home" ? await getTranslations({ locale, namespace: "Home" }) : null;
  const homeSections: FormSectionSpec[] = tHome
    ? [
        {
          title: "Sections",
          description: "Headings and text for the other parts of the home page.",
          fields: HOME_SECTION_FIELDS.map(([k, label]) => ({
            name: `section_${k}`,
            label,
            lang: locale,
            maxLength: k === "causesLead" || k === "bandP" ? 300 : 120,
            ...(k === "causesLead" || k === "bandP" ? { type: "textarea" as const, rows: 2 } : {}),
            defaultValue: (extras?.success ? extras.data.sections[k] : undefined) || tHome(k),
          })),
        },
      ]
    : [];
  const bodyField = {
    name: "body",
    label: key === "home" ? "Story" : "Text",
    type: "blocks" as const,
    lang: locale,
    defaultValue: blocksToMarkup(row?.sections ?? draft?.sections ?? []),
    editor,
  };
  const impact = extras?.success ? extras.data.impact : [];
  const homeParts: FormSectionSpec[] =
    key === "home"
      ? [
          {
            title: "Impact in numbers",
            description:
              "Up to four figures, e.g. “1,200+” with “families helped”. Leave a row empty to drop it; with none filled the section is hidden.",
            fields: ([1, 2, 3, 4] as const).flatMap((n) => [
              {
                name: `impact${n}Value`,
                label: `Number ${n}`,
                lang: locale,
                maxLength: 20,
                defaultValue: impact[n - 1]?.value ?? "",
              },
              {
                name: `impact${n}Label`,
                label: `Number ${n} label`,
                lang: locale,
                maxLength: 80,
                defaultValue: impact[n - 1]?.label ?? "",
              },
            ]),
          },
          {
            title: "Our story",
            description:
              "A short story of the Trust, shown on the home page with a “Read our story” link to About. Leave it empty to hide the section.",
            fields: [bodyField],
          },
        ]
      : [];
  const body: FormSectionSpec =
    key === "home"
      ? {
          title: "Why give",
          description: "The three points under the headline.",
          fields: ([1, 2, 3] as const).flatMap((n) => [
            {
              name: `point${n}Title`,
              label: `Point ${n} title`,
              required: true,
              lang: locale,
              maxLength: 80,
              defaultValue: point(n, "title"),
            },
            {
              name: `point${n}Text`,
              label: `Point ${n} text`,
              required: true,
              lang: locale,
              maxLength: 300,
              defaultValue: point(n, "text"),
            },
          ]),
        }
      : {
          title: "Content",
          description:
            key === "contact" || key === "transparency"
              ? "Optional text shown above the form or the documents list."
              : ["causes", "events", "news", "gallery"].includes(key)
                ? "Optional text shown above the list."
                : "The page text. Write as in a document; use the toolbar for headings, lists, notes and photos.",
          fields: [bodyField],
        };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/pages", label: "Pages" }}
        title={page.label}
        description={`Public address: /${locale}${page.path}`}
        actions={
          <ButtonLink variant="secondary" href={`/${locale}${page.path}`}>
            View page
          </ButtonLink>
        }
      />
      <LanguageTabs
        href={(l) => `/admin/content/pages/${key}?lang=${l}`}
        current={locale}
        states={
          Object.fromEntries(
            routing.locales.map((l) => [l, translationState(rows.find((r) => r.locale === l))]),
          ) as Record<(typeof routing.locales)[number], ReturnType<typeof translationState>>
        }
      />
      {q.removed ? (
        <Alert tone="success" live="polite">
          <p>
            The {lang.name} version was removed. The page no longer appears in {lang.name}.
          </p>
        </Alert>
      ) : null}
      {!row ? (
        <Alert tone="info">
          <p>
            {draft
              ? `No ${lang.name} version is saved yet. The form starts from the draft text, which still needs review.`
              : key === "home"
                ? `No ${lang.name} version is saved yet: the home page shows the built-in text below until you save.`
                : locale === "en"
                  ? "This page has no English version yet."
                  : `This page has no ${lang.name} version yet. Write it in ${lang.name}; don't paste English here.`}
          </p>
        </Alert>
      ) : null}
      <AdminForm
        key={locale}
        id="page"
        action={savePageAction.bind(null, key, locale)}
        submitLabel="Save"
        sticky
        sections={[
          {
            title: "Header photos",
            description:
              key === "home"
                ? "Shown above the headline: one photo, or several as a slider. The same in every language."
                : "Optional: one photo, or several as a slider, above the heading. The same in every language.",
            fields: [
              {
                name: "heroMediaIds",
                label: "Photos",
                type: "photos",
                defaultValue: heroIds.join(","),
                photos: { library: englishLibrary, max: 8 },
              },
            ],
          },
          heading,
          body,
          ...homeParts,
          ...homeSections,
          {
            title: "Search engines",
            description: SEO_DESC,
            fields: [
              {
                name: "seoTitle",
                label: "SEO title",
                lang: locale,
                maxLength: 70,
                defaultValue: row?.seoTitle ?? draft?.seoTitle ?? "",
              },
              {
                name: "seoDescription",
                label: "SEO description",
                type: "textarea",
                rows: 2,
                lang: locale,
                maxLength: 160,
                defaultValue: row?.seoDescription ?? draft?.seoDescription ?? "",
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
                hint: "Uncheck to take it off the live site while you keep editing.",
              },
            ],
          },
        ]}
      />
      {row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`Deletes the ${lang.name} text. The page then doesn't appear in ${lang.name}; there's no fallback to English.`}
          >
            <AdminForm
              id="remove-lang"
              action={deletePageTranslationAction.bind(null, key, locale)}
              submitLabel={`Remove ${lang.name} version`}
              variant="danger"
              confirm={`Remove the ${lang.name} version of ${page.label}?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
    </>
  );
}
