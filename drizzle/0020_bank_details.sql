ALTER TABLE "payment_settings" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_branch" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_account_type" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "upi_id" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "cheque_payee" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "donation_details_email" text;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "bank_details_public" boolean DEFAULT false NOT NULL;