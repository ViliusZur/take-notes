ALTER TABLE "tasks" ADD COLUMN "day_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Until now one position ordered both lists; both orders start from it.
UPDATE "tasks" SET "day_position" = "position";
