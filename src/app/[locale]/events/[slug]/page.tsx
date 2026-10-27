import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { eventsFrom, getEvent } from "@/lib/content/queries";
import { getSiteContent } from "@/lib/content/source";
import { formatDate, isoIst } from "@/lib/dates/format";
import { absoluteUrl } from "@/lib/seo/site";
import { breadcrumbList, event as eventLd, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { Badge } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Card";
import { ContentBody } from "@/components/content/ContentBody";
import { CoverImage } from "@/components/content/CoverImage";
import { LibraryPhotos } from "@/components/content/LibraryPhotos";
import { absoluteImageUrl } from "@/lib/content/media";
import { TextLink } from "@/components/ui/TextLink";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const content = await getSiteContent();
  return routing.locales.flatMap((locale) =>
    eventsFrom(content, locale).map((e) => ({ locale, slug: e.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const e = await getEvent(locale as Locale, slug);
  if (!e) return {};
  return pageMetadata({
    locale: locale as Locale,
    path: `/events/${slug}`,
    title: e.seoTitle ?? e.title,
    description: e.seoDescription ?? e.summary,
    locales: e.locales,
  });
}

export default async function EventPage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const e = await getEvent(locale, slug);
  if (!e) notFound();
  const [t, tc, image] = await Promise.all([
    getTranslations("Events"),
    getTranslations("Common"),
    absoluteImageUrl(e.coverImageId, locale),
  ]);
  const path = `/events/${slug}`;
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/events" },
    { name: e.title, path },
  ];
  const where = [e.venue?.name, e.venue?.street, e.venue?.city, e.venue?.region].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({ locale, path, name: e.title, description: e.summary, hasBreadcrumb: true }),
          breadcrumbList(locale, path, crumbs),
          eventLd({
            name: e.title,
            description: e.summary,
            url: absoluteUrl(locale, path),
            start: e.startsAt,
            end: e.endsAt ?? undefined,
            status: e.eventStatus,
            attendance: e.attendance,
            venue: e.venue
              ? {
                  name: e.venue.name,
                  streetAddress: e.venue.street,
                  city: e.venue.city,
                  region: e.venue.region,
                  postalCode: e.venue.postalCode,
                }
              : undefined,
            onlineUrl: e.onlineUrl ?? undefined,
            image,
          }),
        ])}
      />
      <PageHeader
        crumbs={[
          { label: tc("home"), href: `/${locale}` },
          { label: t("title"), href: `/${locale}/events` },
          { label: e.title },
        ]}
        crumbLabel={tc("breadcrumb")}
        title={e.title}
        lead={e.summary}
      >
        {e.eventStatus !== "scheduled" ? (
          <p className="mt-4">
            <Badge tone={e.eventStatus === "cancelled" ? "error" : "warning"}>
              {t(`status.${e.eventStatus}`)}
            </Badge>
          </p>
        ) : null}
      </PageHeader>
      <SampleBanner show={e.isSample} />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-8">
          {e.coverImageId ? (
            <CoverImage mediaId={e.coverImageId} locale={locale} fallback={e.title} ratio="wide" priority />
          ) : null}
          <ContentBody blocks={e.body} locale={locale as Locale} />
          <LibraryPhotos ids={e.photoIds} locale={locale} ratio="photo" />
        </div>
        <Panel>
          <dl className="m-0 grid gap-4">
            <div>
              <dt className="font-semibold text-fg-strong">{t("when")}</dt>
              <dd className="m-0">
                <time dateTime={isoIst(e.startsAt)}>{formatDate(locale, e.startsAt, true)}</time>
                {e.endsAt ? (
                  <>
                    {" – "}
                    <time dateTime={isoIst(e.endsAt)}>{formatDate(locale, e.endsAt, true)}</time>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-fg-strong">{t("where")}</dt>
              <dd className="m-0">
                {e.attendance === "online"
                  ? t("online")
                  : e.attendance === "mixed"
                    ? `${where} · ${t("onlineAndVenue")}`
                    : where}
                {e.onlineUrl && e.attendance !== "offline" ? (
                  <span className="mt-2 block">
                    <TextLink href={e.onlineUrl}>{t("joinOnline")}</TextLink>
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
