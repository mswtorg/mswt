import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { ReactNode } from "react";
import { getPage, getReports } from "@/lib/content/queries";
import { getMediaStorage } from "@/lib/storage/media";
import { formatDate } from "@/lib/dates/format";
import { breadcrumbList, ngo, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { getOrganizationSettings } from "@/lib/settings";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHero } from "@/components/content/LibraryPhotos";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { ContentBody } from "@/components/content/ContentBody";
import { HeadingRule } from "@/components/ui/Typography";
import { TextLink } from "@/components/ui/TextLink";
import { getTestimonials } from "@/lib/content/testimonials";
import { TestimonialList } from "@/components/content/Testimonials";
import { TeamPhoto } from "@/components/content/TeamPhoto";
import { getTeam } from "@/lib/content/team";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "About" }),
    getPage("about", locale),
  ]);
  return pageMetadata({
    locale,
    path: "/about",
    title: page?.title ?? t("title"),
    description: page?.intro ?? t("description"),
  });
}

export default async function AboutPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, tt, tr, page, org, testimonials, documents, team] = await Promise.all([
    getTranslations("About"),
    getTranslations("Common"),
    getTranslations("Testimonials"),
    getTranslations("Transparency"),
    getPage("about", locale),
    getOrganizationSettings(),
    getTestimonials(locale),
    getReports(locale),
    getTeam(locale),
  ]);
  if (!page && !org) notFound();
  const title = page?.h1 ?? t("title");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/about" },
  ];
  // Content → Team: members ticked "Show on About"; everyone is on /team.
  const trustees = team.filter((m) => m.showOnAbout);
  // A published certificate (Content → Documents) is linked next to its registration number.
  const mediaBase = getMediaStorage()?.publicBase ?? null;
  const withCertificate = (value: string | null, kind: "cert_12a" | "cert_80g") => {
    const cert = documents.find((d) => d.kind === kind && d.pdfKey);
    if (!value || !cert || !mediaBase) return value;
    return (
      <>
        {value} ·{" "}
        <a href={`${mediaBase}/${cert.pdfKey}`} className="text-link-default underline underline-offset-4">
          {t("viewCertificate")}
          <span className="sr-only">: {tr(`kind.${kind}`)}</span>
        </a>
      </>
    );
  };
  const rows: [string, ReactNode][] = org
    ? ([
        [t("legalName"), org.legalName],
        [t("pan"), org.trustPan],
        [t("reg12a"), withCertificate(org.reg12aNumber, "cert_12a")],
        [
          t("reg80g"),
          withCertificate(
            org.reg80gNumber &&
              [
                org.reg80gNumber,
                org.reg80gValidFrom && org.reg80gValidTo
                  ? t("validity", {
                      from: formatDate(locale, new Date(org.reg80gValidFrom)),
                      to: formatDate(locale, new Date(org.reg80gValidTo)),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(", "),
            "cert_80g",
          ),
        ],
        [t("fcra"), t("fcraValue")],
      ].filter(([, v]) => v) as [string, ReactNode][])
    : [];

  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          org ? ngo(org, locale, team) : null,
          webPage({
            type: "AboutPage",
            locale,
            path: "/about",
            name: title,
            description: page?.intro,
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/about", crumbs),
        ])}
      />
      <PageHero pageKey="about" locale={locale} className="mb-8" />
      <PageHeader
        crumbs={crumbs.map((c, i) => ({
          label: c.name,
          href: i < crumbs.length - 1 ? `/${locale}${c.path}` : undefined,
        }))}
        crumbLabel={tc("breadcrumb")}
        title={title}
        lead={page?.intro}
      />
      <SampleBanner show={page?.isSample ?? false} />
      {page ? <ContentBody blocks={page.sections} locale={locale} /> : null}

      {trustees.length > 0 ? (
        <section aria-labelledby="trustees-h" className="mt-16">
          <HeadingRule id="trustees-h" className="text-3xl">
            {t("trustees")}
          </HeadingRule>
          <ul className="mt-8 grid list-none gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {trustees.map((p) => (
              <li key={p.id} className="grid justify-items-center gap-2 text-center">
                <TeamPhoto mediaId={p.photoId} name={p.name} locale={locale} />
                <h3 className="text-lg">{p.name}</h3>
                <p className="text-sm text-fg-muted">{p.designation}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <TextLink href={`/${locale}/team`}>{t("allTeam")}</TextLink>
          </p>
        </section>
      ) : null}

      {testimonials.length > 0 ? (
        <section aria-labelledby="testimonials-h" className="mt-16">
          <HeadingRule id="testimonials-h" className="text-3xl">
            {t("testimonials")}
          </HeadingRule>
          <TestimonialList items={testimonials.slice(0, 6)} locale={locale} />
          <p className="mt-6">
            <TextLink href={`/${locale}/testimonials`}>{tt("all")}</TextLink>
          </p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section aria-labelledby="reg-h" className="mt-16">
          <HeadingRule id="reg-h" className="text-3xl">
            {t("registration")}
          </HeadingRule>
          <dl className="mt-6 grid max-w-3xl gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-fg-strong">{k}</dt>
                <dd className="m-0">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6">
            <TextLink
              href={`/${locale}/transparency${documents.some((d) => d.kind.startsWith("cert_")) ? "#certificates" : ""}`}
            >
              {t("reports")}
            </TextLink>
          </p>
        </section>
      ) : null}
    </div>
  );
}
