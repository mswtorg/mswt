import type { CoverSize } from "@/components/content/photo-ratio";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import type { Blocks } from "./blocks";
import type { ContentPageKey } from "./format";
import { getSiteContent, isProduction, type SiteContent } from "./source";
import type { DocumentKind } from "./document-kinds";

type Tr = { reviewed: boolean; seoTitle?: string; seoDescription?: string };

/**
 * The language rule (I18N-03, SEO-13): an item exists in a language only when it has a translation
 * for that language, and in production that translation must be reviewed. No fallback to English.
 */
export function visible<T extends Tr>(
  translations: Partial<Record<Locale, T>>,
  locale: Locale,
  production = isProduction(),
): T | null {
  const tr = translations[locale];
  if (!tr) return null;
  if (production && !tr.reviewed) return null;
  return tr;
}

/** Languages an item is available in (for hreflang, the language switcher and the sitemap). */
export function availableLocales<T extends Tr>(
  translations: Partial<Record<Locale, T>>,
  production = isProduction(),
): Locale[] {
  return routing.locales.filter((l) => visible(translations, l, production) !== null);
}

type Meta = { locales: Locale[]; seoTitle?: string; seoDescription?: string; isSample: boolean };

export type CauseView = Meta & {
  slug: string;
  status: "active" | "closed";
  goalPaise: number | null;
  raisedPaise: number;
  is80gEligible: boolean;
  icon: string | null;
  coverImageId: string | null;
  coverSize: CoverSize;
  photoIds: string[];
  title: string;
  summary: string;
  tag: string | null;
  body: Blocks;
};

export type EventView = Meta & {
  slug: string;
  eventStatus: "scheduled" | "cancelled" | "postponed" | "rescheduled" | "moved_online";
  attendance: "offline" | "online" | "mixed";
  startsAt: Date;
  endsAt: Date | null;
  venue: { name: string; street?: string; city?: string; region?: string; postalCode?: string } | null;
  onlineUrl: string | null;
  coverImageId: string | null;
  coverSize: CoverSize;
  photoIds: string[];
  title: string;
  summary: string;
  body: Blocks;
};

export type NewsView = Meta & {
  slug: string;
  publishedAt: Date;
  authorName: string | null;
  coverImageId: string | null;
  coverSize: CoverSize;
  photoIds: string[];
  headline: string;
  excerpt: string;
  body: Blocks;
};

export type AlbumView = Meta & {
  slug: string;
  publishedAt: Date | null;
  albumDate: string | null;
  coverImageId: string | null;
  title: string;
  description?: string;
  items: { mediaId?: string; width: number; height: number; alt: string; caption?: string }[];
};

export type ReportView = {
  /** Null for registration certificates. */
  fy: string | null;
  kind: DocumentKind;
  title: string;
  /** Key in the public media bucket and size, once the PDF is uploaded. */
  pdfKey: string | null;
  pdfBytes: number | null;
  isSample: boolean;
};

export type PageView = Meta & {
  key: ContentPageKey;
  title: string;
  h1: string;
  intro?: string;
  sections: Blocks;
  reviewed: boolean;
};

const meta = <T extends Tr>(translations: Partial<Record<Locale, T>>, tr: T, isSample: boolean): Meta => ({
  locales: availableLocales(translations),
  seoTitle: tr.seoTitle,
  seoDescription: tr.seoDescription,
  isSample,
});

export function causesFrom(c: SiteContent, locale: Locale): CauseView[] {
  const sample = c.sampleParts.includes("causes");
  return c.causes.flatMap((x) => {
    if (x.status === "draft") return [];
    const tr = visible(x.translations, locale);
    if (!tr) return [];
    return [
      {
        ...meta(x.translations, tr, sample || x.isSample),
        slug: x.slug,
        status: x.status,
        goalPaise: x.goalPaise,
        raisedPaise: x.raisedPaise,
        is80gEligible: x.is80gEligible,
        icon: x.icon,
        coverImageId: x.coverImageId,
        coverSize: x.coverSize,
        photoIds: x.photoIds,
        title: tr.title,
        summary: tr.summary,
        tag: tr.tag,
        body: tr.body,
      },
    ];
  });
}

export function eventsFrom(c: SiteContent, locale: Locale): EventView[] {
  const sample = c.sampleParts.includes("events");
  return c.events
    .flatMap((x) => {
      if (x.status !== "published") return [];
      const tr = visible(x.translations, locale);
      if (!tr) return [];
      return [
        {
          ...meta(x.translations, tr, sample || x.isSample),
          slug: x.slug,
          eventStatus: x.eventStatus,
          attendance: x.attendance,
          startsAt: new Date(x.startsAt),
          endsAt: x.endsAt ? new Date(x.endsAt) : null,
          venue: x.venue,
          onlineUrl: x.onlineUrl,
          coverImageId: x.coverImageId,
          coverSize: x.coverSize,
          photoIds: x.photoIds,
          title: tr.title,
          summary: tr.summary,
          body: tr.body,
        },
      ];
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function newsFrom(c: SiteContent, locale: Locale): NewsView[] {
  const sample = c.sampleParts.includes("news");
  return c.news
    .flatMap((x) => {
      if (x.status !== "published") return [];
      const tr = visible(x.translations, locale);
      if (!tr) return [];
      return [
        {
          ...meta(x.translations, tr, sample || x.isSample),
          slug: x.slug,
          publishedAt: new Date(x.publishedAt),
          authorName: x.authorName,
          coverImageId: x.coverImageId,
          coverSize: x.coverSize,
          photoIds: x.photoIds,
          headline: tr.headline,
          excerpt: tr.excerpt,
          body: tr.body,
        },
      ];
    })
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function albumsFrom(c: SiteContent, locale: Locale): AlbumView[] {
  const sample = c.sampleParts.includes("albums");
  return c.albums.flatMap((x) => {
    if (x.status !== "published") return [];
    const tr = visible(x.translations, locale);
    if (!tr) return [];
    return [
      {
        ...meta(x.translations, tr, sample || x.isSample),
        slug: x.slug,
        publishedAt: x.publishedAt ? new Date(x.publishedAt) : null,
        albumDate: x.albumDate,
        coverImageId: x.coverImageId,
        title: tr.title,
        description: tr.description,
        // Images without alt text in this language are left out rather than shown unlabelled.
        items: x.items.flatMap((i) =>
          i.alt[locale]
            ? [
                {
                  mediaId: i.mediaId,
                  width: i.width,
                  height: i.height,
                  alt: i.alt[locale]!,
                  caption: i.caption?.[locale],
                },
              ]
            : [],
        ),
      },
    ];
  });
}

export function reportsFrom(c: SiteContent, locale: Locale): ReportView[] {
  const sample = c.sampleParts.includes("reports");
  return c.reports
    .flatMap((x) => {
      if (x.status !== "published") return [];
      const tr = visible(x.translations, locale);
      return tr
        ? [
            {
              fy: x.fy,
              kind: x.kind,
              title: tr.title,
              pdfKey: x.pdfKey,
              pdfBytes: x.pdfBytes,
              isSample: sample || x.isSample,
            },
          ]
        : [];
    })
    .sort((a, b) => (b.fy ?? "").localeCompare(a.fy ?? ""));
}

export function pageFrom(c: SiteContent, key: ContentPageKey, locale: Locale): PageView | null {
  const translations = c.pages[key];
  if (!translations) return null;
  const tr = visible(translations, locale);
  if (!tr) return null;
  return {
    ...meta(translations, tr, c.sampleParts.includes(`page:${key}`)),
    key,
    title: tr.title,
    h1: tr.h1,
    intro: tr.intro,
    sections: tr.sections,
    reviewed: tr.reviewed,
  };
}

// Convenience loaders for pages (cached via getSiteContent).
export const getCauses = async (l: Locale) => causesFrom(await getSiteContent(), l);
export const getCause = async (l: Locale, slug: string) =>
  (await getCauses(l)).find((c) => c.slug === slug) ?? null;
export const getEvents = async (l: Locale) => eventsFrom(await getSiteContent(), l);
export const getEvent = async (l: Locale, slug: string) =>
  (await getEvents(l)).find((e) => e.slug === slug) ?? null;
export const getNews = async (l: Locale) => newsFrom(await getSiteContent(), l);
export const getNewsPost = async (l: Locale, slug: string) =>
  (await getNews(l)).find((n) => n.slug === slug) ?? null;
export const getAlbums = async (l: Locale) => albumsFrom(await getSiteContent(), l);
export const getAlbum = async (l: Locale, slug: string) =>
  (await getAlbums(l)).find((a) => a.slug === slug) ?? null;
export const getReports = async (l: Locale) => reportsFrom(await getSiteContent(), l);
export const getPage = async (key: ContentPageKey, l: Locale) => pageFrom(await getSiteContent(), key, l);

/** Split events into upcoming (soonest first) and past (latest first) at `now`. */
export function splitEvents(
  events: EventView[],
  now = new Date(),
): { upcoming: EventView[]; past: EventView[] } {
  const ended = (e: EventView) => (e.endsAt ?? e.startsAt).getTime() < now.getTime();
  return { upcoming: events.filter((e) => !ended(e)), past: events.filter(ended).reverse() };
}
