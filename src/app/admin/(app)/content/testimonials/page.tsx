import type { Metadata } from "next";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { requireCapability } from "@/lib/admin/guard";
import { listTestimonials } from "@/lib/admin/testimonials";
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
        description="Quotes from donors, volunteers and families. Published ones show on About, and the first 6 marked for Home on the home page, in each language they're written in."
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
            <Th>Who</Th>
            <Th>Quote</Th>
            <Th>Status</Th>
            <Th>Home</Th>
            <Th>Languages</Th>
            <Th align="right">Order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
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
                      {shown?.name ?? "No text yet"}
                    </Link>
                  </Td>
                  <Td>
                    <span className="line-clamp-2 max-w-md text-sm text-fg-muted">{shown?.quote ?? ""}</span>
                  </Td>
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
