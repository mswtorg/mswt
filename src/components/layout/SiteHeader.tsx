import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MAIN_NAV, PAGES, pageHref } from "@/config/nav";
import { resolveMenu } from "@/lib/admin/menus";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CollapsibleNav } from "@/components/ui/CollapsibleNav";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { NavDropdown } from "@/components/ui/NavDropdown";
import { HeaderShadow } from "./HeaderShadow";

const linkClass =
  "inline-flex min-h-(--size-target-comfortable) items-center font-medium text-fg-default no-underline hover:text-link-hover hover:underline aria-[current=page]:text-fg-brand aria-[current=page]:border-b-2 aria-[current=page]:border-border-rule";

export async function SiteHeader({ locale, current }: { locale: Locale; current?: string }) {
  const [t, tl, th] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Layout"),
    getTranslations("Home"),
  ]);
  const ALL = { causes: "allCauses", news: "allNews", events: "allEvents" } as const;
  // Admin → Content → Menus, or the built-in menu until one is saved (Causes lists the causes).
  const items = await resolveMenu(
    "header",
    locale,
    MAIN_NAV,
    (k) => t(k as "about"),
    (auto) => th(ALL[auto]),
  );
  // Sticky; HeaderShadow swaps the bottom border for a shadow once the page scrolls.
  return (
    <header
      id="site-header"
      className="sticky top-0 z-40 border-b border-border-decorative bg-bg-canvas transition-shadow data-scrolled:border-transparent data-scrolled:shadow-md motion-reduce:transition-none"
    >
      <HeaderShadow headerId="site-header" />
      <div className="mx-auto flex min-h-20 max-w-(--size-container-max) flex-wrap items-center gap-x-6 px-4 py-2 lg:px-8">
        <a href={pageHref(locale, "home")} className="inline-flex flex-none">
          <Logo alt={tl("logoHome")} width={204} />
        </a>
        <CollapsibleNav id="site-nav" menuLabel={t("menu")}>
          {items.length > 0 ? (
            // Large screens: the menu centred between the logo and language + Donate, one even gap.
            <nav aria-label={t("label")} className="lg:flex lg:flex-1 lg:justify-center">
              <ul className="m-0 flex list-none flex-col p-0 lg:flex-row lg:items-center lg:gap-6">
                {items.map((item, i) => (
                  <li key={item.key}>
                    {/* A link with sub-links (Admin → Menus): a dropdown, collapsed until opened. */}
                    {item.children?.length ? (
                      <NavDropdown
                        id={`menu-${i + 1}`}
                        link={{ href: item.href, label: item.label }}
                        current={Boolean(item.page && current === item.page)}
                        toggleLabel={t("subLinks", { label: item.label })}
                        items={item.children}
                        all={item.all}
                        linkClassName={linkClass}
                      />
                    ) : (
                      <a
                        href={item.href}
                        aria-current={item.page && current === item.page ? "page" : undefined}
                        className={linkClass}
                      >
                        {item.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center gap-4 lg:flex-none">
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
