import { and, asc, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { routing, type Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { testimonials, testimonialTranslations } from "@/lib/db/schema";
import type { Block } from "./blocks";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG, isProduction } from "./source";

export type Testimonial = {
  id: string;
  slug: string;
  title: string;
  /** The summary, or the story's first lines when none was written. */
  summary: string;
  name: string;
  role: string | null;
  /** "2026-03-14" (a calendar day). */
  storyDate: string;
  photoId: string | null;
  showOnHome: boolean;
};
export type TestimonialStory = Testimonial & { body: Block[]; locales: Locale[] };

const SUMMARY_MAX = 200;

/** Card text: the written summary, else the first paragraph without **bold** or [link](…) markup, shortened. */
export function storySummary(summary: string | null, body: Block[]): string {
  if (summary) return summary;
  const first = body.find((b) => b.type === "paragraph");
  if (!first || first.type !== "paragraph") return "";
  const plain = first.text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= SUMMARY_MAX) return plain;
  const cut = plain.slice(0, SUMMARY_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : SUMMARY_MAX).trimEnd()}…`;
}

const visible = (r: { reviewedAt: Date | null }) => !isProduction() || r.reviewedAt;

const columns = {
  id: testimonials.id,
  slug: testimonials.slug,
  storyDate: testimonials.storyDate,
  photoId: testimonials.photoId,
  showOnHome: testimonials.showOnHome,
  title: testimonialTranslations.title,
  body: testimonialTranslations.body,
  summary: testimonialTranslations.summary,
  name: testimonialTranslations.name,
  role: testimonialTranslations.role,
  reviewedAt: testimonialTranslations.reviewedAt,
};

function published(locale: Locale) {
  return db
    .select(columns)
    .from(testimonials)
    .innerJoin(
      testimonialTranslations,
      and(
        eq(testimonialTranslations.testimonialId, testimonials.id),
        eq(testimonialTranslations.locale, locale),
      ),
    );
}

const toCard = ({ reviewedAt: _, body, summary, ...t }: Awaited<ReturnType<typeof published>>[number]) => ({
  ...t,
  summary: storySummary(summary, body),
});

/**
 * Published testimonials with text in `locale` (reviewed, in production): admin order, then newest.
 * No English fallback: a testimonial not written in this language doesn't show in it.
 */
export const getTestimonials = unstable_cache(
  async (locale: Locale): Promise<Testimonial[]> => {
    if (!routing.locales.includes(locale)) return [];
    const rows = await published(locale)
      .where(eq(testimonials.status, "published"))
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.storyDate), desc(testimonials.createdAt));
    return rows.filter(visible).map(toCard);
  },
  ["testimonials"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);

/** One published story in `locale`, with the languages it can be read in (hreflang); null → 404. */
export const getTestimonial = unstable_cache(
  async (locale: Locale, slug: string): Promise<TestimonialStory | null> => {
    if (!routing.locales.includes(locale)) return null;
    const [row] = await published(locale).where(
      and(eq(testimonials.status, "published"), eq(testimonials.slug, slug)),
    );
    if (!row || !visible(row)) return null;
    const langs = await db
      .select({ locale: testimonialTranslations.locale, reviewedAt: testimonialTranslations.reviewedAt })
      .from(testimonialTranslations)
      .where(eq(testimonialTranslations.testimonialId, row.id));
    return {
      ...toCard(row),
      body: row.body,
      locales: routing.locales.filter((l) => langs.some((x) => x.locale === l && visible(x))),
    };
  },
  ["testimonial"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);
