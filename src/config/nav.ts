import { routing, type Locale } from "@/i18n/routing";
import { donationsEnabled } from "@/lib/flags";

/**
 * Every public page in the sitemap (docs/spec.md §1). `ready` turns a page on in the header/footer;
 * pages that don't exist yet are never linked, so the live site has no links to 404s.
 * Legal pages stay not-ready until the Trust's CA approves them (they 404 in production till then).
 */
export const PAGES = {
  home: { path: "", ready: true },
  about: { path: "/about", ready: true },
  causes: { path: "/causes", ready: true },
  gallery: { path: "/gallery", ready: true },
  events: { path: "/events", ready: true },
  news: { path: "/news", ready: true },
  // Linked from Home and About; add it to a menu in Admin → Menus (not in the built-in menus).
  testimonials: { path: "/testimonials", ready: true },
  transparency: { path: "/transparency", ready: true },
  contact: { path: "/contact", ready: true },
  // Off in production until go-live (src/lib/flags.ts).
  donate: { path: "/donate", ready: donationsEnabled() },
  privacy: { path: "/privacy", ready: false },
  terms: { path: "/terms", ready: false },
  refund: { path: "/refund-policy", ready: false },
  disclaimer80g: { path: "/80g-disclaimer", ready: false },
} as const;

export type PageKey = keyof typeof PAGES;

export const MAIN_NAV: PageKey[] = [
  "about",
  "causes",
  "gallery",
  "events",
  "news",
  "transparency",
  "contact",
];
export const FOOTER_NAV: Record<"explore" | "trust", PageKey[]> = {
  explore: ["causes", "events", "news", "gallery"],
  trust: ["about", "transparency", "disclaimer80g"],
};
export const LEGAL_NAV: PageKey[] = ["privacy", "terms", "refund"];

export function readyPages(keys: readonly PageKey[]): PageKey[] {
  return keys.filter((k) => PAGES[k].ready);
}

export function pageHref(locale: Locale, key: PageKey): string {
  return `/${locale}${PAGES[key].path}`;
}

/** Same page in another language; falls back to that language's home for unknown paths. */
export function switchLocaleHref(pathname: string, target: Locale): string {
  const parts = pathname.split("/");
  const current = parts[1];
  if (current && (routing.locales as readonly string[]).includes(current)) {
    parts[1] = target;
    return parts.join("/") || `/${target}`;
  }
  return `/${target}`;
}
