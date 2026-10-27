CREATE TYPE "public"."menu_item_kind" AS ENUM('page', 'cause', 'news', 'event', 'url');--> statement-breakpoint
CREATE TYPE "public"."menu_location" AS ENUM('header', 'footer_explore', 'footer_trust', 'footer_legal');--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" "menu_location" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"kind" "menu_item_kind" NOT NULL,
	"target" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "photo_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "photo_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "gallery_albums" ADD COLUMN "album_date" date;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "photo_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "hero_media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "pdf_bytes" integer;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "pdf_filename" text;--> statement-breakpoint
CREATE INDEX "menu_items_location_idx" ON "menu_items" USING btree ("location","sort");