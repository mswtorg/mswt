import type { PgTable } from "drizzle-orm/pg-core";
import type { Locale } from "@/i18n/routing";
import { contentPage } from "@/lib/admin/content-pages";
import { imageIds } from "@/lib/content/markup";
import type { Blocks } from "@/lib/content/blocks";
import {
  appearanceSettings,
  causeTranslations,
  causes,
  emailSettings,
  eventTranslations,
  events,
  galleryAlbumTranslations,
  galleryAlbums,
  galleryItems,
  menuItems,
  newsPosts,
  newsTranslations,
  organizationSettings,
  pageTranslations,
  pages,
  paymentSettings,
  receiptSettings,
  reportTranslations,
  reports,
  seoSettings,
  testimonialTranslations,
  testimonials,
} from "@/lib/db/schema";

// What Admin → Move from stage can move, described once: each kind is a root table (one row per
// item, or a single settings row) with child tables keyed by the item's id. Donations, donors,
// receipts, users, messages and the audit log are never listed here, so they are never moved.

export type Row = Record<string, unknown>;
export type Area = "content" | "site" | "receipts" | "payment";
export type UnitType =
  | "page"
  | "cause"
  | "event"
  | "news"
  | "testimonial"
  | "album"
  | "document"
  | "menus"
  | "organization"
  | "seo"
  | "appearance"
  | "email"
  | "receipts"
  | "payment";

export type Child = {
  name: string;
  table: PgTable;
  /** The column (property name) that points at the root's key. */
  fk: string;
  /** Translations: one row per language (compared per language, "reviewed" as yes/no). */
  translations?: boolean;
  /** Sort order for comparing (property names). */
  order: string[];
};

export type Kind = {
  type: UnitType;
  area: Area;
  label: string;
  /** Null for menus: every menu row is one unit. */
  root: PgTable | null;
  /** Primary key property: "id", "key", or "single" for one-row settings. */
  key: "id" | "key" | "single";
  children: Child[];
  /** Root fields that belong to the environment: never compared, production's value is kept. */
  keep?: string[];
  slug?: boolean;
  /** Can an item that is only on production be removed? */
  removable?: boolean;
  /** Translation field used as the item's name. */
  titleField?: string;
  media?: (root: Row, children: Record<string, Row[]>) => (string | null | undefined)[];
  /** Public paths in a language (for search engines after a move); only for published items. */
  paths?: (root: Row, locale: Locale) => string[];
  published?: (root: Row) => boolean;
};

const tr = (table: PgTable, fk: string): Child => ({
  name: "translations",
  table,
  fk,
  translations: true,
  order: ["locale"],
});
const blocksOf = (children: Record<string, Row[]>, field: string) =>
  (children.translations ?? []).flatMap((t) => imageIds((t[field] as Blocks | null) ?? []));
const photos = (field: string) => (root: Row, children: Record<string, Row[]>) => [
  root.coverImageId as string | null,
  ...((root.photoIds as string[] | null) ?? []),
  ...blocksOf(children, field),
];
const isPublished = (root: Row) => root.status === "published";

export const KINDS: Kind[] = [
  {
    type: "page",
    area: "content",
    label: "Page",
    root: pages,
    key: "key",
    children: [tr(pageTranslations, "pageKey")],
    titleField: "title",
    media: (root, children) => [
      ...((root.heroMediaIds as string[]) ?? []),
      ...blocksOf(children, "sections"),
    ],
    paths: (root, l) => {
      const page = contentPage(String(root.key));
      return page ? [`/${l}${page.path}`] : [];
    },
    published: () => true,
  },
  {
    type: "cause",
    area: "content",
    label: "Cause",
    root: causes,
    key: "id",
    children: [tr(causeTranslations, "causeId")],
    // Donations add to the amount raised on each site; it is never copied.
    keep: ["raisedPaise"],
    slug: true,
    removable: true,
    titleField: "title",
    media: photos("body"),
    paths: (root, l) => [`/${l}/causes/${String(root.slug)}`, `/${l}/causes`],
    published: (root) => root.status !== "draft",
  },
  {
    type: "event",
    area: "content",
    label: "Event",
    root: events,
    key: "id",
    children: [tr(eventTranslations, "eventId")],
    slug: true,
    removable: true,
    titleField: "title",
    media: photos("body"),
    paths: (root, l) => [`/${l}/events/${String(root.slug)}`, `/${l}/events`],
    published: isPublished,
  },
  {
    type: "news",
    area: "content",
    label: "News",
    root: newsPosts,
    key: "id",
    children: [tr(newsTranslations, "postId")],
    slug: true,
    removable: true,
    titleField: "headline",
    media: photos("body"),
    paths: (root, l) => [`/${l}/news/${String(root.slug)}`, `/${l}/news`],
    published: isPublished,
  },
  {
    type: "testimonial",
    area: "content",
    label: "Testimonial",
    root: testimonials,
    key: "id",
    children: [tr(testimonialTranslations, "testimonialId")],
    slug: true,
    removable: true,
    titleField: "title",
    media: (root, children) => [root.photoId as string | null, ...blocksOf(children, "body")],
    paths: (root, l) => [`/${l}/testimonials/${String(root.slug)}`, `/${l}/testimonials`],
    published: isPublished,
  },
  {
    type: "album",
    area: "content",
    label: "Gallery album",
    root: galleryAlbums,
    key: "id",
    children: [
      tr(galleryAlbumTranslations, "albumId"),
      { name: "photos", table: galleryItems, fk: "albumId", order: ["sortOrder", "id"] },
    ],
    slug: true,
    removable: true,
    titleField: "title",
    media: (root, children) => [
      root.coverImageId as string | null,
      ...(children.photos ?? []).map((p) => p.mediaId as string),
    ],
    paths: (root, l) => [`/${l}/gallery/${String(root.slug)}`, `/${l}/gallery`],
    published: isPublished,
  },
  {
    type: "document",
    area: "content",
    label: "Document",
    root: reports,
    key: "id",
    children: [tr(reportTranslations, "reportId")],
    removable: true,
    titleField: "title",
    paths: (_root, l) => [`/${l}/transparency`],
    published: isPublished,
  },
  {
    type: "menus",
    area: "content",
    label: "Menus",
    root: null,
    key: "single",
    children: [{ name: "links", table: menuItems, fk: "", order: ["location", "parentId", "sort", "id"] }],
  },
  {
    type: "organization",
    area: "site",
    label: "Organization settings",
    root: organizationSettings,
    key: "single",
    children: [],
    media: (root) => [
      root.logoMediaId as string | null,
      root.signatureMediaId as string | null,
      ...((root.trustees as { photoMediaId?: string }[]) ?? []).map((t) => t.photoMediaId),
    ],
  },
  {
    type: "seo",
    area: "site",
    label: "SEO settings",
    root: seoSettings,
    key: "single",
    children: [],
    // Each site has its own IndexNow key (it is published at /{key}.txt on that host).
    keep: ["indexnowKey"],
    media: (root) => [root.defaultOgImageId as string | null],
  },
  {
    type: "appearance",
    area: "site",
    label: "Appearance settings",
    root: appearanceSettings,
    key: "single",
    children: [],
  },
  {
    type: "email",
    area: "receipts",
    label: "Email settings",
    root: emailSettings,
    key: "single",
    children: [],
  },
  {
    type: "receipts",
    area: "receipts",
    label: "Receipt templates",
    root: receiptSettings,
    key: "single",
    children: [],
  },
  {
    type: "payment",
    area: "payment",
    label: "Payment settings",
    root: paymentSettings,
    key: "single",
    children: [],
    // Sandbox on stage, live on production: never copied.
    keep: ["providerMode"],
  },
];

export const kindOf = (type: UnitType) => KINDS.find((k) => k.type === type)!;

export const AREA_LABEL: Record<Area, string> = {
  content: "Content",
  site: "Organization, SEO and appearance",
  receipts: "Receipts and email",
  payment: "Payments",
};
