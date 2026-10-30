import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo/metadata";
import { ngo, pageGraph, webPage, website } from "@/lib/seo/jsonld";
import { getOrganizationSettings } from "@/lib/settings";
import { JsonLd } from "@/components/seo/JsonLd";
import { getHomeContent, getHomeSections, type HomeSectionKey } from "@/lib/content/home";
import { getTestimonials } from "@/lib/content/testimonials";
import { getTeam } from "@/lib/content/team";
import { ContentBody } from "@/components/content/ContentBody";
import { TestimonialList } from "@/components/content/Testimonials";
import { CountUp } from "@/components/content/CountUp";
import { Card, CardBody } from "@/components/ui/Card";
import { getCauses, getEvents, getNews, splitEvents } from "@/lib/content/queries";
import { formatDate } from "@/lib/dates/format";
import { CauseCard, EventCard, NewsCard } from "@/components/content/Cards";
import { SampleBanner } from "@/components/content/Banners";
import { PageHero } from "@/components/content/LibraryPhotos";
import { QuickDonate } from "@/components/donate/QuickDonate";
import { PAGES } from "@/config/nav";
import { getPaymentSettings } from "@/lib/payment-settings";
import { donatableCauses } from "@/lib/donations/causes";
import { cn } from "@/lib/cn";
import { HeadingRule } from "@/components/ui/Typography";
import { TextLink } from "@/components/ui/TextLink";
import { Eyebrow } from "@/components/ui/Typography";

type Props = { params: Promise<{ locale: string }> };
type Tone = "subtle" | "plain";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [t, home] = await Promise.all([
    getTranslations({ locale: locale as Locale, namespace: "Meta" }),
    getHomeContent(locale as Locale),
  ]);
  return buildMetadata({
    locale: locale as Locale,
    path: "",
    title: home?.seoTitle ?? home?.title ?? t("homeTitle"),
    description: home?.seoDescription ?? home?.intro ?? t("homeDescription"),
    siteName: t("siteName"),
    absoluteTitle: true,
  });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  // Same check as the layout: "/favicon.ico" and other unknown paths also reach this page.
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale as Locale);
  const [
    t,
    tm,
    tn,
    tnews,
    org,
    causes,
    events,
    news,
    home,
    payments,
    donateCauses,
    testimonials,
    order,
    team,
  ] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Meta"),
    getTranslations("Nav"),
    getTranslations("News"),
    getOrganizationSettings(),
    getCauses(locale as Locale),
    getEvents(locale as Locale),
    getNews(locale as Locale),
    getHomeContent(locale as Locale),
    getPaymentSettings(),
    donatableCauses(locale as Locale),
    getTestimonials(locale as Locale),
    getHomeSections(),
    getTeam(locale as Locale),
  ]);
  const quotes = testimonials.filter((q) => q.showOnHome).slice(0, 6);
  const tt = await getTranslations("Testimonials");
  // Settings → Payments → "Show the quick donate box on Home", and only once donations are live.
  const donateBox = PAGES.donate.ready && (payments?.homeDonateBox ?? true) && payments;
  const section = (k: keyof NonNullable<typeof home>["sections"]) => home?.sections[k] || t(k);
  // Text edited under Content → Pages → Home, or the built-in text for languages not written yet.
  const hero = {
    eyebrow: home ? home.eyebrow : t("eyebrow"),
    h1: home?.h1 ?? t("h1"),
    intro: home ? home.intro : t("intro"),
    points:
      home?.points ?? ([1, 2, 3] as const).map((n) => ({ title: t(`trust${n}t`), text: t(`trust${n}`) })),
  };
  const upcoming = splitEvents(events).upcoming.slice(0, 3);
  const lang = locale as Locale;

  /** A full-width section band; `tone` alternates the background down the page. */
  const band = (id: string, tone: Tone, children: ReactNode) => (
    <section aria-labelledby={id} className={cn("py-12 lg:py-20", tone === "subtle" && "bg-bg-subtle")}>
      <div className="mx-auto max-w-(--size-container-max) px-4 lg:px-8">{children}</div>
    </section>
  );
  const heading = (id: string, text: string) => (
    <HeadingRule id={id} className="text-3xl">
      {text}
    </HeadingRule>
  );
  // Each section, or null when it has nothing to show (it is then skipped).
  const sections: Record<HomeSectionKey, ((tone: Tone) => ReactNode) | null> = {
    impact: home?.impact.length
      ? (tone) =>
          band(
            "impact-h",
            tone,
            <>
              {heading("impact-h", section("impactH"))}
              <ul className="m-0 mt-8 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {home.impact.map((n, i) => (
                  <li key={i} className="grid">
                    <Card>
                      <CardBody className="gap-2">
                        <p className="text-4xl leading-tight font-semibold text-fg-brand lg:text-5xl">
                          <CountUp text={n.value} />
                        </p>
                        <p className="text-fg-muted">{n.label}</p>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            </>,
          )
      : null,
    why: (tone) =>
      band(
        "why-h",
        tone,
        <>
          <h2 id="why-h" className="sr-only">
            {section("whyTitle")}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {hero.points.map((p, i) => (
              <div key={i} className="border-t-2 border-border-rule pt-3">
                <h3 className="mb-2 text-xl">{p.title}</h3>
                <p className="text-fg-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </>,
      ),
    story: home?.story.length
      ? (tone) =>
          band(
            "story-h",
            tone,
            <>
              {heading("story-h", section("storyH"))}
              <ContentBody blocks={home.story} locale={lang} />
              <p className="mt-6">
                <TextLink href={`/${locale}/about`}>{t("readStory")}</TextLink>
              </p>
            </>,
          )
      : null,
    causes: causes.length
      ? (tone) =>
          band(
            "causes-h",
            tone,
            <>
              {heading("causes-h", section("causesH"))}
              <p className="mt-3 text-fg-muted">{section("causesLead")}</p>
              <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
                {causes.slice(0, 3).map((c) => (
                  <li key={c.slug} className="grid">
                    <CauseCard cause={c} locale={lang} />
                  </li>
                ))}
              </ul>
              <p className="mt-6">
                <TextLink href={`/${locale}/causes`}>{t("allCauses")}</TextLink>
              </p>
            </>,
          )
      : null,
    events: upcoming.length
      ? (tone) =>
          band(
            "events-h",
            tone,
            <>
              {heading("events-h", section("eventsH"))}
              <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((e) => (
                  <li key={e.slug} className="grid">
                    <EventCard event={e} locale={lang} />
                  </li>
                ))}
              </ul>
              <p className="mt-6">
                <TextLink href={`/${locale}/events`}>{t("allEvents")}</TextLink>
              </p>
            </>,
          )
      : null,
    news: news.length
      ? (tone) =>
          band(
            "news-h",
            tone,
            <>
              {heading("news-h", section("newsH"))}
              <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
                {news.slice(0, 3).map((p) => (
                  <li key={p.slug} className="grid">
                    <NewsCard
                      post={p}
                      locale={lang}
                      publishedLabel={tnews("published", { date: formatDate(lang, p.publishedAt) })}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-6">
                <TextLink href={`/${locale}/news`}>{t("allNews")}</TextLink>
              </p>
            </>,
          )
      : null,
    testimonials: quotes.length
      ? (tone) =>
          band(
            "testimonials-h",
            tone,
            <>
              {heading("testimonials-h", section("testimonialsH"))}
              <TestimonialList items={quotes} locale={lang} />
              <p className="mt-6">
                <TextLink href={`/${locale}/testimonials`}>{tt("all")}</TextLink>
              </p>
            </>,
          )
      : null,
    // The donate band keeps its brand colour wherever it is placed.
    band: () => (
      <section
        aria-labelledby="transparency-h"
        className="on-dark bg-bg-brand py-12 text-fg-on-brand lg:py-16"
      >
        <div className="mx-auto flex max-w-(--size-container-max) flex-wrap items-center justify-between gap-6 px-4 lg:px-8">
          <div className="max-w-2xl">
            <h2 id="transparency-h" className="text-3xl text-fg-on-brand">
              {section("bandH")}
            </h2>
            <p className="mt-3 text-fg-on-brand-muted">{section("bandP")}</p>
          </div>
          <a href={`/${locale}/transparency`} className="text-fg-on-brand underline underline-offset-4">
            {tn("transparency")}
          </a>
        </div>
      </section>
    ),
  };
  const shownSections = order.filter((k) => sections[k]);
  const graph = pageGraph([
    org ? ngo(org, lang, team) : null,
    website(
      lang,
      tm("siteName"),
      org ? [org.displayName, org.legalName, ...Object.values(org.alternateNames ?? {}).flat()] : [],
    ),
    webPage({ locale: lang, path: "", name: tm("homeTitle"), description: tm("homeDescription") }),
  ]);

  return (
    <>
      <JsonLd graph={graph} />
      <PageHero pageKey="home" locale={lang} variant="full" />
      <section
        className={cn(
          "mx-auto grid max-w-(--size-container-max) items-start gap-8 px-4 py-10 lg:px-8 lg:py-12",
          donateBox && "lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12",
        )}
      >
        <div>
          {hero.eyebrow ? <Eyebrow>{hero.eyebrow}</Eyebrow> : null}
          <h1 className="text-4xl lg:text-5xl">{hero.h1}</h1>
          {hero.intro ? <p className="mt-6 text-xl text-fg-muted">{hero.intro}</p> : null}
        </div>
        {donateBox ? (
          <QuickDonate locale={lang} presets={donateBox.presetAmountsPaise} causes={donateCauses} />
        ) : null}
      </section>
      {[...causes, ...upcoming, ...news].some((x) => x.isSample) ? (
        <div className="mx-auto max-w-(--size-container-max) px-4 pt-12 lg:px-8">
          <SampleBanner show />
        </div>
      ) : null}
      {/* Sections in the order set in Content → Pages → Home; backgrounds alternate whatever the order. */}
      {shownSections.map((key, i) => (
        <Fragment key={key}>{sections[key]!(i % 2 === 0 ? "subtle" : "plain")}</Fragment>
      ))}
    </>
  );
}
