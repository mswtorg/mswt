import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MAIN_NAV, PAGES, pageHref } from "@/config/nav";
import { resolveMenu } from "@/lib/admin/menus";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CollapsibleNav } from "@/components/ui/CollapsibleNav";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";

export async function SiteHeader({ locale, current }: { locale: Locale; current?: string }) {
  const [t, tl] = await Promise.all([getTranslations("Nav"), getTranslations("Layout")]);
  // Admin → Content → Menus, or the built-in menu until one is saved.
  const items = await resolveMenu("header", locale, MAIN_NAV, (k) => t(k as "about"));
  return (
    <header className="border-b border-border-decorative bg-bg-canvas">
      <div className="mx-auto flex min-h-20 max-w-(--size-container-max) flex-wrap items-center gap-x-6 px-4 py-2 lg:px-8">
        <a href={pageHref(locale, "home")} className="inline-flex flex-none">
          <Logo alt={tl("logoHome")} width={204} />
        </a>
        <CollapsibleNav id="site-nav" menuLabel={t("menu")}>
          {items.length > 0 ? (
            <nav aria-label={t("label")}>
              <ul className="m-0 flex list-none flex-col p-0 lg:flex-row lg:gap-5">
                {items.map((item) => (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      aria-current={item.page && current === item.page ? "page" : undefined}
                      className="inline-flex min-h-(--size-target-comfortable) items-center font-medium text-fg-default no-underline hover:text-link-hover hover:underline aria-[current=page]:text-fg-brand aria-[current=page]:border-b-2 aria-[current=page]:border-border-rule"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher locale={locale} label={tl("language")} />
            {PAGES.donate.ready ? (
              <ButtonLink href={pageHref(locale, "donate")}>{t("donate")}</ButtonLink>
            ) : (
              <Button disabled>{t("donateSoon")}</Button>
            )}
          </div>
        </CollapsibleNav>
      </div>
    </header>
  );
}
