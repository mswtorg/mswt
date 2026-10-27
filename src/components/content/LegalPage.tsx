import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage } from "@/lib/content/queries";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { DraftBanner } from "@/components/content/Banners";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "./LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";

type LegalKey = "privacy" | "terms" | "refund_policy" | "disclaimer_80g";

/**
 * Privacy, terms, refund and 80G pages. Content comes from the CMS; in production only reviewed
 * translations exist, so an unapproved draft is a 404 there (and shows a draft banner in previews).
 */
export async function legalMetadata(key: LegalKey, path: string, locale: Locale): Promise<Metadata> {
  const page = await getPage(key, locale);
  if (!page) return {};
  return pageMetadata({
    locale,
    path,
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.intro ?? page.title,
    locales: page.locales,
    noindex: !page.reviewed,
  });
}

export async function LegalPage({
  pageKey,
  path,
  locale,
}: {
  pageKey: LegalKey;
  path: string;
  locale: Locale;
}) {
  setRequestLocale(locale);
  const page = await getPage(pageKey, locale);
  if (!page) notFound();
  const tc = await getTranslations("Common");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: page.title, path },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({ locale, path, name: page.title, description: page.intro, hasBreadcrumb: true }),
          breadcrumbList(locale, path, crumbs),
        ])}
      />
      <PageHero pageKey={pageKey} locale={locale} className="mb-8" />
      <PageHeader
        crumbs={[{ label: tc("home"), href: `/${locale}` }, { label: page.title }]}
        crumbLabel={tc("breadcrumb")}
        title={page.h1}
        lead={page.intro}
      />
      <DraftBanner show={!page.reviewed} />
      <ContentBody blocks={page.sections} locale={locale} />
    </div>
  );
}
