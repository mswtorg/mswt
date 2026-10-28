import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage } from "@/lib/content/queries";
import { getTestimonial } from "@/lib/content/testimonials";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { ContentBody } from "@/components/content/ContentBody";
import { StoryDate } from "@/components/content/Testimonials";
import { TextLink } from "@/components/ui/TextLink";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string; slug: string }> };

// Stories render on first request and are then cached (ISR); unknown or untranslated ones 404.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const story = await getTestimonial(locale as Locale, slug);
  if (!story) return {};
  return pageMetadata({
    locale: locale as Locale,
    path: `/testimonials/${slug}`,
    title: story.title,
    description: story.summary,
    locales: story.locales,
    type: "article",
  });
}

export default async function TestimonialStoryPage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const story = await getTestimonial(locale, slug);
  if (!story) notFound();
  const [t, tc, listPage] = await Promise.all([
    getTranslations("Testimonials"),
    getTranslations("Common"),
    getPage("testimonials", locale),
  ]);
  const listName = listPage?.h1 ?? t("title");
  const path = `/testimonials/${slug}`;
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: listName, path: "/testimonials" },
    { name: story.title, path },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      {/* No Review markup: Google ignores reviews an organisation publishes about itself. */}
      <JsonLd
        graph={pageGraph([
          webPage({ locale, path, name: story.title, description: story.summary, hasBreadcrumb: true }),
          breadcrumbList(locale, path, crumbs),
        ])}
      />
      <PageHeader
        crumbs={[
          { label: tc("home"), href: `/${locale}` },
          { label: listName, href: `/${locale}/testimonials` },
          { label: story.title },
        ]}
        crumbLabel={tc("breadcrumb")}
        title={story.title}
      >
        <p className="mt-4 text-fg-muted">
          <span className="font-semibold text-fg-strong">{story.name}</span>
          {story.role ? <>, {story.role}</> : null}
          {" · "}
          <StoryDate day={story.storyDate} locale={locale} />
        </p>
      </PageHeader>
      <article>
        <ContentBody blocks={story.body} locale={locale} />
      </article>
      <p className="mt-10">
        <TextLink href={`/${locale}/testimonials`}>{t("more")}</TextLink>
      </p>
    </div>
  );
}
