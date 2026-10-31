import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import type { PublicBankDetails } from "@/lib/donations/bank";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import { CopyButton } from "./CopyButton";

/**
 * "Bank transfer, UPI or cheque" on the Donate page (#bank-transfer), from Admin → Settings →
 * Payments. Donors who pay this way email their details to get a receipt; the Accountant then
 * records it as an offline donation.
 */
export async function BankDetails({
  details,
  postalAddress,
  locale,
}: {
  details: PublicBankDetails;
  postalAddress: string;
  locale: string;
}) {
  const t = await getTranslations("Bank");
  const { account, upi, chequePayee, detailsEmail } = details;
  const qr = upi ? await QRCode.toString(upi.uri, { type: "svg", margin: 1, width: 176 }) : null;
  const copy = (value: string, what: string) => (
    <CopyButton
      value={value}
      text={t("copy")}
      label={t("copyLabel", { what })}
      copiedText={t("copied", { what })}
    />
  );
  const mailto = detailsEmail
    ? `mailto:${detailsEmail}?subject=${encodeURIComponent(t("mailSubject"))}&body=${encodeURIComponent(t("mailBody"))}`
    : null;
  const row = (label: string, value: string, extra?: React.ReactNode) => (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="m-0 flex flex-wrap items-center gap-x-2 font-semibold text-fg-strong">
        <span className="break-all">{value}</span>
        {extra}
      </dd>
    </div>
  );

  return (
    <section id="bank-transfer" aria-labelledby="bank-h" className="mt-16 grid scroll-mt-24 gap-6">
      <div className="grid gap-2">
        <h2 id="bank-h" className="text-2xl">
          {t("title")}
        </h2>
        <p className="max-w-prose">{t("lead")}</p>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
        {account ? (
          <Panel className="grid gap-4">
            <h3 className="text-xl">{t("transfer")}</h3>
            <dl className="m-0 grid gap-3">
              {row(t("accountName"), account.name)}
              {row(t("accountNumber"), account.number, copy(account.number, t("accountNumber")))}
              {row(t("ifsc"), account.ifsc, copy(account.ifsc, t("ifsc")))}
              {account.bank || account.branch
                ? row(t("bank"), [account.bank, account.branch].filter(Boolean).join(", "))
                : null}
              {account.type ? row(t("accountType"), t(account.type)) : null}
            </dl>
          </Panel>
        ) : null}
        {upi && qr ? (
          <Panel className="grid gap-4">
            <h3 className="text-xl">{t("upi")}</h3>
            <div
              role="img"
              aria-label={t("qr", { id: upi.id })}
              className="w-44 justify-self-start rounded-md bg-bg-canvas [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="text-sm">{t("scan")}</p>
            <dl className="m-0">{row(t("upiId"), upi.id, copy(upi.id, t("upiId")))}</dl>
            <a href={upi.uri} className={`${buttonClasses({ variant: "secondary" })} md:hidden`}>
              {t("payApp")}
            </a>
          </Panel>
        ) : null}
        {chequePayee ? (
          <Panel className="grid gap-4">
            <h3 className="text-xl">{t("cheque")}</h3>
            <dl className="m-0 grid gap-3">
              {row(t("payee"), chequePayee)}
              {postalAddress ? (
                <div>
                  <dt className="text-sm text-fg-muted">{t("post")}</dt>
                  <dd className="m-0">
                    <address className="not-italic">{postalAddress}</address>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Panel>
        ) : null}
      </div>
      <Alert tone="info">
        <h3 className="text-lg">{t("afterTitle")}</h3>
        <p className="mt-2">{t("after")}</p>
        <p className="mt-2">
          {mailto ? (
            <TextLink href={mailto}>{t("emailUs", { email: detailsEmail! })}</TextLink>
          ) : (
            <TextLink href={`/${locale}/contact`}>{t("noEmail")}</TextLink>
          )}
        </p>
      </Alert>
      <ul className="grid gap-1 text-sm text-fg-muted">
        <li>{t("fcra")}</li>
        <li>{t("cash")}</li>
      </ul>
    </section>
  );
}
