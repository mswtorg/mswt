ALTER TABLE "cause_translations" ADD COLUMN "tag" text;--> statement-breakpoint
ALTER TABLE "causes" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "section_order" text[] DEFAULT '{}'::text[] NOT NULL;