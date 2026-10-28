import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage } from "@/lib/content/queries";
import { getTestimonials } from "@/lib/content/testimonials";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { TestimonialList } from "@/components/content/Testimonials";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 9;
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string }> };

function pageNumber(raw: string | undefined): number {
  const n = Number(raw ?? "1");
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const page = pageNumber((await searchParams).page);
  const [t, tc, listPage] = await Promise.all([
    getTranslations({ locale, namespace: "Testimonials" }),
    getTranslations({ locale, namespace: "Common" }),
    getPage("testimonials", locale),
  ]);
  const title = listPage?.seoTitle ?? listPage?.title ?? t("title");
  return pageMetadata({
    locale,
    path: page > 1 ? `/testimonials?page=${page}` : "/testimonials",
    title: page > 1 ? `${title} – ${tc("pageOf", { page, total: page })}` : title,
    description: listPage?.seoDescription ?? listPage?.intro ?? t("description"),
  });
}

export default async function TestimonialsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, stories, listPage] = await Promise.all([
    getTranslations("Testimonials"),
    getTranslations("Common"),
    getTestimonials(locale),
    getPage("testimonials", locale),
  ]);
  // Text from Content → Pages → Testimonials (list); the built-in text is only a safety net.
  const heading = listPage?.h1 ?? t("title");
  const total = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
  const page = Math.min(pageNumber((await searchParams).page), total);
  const shown = stories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/testimonials" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/testimonials",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/testimonials", crumbs),
        ])}
      />
      <PageHero pageKey="testimonials" locale={locale} className="mb-8" />
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
      {shown.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <TestimonialList items={shown} locale={locale} headingLevel={2} />
      )}
      <Pagination
        page={page}
        total={total}
        hrefFor={(n) => (n === 1 ? `/${locale}/testimonials` : `/${locale}/testimonials?page=${n}`)}
        labels={{
          nav: tc("pagination"),
          previous: tc("previous"),
          next: tc("next"),
          pageOf: tc("pageOf", { page, total }),
        }}
      />
    </div>
  );
}
