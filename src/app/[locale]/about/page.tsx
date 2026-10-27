import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage } from "@/lib/content/queries";
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
import { ImagePlaceholder } from "@/components/ui/ImagePlaceholder";
import { ResponsiveImage } from "@/components/content/ResponsiveImage";
import { getMediaViews } from "@/lib/content/media";
import { TextLink } from "@/components/ui/TextLink";

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
  const [t, tc, page, org] = await Promise.all([
    getTranslations("About"),
    getTranslations("Common"),
    getPage("about", locale),
    getOrganizationSettings(),
  ]);
  if (!page && !org) notFound();
  const title = page?.h1 ?? t("title");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/about" },
  ];
  const trustees = (org?.trustees ?? []).slice().sort((a, b) => a.sort - b.sort);
  const rows: [string, string][] = org
    ? ([
        [t("legalName"), org.legalName],
        [t("pan"), org.trustPan],
        [t("reg12a"), org.reg12aNumber],
        [
          t("reg80g"),
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
        ],
        [t("fcra"), t("fcraValue")],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          org ? ngo(org, locale) : null,
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
              <li key={p.name} className="grid justify-items-center gap-2 text-center">
                <TrusteePhoto mediaId={p.photoMediaId ?? null} name={p.name} locale={locale} />
                <h3 className="text-lg">{p.name}</h3>
                <p className="text-sm text-fg-muted">{p.role}</p>
              </li>
            ))}
          </ul>
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
            <TextLink href={`/${locale}/transparency`}>{t("reports")}</TextLink>
          </p>
        </section>
      ) : null}
    </div>
  );
}

/** A trustee's library photo (round), or the placeholder when none is set or it lacks alt text here. */
async function TrusteePhoto({
  mediaId,
  name,
  locale,
}: {
  mediaId: string | null;
  name: string;
  locale: Locale;
}) {
  const image = mediaId ? (await getMediaViews([mediaId], locale))[mediaId] : undefined;
  if (!image?.alt || !image.src) return <ImagePlaceholder description={name} round className="w-32" />;
  return (
    <ResponsiveImage
      image={image}
      alt={image.alt}
      sizes="128px"
      className="aspect-square w-32 rounded-full"
    />
  );
}
