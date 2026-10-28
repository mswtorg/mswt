import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pageHref } from "@/config/nav";
import { formatRupees } from "@/lib/money";
import { AmountPicker, FormField, InputPrefix, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

/**
 * The quick donate box on Home (Admin → Settings → Payments). A plain GET form to the donate
 * page, which fills in the amount and cause and still checks everything itself: it works without
 * JavaScript and creates no new URLs to index.
 */
export async function QuickDonate({
  locale,
  presets,
  causes,
}: {
  locale: Locale;
  /** Suggested amounts in paise (Settings → Payments). */
  presets: number[];
  causes: { slug: string; title: string }[];
}) {
  const [t, td] = await Promise.all([getTranslations("QuickDonate"), getTranslations("Donate")]);
  return (
    <section
      aria-labelledby="quick-donate-h"
      className="rounded-md border border-border-decorative border-t-4 border-t-border-rule bg-bg-canvas p-6"
    >
      <h2 id="quick-donate-h" className="text-2xl">
        {t("title")}
      </h2>
      <p className="mt-1 mb-4 text-fg-muted">{t("note")}</p>
      <form method="get" action={pageHref(locale, "donate")} className="grid gap-4">
        <AmountPicker
          id="quick-preset"
          name="preset"
          legend={td("amountLegend")}
          defaultValue={presets[1] ?? presets[0]}
          options={presets.map((p) => ({ value: p, label: formatRupees(p, locale) }))}
        />
        <FormField id="quick-custom" label={td("customAmount")}>
          {(p) => (
            <InputPrefix
              {...p}
              prefix="₹"
              name="custom"
              inputMode="decimal"
              autoComplete="off"
              maxLength={12}
            />
          )}
        </FormField>
        {causes.length > 0 ? (
          <FormField id="quick-cause" label={td("cause")}>
            {(p) => (
              <Select {...p} name="cause" defaultValue="">
                <option value="">{td("generalFund")}</option>
                {causes.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : null}
        <Button type="submit" block>
          {t("submit")}
        </Button>
      </form>
    </section>
  );
}
