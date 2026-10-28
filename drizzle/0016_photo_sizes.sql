ALTER TABLE "causes" ADD COLUMN "cover_size" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cover_size" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "cover_size" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "hero_size" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
-- Hand-added: only the sizes the site knows (src/components/content/photo-ratio.ts COVER_SIZES).
ALTER TABLE "causes" ADD CONSTRAINT "causes_cover_size_check" CHECK ("cover_size" IN ('short', 'standard', 'tall'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_size_check" CHECK ("cover_size" IN ('short', 'standard', 'tall'));--> statement-breakpoint
ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_cover_size_check" CHECK ("cover_size" IN ('short', 'standard', 'tall'));--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_hero_size_check" CHECK ("hero_size" IN ('short', 'standard', 'tall'));
