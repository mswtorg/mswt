import { and, asc, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { routing, type Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { testimonials, testimonialTranslations } from "@/lib/db/schema";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG, isProduction } from "./source";

export type Testimonial = {
  id: string;
  quote: string;
  name: string;
  role: string | null;
  photoId: string | null;
  showOnHome: boolean;
};

/**
 * Published testimonials with text in `locale` (reviewed, in production), in their admin order.
 * No English fallback: a testimonial not written in this language doesn't show in it.
 */
export const getTestimonials = unstable_cache(
  async (locale: Locale): Promise<Testimonial[]> => {
    if (!routing.locales.includes(locale)) return [];
    const rows = await db
      .select({
        id: testimonials.id,
        photoId: testimonials.photoId,
        showOnHome: testimonials.showOnHome,
        quote: testimonialTranslations.quote,
        name: testimonialTranslations.name,
        role: testimonialTranslations.role,
        reviewedAt: testimonialTranslations.reviewedAt,
      })
      .from(testimonials)
      .innerJoin(
        testimonialTranslations,
        and(
          eq(testimonialTranslations.testimonialId, testimonials.id),
          eq(testimonialTranslations.locale, locale),
        ),
      )
      .where(eq(testimonials.status, "published"))
      .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt));
    return rows.filter((r) => !isProduction() || r.reviewedAt).map(({ reviewedAt: _, ...t }) => t);
  },
  ["testimonials"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);
