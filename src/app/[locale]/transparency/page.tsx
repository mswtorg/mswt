import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage, getReports } from "@/lib/content/queries";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { getMediaStorage } from "@/lib/storage/media";
import { JsonLd } from "@/components/seo/JsonLd";
import { ContentBody } from "@/components/content/ContentBody";
import { PageHero } from "@/components/content/LibraryPhotos";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeadingRule } from "@/components/ui/Typography";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "Transparency" }),
    getPage("transparency", locale),
  ]);
  // Text edited under Content → Pages wins; the built-in text is used until a language is written.
  return pageMetadata({
    locale,
    path: "/transparency",
    title: page?.seoTitle ?? page?.title ?? t("title"),
    description: page?.seoDescription ?? page?.intro ?? t("description"),
  });
}

export default async function TransparencyPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, reports, page] = await Promise.all([
    getTranslations("Transparency"),
    getTranslations("Common"),
    getReports(locale),
    getPage("transparency", locale),
  ]);
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/transparency" },
  ];
  const mediaBase = getMediaStorage()?.publicBase ?? null;
  const byYear = Object.entries(Object.groupBy(reports, (r) => r.fy)).sort(([a], [b]) => b.localeCompare(a));
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/transparency",
            name: t("title"),
            description: t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/transparency", crumbs),
        ])}
      />
      <PageHero pageKey="transparency" locale={locale} className="mb-8" />
      <PageHeader
        crumbs={[{ label: tc("home"), href: `/${locale}` }, { label: t("title") }]}
        crumbLabel={tc("breadcrumb")}
        title={page?.h1 ?? t("title")}
        lead={page?.intro ?? t("lead")}
      />
      {page?.sections.length ? (
        <div className="mb-10">
          <ContentBody blocks={page.sections} locale={locale} />
        </div>
      ) : null}
      <SampleBanner show={reports.some((r) => r.isSample)} />
      {byYear.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <div className="grid gap-12">
          {byYear.map(([fy, items]) => (
            <section key={fy} aria-labelledby={`fy-${fy}`}>
              <HeadingRule id={`fy-${fy}`} className="text-2xl">
                {t("fy", { fy })}
              </HeadingRule>
              <ul className="mt-4 grid list-none gap-3 p-0">
                {items!.map((r) => (
                  <li
                    key={r.kind}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-decorative px-5 py-4"
                  >
                    <span>
                      <span className="block font-semibold text-fg-strong">{r.title}</span>
                      <span className="text-sm text-fg-muted">{t(`kind.${r.kind}`)}</span>
                    </span>
                    {r.pdfKey && mediaBase ? (
                      <a
                        href={`${mediaBase}/${r.pdfKey}`}
                        className="font-semibold text-link-default underline underline-offset-4"
                      >
                        {t("download", { size: r.pdfBytes ? (r.pdfBytes / 1024 / 1024).toFixed(1) : "–" })}
                        <span className="sr-only">: {r.title}</span>
                      </a>
                    ) : (
                      <span className="text-sm text-fg-muted">{t("fileSoon")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
