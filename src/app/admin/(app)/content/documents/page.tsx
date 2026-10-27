import type { Metadata } from "next";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { listDocuments } from "@/lib/admin/documents";
import { requireCapability } from "@/lib/admin/guard";
import { DataTable, PageHeader, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { KIND_LABEL } from "./fields";

export const metadata: Metadata = { title: "Documents" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

const size = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : "No PDF yet");

export default async function DocumentsPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listDocuments(), searchParams]);
  return (
    <>
      <PageHeader
        title="Documents"
        description="Annual reports and audited accounts on the Transparency page, as public PDFs."
        actions={<ButtonLink href="/admin/content/documents/new">New document</ButtonLink>}
      />
      {q.deleted ? (
        <Alert tone="success" live="polite">
          <p>Document deleted.</p>
        </Alert>
      ) : null}
      <DataTable caption="Documents">
        <thead>
          <tr>
            <Th>Document</Th>
            <Th>Year</Th>
            <Th>Status</Th>
            <Th>Languages</Th>
            <Th>PDF</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                No documents yet.
              </td>
            </tr>
          ) : (
            rows.map((d) => (
              <Tr key={d.id}>
                <Td header>
                  <Link
                    href={`/admin/content/documents/${d.id}`}
                    className="text-link-default underline underline-offset-4"
                  >
                    {d.translations.find((t) => t.locale === "en")?.title ?? KIND_LABEL[d.kind]}
                  </Link>
                  <span className="block text-xs font-normal text-fg-muted">{KIND_LABEL[d.kind]}</span>
                </Td>
                <Td>{d.fy}</Td>
                <Td>
                  <Badge tone={d.status === "published" ? "success" : "neutral"}>
                    {d.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {routing.locales.map((l) => {
                      const t = d.translations.find((x) => x.locale === l);
                      return t ? (
                        <Badge key={l} tone={t.reviewedAt ? "success" : "warning"}>
                          {l.toUpperCase()}
                          <span className="sr-only">{t.reviewedAt ? " reviewed" : " draft"}</span>
                        </Badge>
                      ) : null;
                    })}
                  </span>
                </Td>
                <Td>{size(d.pdfBytes)}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </>
  );
}
