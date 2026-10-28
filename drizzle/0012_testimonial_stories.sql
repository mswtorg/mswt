ALTER TYPE "public"."page_key" ADD VALUE 'testimonials';--> statement-breakpoint
ALTER TABLE "testimonial_translations" ALTER COLUMN "quote" DROP NOT NULL;--> statement-breakpoint
-- Testimonials become stories: a heading, the whole story (blocks) and an optional summary.
-- Rows saved before this keep their text: heading from the name, quote as the story and summary.
ALTER TABLE "testimonial_translations" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "testimonial_translations" ADD COLUMN "body" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "testimonial_translations" ADD COLUMN "summary" text;--> statement-breakpoint
UPDATE "testimonial_translations" SET
  "title" = "name",
  "summary" = "quote",
  "body" = CASE WHEN coalesce("quote", '') = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', "quote")) END;--> statement-breakpoint
ALTER TABLE "testimonial_translations" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
-- Each story gets an address and a date (the day it was added, in India time, until edited).
ALTER TABLE "testimonials" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "story_date" date;--> statement-breakpoint
UPDATE "testimonials" SET
  "slug" = 'testimonial-' || left("id"::text, 8),
  "story_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date;--> statement-breakpoint
ALTER TABLE "testimonials" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "testimonials" ALTER COLUMN "story_date" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "testimonials_slug_idx" ON "testimonials" USING btree ("slug");
