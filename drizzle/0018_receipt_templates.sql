CREATE TABLE "receipt_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"pdf_80g" jsonb,
	"pdf_ack" jsonb,
	"email" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_settings_single_row" CHECK ("receipt_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "receipt_settings" ADD CONSTRAINT "receipt_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;