import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNewsForEdit } from "@/lib/admin/events";
import { istDateTime } from "@/lib/admin/format";
import { requireCapability } from "@/lib/admin/guard";
import { editorMedia } from "@/lib/admin/media";
import { pickLocale } from "@/components/admin/LanguageTabs";
import { ItemEditor, settingsSections } from "../../ItemPages";

export const metadata: Metadata = { title: "News post" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function NewsPostPage({ params, searchParams }: Props) {
  await requireCapability("cms.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const locale = pickLocale(q.lang);
  const [data, editor, { library }] = await Promise.all([
    getNewsForEdit(id),
    editorMedia(locale),
    editorMedia("en"),
  ]);
  if (!data) notFound();
  const { post, translations } = data;
  return (
    <ItemEditor
      kind="news"
      id={id}
      slug={post.slug}
      status={post.status}
      title={translations.find((t) => t.locale === "en")?.headline ?? post.slug}
      description={
        post.status === "published" && post.publishedAt
          ? `Published ${istDateTime(post.publishedAt)}`
          : "Draft"
      }
      locale={locale}
      sections={settingsSections("news", post, library)}
      translations={translations.map((t) => ({ ...t, title: t.headline, summary: t.excerpt }))}
      editor={editor}
      flags={{ created: Boolean(q.created), removed: Boolean(q.removed) }}
    />
  );
}
