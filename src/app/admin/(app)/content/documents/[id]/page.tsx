import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getDocumentForEdit } from "@/lib/admin/documents";
import { requireCapability } from "@/lib/admin/guard";
import { LANGUAGES } from "@/lib/admin/languages";
import { getMediaStorage } from "@/lib/storage/media";
import { AdminForm } from "@/components/admin/AdminForm";
import { LanguageTabs, pickLocale, translationState } from "@/components/admin/LanguageTabs";
import { PdfUpload } from "@/components/admin/PdfUpload";
import { Card, Details, PageHeader, Section } from "@/components/admin/ui";
import { Alert } from "@/components/ui/Alert";
import {
  deleteDocumentAction,
  deleteDocumentTitleAction,
  finishPdfUploadAction,
  saveDocumentAction,
  saveDocumentTitleAction,
  startPdfUploadAction,
  uploadPdfAction,
} from "../actions";
import { documentSections, KIND_LABEL } from "../fields";

export const metadata: Metadata = { title: "Document" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function DocumentPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale: Locale = pickLocale(q.lang);
  const data = await getDocumentForEdit(id);
  if (!data) notFound();
  const { doc, translations } = data;
  const row = translations.find((t) => t.locale === locale);
  const lang = LANGUAGES[locale];
  const storage = getMediaStorage();
  const pdfUrl = doc.pdfR2Key && storage ? `${storage.publicBase}/${doc.pdfR2Key}` : null;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/content/documents", label: "Documents" }}
        title={translations.find((t) => t.locale === "en")?.title ?? `${KIND_LABEL[doc.kind]} ${doc.fy}`}
        description={`${KIND_LABEL[doc.kind]} · ${doc.fy} · ${doc.status === "published" ? "Published" : "Draft"}`}
      />
      {q.created ? (
        <Alert tone="success" live="polite">
          <p>Document created. Now upload the PDF and add its title in each language.</p>
        </Alert>
      ) : null}
      <AdminForm
        id="document"
        action={saveDocumentAction.bind(null, id)}
        submitLabel="Save"
        sections={documentSections(doc)}
      />
      <Card>
        <Section id="pdf" title="PDF" description="Uploading a new PDF replaces the current one.">
          <div className="grid gap-4">
            <Details
              items={[
                { label: "Current file", value: doc.pdfFilename ?? "None yet" },
                {
                  label: "Size",
                  value: doc.pdfBytes ? `${(doc.pdfBytes / 1024 / 1024).toFixed(1)} MB` : null,
                },
                {
                  label: "Link",
                  value: pdfUrl ? (
                    <a href={pdfUrl} className="text-link-default">
                      Open PDF
                    </a>
                  ) : null,
                },
              ]}
            />
            <PdfUpload
              start={startPdfUploadAction.bind(null, id)}
              finish={finishPdfUploadAction.bind(null, id)}
              throughServer={uploadPdfAction.bind(null, id)}
              disabled={
                storage
                  ? undefined
                  : "Media storage isn’t set up for this environment yet (R2_MEDIA_BUCKET and R2_MEDIA_PUBLIC_URL)."
              }
            />
          </div>
        </Section>
      </Card>
      <section aria-labelledby="text-h" className="grid gap-4">
        <h2 id="text-h" className="text-lg">
          Title in each language
        </h2>
        <LanguageTabs
          href={(l) => `/admin/content/documents/${id}?lang=${l}`}
          current={locale}
          states={
            Object.fromEntries(
              routing.locales.map((l) => [l, translationState(translations.find((t) => t.locale === l))]),
            ) as Record<Locale, ReturnType<typeof translationState>>
          }
        />
        {q.removed ? (
          <Alert tone="success" live="polite">
            <p>The {lang.name} title was removed.</p>
          </Alert>
        ) : null}
        <AdminForm
          key={locale}
          id="document-title"
          action={saveDocumentTitleAction.bind(null, id, locale)}
          submitLabel="Save"
          sections={[
            {
              title: "Title",
              description: "As shown on the Transparency page, e.g. “Annual report 2025-26”.",
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
            description={`It then isn't listed in ${lang.name}.`}
          >
            <AdminForm
              id="remove-lang"
              action={deleteDocumentTitleAction.bind(null, id, locale)}
              submitLabel={`Remove ${lang.name} title`}
              variant="danger"
              confirm={`Remove the ${lang.name} title?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
      <Card>
        <Section id="delete" title="Delete document" description="Removes it and its PDF.">
          <AdminForm
            id="delete-document"
            action={deleteDocumentAction.bind(null, id)}
            submitLabel="Delete document"
            variant="danger"
            confirm="Delete this document and its PDF?"
            fields={[]}
          />
        </Section>
      </Card>
    </>
  );
}
