import type { Metadata } from "next";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { requireCapability } from "@/lib/admin/guard";
import { listTestimonials } from "@/lib/admin/testimonials";
import { formatDate, istDay } from "@/lib/dates/format";
import { DataTable, PageHeader, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Testimonials" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function TestimonialsPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listTestimonials(), searchParams]);
  return (
    <>
      <PageHeader
        title="Testimonials"
        description="Stories from donors, volunteers and families. Each has its own page under /testimonials; Home and About show cards that link to it, in each language it's written in."
        actions={<ButtonLink href="/admin/content/testimonials/new">New testimonial</ButtonLink>}
      />
      {q.deleted ? (
        <Alert tone="success" live="polite">
          <p>Testimonial deleted.</p>
        </Alert>
      ) : null}
      <DataTable caption="Testimonials">
        <thead>
          <tr>
            <Th>Heading</Th>
            <Th>Who</Th>
            <Th>Date</Th>
            <Th>Status</Th>
            <Th>Home</Th>
            <Th>Languages</Th>
            <Th align="right">Order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                No testimonials yet.
              </td>
            </tr>
          ) : (
            rows.map((t) => {
              const shown = t.translations.find((x) => x.locale === "en") ?? t.translations[0];
              return (
                <Tr key={t.id}>
                  <Td header>
                    <Link
                      href={`/admin/content/testimonials/${t.id}`}
                      className="text-link-default underline underline-offset-4"
                    >
                      {shown?.title ?? t.slug}
                    </Link>
                  </Td>
                  <Td>{shown?.name ?? ""}</Td>
                  <Td>{formatDate("en", istDay(t.storyDate))}</Td>
                  <Td>
                    <Badge tone={t.status === "published" ? "success" : "neutral"}>
                      {t.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </Td>
                  <Td>{t.showOnHome ? "Yes" : "No"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {routing.locales.map((l) => {
                        const x = t.translations.find((y) => y.locale === l);
                        return x ? (
                          <Badge key={l} tone={x.reviewedAt ? "success" : "warning"}>
                            {l.toUpperCase()}
                            <span className="sr-only">{x.reviewedAt ? " reviewed" : " draft"}</span>
                          </Badge>
                        ) : null;
                      })}
                    </span>
                  </Td>
                  <Td align="right">{t.sortOrder}</Td>
                </Tr>
              );
            })
          )}
        </tbody>
      </DataTable>
    </>
  );
}
