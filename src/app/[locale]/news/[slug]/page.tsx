import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { getNewsPost, newsFrom } from "@/lib/content/queries";
import { getSiteContent } from "@/lib/content/source";
import { formatDate, isoIst } from "@/lib/dates/format";
import { absoluteUrl } from "@/lib/seo/site";
import { breadcrumbList, newsArticle, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { ContentBody } from "@/components/content/ContentBody";
import { CoverImage } from "@/components/content/CoverImage";
import { LibraryPhotos } from "@/components/content/LibraryPhotos";
import { absoluteImageUrl } from "@/lib/content/media";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const content = await getSiteContent();
  return routing.locales.flatMap((locale) =>
    newsFrom(content, locale).map((n) => ({ locale, slug: n.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getNewsPost(locale as Locale, slug);
  if (!post) return {};
  return pageMetadata({
    locale: locale as Locale,
    path: `/news/${slug}`,
    title: post.seoTitle ?? post.headline,
    description: post.seoDescription ?? post.excerpt,
    locales: post.locales,
    type: "article",
  });
}

export default async function NewsArticlePage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const post = await getNewsPost(locale, slug);
  if (!post) notFound();
  const [t, tc, image] = await Promise.all([
    getTranslations("News"),
    getTranslations("Common"),
    absoluteImageUrl(post.coverImageId, locale as Locale),
  ]);
  const path = `/news/${slug}`;
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/news" },
    { name: post.headline, path },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({ locale, path, name: post.headline, description: post.excerpt, hasBreadcrumb: true }),
          breadcrumbList(locale, path, crumbs),
          // Google needs an image for article rich results: the cover photo, once set.
          newsArticle({
            headline: post.headline,
            url: absoluteUrl(locale, path),
            images: image ? [image] : [],
            published: post.publishedAt,
            authorName: post.authorName ?? undefined,
            locale,
          }),
        ])}
      />
      <PageHeader
        crumbs={[
          { label: tc("home"), href: `/${locale}` },
          { label: t("title"), href: `/${locale}/news` },
          { label: post.headline },
        ]}
        crumbLabel={tc("breadcrumb")}
        title={post.headline}
        lead={post.excerpt}
      >
        <p className="mt-4 text-sm text-fg-muted">
          <time dateTime={isoIst(post.publishedAt)}>
            {t("published", { date: formatDate(locale, post.publishedAt) })}
          </time>
          {post.authorName ? <> · {t("by", { name: post.authorName })}</> : null}
        </p>
      </PageHeader>
      <SampleBanner show={post.isSample} />
      <article className="grid gap-8">
        {post.coverImageId ? (
          <CoverImage
            mediaId={post.coverImageId}
            locale={locale}
            fallback={post.headline}
            ratio="wide"
            priority
          />
        ) : null}
        <ContentBody blocks={post.body} locale={locale as Locale} />
        <LibraryPhotos ids={post.photoIds} locale={locale} ratio="photo" />
      </article>
    </div>
  );
}
