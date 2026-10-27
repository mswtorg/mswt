import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCauseForEdit } from "@/lib/admin/causes";
import { inr } from "@/lib/admin/format";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { editorMedia } from "@/lib/admin/media";
import { can } from "@/lib/admin/permissions";
import { blocksToMarkup } from "@/lib/content/markup";
import { AdminForm } from "@/components/admin/AdminForm";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { Card, Details, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { RichText } from "@/components/ui/RichText";
import { deleteCauseAction, deleteCauseTextAction, saveCauseTextAction, updateCauseAction } from "../actions";
import { causeFields } from "../fields";

export const metadata: Metadata = { title: "Cause" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function CausePage({ params, searchParams }: Props) {
  const admin = await requireCapability("causes.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale: Locale = pickLocale(q.lang);
  const [data, editor, { library: englishLibrary }] = await Promise.all([
    getCauseForEdit(id),
    editorMedia(locale),
    editorMedia("en"),
  ]);
  if (!data) notFound();
  const { cause, translations, donationCount } = data;
  const write = can(admin.role, "causes.write");
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  const en = translations.find((t) => t.locale === "en");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/causes", label: "Causes" }}
        title={en?.title ?? cause.slug}
        description={`Raised ${inr(cause.raisedPaise)}${cause.goalPaise ? ` of ${inr(cause.goalPaise)}` : ""} · ${donationCount} donations`}
        actions={
          cause.status !== "draft" ? (
            <ButtonLink variant="secondary" href={`/${locale}/causes/${cause.slug}`}>
              View cause
            </ButtonLink>
          ) : null
        }
      />
      {q.created ? (
        <Alert tone="success" live="polite">
          <p>Cause created as {cause.status}. Now write its text in each language.</p>
        </Alert>
      ) : null}
      {write ? (
        <AdminForm
          id="cause"
          action={updateCauseAction.bind(null, id)}
          submitLabel="Save settings"
          sections={[
            { title: "Settings", fields: causeFields(cause, englishLibrary, cause.status !== "draft") },
          ]}
        />
      ) : (
        <Card>
          <Section id="settings" title="Settings">
            <Details
              items={[
                { label: "Web address", value: `/${cause.slug}` },
                { label: "Status", value: cause.status },
                { label: "Goal", value: cause.goalPaise ? inr(cause.goalPaise) : null },
                { label: "80G eligible", value: cause.is80gEligible ? "Yes" : "No" },
              ]}
            />
          </Section>
        </Card>
      )}

      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Text in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/causes/${id}?lang=${l}`}
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
        {write ? (
          <AdminForm
            key={locale}
            id="cause-text"
            action={saveCauseTextAction.bind(null, id, locale)}
            submitLabel="Save text"
            sticky
            sections={[
              {
                title: "Title and summary",
                description: "Shown on the causes list and the home page.",
                fields: [
                  {
                    name: "title",
                    label: "Title",
                    required: true,
                    lang: locale,
                    maxLength: 120,
                    defaultValue: row?.title ?? "",
                  },
                  {
                    name: "summary",
                    label: "Summary",
                    type: "textarea",
                    rows: 2,
                    required: true,
                    lang: locale,
                    maxLength: 300,
                    defaultValue: row?.summary ?? "",
                  },
                ],
              },
              {
                title: "Story",
                description: "The cause page text.",
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
            ]}
          />
        ) : row ? (
          <Card>
            <Section id="read" title={row.title} description={row.summary}>
              <RichText blocks={row.body} media={editor.media} markMissing />
            </Section>
          </Card>
        ) : (
          <p className="text-sm text-fg-muted">No {lang.name} text yet.</p>
        )}
      </section>

      {write && row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`The cause then doesn't appear in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteCauseTextAction.bind(null, id, locale)}
              submitLabel={`Remove ${lang.name} text`}
              variant="danger"
              confirm={`Remove the ${lang.name} text of this cause?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      {write && cause.status === "draft" && donationCount === 0 ? (
        <Card>
          <Section id="delete" title="Delete cause" description="Only drafts that never received a donation.">
            <AdminForm
              id="delete-cause"
              action={deleteCauseAction.bind(null, id)}
              submitLabel="Delete cause"
              variant="danger"
              confirm="Delete this cause and all its text?"
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
    </>
  );
}
