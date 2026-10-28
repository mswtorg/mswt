CREATE TYPE "public"."menu_auto" AS ENUM('causes', 'news', 'events');--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "auto" "menu_auto";--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_menu_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_items_parent_idx" ON "menu_items" USING btree ("parent_id");--> statement-breakpoint
-- A saved header link to the Causes page keeps the dropdown it had before (all causes).
UPDATE "menu_items" SET "auto" = 'causes' WHERE "location" = 'header' AND "kind" = 'page' AND "target" = 'causes' AND "parent_id" IS NULL;
