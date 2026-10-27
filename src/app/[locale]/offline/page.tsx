import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MAIN_NAV, pageHref, readyPages } from "@/config/nav";
import { buildMetadata } from "@/lib/seo/metadata";
import { ButtonLink } from "@/components/ui/Button";
import { SavedPages } from "@/components/pwa/SavedPages";

// Shown by the service worker when a page isn't cached and there is no network (Step 9, PWA-04).
// Precached at install, so it is built once per deploy and never indexed.
export const dynamic = "force-static";
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, tm] = await Promise.all([
    getTranslations({ locale, namespace: "Offline" }),
    getTranslations({ locale, namespace: "Meta" }),
  ]);
  return buildMetadata({
    locale,
    path: "/offline",
    title: t("metaTitle"),
    description: t("body"),
    siteName: tm("siteName"),
    noindex: true,
  });
}

export default async function OfflinePage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tn] = await Promise.all([getTranslations("Offline"), getTranslations("Nav")]);
  const pages = [
    { href: pageHref(locale, "home"), label: t("home") },
    ...readyPages(MAIN_NAV).map((key) => ({ href: pageHref(locale, key), label: tn(key as "about") })),
  ];
  return (
    <section className="mx-auto max-w-(--size-container-max) px-4 py-24 text-center lg:px-8">
      <h1 className="text-4xl">{t("title")}</h1>
      <p className="mx-auto mt-4 max-w-xl text-fg-muted">{t("body")}</p>
      <div className="mt-8 flex justify-center">
        {/* An empty href reloads the address the visitor asked for (the fallback is shown in its place). */}
        <ButtonLink href="">{t("retry")}</ButtonLink>
      </div>
      <SavedPages heading={t("saved")} pages={pages} />
    </section>
  );
}
