import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getAlbums, getPage } from "@/lib/content/queries";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { SampleBanner } from "@/components/content/Banners";
import { AlbumCard } from "@/components/content/Cards";
import { EmptyState } from "@/components/ui/EmptyState";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "Gallery" }),
    getPage("gallery", locale),
  ]);
  return pageMetadata({
    locale,
    path: "/gallery",
    title: page?.seoTitle ?? page?.title ?? t("title"),
    description: page?.seoDescription ?? page?.intro ?? t("description"),
  });
}

export default async function GalleryPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, albums] = await Promise.all([
    getTranslations("Gallery"),
    getTranslations("Common"),
    getAlbums(locale),
  ]);
  // Text from Content → Pages → Gallery (list); the built-in text is only a safety net.
  const listPage = await getPage("gallery", locale);
  const heading = listPage?.h1 ?? t("title");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/gallery" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/gallery",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/gallery", crumbs),
        ])}
      />
      <PageHero pageKey="gallery" locale={locale} className="mb-8" />
      <PageHeader
        crumbs={[{ label: tc("home"), href: `/${locale}` }, { label: heading }]}
        crumbLabel={tc("breadcrumb")}
        title={heading}
        lead={listPage?.intro ?? t("description")}
      />
      {listPage?.sections.length ? (
        <div className="mb-10">
          <ContentBody blocks={listPage.sections} locale={locale} />
        </div>
      ) : null}
      <SampleBanner show={albums.some((a) => a.isSample)} />
      {albums.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <li key={a.slug} className="grid">
              <AlbumCard album={a} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
