import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getSeoSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/seo/site";
import { SiteShell } from "@/components/layout/SiteShell";
import { THEME_COLOR } from "@/lib/pwa/manifest";
import { ServiceWorker } from "@/components/pwa/ServiceWorker";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const [t, seo] = await Promise.all([
    getTranslations({ locale: lang, namespace: "Meta" }),
    getSeoSettings(),
  ]);
  const template = seo?.titleTemplate[lang] || `%s | ${t("siteName")}`;
  return {
    metadataBase: siteUrl(),
    title: { template, default: t("homeTitle") },
    description: seo?.defaultDescription[lang] || t("homeDescription"),
    applicationName: t("siteName"),
    icons: { icon: "/brand/mswt-mark-compact.svg", apple: "/icons/apple-touch-icon.png" },
    // Installed on iOS ("Add to Home Screen"): app name and a light status bar.
    appleWebApp: { capable: true, title: "MS Welfare", statusBarStyle: "default" },
    verification: {
      ...(seo?.googleSiteVerification ? { google: seo.googleSiteVerification } : {}),
      ...(seo?.bingSiteVerification ? { other: { "msvalidate.01": seo.bingSiteVerification } } : {}),
    },
  };
}

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return (
    <SiteShell locale={locale}>
      {children}
      <ServiceWorker />
    </SiteShell>
  );
}
