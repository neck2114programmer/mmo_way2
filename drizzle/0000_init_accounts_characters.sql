-- Идемпотентная миграция: безопасна при повторном применении, данные не удаляются.
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_norm" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"class_id" text NOT NULL,
	"gender" text NOT NULL,
	"hair_id" text NOT NULL,
	"appearance" jsonb NOT NULL,
	"armor_tier" smallint DEFAULT 2 NOT NULL,
	"weapon_tier" smallint DEFAULT 2 NOT NULL,
	"helm" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_gender_chk" CHECK ("characters"."gender" in ('male','female')),
	CONSTRAINT "characters_tiers_chk" CHECK ("characters"."armor_tier" between 0 and 5 and "characters"."weapon_tier" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_username_norm_uq" ON "accounts" USING btree ("username_norm");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "characters_name_norm_uq" ON "characters" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_account_idx" ON "characters" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" USING btree ("expires_at");