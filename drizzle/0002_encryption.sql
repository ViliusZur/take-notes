CREATE TABLE "user_encryption" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kdf" text NOT NULL,
	"kdf_iterations" integer NOT NULL,
	"kdf_salt" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"wrap_iv" text NOT NULL,
	"proof_hash" text NOT NULL,
	"lock_timeout_minutes" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_encryption" ADD CONSTRAINT "user_encryption_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;