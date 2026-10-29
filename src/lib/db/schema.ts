import { sql } from "drizzle-orm";
import type { Blocks } from "@/lib/content/blocks";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Conventions (docs/spec.md §2): uuid ids, timestamptz everywhere, money as bigint paise.
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const paise = (name: string) => bigint(name, { mode: "number" });
type Localised = Partial<Record<"en" | "hi" | "mr" | "gu", string>>;

export const userRole = pgEnum("user_role", ["super_admin", "accountant", "content_editor"]);
export const providerMode = pgEnum("provider_mode", ["sandbox", "production"]);
export const emailProvider = pgEnum("email_provider", ["resend", "brevo", "msg91"]);
export const siteFont = pgEnum("site_font", ["poppins", "mukta", "hind", "noto_sans"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // Null until an invited user sets their password (invite link).
    passwordHash: text("password_hash"),
    role: userRole("role").notNull(),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    // Last accepted TOTP time step: a code can't be used twice.
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    // Full PAN is visible to this admin until then (email OTP, src/lib/admin/pan-access.ts).
    panAccessUntil: timestamp("pan_access_until", { withTimezone: true }),
    // Bumped on deactivation, password reset or 2FA reset: every existing session ends.
    sessionVersion: integer("session_version").default(1).notNull(),
    recoveryCodesHash: text("recovery_codes_hash").array(),
    failedLogins: integer("failed_logins").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const userTokenKind = pgEnum("user_token_kind", ["invite", "reset"]);

/** One-time invite / password-reset links. Only a SHA-256 of the token is stored. */
export const userTokens = pgTable(
  "user_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: userTokenKind("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_tokens_hash_idx").on(t.tokenHash), index("user_tokens_user_idx").on(t.userId)],
);

// Append-only: a trigger in drizzle/0001 rejects UPDATE and DELETE.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

// Single-row settings tables: id is always 1.
const singleRowId = () => smallint("id").primaryKey().default(1);
const updatedBy = () => uuid("updated_by").references(() => users.id);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    id: singleRowId(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    alternateNames: jsonb("alternate_names")
      .$type<Partial<Record<keyof Localised, string[]>>>()
      .default({})
      .notNull(),
    description: jsonb("description").$type<Localised>().default({}).notNull(),
    foundingDate: date("founding_date"),
    trustPan: text("trust_pan"),
    trustRegistrationNo: text("trust_registration_no"),
    registrationAuthority: text("registration_authority"),
    reg12aNumber: text("reg_12a_number"),
    reg12aDate: date("reg_12a_date"),
    reg80gNumber: text("reg_80g_number"),
    reg80gValidFrom: date("reg_80g_valid_from"),
    reg80gValidTo: date("reg_80g_valid_to"),
    streetAddress: text("street_address"),
    locality: text("locality"),
    city: text("city"),
    district: text("district"),
    state: text("state"),
    pincode: text("pincode"),
    country: text("country").default("IN").notNull(),
    geoLat: numeric("geo_lat", { precision: 9, scale: 6 }),
    geoLng: numeric("geo_lng", { precision: 9, scale: 6 }),
    phones: text("phones")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    email: text("email"),
    contactHours: jsonb("contact_hours").$type<Localised>().default({}).notNull(),
    areaServed: text("area_served")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    trustees: jsonb("trustees")
      .$type<{ name: string; role: string; photoMediaId?: string; bio?: Localised; sort: number }[]>()
      .default([])
      .notNull(),
    sameAs: text("same_as")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    logoMediaId: uuid("logo_media_id"),
    signatoryName: text("signatory_name"),
    signatoryTitle: text("signatory_title"),
    signatureMediaId: uuid("signature_media_id"),
    updatedBy: updatedBy(),
    updatedAt: updatedAt(),
  },
  (t) => [check("organization_settings_single_row", sql`${t.id} = 1`)],
);

export const seoSettings = pgTable(
  "seo_settings",
  {
    id: singleRowId(),
    titleTemplate: jsonb("title_template").$type<Localised>().default({}).notNull(),
    defaultDescription: jsonb("default_description").$type<Localised>().default({}).notNull(),
    defaultOgImageId: uuid("default_og_image_id"),
    googleSiteVerification: text("google_site_verification"),
    bingSiteVerification: text("bing_site_verification"),
    indexnowKey: text("indexnow_key"),
    twitterHandle: text("twitter_handle"),
    updatedBy: updatedBy(),
    updatedAt: updatedAt(),
  },
  (t) => [check("seo_settings_single_row", sql`${t.id} = 1`)],
);

export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: singleRowId(),
    minAmountPaise: paise("min_amount_paise").default(10000).notNull(),
    // No maximum until the Trust decides (open-questions B7).
    maxAmountPaise: paise("max_amount_paise"),
    presetAmountsPaise: bigint("preset_amounts_paise", { mode: "number" })
      .array()
      .default(sql`'{}'::bigint[]`)
      .notNull(),
    // Fee-cover percentage in basis points; off until B3 is answered.
    feeCoverPercentBp: integer("fee_cover_percent_bp").default(0).notNull(),
    feeCoverEnabled: boolean("fee_cover_enabled").default(false).notNull(),
    // Section 80G(5D): cash above ₹2,000 is not deductible.
    cash80gLimitPaise: paise("cash_80g_limit_paise").default(200000).notNull(),
    providerMode: providerMode("provider_mode").default("sandbox").notNull(),
    // Admin → Settings → Payments: the quick donate box on Home.
    homeDonateBox: boolean("home_donate_box").default(true).notNull(),
    updatedBy: updatedBy(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("payment_settings_single_row", sql`${t.id} = 1`),
    // Above ₹5 (owner decision, 2026-10-22); the exact minimum is set in the admin.
    check("payment_settings_min_above_5_rupees", sql`${t.minAmountPaise} > 500`),
    // 3–4 suggested amounts shown as buttons on the donate form.
    check("payment_settings_presets_count", sql`cardinality(${t.presetAmountsPaise}) between 3 and 4`),
    check(
      "payment_settings_max_gte_min",
      sql`${t.maxAmountPaise} is null or ${t.maxAmountPaise} >= ${t.minAmountPaise}`,
    ),
    check("payment_settings_fee_bp_range", sql`${t.feeCoverPercentBp} between 0 and 1000`),
  ],
);

export const emailSettings = pgTable(
  "email_settings",
  {
    id: singleRowId(),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    replyTo: text("reply_to"),
    adminAlertRecipients: text("admin_alert_recipients")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    provider: emailProvider("provider"),
    updatedBy: updatedBy(),
    updatedAt: updatedAt(),
  },
  (t) => [check("email_settings_single_row", sql`${t.id} = 1`)],
);

export const appearanceSettings = pgTable(
  "appearance_settings",
  {
    id: singleRowId(),
    siteFont: siteFont("site_font").default("poppins").notNull(),
    updatedBy: updatedBy(),
    updatedAt: updatedAt(),
  },
  (t) => [check("appearance_settings_single_row", sql`${t.id} = 1`)],
);

// ── Content (Step 6a) ────────────────────────────────────────────────────────────────────────
// Every content type has a *_translations table keyed (parent, locale). An item is published in a
// language only when that translation row exists (no silent fallback, I18N-03).

export const locale = pgEnum("locale", ["en", "hi", "mr", "gu"]);
export const publishStatus = pgEnum("publish_status", ["draft", "published"]);
export const causeStatus = pgEnum("cause_status", ["draft", "active", "closed"]);
export const pageKey = pgEnum("page_key", [
  "home",
  "about",
  "transparency",
  "contact",
  "privacy",
  "terms",
  "refund_policy",
  "disclaimer_80g",
  // List pages (Step 8c, content everywhere): heading, intro and header photos above the list.
  "causes",
  "gallery",
  "events",
  "news",
  "testimonials",
]);
export const eventStatus = pgEnum("event_status", [
  "scheduled",
  "cancelled",
  "postponed",
  "rescheduled",
  "moved_online",
]);
export const eventAttendance = pgEnum("event_attendance", ["offline", "online", "mixed"]);
/** Yearly reports, and registration certificates (`cert_*`, no financial year). */
export const reportKind = pgEnum("report_kind", [
  "annual_report",
  "audited_accounts",
  "other",
  "cert_12a",
  "cert_80g",
  "cert_registration",
  "cert_pan",
  "cert_other",
]);

const translationCols = () => ({
  locale: locale("locale").notNull(),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  /** Set when a human has reviewed this translation; production shows only reviewed text (SEO-13). */
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  updatedAt: updatedAt(),
});
const slugCol = () => text("slug").notNull();
const slugCheck = (name: string, col: unknown) => check(name, sql`${col} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`);
const blocks = (name: string) => jsonb(name).$type<Blocks>().default([]).notNull();

/**
 * Images. `r2Key` is the folder prefix of the stored WebP copies (`media/{id}/{name}`), one per
 * width in `variants`; null for rows without a file (sample content), which show a placeholder.
 */
export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  r2Key: text("r2_key"),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes"),
  variants: jsonb("variants").$type<number[]>().default([]).notNull(),
  /** Tiny base64 WebP shown while the image loads. */
  blur: text("blur"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  isSample: boolean("is_sample").default(false).notNull(),
  createdAt: createdAt(),
});

export const mediaTranslations = pgTable(
  "media_translations",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    locale: locale("locale").notNull(),
    altText: text("alt_text").notNull(),
    caption: text("caption"),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.locale] })],
);

export const causes = pgTable(
  "causes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: slugCol(),
    status: causeStatus("status").default("draft").notNull(),
    goalPaise: paise("goal_paise"),
    raisedPaise: paise("raised_paise").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    coverImageId: uuid("cover_image_id").references(() => media.id),
    /** Cover photo height on its own page: short, standard or tall (cards keep one shape). */
    coverSize: text("cover_size").default("standard").notNull(),
    /** Ordered library photos shown as a slider on the public page (Step 8c-2). */
    photoIds: uuid("photo_ids")
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    is80gEligible: boolean("is_80g_eligible").default(true).notNull(),
    /** Icon beside the title on the cause card (one of CARD_ICONS); null: no icon. */
    icon: text("icon"),
    /** Created by "Load sample content" (Content → Sample content); removable as a group. */
    isSample: boolean("is_sample").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("causes_slug_idx").on(t.slug),
    slugCheck("causes_slug_format", t.slug),
    check("causes_goal_positive", sql`${t.goalPaise} is null or ${t.goalPaise} > 0`),
    check("causes_raised_non_negative", sql`${t.raisedPaise} >= 0`),
  ],
);

export const causeTranslations = pgTable(
  "cause_translations",
  {
    causeId: uuid("cause_id")
      .notNull()
      .references(() => causes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /** Short label on the card photo, e.g. "Education" (per language); null: no label. */
    tag: text("tag"),
    body: blocks("body"),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.causeId, t.locale] })],
);

/** Fixed pages (about, legal…) keyed by page_key; their content is blocks per language. */
export const pages = pgTable("pages", {
  key: pageKey("key").primaryKey(),
  /** Header photo(s) above the page (one photo, or a slider); the same in every language. */
  heroMediaIds: uuid("hero_media_ids")
    .array()
    .default(sql`'{}'::uuid[]`)
    .notNull(),
  /** Home only: the order of the sections under the headline (HOME_SECTIONS keys); empty: default. */
  sectionOrder: text("section_order")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  /** Header photo height: short, standard or tall (src/components/content/photo-ratio.ts). */
  heroSize: text("hero_size").default("standard").notNull(),
  /** Home only: sections switched off in the admin (kept in the order, not shown). */
  hiddenSections: text("hidden_sections")
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  updatedAt: updatedAt(),
});

export const pageTranslations = pgTable(
  "page_translations",
  {
    pageKey: pageKey("page_key")
      .notNull()
      .references(() => pages.key, { onDelete: "cascade" }),
    title: text("title").notNull(),
    h1: text("h1").notNull(),
    intro: text("intro"),
    sections: blocks("sections"),
    /** Page-specific fields (home: eyebrow and the three points), validated per page key. */
    extras: jsonb("extras").$type<Record<string, unknown>>(),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.pageKey, t.locale] })],
);

export const galleryAlbums = pgTable(
  "gallery_albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: slugCol(),
    status: publishStatus("status").default("draft").notNull(),
    coverImageId: uuid("cover_image_id").references(() => media.id),
    sortOrder: integer("sort_order").default(0).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** When the photos were taken (shown on the album); optional. */
    albumDate: date("album_date"),
    /** Created by "Load sample content" (Content → Sample content); removable as a group. */
    isSample: boolean("is_sample").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gallery_albums_slug_idx").on(t.slug), slugCheck("gallery_albums_slug_format", t.slug)],
);

export const galleryAlbumTranslations = pgTable(
  "gallery_album_translations",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => galleryAlbums.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.locale] })],
);

export const galleryItems = pgTable(
  "gallery_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => galleryAlbums.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("gallery_items_album_idx").on(t.albumId, t.sortOrder)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: slugCol(),
    status: publishStatus("status").default("draft").notNull(),
    eventStatus: eventStatus("event_status").default("scheduled").notNull(),
    attendance: eventAttendance("attendance").default("offline").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    venueName: text("venue_name"),
    venueStreet: text("venue_street"),
    venueCity: text("venue_city"),
    venueRegion: text("venue_region"),
    venuePostalCode: text("venue_postal_code"),
    onlineUrl: text("online_url"),
    /** Created by "Load sample content" (Content → Sample content); removable as a group. */
    isSample: boolean("is_sample").default(false).notNull(),
    coverImageId: uuid("cover_image_id").references(() => media.id),
    /** Cover photo height on its own page: short, standard or tall (cards keep one shape). */
    coverSize: text("cover_size").default("standard").notNull(),
    /** Ordered library photos shown as a slider on the public page (Step 8c-2). */
    photoIds: uuid("photo_ids")
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("events_slug_idx").on(t.slug),
    slugCheck("events_slug_format", t.slug),
    check("events_end_after_start", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
    index("events_starts_idx").on(t.startsAt),
  ],
);

export const eventTranslations = pgTable(
  "event_translations",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: blocks("body"),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.locale] })],
);

export const newsPosts = pgTable(
  "news_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: slugCol(),
    status: publishStatus("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorName: text("author_name"),
    /** Created by "Load sample content" (Content → Sample content); removable as a group. */
    isSample: boolean("is_sample").default(false).notNull(),
    coverImageId: uuid("cover_image_id").references(() => media.id),
    /** Cover photo height on its own page: short, standard or tall (cards keep one shape). */
    coverSize: text("cover_size").default("standard").notNull(),
    /** Ordered library photos shown as a slider on the public page (Step 8c-2). */
    photoIds: uuid("photo_ids")
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("news_posts_slug_idx").on(t.slug),
    slugCheck("news_posts_slug_format", t.slug),
    check("news_posts_published_has_date", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
    index("news_posts_published_idx").on(t.publishedAt),
  ],
);

export const newsTranslations = pgTable(
  "news_translations",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => newsPosts.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    excerpt: text("excerpt").notNull(),
    body: blocks("body"),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.locale] })],
);

/**
 * Testimonials (Content → Testimonials): quotes from donors, volunteers and families, shown on
 * Home (when `show_on_home`) and About. Published ones show in a language once its text is there
 * (and reviewed, in production). Not marked up as reviews in JSON-LD (self-serving reviews).
 */
export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Public address: /{locale}/testimonials/{slug}. */
    slug: slugCol(),
    status: publishStatus("status").default("draft").notNull(),
    /** The date of the story, shown with it (the same in every language). */
    storyDate: date("story_date", { mode: "string" }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    showOnHome: boolean("show_on_home").default(true).notNull(),
    photoId: uuid("photo_id").references(() => media.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("testimonials_sort_idx").on(t.sortOrder), uniqueIndex("testimonials_slug_idx").on(t.slug)],
);

export const testimonialTranslations = pgTable(
  "testimonial_translations",
  {
    testimonialId: uuid("testimonial_id")
      .notNull()
      .references(() => testimonials.id, { onDelete: "cascade" }),
    locale: locale("locale").notNull(),
    title: text("title").notNull(),
    /** The whole story (typed blocks, edited in the visual editor). */
    body: blocks("body"),
    /** Short text for cards and search results; empty: the story's first lines. */
    summary: text("summary"),
    name: text("name").notNull(),
    /** Who they are: "Parent, Mumbai", "Volunteer since 2021"… */
    role: text("role"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.testimonialId, t.locale] })],
);

/**
 * Transparency documents. The PDF lives in R2 (Step 8); until then pdf_r2_key is null. Reports
 * have a financial year; registration certificates (`cert_*`) never do.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fy: text("fy"),
    kind: reportKind("kind").notNull(),
    status: publishStatus("status").default("draft").notNull(),
    pdfR2Key: text("pdf_r2_key"),
    pdfBytes: integer("pdf_bytes"),
    pdfFilename: text("pdf_filename"),
    /** Created by "Load sample content" (Content → Sample content); removable as a group. */
    isSample: boolean("is_sample").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("reports_fy_format", sql`${t.fy} ~ '^[0-9]{4}-[0-9]{2}$'`),
    check("reports_fy_by_kind", sql`starts_with(${t.kind}::text, 'cert_') = (${t.fy} IS NULL)`),
  ],
);

export const reportTranslations = pgTable(
  "report_translations",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ...translationCols(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.locale] })],
);

// ── Menus (Step 8c-2) ──────────────────────────────────────────────────────────────────────────
// Header and footer links edited in the admin. While a location has no rows the site uses the
// built-in menus (src/config/nav.ts). Links to pages that aren't live, or to drafts, never show.
export const menuLocation = pgEnum("menu_location", [
  "header",
  "footer_explore",
  "footer_trust",
  "footer_legal",
]);
export const menuItemKind = pgEnum("menu_item_kind", ["page", "cause", "news", "event", "url"]);
/** Header dropdowns filled automatically: all causes, latest news, upcoming events. */
export const menuAuto = pgEnum("menu_auto", ["causes", "news", "events"]);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    location: menuLocation("location").notNull(),
    /** A header sub-link (one level only); its order is `sort` among its siblings. */
    parentId: uuid("parent_id").references((): AnyPgColumn => menuItems.id, { onDelete: "cascade" }),
    sort: integer("sort").default(0).notNull(),
    kind: menuItemKind("kind").notNull(),
    /** Page key (src/config/nav.ts), cause/news/event slug, or an https URL. */
    target: text("target").notNull(),
    hidden: boolean("hidden").default(false).notNull(),
    /** Optional label per language; the built-in name (or the item's title) is used otherwise. */
    labels: jsonb("labels").$type<Partial<Record<"en" | "hi" | "mr" | "gu", string>>>().default({}).notNull(),
    /** Header link whose dropdown lists causes, news or events by itself (no hand-picked sub-links). */
    auto: menuAuto("auto"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("menu_items_location_idx").on(t.location, t.sort),
    index("menu_items_parent_idx").on(t.parentId),
  ],
);

export const messageStatus = pgEnum("message_status", ["new", "read", "replied", "spam"]);

/** Contact form submissions. The sender's IP is stored only as a salted hash (DPDP minimisation). */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    locale: locale("locale").notNull(),
    ipHash: text("ip_hash").notNull(),
    status: messageStatus("status").default("new").notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("messages_created_idx").on(t.createdAt),
    index("messages_status_idx").on(t.status, t.createdAt),
    index("messages_ip_recent_idx").on(t.ipHash, t.createdAt),
  ],
);

// ── Donations (Step 7) ───────────────────────────────────────────────────────────────────────
// docs/spec.md §2–4. PAN is never stored in clear (SEC-11): AES-256-GCM ciphertext + last 4
// characters for display + keyed HMAC for de-duplication (src/lib/crypto/pii.ts).

export const donationMode = pgEnum("donation_mode", ["online", "cash", "cheque", "neft", "upi_offline"]);
export const donationStatus = pgEnum("donation_status", [
  "created",
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
]);
export const receiptKind = pgEnum("receipt_kind", ["80g", "acknowledgement"]);
export const donorCreatedVia = pgEnum("donor_created_via", ["online", "offline"]);

export type PostalAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
};

export const donors = pgTable(
  "donors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    panEnc: text("pan_enc"),
    panLast4: text("pan_last4"),
    panHmac: text("pan_hmac"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    isIndianCitizenDeclared: boolean("is_indian_citizen_declared").notNull(),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull(),
    consentMarketing: boolean("consent_marketing").default(false).notNull(),
    createdVia: donorCreatedVia("created_via").notNull(),
    /** Set when this record was merged into another donor (kept for history, hidden from lists). */
    mergedIntoId: uuid("merged_into_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("donors_pan_hmac_idx")
      .on(t.panHmac)
      .where(sql`${t.panHmac} is not null`),
    index("donors_email_phone_idx").on(sql`lower(${t.email})`, t.phone),
    check("donors_indian_citizen", sql`${t.isIndianCitizenDeclared}`),
    check("donors_pincode_format", sql`${t.pincode} is null or ${t.pincode} ~ '^[1-9][0-9]{5}$'`),
  ],
);

export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Random, URL-safe; the id the donor and Cashfree see (never the uuid). */
    publicOrderId: text("public_order_id").notNull(),
    donorId: uuid("donor_id")
      .notNull()
      .references(() => donors.id),
    causeId: uuid("cause_id").references(() => causes.id),
    amountPaise: paise("amount_paise").notNull(),
    feeCoverPaise: paise("fee_cover_paise").default(0).notNull(),
    totalPaise: paise("total_paise").notNull(),
    currency: text("currency").default("INR").notNull(),
    mode: donationMode("mode").notNull(),
    status: donationStatus("status").default("created").notNull(),
    provider: text("provider"),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    providerPaymentMethod: text("provider_payment_method"),
    paymentSessionId: text("payment_session_id"),
    instrumentRef: text("instrument_ref"),
    instrumentDate: date("instrument_date"),
    bankName: text("bank_name"),
    isAnonymous: boolean("is_anonymous").default(false).notNull(),
    wants80g: boolean("wants_80g").default(false).notNull(),
    // Snapshots frozen when the donation is made, so a receipt never changes with the donor record.
    nameSnapshot: text("name_snapshot").notNull(),
    emailSnapshot: text("email_snapshot").notNull(),
    panEncSnapshot: text("pan_enc_snapshot"),
    panLast4Snapshot: text("pan_last4_snapshot"),
    addressSnapshot: jsonb("address_snapshot").$type<PostalAddress>(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    fy: text("fy"),
    enteredByUserId: uuid("entered_by_user_id").references(() => users.id),
    notes: text("notes"),
    locale: locale("locale").default("en").notNull(),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("donations_public_order_id_idx").on(t.publicOrderId),
    index("donations_status_created_idx").on(t.status, t.createdAt),
    index("donations_donor_idx").on(t.donorId),
    index("donations_cause_idx").on(t.causeId),
    index("donations_ip_recent_idx").on(t.ipHash, t.createdAt),
    index("donations_fy_idx").on(t.fy),
    check("donations_inr_only", sql`${t.currency} = 'INR'`),
    check("donations_amount_positive", sql`${t.amountPaise} > 0`),
    check("donations_fee_non_negative", sql`${t.feeCoverPaise} >= 0`),
    check("donations_total", sql`${t.totalPaise} = ${t.amountPaise} + ${t.feeCoverPaise}`),
    check(
      "donations_paid_has_date",
      sql`${t.status} not in ('paid', 'refunded') or (${t.receivedAt} is not null and ${t.fy} is not null)`,
    ),
    check("donations_fy_format", sql`${t.fy} is null or ${t.fy} ~ '^[0-9]{4}-[0-9]{2}$'`),
  ],
);

/** Every webhook delivery, valid or not. (provider, provider_event_id) unique → idempotency. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    donationId: uuid("donation_id").references(() => donations.id),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("payment_events_provider_event_idx").on(t.provider, t.providerEventId),
    index("payment_events_donation_idx").on(t.donationId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donationId: uuid("donation_id")
      .notNull()
      .references(() => donations.id),
    kind: receiptKind("kind").notNull(),
    number: text("number").notNull(),
    fy: text("fy").notNull(),
    seq: integer("seq").notNull(),
    pdfR2Key: text("pdf_r2_key"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailMessageId: text("email_message_id"),
    emailAttempts: integer("email_attempts").default(0).notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id),
    /** A reissued receipt points at the voided one it replaces. */
    replacesReceiptId: uuid("replaces_receipt_id"),
  },
  (t) => [
    // One live receipt per donation; voided ones stay (reissue keeps the history).
    uniqueIndex("receipts_donation_live_idx")
      .on(t.donationId)
      .where(sql`${t.voidedAt} is null`),
    index("receipts_donation_idx").on(t.donationId),
    uniqueIndex("receipts_number_idx").on(t.number),
    uniqueIndex("receipts_kind_fy_seq_idx").on(t.kind, t.fy, t.seq),
    check("receipts_seq_positive", sql`${t.seq} > 0`),
  ],
);

/** Gapless receipt counters per (kind, FY): incremented inside the confirming transaction. */
export const receiptSequences = pgTable(
  "receipt_sequences",
  {
    kind: receiptKind("kind").notNull(),
    fy: text("fy").notNull(),
    lastSeq: integer("last_seq").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.fy] }), check("receipt_sequences_seq", sql`${t.lastSeq} >= 0`)],
);

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  checked: integer("checked").default(0).notNull(),
  updated: integer("updated").default(0).notNull(),
  errors: jsonb("errors").$type<{ orderId: string; error: string }[]>().default([]).notNull(),
});

/** One-time codes emailed to an admin before full PANs are shown (owner decision, Step 8b). */
export const panAccessCodes = pgTable(
  "pan_access_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("pan_access_codes_user_idx").on(t.userId, t.createdAt)],
);
