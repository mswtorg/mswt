ALTER TYPE "public"."page_key" ADD VALUE 'team';--> statement-breakpoint
CREATE TABLE "team_member_translations" (
	"member_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"bio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_member_translations_member_id_locale_pk" PRIMARY KEY("member_id","locale")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"show_on_about" boolean DEFAULT false NOT NULL,
	"photo_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_settings" ADD COLUMN "pan_required_above_paise" bigint DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member_translations" ADD CONSTRAINT "team_member_translations_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member_translations" ADD CONSTRAINT "team_member_translations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_members_sort_idx" ON "team_members" USING btree ("sort_order");--> statement-breakpoint
-- Reviewed: move the trustees (Settings → Organization) into team members before dropping the column.
-- Each becomes a published member shown on About, with its English name and role marked reviewed
-- (as it was shown before) and its photo when that photo still exists. Ids are made once (MATERIALIZED)
-- so both inserts use the same ones.
WITH t AS MATERIALIZED (
  SELECT gen_random_uuid() AS "id", x.value AS v, COALESCE((x.value->>'sort')::int, x.ordinality::int) AS sort
  FROM "organization_settings" o, jsonb_array_elements(o."trustees") WITH ORDINALITY x
), m AS (
  INSERT INTO "team_members" ("id", "status", "sort_order", "show_on_about", "photo_id")
  SELECT t."id", 'published', t.sort, true,
    (SELECT md."id" FROM "media" md WHERE md."id"::text = t.v->>'photoMediaId')
  FROM t
  RETURNING "id"
)
INSERT INTO "team_member_translations" ("member_id", "locale", "name", "designation", "reviewed_at")
SELECT m."id", 'en', t.v->>'name', t.v->>'role', now()
FROM m JOIN t ON t."id" = m."id";--> statement-breakpoint
ALTER TABLE "organization_settings" DROP COLUMN "trustees";
