import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getEvents, getPage, splitEvents } from "@/lib/content/queries";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { SampleBanner } from "@/components/content/Banners";
import { EventCard } from "@/components/content/Cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeadingRule } from "@/components/ui/Typography";

// Upcoming/past is decided when the page is rendered, so refresh at least hourly.
export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "Events" }),
    getPage("events", locale),
  ]);
  return pageMetadata({
    locale,
    path: "/events",
    title: page?.seoTitle ?? page?.title ?? t("title"),
    description: page?.seoDescription ?? page?.intro ?? t("description"),
  });
}

export default async function EventsPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, events] = await Promise.all([
    getTranslations("Events"),
    getTranslations("Common"),
    getEvents(locale),
  ]);
  // Text from Content → Pages → Events (list); the built-in text is only a safety net.
  const listPage = await getPage("events", locale);
  const heading = listPage?.h1 ?? t("title");
  const { upcoming, past } = splitEvents(events);
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/events" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/events",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/events", crumbs),
        ])}
      />
      <PageHero pageKey="events" locale={locale} className="mb-8" />
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
      <SampleBanner show={events.some((e) => e.isSample)} />
      {[
        { id: "upcoming", title: t("upcoming"), items: upcoming, empty: t("emptyUpcoming") },
        { id: "past", title: t("past"), items: past, empty: t("emptyPast") },
      ].map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-h`} className="mb-14">
          <HeadingRule id={`${group.id}-h`} className="mb-6 text-3xl">
            {group.title}
          </HeadingRule>
          {group.items.length === 0 ? (
            <EmptyState>{group.empty}</EmptyState>
          ) : (
            <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
              {group.items.map((e) => (
                <li key={e.slug} className="grid">
                  <EventCard event={e} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
