import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getNews, getPage } from "@/lib/content/queries";
import { formatDate } from "@/lib/dates/format";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { SampleBanner } from "@/components/content/Banners";
import { NewsCard } from "@/components/content/Cards";
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
    getTranslations({ locale, namespace: "News" }),
    getTranslations({ locale, namespace: "Common" }),
    getPage("news", locale),
  ]);
  const title = listPage?.seoTitle ?? listPage?.title ?? t("title");
  const meta = await pageMetadata({
    locale,
    path: page > 1 ? `/news?page=${page}` : "/news",
    title: page > 1 ? `${title} – ${tc("pageOf", { page, total: page })}` : title,
    description: listPage?.seoDescription ?? listPage?.intro ?? t("description"),
  });
  return meta;
}

export default async function NewsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, posts, listPage] = await Promise.all([
    getTranslations("News"),
    getTranslations("Common"),
    getNews(locale),
    getPage("news", locale),
  ]);
  // Text from Content → Pages → News (list); the built-in text is only a safety net.
  const heading = listPage?.h1 ?? t("title");
  const total = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const page = Math.min(pageNumber((await searchParams).page), total);
  const shown = posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/news" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/news",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/news", crumbs),
        ])}
      />
      <PageHero pageKey="news" locale={locale} className="mb-8" />
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
      <SampleBanner show={posts.some((p) => p.isSample)} />
      {shown.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.slug} className="grid">
              <NewsCard
                post={p}
                locale={locale}
                publishedLabel={t("published", { date: formatDate(locale, p.publishedAt) })}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        total={total}
        hrefFor={(n) => (n === 1 ? `/${locale}/news` : `/${locale}/news?page=${n}`)}
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
