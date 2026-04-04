CREATE TABLE "email_verification_requests" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_verification_requests_email_kind_created_at_idx" ON "email_verification_requests" USING btree ("email","kind","created_at");