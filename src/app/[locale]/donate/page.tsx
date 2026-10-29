import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { donatableCauses } from "@/lib/donations/causes";
import { donationsEnabled } from "@/lib/flags";
import { getPaymentSettings } from "@/lib/payment-settings";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { breadcrumbList, donateAction, pageGraph, webPage } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/page";
import { JsonLd } from "@/components/seo/JsonLd";
import { PageHeader } from "@/components/content/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import { PAGES } from "@/config/nav";
import { DonateForm, type DonateStrings } from "./DonateForm";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "Donate" });
  return pageMetadata({ locale, path: "/donate", title: t("title"), description: t("description") });
}

export default async function DonatePage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, tc, tn, settings, causes] = await Promise.all([
    getTranslations("Donate"),
    getTranslations("Common"),
    getTranslations("Nav"),
    getPaymentSettings(),
    donatableCauses(locale),
  ]);
  const crumbs = [
    { name: tc("home"), path: "" },
    { name: t("title"), path: "/donate" },
  ];
  const keys = [
    "amountLegend",
    "customAmount",
    "minHint",
    "cause",
    "generalFund",
    "coverFee",
    "detailsLegend",
    "name",
    "nameHint",
    "email",
    "emailHint",
    "phone",
    "phoneHint",
    "receiptLegend",
    "wants80g",
    "wants80gHint",
    "pan",
    "panHint",
    "panRequiredHint",
    "line1",
    "line2",
    "city",
    "state",
    "pincode",
    "anonymous",
    "anonymousHint",
    "citizen",
    "citizenHint",
    "captcha",
    "total",
    "pay",
    "payNoAmount",
    "processing",
    "errorSummary",
  ] as const;
  const errorKeys = [
    "amount",
    "amountMin",
    "amountMax",
    "cause",
    "name",
    "email",
    "phone",
    "pan",
    "panRequired",
    "line1",
    "city",
    "state",
    "pincode",
    "citizen",
    "captcha",
    "rate",
    "server",
    "closed",
    "gateway",
  ] as const;
  // Raw strings: placeholders such as {min} and {amount} are filled in by the form.
  const strings = {
    ...Object.fromEntries(keys.map((k) => [k, t.raw(k) as string])),
    required: tc("required"),
    optional: tc("optional"),
    errors: Object.fromEntries(errorKeys.map((k) => [k, t.raw(`errors.${k}`) as string])),
  } as DonateStrings;
  const open = donationsEnabled() && settings !== null;

  return (
    <div className="mx-auto max-w-(--size-container-max) px-4 py-12 lg:px-8">
      <JsonLd
        graph={pageGraph([
          webPage({
            locale,
            path: "/donate",
            name: t("title"),
            description: t("description"),
            hasBreadcrumb: true,
          }),
          breadcrumbList(locale, "/donate", crumbs),
          open ? donateAction(locale, t("title")) : null,
        ])}
      />
      <PageHeader
        crumbs={[{ label: tc("home"), href: `/${locale}` }, { label: t("title") }]}
        crumbLabel={tc("breadcrumb")}
        title={t("title")}
        lead={t("lead")}
      />
      {open ? (
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label={t("title")}>
            <DonateForm
              locale={locale}
              siteKey={turnstileSiteKey()}
              config={{
                presets: settings.presetAmountsPaise,
                minPaise: settings.minAmountPaise,
                maxPaise: settings.maxAmountPaise,
                panAbovePaise: settings.panRequiredAbovePaise,
                feeBp: settings.feeCoverEnabled ? settings.feeCoverPercentBp : 0,
                causes,
              }}
              t={strings}
            />
          </section>
          <Panel className="grid gap-4">
            <h2 className="text-xl">{t("receiptLegend")}</h2>
            <p>{t("wants80gHint")}</p>
            <p className="text-sm text-fg-muted">{t("citizenHint")}</p>
            <p className="text-sm text-fg-muted">{t("secureNote")}</p>
            {PAGES.disclaimer80g.ready ? (
              <TextLink href={`/${locale}/80g-disclaimer`}>{t("receiptLegend")}</TextLink>
            ) : null}
          </Panel>
        </div>
      ) : (
        <Alert tone="info">
          <p>
            {t("closed")} <TextLink href={`/${locale}/contact`}>{tn("contact")}</TextLink>
          </p>
        </Alert>
      )}
    </div>
  );
}
