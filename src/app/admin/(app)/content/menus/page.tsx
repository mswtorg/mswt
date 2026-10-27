import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FOOTER_NAV, LEGAL_NAV, MAIN_NAV, PAGES, type PageKey } from "@/config/nav";
import { listCauses } from "@/lib/admin/causes";
import { listEvents, listNews } from "@/lib/admin/events";
import { requireCapability } from "@/lib/admin/guard";
import { MENU_LOCATIONS, menuRows, type MenuLocation } from "@/lib/admin/menus";
import { AdminForm } from "@/components/admin/AdminForm";
import { MenuEditor, type MenuItemState, type MenuOption } from "@/components/admin/MenuEditor";
import { Card, PageHeader, Section } from "@/components/admin/ui";
import { resetMenuAction, saveMenuAction } from "./actions";

export const metadata: Metadata = { title: "Menus" };
type Props = { searchParams: Promise<Record<string, string | undefined>> };

const LOCATION: Record<MenuLocation, { label: string; description: string; defaults: readonly PageKey[] }> = {
  header: { label: "Header", description: "The main menu at the top of every page.", defaults: MAIN_NAV },
  footer_explore: {
    label: "Footer: Explore",
    description: "First link list in the footer.",
    defaults: FOOTER_NAV.explore,
  },
  footer_trust: {
    label: "Footer: The Trust",
    description: "Second link list in the footer.",
    defaults: FOOTER_NAV.trust,
  },
  footer_legal: {
    label: "Footer: Legal",
    description: "Small links at the very bottom.",
    defaults: LEGAL_NAV,
  },
};

export default async function MenusPage({ searchParams }: Props) {
  await requireCapability("cms.write");
  const q = await searchParams;
  const location = MENU_LOCATIONS.find((l) => l === q.menu) ?? "header";
  const [rows, causes, news, events, tn, tf] = await Promise.all([
    menuRows(location),
    listCauses(),
    listNews(),
    listEvents(),
    getTranslations({ locale: "en", namespace: "Nav" }),
    getTranslations({ locale: "en", namespace: "Footer" }),
  ]);
  const pageName = (k: PageKey) =>
    k === "privacy" || k === "terms" || k === "refund" || k === "disclaimer80g" ? tf(k) : tn(k as "about");
  const en = (t: { locale: string; title: string }[], fallback: string) =>
    t.find((x) => x.locale === "en")?.title ?? fallback;
  const options: MenuOption[] = [
    ...(Object.keys(PAGES) as PageKey[]).map((k) => ({
      kind: "page" as const,
      target: k,
      label: `${pageName(k)}${PAGES[k].ready ? "" : " (not live yet)"}`,
    })),
    ...causes.map((c) => ({
      kind: "cause" as const,
      target: c.slug,
      label: `${en(c.translations, c.slug)}${c.status === "draft" ? " (draft)" : ""}`,
    })),
    ...news.map((n) => ({
      kind: "news" as const,
      target: n.slug,
      label: `${en(n.translations, n.slug)}${n.status === "draft" ? " (draft)" : ""}`,
    })),
    ...events.map((e) => ({
      kind: "event" as const,
      target: e.slug,
      label: `${en(e.translations, e.slug)}${e.status === "draft" ? " (draft)" : ""}`,
    })),
  ];
  const meta = LOCATION[location];
  // No saved links yet: start from the built-in menu the site shows today.
  const initial: MenuItemState[] = rows.length
    ? rows.map((r) => ({ kind: r.kind, target: r.target, hidden: r.hidden, labels: r.labels }))
    : meta.defaults.map((k) => ({ kind: "page", target: k, hidden: false, labels: {} }));

  return (
    <>
      <PageHeader
        title="Menus"
        description="Order, rename and hide the links in the header and footer, or add links to causes, news, events and other sites. Pages that aren't live yet and drafts never show."
      />
      <nav aria-label="Menus" className="overflow-x-auto">
        <ul className="m-0 flex min-w-max list-none gap-1 border-b border-border-decorative p-0">
          {MENU_LOCATIONS.map((l) => (
            <li key={l}>
              <Link
                href={`/admin/content/menus?menu=${l}`}
                aria-current={l === location ? "page" : undefined}
                className="-mb-px flex min-h-11 items-center border-b-2 border-transparent px-4 text-sm font-medium text-fg-muted no-underline hover:text-fg-strong aria-[current=page]:border-action-primary-bg aria-[current=page]:text-fg-strong"
              >
                {LOCATION[l].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Card>
        <Section
          id="menu"
          title={meta.label}
          description={`${meta.description}${rows.length ? "" : " Not customised yet: this is the built-in menu."}`}
        >
          <AdminForm
            key={location}
            id="menu"
            action={saveMenuAction.bind(null, location)}
            submitLabel="Save menu"
            sticky
          >
            <MenuEditor initial={initial} options={options} />
          </AdminForm>
        </Section>
      </Card>
      {rows.length ? (
        <Card>
          <Section id="reset" title="Use the built-in menu" description="Removes your changes to this menu.">
            <AdminForm
              id="reset-menu"
              action={resetMenuAction.bind(null, location)}
              submitLabel="Reset this menu"
              variant="secondary"
              confirm={`Reset the ${meta.label} menu to the built-in links?`}
              fields={[]}
            />
          </Section>
        </Card>
      ) : null}
    </>
  );
}
