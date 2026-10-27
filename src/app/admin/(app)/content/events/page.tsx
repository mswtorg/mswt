import type { Metadata } from "next";
import { listEvents } from "@/lib/admin/events";
import { requireCapability } from "@/lib/admin/guard";
import { ItemList } from "../ItemPages";

export const metadata: Metadata = { title: "Events" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function EventsPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const [rows, q] = await Promise.all([listEvents(), searchParams]);
  return (
    <ItemList
      kind="events"
      deleted={Boolean(q.deleted)}
      rows={rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        status: r.status,
        when: r.startsAt,
        translations: r.translations,
      }))}
    />
  );
}
