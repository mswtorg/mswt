import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { editorMedia } from "@/lib/admin/media";
import { getTestimonialForEdit } from "@/lib/admin/testimonials";
import { AdminForm } from "@/components/admin/AdminForm";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import {
  deleteTestimonialAction,
  deleteTestimonialTextAction,
  saveTestimonialTextAction,
  updateTestimonialAction,
} from "../actions";
import { testimonialFields } from "../fields";

export const metadata: Metadata = { title: "Testimonial" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function TestimonialPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale: Locale = pickLocale(q.lang);
  const [data, { library }] = await Promise.all([getTestimonialForEdit(id), editorMedia("en")]);
  if (!data) notFound();
  const { testimonial, translations } = data;
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  const en = translations.find((t) => t.locale === "en");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/testimonials", label: "Testimonials" }}
        title={en?.name ?? row?.name ?? "Testimonial"}
        description={testimonial.status === "published" ? "Published" : "Draft: not on the site yet"}
      />
      {q.created ? (
        <Alert tone="success" live="polite">
          <p>Testimonial created. Now write the quote in each language.</p>
        </Alert>
      ) : null}
      <AdminForm
        id="testimonial"
        action={updateTestimonialAction.bind(null, id)}
        submitLabel="Save settings"
        sections={[{ title: "Settings", fields: testimonialFields(testimonial, library) }]}
      />

      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Text in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/testimonials/${id}?lang=${l}`}
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
        {!row && locale !== "en" ? (
          <Alert tone="info">
            <p>
              No {lang.name} text yet. Write it in {lang.name}; until then this testimonial doesn&apos;t show
              in {lang.name}.
            </p>
          </Alert>
        ) : null}
        <AdminForm
          key={locale}
          id="testimonial-text"
          action={saveTestimonialTextAction.bind(null, id, locale)}
          submitLabel="Save text"
          sticky
          sections={[
            {
              title: "Quote",
              description: "In the person's own words; shorter quotes read best (two to four sentences).",
              fields: [
                {
                  name: "quote",
                  label: "Quote",
                  type: "textarea",
                  rows: 4,
                  required: true,
                  lang: locale,
                  maxLength: 600,
                  defaultValue: row?.quote ?? "",
                },
                {
                  name: "name",
                  label: "Name",
                  required: true,
                  lang: locale,
                  maxLength: 80,
                  defaultValue: row?.name ?? "",
                  hint: "A first name or initials is fine, especially for children and families.",
                },
                {
                  name: "role",
                  label: "Who they are",
                  lang: locale,
                  maxLength: 120,
                  defaultValue: row?.role ?? "",
                  hint: "Optional, e.g. “Parent, Mumbai” or “Volunteer since 2021”.",
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
      </section>

      {row ? (
        <Card>
          <Section
            id="remove"
            title={`Remove ${lang.name}`}
            description={`The testimonial then doesn't appear in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteTestimonialTextAction.bind(null, id, locale)}
              submitLabel={`Remove ${lang.name} text`}
              variant="danger"
              confirm={`Remove the ${lang.name} text of this testimonial?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      <Card>
        <Section id="delete" title="Delete testimonial" description="Removes it in every language.">
          <AdminForm
            id="delete-testimonial"
            action={deleteTestimonialAction.bind(null, id)}
            submitLabel="Delete testimonial"
            variant="danger"
            confirm="Delete this testimonial and all its text?"
            fields={[]}
          />
        </Section>
      </Card>
    </>
  );
}
