import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { albumsFrom, getAlbum } from "@/lib/content/queries";
import { getSiteContent } from "@/lib/content/source";
import { getMediaViews } from "@/lib/content/media";
import { breadcrumbList, imageObject, pageGraph, webPage } from "@/lib/seo/jsonld";
import { siteUrl } from "@/lib/seo/site";
import { getPhotoStrings } from "@/components/content/ContentBody";
import { PhotoGrid, type SlidePhoto } from "@/components/content/PhotoSlider";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImagePlaceholder } from "@/components/ui/ImagePlaceholder";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const content = await getSiteContent();
  return routing.locales.flatMap((locale) =>
    albumsFrom(content, locale).map((a) => ({ locale, slug: a.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const album = await getAlbum(locale as Locale, slug);
  if (!album) return {};
  return pageMetadata({
    locale: locale as Locale,
    path: `/gallery/${slug}`,
    title: album.seoTitle ?? album.title,
    description: album.seoDescription ?? album.description ?? album.title,
    locales: album.locales,
  });
}

export default async function AlbumPage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const album = await getAlbum(locale, slug);
  if (!album) notFound();
  const ids = album.items.flatMap((i) => (i.mediaId ? [i.mediaId] : []));
  const [t, tc, views, photoStrings] = await Promise.all([
    getTranslations("Gallery"),
    getTranslations("Common"),
    getMediaViews(ids, locale),
    getPhotoStrings(locale),
  ]);
  // Library photos (database albums); sample albums have none and keep their placeholders.
  const photos: SlidePhoto[] = album.items.flatMap((i) => {
    const v = i.mediaId ? views[i.mediaId] : undefined;
    return v?.src ? [{ ...v, alt: i.alt, caption: i.caption ?? v.caption }] : [];
  });
  const absolute = (src: string) => (src.startsWith("/") ? new URL(src, siteUrl()).toString() : src);
  const path = `/gallery/${slug}`;
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/gallery" },
    { name: album.title, path },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path,
            name: album.title,
            description: album.description,
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, path, crumbs),
          ...photos.map((p) =>
            imageObject({
              contentUrl: absolute(p.src!),
              caption: p.caption ?? p.alt,
              width: p.width,
              height: p.height,
            }),
          ),
        ])}
      />
      <PageHeader
        crumbs={[
          { label: tc("home"), href: `/${locale}` },
          { label: t("title"), href: `/${locale}/gallery` },
          { label: album.title },
        ]}
        crumbLabel={tc("breadcrumb")}
        title={album.title}
        lead={album.description}
      />
      <SampleBanner show={album.isSample} />
      {album.items.length === 0 ? (
        <EmptyState>{t("photoPending")}</EmptyState>
      ) : photos.length ? (
        <PhotoGrid photos={photos} t={photoStrings} />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {album.items.map((item, i) => (
            <li key={i}>
              <figure className="m-0 grid gap-2">
                <ImagePlaceholder description={item.alt} />
                {item.caption ? (
                  <figcaption className="text-sm text-fg-muted">{item.caption}</figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
