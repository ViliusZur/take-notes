ALTER TABLE "weeks" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN "notes_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Keep existing day notes: copy them into the week's notes, one "Mon 12" heading per day.
UPDATE "weeks" SET "notes" = "merged"."body"
FROM (
  SELECT "week_id", string_agg(to_char("note_date", 'Dy DD') || E'\n' || "body", E'\n\n' ORDER BY "note_date") AS "body"
  FROM "daily_notes"
  WHERE btrim("body") <> ''
  GROUP BY "week_id"
) AS "merged"
WHERE "merged"."week_id" = "weeks"."id";--> statement-breakpoint
DROP TABLE "daily_notes" CASCADE;
