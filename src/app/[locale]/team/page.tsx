import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPage } from "@/lib/content/queries";
import { getTeam } from "@/lib/content/team";
import { breadcrumbList, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { PageHero } from "@/components/content/LibraryPhotos";
import { ContentBody } from "@/components/content/ContentBody";
import { TeamPhoto } from "@/components/content/TeamPhoto";
import { EmptyState } from "@/components/ui/EmptyState";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, page] = await Promise.all([
    getTranslations({ locale, namespace: "Team" }),
    getPage("team", locale),
  ]);
  return pageMetadata({
    locale,
    path: "/team",
    title: page?.seoTitle ?? page?.title ?? t("title"),
    description: page?.seoDescription ?? page?.intro ?? t("description"),
  });
}

export default async function TeamPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, team, listPage] = await Promise.all([
    getTranslations("Team"),
    getTranslations("Common"),
    getTeam(locale),
    getPage("team", locale),
  ]);
  // Text from Content → Pages → Team (list); the built-in text is only a safety net.
  const heading = listPage?.h1 ?? t("title");
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: heading, path: "/team" },
  ];
  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            type: "CollectionPage",
            locale,
            path: "/team",
            name: heading,
            description: listPage?.intro ?? t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/team", crumbs),
        ])}
      />
      <PageHero pageKey="team" locale={locale} className="mb-8" />
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
      {team.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-x-8 gap-y-12 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((m) => (
            <li key={m.id} className="grid content-start justify-items-center gap-2 text-center">
              <TeamPhoto mediaId={m.photoId} name={m.name} locale={locale} />
              <h2 className="mt-2 text-xl">{m.name}</h2>
              <p className="text-sm text-fg-muted">{m.designation}</p>
              {m.bio.length ? (
                <div className="mt-2 w-full text-left">
                  <ContentBody blocks={m.bio} locale={locale} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
