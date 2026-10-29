import type {
  BreadcrumbList,
  DonateAction,
  Event,
  Graph,
  ImageObject,
  NGO,
  NewsArticle,
  Person,
  Thing,
  WebPage,
  WebSite,
} from "schema-dts";
import { routing, type Locale } from "@/i18n/routing";
import type { OrganizationSettings } from "@/lib/settings";
import { absoluteUrl, siteUrl } from "./site";

/** Stable node ids (LD-02): the same on every page and in every language. */
export const ids = {
  organization: () => new URL("/#organization", siteUrl()).toString(),
  website: () => new URL("/#website", siteUrl()).toString(),
  webpage: (url: string) => `${url}#webpage`,
  breadcrumb: (url: string) => `${url}#breadcrumb`,
};

const ref = (id: string) => ({ "@id": id });

/** Drop undefined, null, "" and empty arrays/objects (recursively) so no half-filled fields appear. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(compact).filter((v) => !isEmpty(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v);
      if (!isEmpty(c)) out[k] = c;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object")
    return (
      Object.keys(v as object).filter((k) => !k.startsWith("@")).length === 0 && !("@id" in (v as object))
    );
  return false;
}

/** Date or instant → ISO string with the Asia/Kolkata offset (LD-08). */
export function istIso(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

const LANGUAGES = routing.locales as readonly string[];

/** The site-wide NGO entity, built from organization_settings and the published team (LD-03, LD-04). */
export function ngo(
  org: OrganizationSettings,
  locale: Locale,
  team: readonly { name: string; designation: string }[] = [],
): NGO {
  const alternateNames = [
    ...new Set([org.displayName, ...Object.values(org.alternateNames ?? {}).flat()]),
  ].filter((n) => n && n !== org.legalName && n !== org.displayName);
  const person = (m: { name: string; designation: string }): Person => ({
    "@type": "Person",
    name: m.name,
    jobTitle: m.designation,
  });
  const people = team.map(person);
  const founders = team.filter((m) => /founder/i.test(m.designation)).map(person);
  return compact<NGO>({
    "@type": "NGO",
    "@id": ids.organization(),
    name: org.displayName,
    legalName: org.legalName,
    alternateName: alternateNames,
    url: siteUrl().origin,
    logo: {
      "@type": "ImageObject",
      url: new URL("/brand/mswt-logo-512.png", siteUrl()).toString(),
      width: "512",
      height: "512",
    },
    description: org.description?.[locale] || org.description?.en,
    foundingDate: org.foundingDate ?? undefined,
    taxID: org.trustPan ?? undefined,
    email: org.email ?? undefined,
    telephone: org.phones?.[0],
    address:
      org.city || org.streetAddress
        ? {
            "@type": "PostalAddress",
            streetAddress: [org.streetAddress, org.locality].filter(Boolean).join(", ") || undefined,
            addressLocality: org.city ?? undefined,
            addressRegion: org.state ?? undefined,
            postalCode: org.pincode ?? undefined,
            addressCountry: org.country,
          }
        : undefined,
    contactPoint:
      org.email || org.phones?.length
        ? {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: org.email ?? undefined,
            telephone: org.phones?.[0],
            availableLanguage: [...LANGUAGES],
            areaServed: "IN",
          }
        : undefined,
    areaServed: org.areaServed?.length ? org.areaServed : undefined,
    founder: founders,
    member: people,
    sameAs: org.sameAs,
  });
}

/**
 * The WebSite node (Home only). Google reads `name` and `alternateName` here for the site name it
 * shows in results, so `alternateName` lists the Trust's other names (legal, short) from Settings.
 */
export function website(locale: Locale, name: string, otherNames: readonly string[] = []): WebSite {
  const alternateName = [...new Set(otherNames.map((n) => n.trim()))].filter((n) => n && n !== name);
  // No SearchAction: Google retired the sitelinks search box (LD-12).
  return {
    "@type": "WebSite",
    "@id": ids.website(),
    url: siteUrl().origin,
    name,
    ...(alternateName.length ? { alternateName } : {}),
    inLanguage: locale,
    publisher: ref(ids.organization()),
  };
}

export type PageType = "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage";

export function webPage(p: {
  type?: PageType;
  locale: Locale;
  path: string;
  name: string;
  description?: string;
  hasBreadcrumb?: boolean;
}): WebPage {
  const url = absoluteUrl(p.locale, p.path);
  return compact({
    "@type": p.type ?? "WebPage",
    "@id": ids.webpage(url),
    url,
    name: p.name,
    description: p.description,
    inLanguage: p.locale,
    isPartOf: ref(ids.website()),
    about: ref(ids.organization()),
    publisher: ref(ids.organization()),
    breadcrumb: p.hasBreadcrumb ? ref(ids.breadcrumb(url)) : undefined,
  } as WebPage);
}

/** Breadcrumbs matching the visible trail (LD-07). The last crumb is the current page. */
export function breadcrumbList(
  locale: Locale,
  path: string,
  crumbs: { name: string; path: string }[],
): BreadcrumbList {
  const url = absoluteUrl(locale, path);
  return {
    "@type": "BreadcrumbList",
    "@id": ids.breadcrumb(url),
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(locale, c.path),
    })),
  };
}

export type EventInput = {
  name: string;
  description?: string;
  url: string;
  start: Date;
  end?: Date;
  status: "scheduled" | "cancelled" | "postponed" | "rescheduled" | "moved_online";
  attendance: "offline" | "online" | "mixed";
  venue?: { name: string; streetAddress?: string; city?: string; region?: string; postalCode?: string };
  onlineUrl?: string;
  image?: string;
};

const EVENT_STATUS = {
  scheduled: "https://schema.org/EventScheduled",
  cancelled: "https://schema.org/EventCancelled",
  postponed: "https://schema.org/EventPostponed",
  rescheduled: "https://schema.org/EventRescheduled",
  moved_online: "https://schema.org/EventMovedOnline",
} as const;
const ATTENDANCE = {
  offline: "https://schema.org/OfflineEventAttendanceMode",
  online: "https://schema.org/OnlineEventAttendanceMode",
  mixed: "https://schema.org/MixedEventAttendanceMode",
} as const;

export function event(e: EventInput): Event {
  const place = e.venue
    ? {
        "@type": "Place" as const,
        name: e.venue.name,
        address: {
          "@type": "PostalAddress" as const,
          streetAddress: e.venue.streetAddress,
          addressLocality: e.venue.city,
          addressRegion: e.venue.region,
          postalCode: e.venue.postalCode,
          addressCountry: "IN",
        },
      }
    : undefined;
  const virtual = e.onlineUrl ? { "@type": "VirtualLocation" as const, url: e.onlineUrl } : undefined;
  return compact<Event>({
    "@type": "Event",
    name: e.name,
    description: e.description,
    url: e.url,
    startDate: istIso(e.start),
    endDate: e.end ? istIso(e.end) : undefined,
    eventStatus: EVENT_STATUS[e.status],
    eventAttendanceMode: ATTENDANCE[e.attendance],
    location: (e.attendance === "mixed"
      ? [place, virtual]
      : e.attendance === "online"
        ? virtual
        : place) as Event["location"],
    image: e.image ? [e.image] : undefined,
    organizer: ref(ids.organization()),
  });
}

export function newsArticle(a: {
  headline: string;
  url: string;
  images: string[];
  published: Date;
  modified?: Date;
  authorName?: string;
  locale: Locale;
}): NewsArticle {
  return compact<NewsArticle>({
    "@type": "NewsArticle",
    headline: a.headline,
    mainEntityOfPage: a.url,
    image: a.images,
    datePublished: istIso(a.published),
    dateModified: istIso(a.modified ?? a.published),
    author: a.authorName ? { "@type": "Person", name: a.authorName } : ref(ids.organization()),
    publisher: ref(ids.organization()),
    inLanguage: a.locale,
  });
}

export function imageObject(i: {
  contentUrl: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}): ImageObject {
  return compact<ImageObject>({
    "@type": "ImageObject",
    contentUrl: i.contentUrl,
    caption: i.caption,
    creditText: i.credit,
    width: i.width ? String(i.width) : undefined,
    height: i.height ? String(i.height) : undefined,
  });
}

export function donateAction(locale: Locale, name: string): DonateAction {
  return {
    "@type": "DonateAction",
    name,
    recipient: ref(ids.organization()),
    target: { "@type": "EntryPoint", urlTemplate: absoluteUrl(locale, "/donate") },
  };
}

/** One graph per page: optional full NGO node, WebSite, and the page's own nodes (LD-02). */
export function pageGraph(nodes: Array<Thing | undefined | null>): Graph {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) as Thing[] } as Graph;
}

/** JSON for a <script> tag: escapes characters that could end the script or confuse parsers (LD-01). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
