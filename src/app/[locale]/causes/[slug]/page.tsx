import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { causesFrom, getCause } from "@/lib/content/queries";
import { getSiteContent } from "@/lib/content/source";
import { formatRupees } from "@/lib/money";
import { breadcrumbList, donateAction, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { PAGES } from "@/config/nav";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { SampleBanner } from "@/components/content/Banners";
import { Badge } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Panel, Progress } from "@/components/ui/Card";
import { CoverImage } from "@/components/content/CoverImage";
import { LibraryPhotos } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const content = await getSiteContent();
  return routing.locales.flatMap((locale) =>
    causesFrom(content, locale).map((c) => ({ locale, slug: c.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const cause = await getCause(locale as Locale, slug);
  if (!cause) return {};
  return pageMetadata({
    locale: locale as Locale,
    path: `/causes/${slug}`,
    title: cause.seoTitle ?? cause.title,
    description: cause.seoDescription ?? cause.summary,
    locales: cause.locales,
  });
}

export default async function CausePage({ params }: Props) {
  const { locale: l, slug } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  const cause = await getCause(locale, slug);
  if (!cause) notFound();
  const [t, tc, tn] = await Promise.all([
    getTranslations("Causes"),
    getTranslations("Common"),
    getTranslations("Nav"),
  ]);
  const path = `/causes/${slug}`;
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: tn("causes"), path: "/causes" },
    { name: cause.title, path },
  ];
  const pct = cause.goalPaise ? Math.round((cause.raisedPaise / cause.goalPaise) * 100) : null;
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({ locale, path, name: cause.title, description: cause.summary, hasBreadcrumb: true }),
          breadcrumbList(locale, path, crumbs),
          cause.status === "active" && PAGES.donate.ready
            ? donateAction(locale, t("donateTo", { title: cause.title }))
            : null,
        ])}
      />
      <PageHeader
        crumbs={[
          { label: tc("home"), href: `/${locale}` },
          { label: tn("causes"), href: `/${locale}/causes` },
          { label: cause.title },
        ]}
        crumbLabel={tc("breadcrumb")}
        title={cause.title}
        lead={cause.summary}
      >
        {cause.status === "closed" ? (
          <p className="mt-4">
            <Badge>{t("closed")}</Badge>
          </p>
        ) : null}
      </PageHeader>
      <SampleBanner show={cause.isSample} />
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="grid gap-8">
          <CoverImage
            mediaId={cause.coverImageId}
            locale={locale as Locale}
            fallback={cause.title}
            ratio="wide"
            priority
          />
          <ContentBody blocks={cause.body} locale={locale as Locale} />
          <LibraryPhotos ids={cause.photoIds} locale={locale as Locale} ratio="photo" />
        </article>
        <aside aria-labelledby="support-h" className="lg:sticky lg:top-6">
          <Panel className="grid gap-4">
            <h2 id="support-h" className="text-xl">
              {t("support")}
            </h2>
            {pct !== null ? (
              <Progress
                value={pct}
                label={t("progressLabel", { percent: Math.min(pct, 100) })}
                meta={
                  <>
                    <span>{t("raised", { amount: formatRupees(cause.raisedPaise, locale) })}</span>
                    <span>{t("goal", { amount: formatRupees(cause.goalPaise!, locale) })}</span>
                  </>
                }
              />
            ) : null}
            {cause.status === "active" && PAGES.donate.ready ? (
              <ButtonLink href={`/${locale}/donate?cause=${cause.slug}`} size="lg" block>
                {tn("donate")}
              </ButtonLink>
            ) : cause.status === "active" ? (
              <>
                <Button disabled size="lg" block>
                  {tn("donateSoon")}
                </Button>
                <p className="text-sm text-fg-muted">{t("donateSoon")}</p>
              </>
            ) : null}
            {cause.is80gEligible ? <p className="text-sm text-fg-muted">{t("eligible80g")}</p> : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
