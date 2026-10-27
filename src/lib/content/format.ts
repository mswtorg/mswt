import { z } from "zod";
import { BlocksSchema } from "./blocks";

/**
 * File format for content (data/content/*.json for real content, data/sample/*.json for previews).
 * The same shape is written to the database by `npm run content:sync`.
 */
const L = z.enum(["en", "hi", "mr", "gu"]);
const per = <T extends z.ZodType>(t: T) => z.partialRecord(L, t);
const reviewed = {
  reviewed: z.boolean().default(false),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
};
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const isoInstant = z.iso.datetime({ offset: true });

export const ContentFileSchema = z.object({
  causes: z
    .array(
      z.object({
        slug,
        /** Created by "Load sample content" (shows the sample banner). */
        isSample: z.boolean().default(false),
        status: z.enum(["draft", "active", "closed"]),
        goalPaise: z.number().int().positive().nullable().default(null),
        raisedPaise: z.number().int().nonnegative().default(0),
        sortOrder: z.number().int().default(0),
        is80gEligible: z.boolean().default(true),
        coverImageId: z.uuid().nullable().default(null),
        photoIds: z.array(z.uuid()).default([]),
        translations: per(
          z.object({
            title: z.string().min(1),
            summary: z.string().min(1),
            body: BlocksSchema.default([]),
            ...reviewed,
          }),
        ),
      }),
    )
    .default([]),
  events: z
    .array(
      z.object({
        slug,
        /** Created by "Load sample content" (shows the sample banner). */
        isSample: z.boolean().default(false),
        status: z.enum(["draft", "published"]),
        eventStatus: z
          .enum(["scheduled", "cancelled", "postponed", "rescheduled", "moved_online"])
          .default("scheduled"),
        attendance: z.enum(["offline", "online", "mixed"]).default("offline"),
        startsAt: isoInstant,
        endsAt: isoInstant.nullable().default(null),
        venue: z
          .object({
            name: z.string(),
            street: z.string().optional(),
            city: z.string().optional(),
            region: z.string().optional(),
            postalCode: z.string().optional(),
          })
          .nullable()
          .default(null),
        onlineUrl: z.url().nullable().default(null),
        coverImageId: z.uuid().nullable().default(null),
        photoIds: z.array(z.uuid()).default([]),
        translations: per(
          z.object({
            title: z.string().min(1),
            summary: z.string().min(1),
            body: BlocksSchema.default([]),
            ...reviewed,
          }),
        ),
      }),
    )
    .default([]),
  news: z
    .array(
      z.object({
        slug,
        /** Created by "Load sample content" (shows the sample banner). */
        isSample: z.boolean().default(false),
        status: z.enum(["draft", "published"]),
        publishedAt: isoInstant,
        authorName: z.string().nullable().default(null),
        coverImageId: z.uuid().nullable().default(null),
        photoIds: z.array(z.uuid()).default([]),
        translations: per(
          z.object({
            headline: z.string().min(1),
            excerpt: z.string().min(1),
            body: BlocksSchema.default([]),
            ...reviewed,
          }),
        ),
      }),
    )
    .default([]),
  albums: z
    .array(
      z.object({
        slug,
        /** Created by "Load sample content" (shows the sample banner). */
        isSample: z.boolean().default(false),
        status: z.enum(["draft", "published"]),
        publishedAt: isoInstant.nullable().default(null),
        albumDate: z.iso.date().nullable().default(null),
        coverImageId: z.uuid().nullable().default(null),
        translations: per(
          z.object({ title: z.string().min(1), description: z.string().optional(), ...reviewed }),
        ),
        items: z
          .array(
            z.object({
              /** Library photo (database content); sample items have none and show a placeholder. */
              mediaId: z.uuid().optional(),
              width: z.number().int().positive(),
              height: z.number().int().positive(),
              alt: per(z.string().min(1)),
              caption: per(z.string()).optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  reports: z
    .array(
      z.object({
        isSample: z.boolean().default(false),
        fy: z.string().regex(/^\d{4}-\d{2}$/),
        kind: z.enum(["annual_report", "audited_accounts", "other"]),
        status: z.enum(["draft", "published"]),
        /** The PDF in the public media bucket, once uploaded. */
        pdfKey: z.string().nullable().default(null),
        pdfBytes: z.number().int().nullable().default(null),
        translations: per(z.object({ title: z.string().min(1), ...reviewed })),
      }),
    )
    .default([]),
  pages: z
    .partialRecord(
      z.enum([
        "about",
        "transparency",
        "contact",
        "privacy",
        "terms",
        "refund_policy",
        "disclaimer_80g",
        "causes",
        "gallery",
        "events",
        "news",
      ]),
      per(
        z.object({
          title: z.string().min(1),
          h1: z.string().min(1),
          intro: z.string().optional(),
          sections: BlocksSchema.default([]),
          ...reviewed,
        }),
      ),
    )
    .default({}),
});

export type ContentFile = z.infer<typeof ContentFileSchema>;
export type ContentPageKey = keyof ContentFile["pages"];
