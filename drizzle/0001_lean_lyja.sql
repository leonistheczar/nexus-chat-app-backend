ALTER TABLE "users" DROP CONSTRAINT "users_active_profile_complete";--> statement-breakpoint
DROP INDEX "users_phone_e164_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone_e164" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" USING btree ("phone_e164");