CREATE TYPE "public"."contact_request_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"status" "contact_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "contact_requests_no_self_reference" CHECK ("contact_requests"."sender_id" <> "contact_requests"."receiver_id")
);
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_requests_receiver_status_idx" ON "contact_requests" USING btree ("receiver_id","status","created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_sender_status_idx" ON "contact_requests" USING btree ("sender_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_requests_pending_pair_unique" ON "contact_requests" USING btree (least("sender_id", "receiver_id"),greatest("sender_id", "receiver_id")) WHERE "contact_requests"."status" = 'pending';