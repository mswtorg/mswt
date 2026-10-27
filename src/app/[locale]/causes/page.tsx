import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getCauses, getPage } from "@/lib/content/queries";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { SampleBanner } from "@/components/content/Banners";
import { CauseCard } from "@/components/content/Cards";
import { EmptyState } from "@/components/ui/EmptyState";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "Causes" }),
    getPage("causes", locale),
  ]);
  return pageMetadata({
    locale,
    path: "/causes",
    title: page?.seoTitle ?? page?.title ?? t("title"),
    description: page?.seoDescription ?? page?.intro ?? t("description"),
  });
}

export default async function CausesPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, causes] = await Promise.all([
    getTranslations("Causes"),
    getTranslations("Common"),
    getCauses(locale),
  ]);
  // Text from Content → Pages → Causes (list); the built-in text is only a safety net.
  const listPage = await getPage("causes", locale);
  const heading = listPage?.h1 ?? t("title");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/causes" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/causes",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/causes", crumbs),
        ])}
      />
      <PageHero pageKey="causes" locale={locale} className="mb-8" />
      <PageHeader
        crumbs={[{ label: tc("home"), href: `/${locale}` }, { label: heading }]}
        crumbLabel={tc("breadcrumb")}
        title={heading}
        lead={listPage?.intro ?? t("lead")}
      />
      {listPage?.sections.length ? (
        <div className="mb-10">
          <ContentBody blocks={listPage.sections} locale={locale} />
        </div>
      ) : null}
      <SampleBanner show={causes.some((c) => c.isSample)} />
      {causes.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
          {causes.map((c) => (
            <li key={c.slug} className="grid">
              <CauseCard cause={c} locale={locale} headingLevel={2} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
