import type { Metadata } from "next";
import { listNews } from "@/lib/admin/events";
import { requireCapability } from "@/lib/admin/guard";
import { ItemList } from "../ItemPages";

export const metadata: Metadata = { title: "News" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function NewsPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listNews(), searchParams]);
  return (
    <ItemList
      kind="news"
      deleted={Boolean(q.deleted)}
      rows={rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        status: r.status,
        when: r.publishedAt,
        translations: r.translations,
      }))}
    />
  );
}
