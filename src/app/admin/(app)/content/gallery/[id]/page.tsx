import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getAlbumForEdit } from "@/lib/admin/gallery";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { editorMedia } from "@/lib/admin/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { deleteAlbumAction, deleteAlbumTextAction, saveAlbumAction, saveAlbumTextAction } from "../actions";
import { albumSections } from "../fields";

export const metadata: Metadata = { title: "Album" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function AlbumPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale: Locale = pickLocale(q.lang);
  const [data, { library }] = await Promise.all([getAlbumForEdit(id), editorMedia("en")]);
  if (!data) notFound();
  const { album, translations, photoIds } = data;
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/gallery", label: "Gallery" }}
        title={translations.find((t) => t.locale === "en")?.title ?? album.slug}
        description={`${photoIds.length} photos · ${album.status === "published" ? "Published" : "Draft"}`}
        actions={
          album.status === "published" ? (
            <ButtonLink variant="secondary" href={`/${locale}/gallery/${album.slug}`}>
              View
            </ButtonLink>
          ) : null
        }
      />
      {q.created ? (
        <Alert tone="success" live="polite">
          <p>Album created. Now add its title in each language.</p>
        </Alert>
      ) : null}
      <AdminForm
        id="album"
        action={saveAlbumAction.bind(null, id)}
        submitLabel="Save album"
        sections={albumSections(album, photoIds, library)}
      />
      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Title in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/gallery/${id}?lang=${l}`}
          current={locale}
          states={
            Object.fromEntries(
              routing.locales.map((l) => [l, translationState(translations.find((t) => t.locale === l))]),
            ) as Record<Locale, ReturnType<typeof translationState>>
          }
        />
        {q.removed ? (
          <Alert tone="success" live="polite">
            <p>The {lang.name} text was removed.</p>
          </Alert>
        ) : null}
        <AdminForm
          key={locale}
          id="album-text"
          action={saveAlbumTextAction.bind(null, id, locale)}
          submitLabel="Save"
          sticky
          sections={[
            {
              title: "Title",
              fields: [
                {
                  name: "title",
                  label: "Title",
                  required: true,
                  lang: locale,
                  maxLength: 160,
                  defaultValue: row?.title ?? "",
                },
                {
                  name: "description",
                  label: "Description",
                  type: "textarea",
                  rows: 3,
                  lang: locale,
                  maxLength: 600,
                  defaultValue: row?.description ?? "",
                },
              ],
            },
            {
              title: "Search engines",
              description: "Leave empty to use the title and description.",
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
              description:
                "Every photo in the album needs alt text in this language before it can be marked reviewed.",
              fields: [
                {
                  name: "reviewed",
                  label: "Reviewed by a person: publish in this language",
                  type: "checkbox",
                  defaultValue: row?.reviewedAt ? "on" : "",
                },
              ],
            },
          ]}
        />
      </section>
      {row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`The album then doesn't appear in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteAlbumTextAction.bind(null, id, locale)}
              submitLabel={`Remove ${lang.name} text`}
              variant="danger"
              confirm={`Remove the ${lang.name} text?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      <Card>
        <Section id="delete" title="Delete album" description="The photos stay in the media library.">
          <AdminForm
            id="delete-album"
            action={deleteAlbumAction.bind(null, id)}
            submitLabel="Delete album"
            variant="danger"
            confirm="Delete this album in every language?"
            fields={[]}
          />
        </Section>
      </Card>
    </>
  );
}
