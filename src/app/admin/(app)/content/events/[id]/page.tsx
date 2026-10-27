import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventForEdit } from "@/lib/admin/events";
import { istDateTime } from "@/lib/admin/format";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { pickLocale } from "@/components/admin/LanguageTabs";
import { ItemEditor, settingsSections } from "../../ItemPages";

export const metadata: Metadata = { title: "Event" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function EventPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale = pickLocale(q.lang);
  const [data, editor, { library }] = await Promise.all([
    getEventForEdit(id),
    editorMedia(locale),
    editorMedia("en"),
  ]);
  if (!data) notFound();
  const { event, translations } = data;
  return (
    <ItemEditor
      kind="events"
      id={id}
      slug={event.slug}
      status={event.status}
      title={translations.find((t) => t.locale === "en")?.title ?? event.slug}
      description={`Starts ${istDateTime(event.startsAt)} · ${event.status === "published" ? "Published" : "Draft"}`}
      locale={locale}
      sections={settingsSections("events", event, library)}
      translations={translations}
      editor={editor}
      flags={{ created: Boolean(q.created), removed: Boolean(q.removed) }}
    />
  );
}
