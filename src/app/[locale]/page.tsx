import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo/metadata";
import { ngo, pageGraph, webPage, website } from "@/lib/seo/jsonld";
import { getOrganizationSettings } from "@/lib/settings";
import { JsonLd } from "@/components/seo/JsonLd";
import { getHomeContent } from "@/lib/content/home";
import { getTestimonials } from "@/lib/content/testimonials";
import { ContentBody } from "@/components/content/ContentBody";
import { TestimonialList } from "@/components/content/Testimonials";
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
  const [t, tm, tn, tnews, org, causes, events, news, home, payments, donateCauses, testimonials] =
    await Promise.all([
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
    ]);
  const quotes = testimonials.filter((q) => q.showOnHome).slice(0, 6);
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
  const graph = pageGraph([
    org ? ngo(org, lang) : null,
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
      <section aria-labelledby="why-h" className="bg-bg-subtle py-12 lg:py-20">
        <div className="mx-auto max-w-(--size-container-max) px-4 lg:px-8">
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
        </div>
      </section>

      {home && home.impact.length > 0 ? (
        <section
          aria-labelledby="impact-h"
          className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8 lg:py-20"
        >
          <HeadingRule id="impact-h" className="text-3xl">
            {section("impactH")}
          </HeadingRule>
          <dl className="m-0 mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {home.impact.map((n, i) => (
              <div key={i} className="flex flex-col-reverse gap-1 border-t-2 border-border-rule pt-3">
                <dt className="text-fg-muted">{n.label}</dt>
                <dd className="m-0 text-4xl font-semibold text-fg-strong">{n.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {home && home.story.length > 0 ? (
        <section aria-labelledby="story-h" className="bg-bg-subtle py-12 lg:py-20">
          <div className="mx-auto max-w-(--size-container-max) px-4 lg:px-8">
            <HeadingRule id="story-h" className="text-3xl">
              {section("storyH")}
            </HeadingRule>
            <ContentBody blocks={home.story} locale={lang} />
            <p className="mt-6">
              <TextLink href={`/${locale}/about`}>{t("readStory")}</TextLink>
            </p>
          </div>
        </section>
      ) : null}

      {[...causes, ...upcoming, ...news].some((x) => x.isSample) ? (
        <div className="mx-auto max-w-(--size-container-max) px-4 pt-12 lg:px-8">
          <SampleBanner show />
        </div>
      ) : null}

      {causes.length > 0 ? (
        <section
          aria-labelledby="causes-h"
          className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8 lg:py-20"
        >
          <HeadingRule id="causes-h" className="text-3xl">
            {section("causesH")}
          </HeadingRule>
          <p className="mt-3 max-w-2xl text-fg-muted">{section("causesLead")}</p>
          <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
            {causes.slice(0, 3).map((c) => (
              <li key={c.slug} className="grid">
                <CauseCard cause={c} locale={locale as Locale} />
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <TextLink href={`/${locale}/causes`}>{t("allCauses")}</TextLink>
          </p>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section aria-labelledby="events-h" className="bg-bg-subtle py-12 lg:py-20">
          <div className="mx-auto max-w-(--size-container-max) px-4 lg:px-8">
            <HeadingRule id="events-h" className="text-3xl">
              {section("eventsH")}
            </HeadingRule>
            <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e) => (
                <li key={e.slug} className="grid">
                  <EventCard event={e} locale={locale as Locale} />
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <TextLink href={`/${locale}/events`}>{t("allEvents")}</TextLink>
            </p>
          </div>
        </section>
      ) : null}

      {news.length > 0 ? (
        <section
          aria-labelledby="news-h"
          className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8 lg:py-20"
        >
          <HeadingRule id="news-h" className="text-3xl">
            {section("newsH")}
          </HeadingRule>
          <ul className="m-0 mt-8 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
            {news.slice(0, 3).map((p) => (
              <li key={p.slug} className="grid">
                <NewsCard
                  post={p}
                  locale={locale as Locale}
                  publishedLabel={tnews("published", { date: formatDate(locale as Locale, p.publishedAt) })}
                />
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <TextLink href={`/${locale}/news`}>{t("allNews")}</TextLink>
          </p>
        </section>
      ) : null}

      {quotes.length > 0 ? (
        <section aria-labelledby="testimonials-h" className="bg-bg-subtle py-12 lg:py-20">
          <div className="mx-auto max-w-(--size-container-max) px-4 lg:px-8">
            <HeadingRule id="testimonials-h" className="text-3xl">
              {section("testimonialsH")}
            </HeadingRule>
            <TestimonialList items={quotes} locale={lang} />
          </div>
        </section>
      ) : null}

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
    </>
  );
}
