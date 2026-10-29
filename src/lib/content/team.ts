import { and, asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { routing, type Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { teamMembers, teamMemberTranslations } from "@/lib/db/schema";
import type { Block } from "./blocks";
import { CONTENT_SAFETY_REVALIDATE, CONTENT_TAG, isProduction } from "./source";

export type TeamMember = {
  id: string;
  name: string;
  designation: string;
  bio: Block[];
  photoId: string | null;
  showOnAbout: boolean;
};

/**
 * Published team members with text in `locale` (reviewed, in production), in the admin's order.
 * No English fallback: a member not written in this language doesn't show in it.
 */
export const getTeam = unstable_cache(
  async (locale: Locale): Promise<TeamMember[]> => {
    if (!routing.locales.includes(locale)) return [];
    const rows = await db
      .select({
        id: teamMembers.id,
        photoId: teamMembers.photoId,
        showOnAbout: teamMembers.showOnAbout,
        name: teamMemberTranslations.name,
        designation: teamMemberTranslations.designation,
        bio: teamMemberTranslations.bio,
        reviewedAt: teamMemberTranslations.reviewedAt,
      })
      .from(teamMembers)
      .innerJoin(
        teamMemberTranslations,
        and(eq(teamMemberTranslations.memberId, teamMembers.id), eq(teamMemberTranslations.locale, locale)),
      )
      .where(eq(teamMembers.status, "published"))
      .orderBy(asc(teamMembers.sortOrder), asc(teamMembers.createdAt));
    return rows.filter((r) => !isProduction() || r.reviewedAt).map(({ reviewedAt: _, ...m }) => m);
  },
  ["team"],
  { tags: [CONTENT_TAG], revalidate: CONTENT_SAFETY_REVALIDATE },
);
