ALTER TYPE "public"."page_key" ADD VALUE 'causes';--> statement-breakpoint
ALTER TYPE "public"."page_key" ADD VALUE 'gallery';--> statement-breakpoint
ALTER TYPE "public"."page_key" ADD VALUE 'events';--> statement-breakpoint
ALTER TYPE "public"."page_key" ADD VALUE 'news';--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery_albums" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;