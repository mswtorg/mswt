ALTER TYPE "public"."report_kind" ADD VALUE 'cert_12a';--> statement-breakpoint
ALTER TYPE "public"."report_kind" ADD VALUE 'cert_80g';--> statement-breakpoint
ALTER TYPE "public"."report_kind" ADD VALUE 'cert_registration';--> statement-breakpoint
ALTER TYPE "public"."report_kind" ADD VALUE 'cert_pan';--> statement-breakpoint
ALTER TYPE "public"."report_kind" ADD VALUE 'cert_other';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "fy" DROP NOT NULL;--> statement-breakpoint
-- Reviewed: registration certificates (cert_*) have no financial year; reports always have one.
-- Compared as text, so it can run in the same migration that adds the enum values.
ALTER TABLE "reports" ADD CONSTRAINT "reports_fy_by_kind" CHECK (starts_with("reports"."kind"::text, 'cert_') = ("reports"."fy" IS NULL));