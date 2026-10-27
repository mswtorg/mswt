import type { Metadata } from "next";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { listAlbums } from "@/lib/admin/gallery";
import { requireCapability } from "@/lib/admin/guard";
import { DataTable, PageHeader, Td, Th, Tr } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Gallery" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function GalleryPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listAlbums(), searchParams]);
  return (
    <>
      <PageHeader
        title="Gallery"
        description="Photo albums. An album appears in a language once its title in that language is reviewed."
        actions={<ButtonLink href="/admin/content/gallery/new">New album</ButtonLink>}
      />
      {q.deleted ? (
        <Alert tone="success" live="polite">
          <p>Album deleted. Its photos are still in the media library.</p>
        </Alert>
      ) : null}
      <DataTable caption="Albums">
        <thead>
          <tr>
            <Th>Album</Th>
            <Th>Status</Th>
            <Th>Languages</Th>
            <Th align="right">Photos</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-fg-muted">
                No albums yet.
              </td>
            </tr>
          ) : (
            rows.map((a) => (
              <Tr key={a.id}>
                <Td header>
                  <Link
                    href={`/admin/content/gallery/${a.id}`}
                    className="text-link-default underline underline-offset-4"
                  >
                    {a.translations.find((t) => t.locale === "en")?.title ?? a.slug}
                  </Link>
                  <span className="block text-xs font-normal text-fg-muted">/{a.slug}</span>
                </Td>
                <Td>
                  <Badge tone={a.status === "published" ? "success" : "neutral"}>
                    {a.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {routing.locales.map((l) => {
                      const t = a.translations.find((x) => x.locale === l);
                      return t ? (
                        <Badge key={l} tone={t.reviewedAt ? "success" : "warning"}>
                          {l.toUpperCase()}
                          <span className="sr-only">{t.reviewedAt ? " reviewed" : " draft"}</span>
                        </Badge>
                      ) : null;
                    })}
                  </span>
                </Td>
                <Td align="right">{a.photoCount}</Td>
              </Tr>
            ))
          )}
        </tbody>
      </DataTable>
    </>
  );
}
