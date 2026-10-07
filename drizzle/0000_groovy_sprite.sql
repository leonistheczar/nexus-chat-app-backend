CREATE TYPE "public"."user_profile_status" AS ENUM('incomplete', 'active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" varchar(255) NOT NULL,
	"username" varchar(20),
	"first_name" varchar(80),
	"last_name" varchar(80),
	"display_name" varchar(161),
	"phone_e164" varchar(16),
	"avatar_url" text,
	"profile_status" "user_profile_status" DEFAULT 'incomplete' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"profile_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_active_profile_complete" CHECK ("users"."profile_status" <> 'active' OR (
                "users"."username" is not null
                AND "users"."first_name" is not null
                AND "users"."last_name" is not null
                AND "users"."display_name" is not null
            ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" USING btree ("phone_e164") WHERE "users"."phone_e164" is not null;--> statement-breakpoint
CREATE INDEX "users_profile_status_idx" ON "users" USING btree ("profile_status");--> statement-breakpoint
CREATE INDEX "users_last_seen_at_idx" ON "users" USING btree ("last_seen_at");